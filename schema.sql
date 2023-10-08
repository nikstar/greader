--
-- PostgreSQL database dump
--

-- Dumped from database version 15.2 (Debian 15.2-1.pgdg110+1)
-- Dumped by pg_dump version 15.2 (Debian 15.2-1.pgdg110+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.api (
    chat_id text,
    hash text
);


ALTER TABLE public.api OWNER TO docker;

--
-- Name: bad_feeds_id_seq; Type: SEQUENCE; Schema: public; Owner: docker
--

CREATE SEQUENCE public.bad_feeds_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.bad_feeds_id_seq OWNER TO docker;

--
-- Name: bad_feeds; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.bad_feeds (
    id integer DEFAULT nextval('public.bad_feeds_id_seq'::regclass) NOT NULL,
    url text NOT NULL,
    comment text,
    chat_id text,
    date timestamp with time zone DEFAULT now()
);


ALTER TABLE public.bad_feeds OWNER TO docker;

--
-- Name: feed_items; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.feed_items (
    id integer NOT NULL,
    feed_id integer NOT NULL,
    guid text NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    date timestamp with time zone NOT NULL
);


ALTER TABLE public.feed_items OWNER TO docker;

--
-- Name: feed_items2_id_seq; Type: SEQUENCE; Schema: public; Owner: docker
--

CREATE SEQUENCE public.feed_items2_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.feed_items2_id_seq OWNER TO docker;

--
-- Name: feed_items2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: docker
--

ALTER SEQUENCE public.feed_items2_id_seq OWNED BY public.feed_items.id;


--
-- Name: feeds; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.feeds (
    id integer NOT NULL,
    url text NOT NULL,
    title text NOT NULL,
    last_update_time timestamp with time zone NOT NULL,
    next_update_time timestamp with time zone NOT NULL,
    most_recent_item timestamp with time zone NOT NULL
);


ALTER TABLE public.feeds OWNER TO docker;

--
-- Name: feeds2_id_seq; Type: SEQUENCE; Schema: public; Owner: docker
--

CREATE SEQUENCE public.feeds2_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.feeds2_id_seq OWNER TO docker;

--
-- Name: feeds2_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: docker
--

ALTER SEQUENCE public.feeds2_id_seq OWNED BY public.feeds.id;


--
-- Name: message_log; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.message_log (
    id integer NOT NULL,
    chat_id text,
    message text,
    dt timestamp with time zone,
    response_time real
);


ALTER TABLE public.message_log OWNER TO docker;

--
-- Name: message_log_id_seq; Type: SEQUENCE; Schema: public; Owner: docker
--

CREATE SEQUENCE public.message_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.message_log_id_seq OWNER TO docker;

--
-- Name: message_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: docker
--

ALTER SEQUENCE public.message_log_id_seq OWNED BY public.message_log.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.users (
    chat_id text NOT NULL,
    lang text,
    username text,
    first_name text
);


ALTER TABLE public.users OWNER TO docker;

--
-- Name: message_log_view; Type: VIEW; Schema: public; Owner: docker
--

CREATE VIEW public.message_log_view AS
 SELECT message_log.chat_id,
    users.username,
    message_log.message
   FROM (public.message_log
     JOIN public.users ON ((message_log.chat_id = users.chat_id)))
  WHERE (users.username <> 'nikstar'::text)
  ORDER BY message_log.dt;


ALTER TABLE public.message_log_view OWNER TO docker;

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.subscriptions (
    id integer NOT NULL,
    chat_id text NOT NULL,
    last_sent timestamp with time zone NOT NULL,
    active boolean DEFAULT true NOT NULL,
    feed_id integer NOT NULL
);


ALTER TABLE public.subscriptions OWNER TO docker;

--
-- Name: subscriptions_view; Type: VIEW; Schema: public; Owner: docker
--

CREATE VIEW public.subscriptions_view AS
 SELECT s.id,
    s.chat_id AS user_id,
    u.username,
    u.first_name,
    s.feed_id,
    f.url,
    s.last_sent,
    s.active
   FROM ((public.subscriptions s
     JOIN public.users u ON ((s.chat_id = u.chat_id)))
     JOIN public.feeds f ON ((s.feed_id = f.id)));


ALTER TABLE public.subscriptions_view OWNER TO docker;

--
-- Name: telegraf_session; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.telegraf_session (
    id character varying,
    session character varying
);


ALTER TABLE public.telegraf_session OWNER TO docker;

--
-- Name: unsubscriptions; Type: TABLE; Schema: public; Owner: docker
--

CREATE TABLE public.unsubscriptions (
    chat_id text,
    msg_id bigint,
    subscription_id integer,
    dt timestamp with time zone DEFAULT now()
);


ALTER TABLE public.unsubscriptions OWNER TO docker;

--
-- Name: untitled_table_179_id_seq; Type: SEQUENCE; Schema: public; Owner: docker
--

CREATE SEQUENCE public.untitled_table_179_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.untitled_table_179_id_seq OWNER TO docker;

--
-- Name: untitled_table_179_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: docker
--

ALTER SEQUENCE public.untitled_table_179_id_seq OWNED BY public.subscriptions.id;


--
-- Name: feed_items id; Type: DEFAULT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.feed_items ALTER COLUMN id SET DEFAULT nextval('public.feed_items2_id_seq'::regclass);


--
-- Name: feeds id; Type: DEFAULT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.feeds ALTER COLUMN id SET DEFAULT nextval('public.feeds2_id_seq'::regclass);


--
-- Name: message_log id; Type: DEFAULT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.message_log ALTER COLUMN id SET DEFAULT nextval('public.message_log_id_seq'::regclass);


--
-- Name: subscriptions id; Type: DEFAULT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.subscriptions ALTER COLUMN id SET DEFAULT nextval('public.untitled_table_179_id_seq'::regclass);


--
-- Name: api api_chat_id_unique; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.api
    ADD CONSTRAINT api_chat_id_unique UNIQUE (chat_id);


--
-- Name: bad_feeds bad_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.bad_feeds
    ADD CONSTRAINT bad_feeds_pkey PRIMARY KEY (id);


--
-- Name: feed_items feed_items2_pkey; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items2_pkey PRIMARY KEY (id);


--
-- Name: feeds feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.feeds
    ADD CONSTRAINT feeds_pkey PRIMARY KEY (id);


--
-- Name: message_log message_log_pkey; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.message_log
    ADD CONSTRAINT message_log_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (chat_id);


--
-- Name: feed_items2_unique; Type: INDEX; Schema: public; Owner: docker
--

CREATE UNIQUE INDEX feed_items2_unique ON public.feed_items USING btree (feed_id, guid);


--
-- Name: feeds_unique_url; Type: INDEX; Schema: public; Owner: docker
--

CREATE UNIQUE INDEX feeds_unique_url ON public.feeds USING btree (url);


--
-- Name: subscriptions_unique_user_feed; Type: INDEX; Schema: public; Owner: docker
--

CREATE UNIQUE INDEX subscriptions_unique_user_feed ON public.subscriptions USING btree (chat_id, feed_id);


--
-- Name: feed_items feed_items2_feed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.feed_items
    ADD CONSTRAINT feed_items2_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id);


--
-- Name: subscriptions subscriptions_feed_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_feed_id_fkey FOREIGN KEY (feed_id) REFERENCES public.feeds(id);


--
-- Name: subscriptions untitled_table_179_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: docker
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT untitled_table_179_user_fkey FOREIGN KEY (chat_id) REFERENCES public.users(chat_id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO docker;


--
-- PostgreSQL database dump complete
--

