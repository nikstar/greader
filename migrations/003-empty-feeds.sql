\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
-- A feed can exist before its first post. Existing dates remain unchanged.
ALTER TABLE public.feeds ALTER COLUMN most_recent_item DROP NOT NULL;
COMMIT;
