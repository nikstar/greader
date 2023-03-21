#!/bin/bash

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file>"
  exit 1
fi

POSTGRES_CONTAINER=$(docker ps -aqf "name=greader-postgres-1")
ddBACKUP_FILENAME="greader-$(date '+%Y-%m-%d_%H-%M-%S').sql"
docker exec -i $POSTGRES_CONTAINER psql -U docker -d greader < "$1"

