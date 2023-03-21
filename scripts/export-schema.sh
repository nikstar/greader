#!/bin/bash
POSTGRES_CONTAINER=$(docker ps -aqf "name=greader-postgres-1")
docker exec -i $POSTGRES_CONTAINER pg_dump -s -U docker greader > schema.sql
