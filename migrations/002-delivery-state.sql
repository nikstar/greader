\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE public.subscriptions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.feed_items IN SHARE MODE;

ALTER TABLE public.users ADD COLUMN delivery_paused_at timestamptz,
    ADD COLUMN delivery_pause_reason text,
    ADD COLUMN migrated_to_chat_id text,
    ADD COLUMN delivery_next_at timestamptz NOT NULL DEFAULT '-infinity';
ALTER TABLE public.subscriptions ADD COLUMN delivery_cursor bigint NOT NULL DEFAULT 0,
    ADD COLUMN delivery_paused boolean NOT NULL DEFAULT false;

CREATE TABLE public.deliveries (
    id bigserial PRIMARY KEY,
    subscription_id integer NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    feed_item_id bigint NOT NULL,
    item_date timestamptz NOT NULL,
    item_title text NOT NULL,
    item_url text NOT NULL,
    feed_title text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped','cancelled')),
    attempts integer NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
    telegram_message_id bigint,
    last_error text,
    UNIQUE (subscription_id, feed_item_id)
);
CREATE INDEX deliveries_pending ON public.deliveries (next_attempt_at,id) WHERE status='pending';
CREATE INDEX deliveries_sending ON public.deliveries (id) WHERE status='sending';
CREATE INDEX deliveries_retention ON public.deliveries (updated_at) WHERE status IN ('sent','skipped','cancelled');
CREATE TABLE public.delivery_runtime (
    id boolean PRIMARY KEY DEFAULT true CHECK(id),
    not_before timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.delivery_runtime DEFAULT VALUES;

-- Preserve the old updater's currently pending work, then use insertion IDs.
-- Feed timestamps can repeat or arrive out of order; they are not safe cursors.
INSERT INTO public.deliveries (subscription_id,feed_item_id,item_date,item_title,item_url,feed_title)
SELECT s.id,i.id,i.date,i.title,i.url,f.title
FROM public.subscriptions s JOIN public.feeds f ON f.id=s.feed_id
JOIN public.feed_items i ON i.feed_id=s.feed_id
WHERE s.active AND i.date>s.last_sent;
UPDATE public.subscriptions s SET delivery_cursor=coalesce(
    (SELECT max(i.id) FROM public.feed_items i WHERE i.feed_id=s.feed_id),0);
CREATE INDEX feed_items_feed_id_id ON public.feed_items(feed_id,id);

CREATE FUNCTION public.initialize_delivery_cursor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' OR (NOT OLD.active AND NEW.active) THEN
        NEW.delivery_cursor := coalesce((SELECT max(id) FROM public.feed_items WHERE feed_id=NEW.feed_id),0);
        NEW.delivery_paused := false;
        IF NEW.active THEN
            UPDATE public.users SET delivery_paused_at=NULL,delivery_pause_reason=NULL
            WHERE chat_id=NEW.chat_id AND migrated_to_chat_id IS NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER initialize_delivery_cursor BEFORE INSERT OR UPDATE OF active ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.initialize_delivery_cursor();

CREATE FUNCTION public.cancel_inactive_deliveries() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.active AND NOT NEW.active THEN
        UPDATE public.deliveries SET status='cancelled',last_error='Subscription paused or unsubscribed',updated_at=now()
        WHERE subscription_id=NEW.id AND status IN ('pending','sending');
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER cancel_inactive_deliveries AFTER UPDATE OF active ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.cancel_inactive_deliveries();

CREATE FUNCTION public.pause_delivery_chat(target text, reason text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE changed integer;
BEGIN
    PERFORM 1 FROM public.users WHERE chat_id=target FOR UPDATE;
    UPDATE public.users SET delivery_paused_at=now(),delivery_pause_reason=reason WHERE chat_id=target;
    UPDATE public.subscriptions SET active=false,delivery_paused=true WHERE chat_id=target AND active;
    GET DIAGNOSTICS changed=ROW_COUNT;
    RETURN changed;
END;
$$;

CREATE FUNCTION public.resume_delivery_chat(target text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE available integer; restored integer; remaining integer;
BEGIN
    PERFORM 1 FROM public.users WHERE chat_id=target AND migrated_to_chat_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('restored',0,'remaining',0); END IF;
    SELECT coalesce(subscription_limit-active_count,2147483647) INTO available
    FROM public.subscription_limits WHERE chat_id=target FOR UPDATE;
    UPDATE public.users SET delivery_paused_at=NULL,delivery_pause_reason=NULL,delivery_next_at='-infinity' WHERE chat_id=target;
    UPDATE public.subscriptions SET active=true,delivery_paused=false,last_sent=now()
    WHERE id IN (SELECT id FROM public.subscriptions WHERE chat_id=target AND delivery_paused AND NOT active
        ORDER BY id LIMIT greatest(coalesce(available,100),0));
    GET DIAGNOSTICS restored=ROW_COUNT;
    SELECT count(*) INTO remaining FROM public.subscriptions WHERE chat_id=target AND delivery_paused AND NOT active;
    RETURN jsonb_build_object('restored',restored,'remaining',remaining);
END;
$$;

CREATE FUNCTION public.migrate_delivery_chat(old_chat text,new_chat text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE source public.subscriptions%ROWTYPE; destination public.subscriptions%ROWTYPE;
        cap integer; total integer; prior_target text;
BEGIN
    IF old_chat !~ '^-[0-9]+$' OR new_chat !~ '^-[0-9]+$' OR old_chat=new_chat THEN
        RAISE EXCEPTION 'Invalid group migration';
    END IF;
    PERFORM pg_advisory_xact_lock(714202602);
    SELECT migrated_to_chat_id INTO prior_target FROM public.users WHERE chat_id=old_chat FOR UPDATE;
    IF prior_target=new_chat THEN RETURN; END IF;
    IF prior_target IS NOT NULL THEN RAISE EXCEPTION 'Conflicting group migration'; END IF;
    INSERT INTO public.users(chat_id,lang,username,first_name)
    SELECT new_chat,lang,username,first_name FROM public.users WHERE chat_id=old_chat
    ON CONFLICT(chat_id) DO NOTHING;
    PERFORM 1 FROM public.users WHERE chat_id=new_chat AND migrated_to_chat_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Migration destination unavailable'; END IF;
    PERFORM 1 FROM public.subscriptions WHERE chat_id IN(old_chat,new_chat) ORDER BY id FOR UPDATE;
    INSERT INTO public.subscription_limits(chat_id) VALUES(new_chat) ON CONFLICT DO NOTHING;
    SELECT subscription_limit INTO cap FROM public.subscription_limits WHERE chat_id=new_chat FOR UPDATE;
    SELECT count(DISTINCT feed_id) INTO total FROM public.subscriptions WHERE chat_id IN(old_chat,new_chat) AND active;
    IF cap IS NOT NULL AND total>cap THEN
        -- Preserve the union without bypassing the cap. An explicit resume can
        -- restore up to the limit; remaining subscriptions stay saved/paused.
        PERFORM public.pause_delivery_chat(old_chat,'Migration exceeds subscription limit');
        PERFORM public.pause_delivery_chat(new_chat,'Migration exceeds subscription limit');
    END IF;
    FOR source IN SELECT * FROM public.subscriptions WHERE chat_id=old_chat ORDER BY id LOOP
        SELECT * INTO destination FROM public.subscriptions WHERE chat_id=new_chat AND feed_id=source.feed_id;
        IF NOT FOUND THEN
            UPDATE public.subscriptions SET chat_id=new_chat WHERE id=source.id;
        ELSE
            INSERT INTO public.deliveries(subscription_id,feed_item_id,item_date,item_title,item_url,feed_title,
                status,attempts,next_attempt_at,created_at,updated_at,expires_at,telegram_message_id,last_error)
            SELECT destination.id,feed_item_id,item_date,item_title,item_url,feed_title,status,attempts,next_attempt_at,
                created_at,updated_at,expires_at,telegram_message_id,last_error FROM public.deliveries WHERE subscription_id=source.id
            ON CONFLICT(subscription_id,feed_item_id) DO UPDATE SET
                status=CASE WHEN deliveries.status IN('sent','skipped','cancelled') THEN deliveries.status ELSE EXCLUDED.status END,
                attempts=greatest(deliveries.attempts,EXCLUDED.attempts),
                telegram_message_id=coalesce(deliveries.telegram_message_id,EXCLUDED.telegram_message_id);
            UPDATE public.unsubscriptions SET subscription_id=destination.id WHERE subscription_id=source.id;
            UPDATE public.subscriptions SET active=source.active OR destination.active,
                delivery_paused=source.delivery_paused OR destination.delivery_paused,
                last_sent=greatest(source.last_sent,destination.last_sent),
                delivery_cursor=greatest(source.delivery_cursor,destination.delivery_cursor) WHERE id=destination.id;
            DELETE FROM public.subscriptions WHERE id=source.id;
        END IF;
    END LOOP;
    UPDATE public.users SET migrated_to_chat_id=new_chat,delivery_paused_at=now(),delivery_pause_reason='Migrated group' WHERE chat_id=old_chat;
END;
$$;
COMMIT;
