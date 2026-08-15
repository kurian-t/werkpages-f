#!/bin/bash
# Usage: ./restore-db.sh backup_20260422_030000.sql.gz
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup-filename>"
  echo "Example: $0 backup_20260422_030000.sql.gz"
  exit 1
fi

REGION="ca-central-1"
SECRET_ID="ratemymanagers/prod/db"
S3_BUCKET="rmm-backups-prod-138465306929-ca-central-1-an"
FILENAME="$1"
TMP_FILE="/tmp/${FILENAME}"

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

echo "Downloading s3://${S3_BUCKET}/postgres/${FILENAME} ..."
aws s3 cp "s3://${S3_BUCKET}/postgres/${FILENAME}" "$TMP_FILE" --region "$REGION"

echo "Restoring into ${DB_NAME} on ${DB_HOST} ..."
gunzip -c "$TMP_FILE" | PGPASSWORD="$DB_PASS" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-password

rm -f "$TMP_FILE"

echo "Restore complete."
