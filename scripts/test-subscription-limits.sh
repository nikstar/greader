#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bot_image=${1:-greader-bot:latest}
db_container="greader-limits-test-$$"
trap 'docker rm -f "$db_container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$db_container" --network none \
  -e POSTGRES_USER=docker -e POSTGRES_DB=greader_limits_test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15 >/dev/null
for attempt in {1..30}; do
  if docker exec "$db_container" pg_isready -h 127.0.0.1 -U docker -d greader_limits_test >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$db_container" psql -U docker -d greader_limits_test -v ON_ERROR_STOP=1 < schema.sql >/dev/null
docker exec -i "$db_container" psql -U docker -d greader_limits_test -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
INSERT INTO users(chat_id) VALUES ('700001'),('legacy');
INSERT INTO feeds(id,url,title,last_update_time,next_update_time,most_recent_item)
SELECT n,'https://example.invalid/'||n,'Feed '||n,now(),now(),now() FROM generate_series(1,160) n;
INSERT INTO subscriptions(chat_id,feed_id,last_sent) SELECT 'legacy',id,now() FROM feeds WHERE id<=150;
SQL
docker exec -i "$db_container" psql -U docker -d greader_limits_test -v owner_chat_id=700001 < migrations/001-subscription-limits.sql >/dev/null
docker run --rm --network "container:$db_container" \
  -e PGHOST=127.0.0.1 -e PGUSER=docker -e PGDATABASE=greader_limits_test -e TEST_SUBSCRIPTION_LIMITS=1 \
  -v "$PWD/bot/test:/app/test:ro" -v "$PWD/api:/api:ro" \
  "$bot_image" sh -c 'node --test test/*.test.cjs'
