#!/bin/bash
set -e

CONTAINER="ratemymanagers-db"
DB="ratemymanagers"
USER="postgres"
SEED_FILE="$(dirname "$0")/seed-data.sql"

echo "→ Stopping API to release DB connections..."
docker stop ratemymanagers-api 2>/dev/null || true

echo "→ Dropping and recreating database..."
docker exec "$CONTAINER" psql -U "$USER" -c "DROP DATABASE IF EXISTS $DB;"
docker exec "$CONTAINER" psql -U "$USER" -c "CREATE DATABASE $DB;"

echo "→ Restarting API (runs Flyway migrations)..."
docker start ratemymanagers-api

echo "→ Waiting for API to finish migrations..."
until docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -c "SELECT 1 FROM flyway_schema_history LIMIT 1;" &>/dev/null; do
  sleep 2
done

echo "→ Seeding data..."
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" < "$SEED_FILE"

echo "✓ Done! Database reset and seeded."
