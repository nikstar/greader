#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
crawler_image=${1:-greader-crawler:latest}
db_container="greader-crawler-test-$$"
trap 'docker rm -fv "$db_container" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$db_container" --network none \
  -e POSTGRES_USER=docker -e POSTGRES_DB=greader_crawler_test -e POSTGRES_HOST_AUTH_METHOD=trust postgres:15 >/dev/null
for attempt in {1..30}; do
  if docker exec "$db_container" pg_isready -h 127.0.0.1 -U docker -d greader_crawler_test >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$db_container" psql -U docker -d greader_crawler_test -v ON_ERROR_STOP=1 < schema.sql >/dev/null
docker run --rm --network "container:$db_container" \
  -e PGHOST=127.0.0.1 -e PGUSER=docker -e PGDATABASE=greader_crawler_test -e TEST_CRAWLER_DATABASE=1 -e CGO_ENABLED=0 \
  "$crawler_image" go test -v ./...
