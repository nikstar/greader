#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
crawler_image=${1:-greader-crawler:latest}
bot_image=${2:-greader-bot:latest}
db_container="greader-empty-feeds-test-$$"
crawler_container="${db_container}-crawler"
trap 'docker rm -fv "$crawler_container" "$db_container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$db_container" --network none \
  -e POSTGRES_USER=docker -e POSTGRES_DB=greader_empty_feed_test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15 >/dev/null
for attempt in {1..30}; do
  if docker exec "$db_container" pg_isready -h 127.0.0.1 -U docker -d greader_empty_feed_test >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$db_container" pg_isready -h 127.0.0.1 -U docker -d greader_empty_feed_test >/dev/null
docker exec -i "$db_container" psql -U docker -d greader_empty_feed_test -v ON_ERROR_STOP=1 < schema.sql >/dev/null
docker exec -i "$db_container" psql -U docker -d greader_empty_feed_test -v owner_chat_id=700001 < migrations/001-subscription-limits.sql >/dev/null
docker exec -i "$db_container" psql -U docker -d greader_empty_feed_test < migrations/002-delivery-state.sql >/dev/null
# Exercise the upgrade from the previous NOT NULL schema as well as new installs.
docker exec "$db_container" psql -U docker -d greader_empty_feed_test -v ON_ERROR_STOP=1 \
  -c 'ALTER TABLE feeds ALTER COLUMN most_recent_item SET NOT NULL' >/dev/null
docker exec -i "$db_container" psql -U docker -d greader_empty_feed_test < migrations/003-empty-feeds.sql >/dev/null
docker run -d --name "$crawler_container" --network "container:$db_container" \
  -e PGHOST=127.0.0.1 -e PGUSER=docker -e PGDATABASE=greader_empty_feed_test "$crawler_image" >/dev/null
docker run --rm --network "container:$db_container" \
  -e PGHOST=127.0.0.1 -e PGUSER=docker -e PGDATABASE=greader_empty_feed_test -e CRAWLER_HOST=127.0.0.1 \
  -v "$PWD/bot/test/empty-feeds-flow.cjs:/app/test/empty-feeds-flow.cjs:ro" \
  "$bot_image" node test/empty-feeds-flow.cjs
