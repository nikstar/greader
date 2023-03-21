#!/bin/bash
docker exec -i $POSTGRES_CONTAINER psql -U docker -d greader < schema.sql
