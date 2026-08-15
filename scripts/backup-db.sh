#!/bin/bash
set -euo pipefail

REGION="ca-central-1"
SECRET_ID="ratemymanagers/prod/db"
S3_BUCKET="rmm-backups-prod-138465306929-ca-central-1-an"

SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --region "$REGION" \
  --query SecretString \
  --output text)

DB_HOST=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])")
DB_PORT=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['port'])")
DB_NAME=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['dbname'])")
DB_USER=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
DB_PASS=$(echo "$SECRET" | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")

TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
FILENAME="backup_${TIMESTAMP}.sql.gz"
TMP_FILE="/tmp/${FILENAME}"

PGPASSWORD="$DB_PASS" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password \
  | gzip > "$TMP_FILE"

aws s3 cp "$TMP_FILE" "s3://${S3_BUCKET}/postgres/${FILENAME}" --region "$REGION"

rm -f "$TMP_FILE"

echo "Backup complete: s3://${S3_BUCKET}/postgres/${FILENAME}"
