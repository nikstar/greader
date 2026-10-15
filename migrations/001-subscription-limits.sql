\set ON_ERROR_STOP on
-- Run once with psql -v owner_chat_id=YOUR_PRIVATE_CHAT_ID.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.subscriptions IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE public.subscription_limits (
    chat_id text PRIMARY KEY,
    active_count integer NOT NULL DEFAULT 0 CHECK (active_count >= 0),
    subscription_limit integer DEFAULT 100 CHECK (subscription_limit >= 0)
);

INSERT INTO public.subscription_limits (chat_id, active_count)
SELECT chat_id, count(*) FILTER (WHERE active)
FROM public.subscriptions GROUP BY chat_id;

-- Exempt the configured owner's private chat, never a username or group.
INSERT INTO public.subscription_limits (chat_id, subscription_limit)
VALUES (:'owner_chat_id', NULL)
ON CONFLICT (chat_id) DO UPDATE SET subscription_limit = NULL;

CREATE FUNCTION public.change_subscription_count(target_chat text, delta integer)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO public.subscription_limits (chat_id) VALUES (target_chat)
    ON CONFLICT (chat_id) DO NOTHING;

    -- A conditional row update serializes concurrent activations. The counter
    -- and the subscription change commit or roll back together.
    UPDATE public.subscription_limits
    SET active_count = active_count + delta
    WHERE chat_id = target_chat AND
        (delta < 0 OR subscription_limit IS NULL OR active_count + delta <= subscription_limit);
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUBSCRIPTION_LIMIT_REACHED';
    END IF;
END;
$$;

CREATE FUNCTION public.enforce_subscription_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.chat_id = NEW.chat_id AND OLD.active = NEW.active THEN
            RETURN NULL;
        END IF;
    END IF;
    IF TG_OP <> 'INSERT' THEN
        IF OLD.active THEN
            PERFORM public.change_subscription_count(OLD.chat_id, -1);
        END IF;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        IF NEW.active THEN
            PERFORM public.change_subscription_count(NEW.chat_id, 1);
        END IF;
    END IF;
    RETURN NULL;
END;
$$;

-- AFTER avoids counting an INSERT ... ON CONFLICT that inserts nothing.
CREATE TRIGGER subscription_limit_changes
AFTER INSERT OR DELETE OR UPDATE OF active, chat_id ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_limit();

CREATE FUNCTION public.reset_subscription_counts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.subscription_limits SET active_count = 0;
    RETURN NULL;
END;
$$;
CREATE TRIGGER subscription_limit_truncate
AFTER TRUNCATE ON public.subscriptions
FOR EACH STATEMENT EXECUTE FUNCTION public.reset_subscription_counts();
COMMIT;
