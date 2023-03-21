#!/bin/bash
POSTGRES_CONTAINER=$(docker ps -aqf "name=greader-postgres-1")
docker exec -it $POSTGRES_CONTAINER psql -U docker -d greader
