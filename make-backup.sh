#!/bin/bash

POSTGRES_CONTAINER=$(docker ps -aqf "name=greader-postgres-1")
BACKUP_FILENAME="greader-$(date '+%Y-%m-%d_%H-%M-%S').sql"
docker exec -i $POSTGRES_CONTAINER pg_dump -U docker greader > "./$BACKUP_FILENAME"

