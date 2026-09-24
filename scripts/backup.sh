#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_ROOT="$APP_DIR/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
MONGO_DB="${MONGO_DB:-smart_planter_demo}"

if [[ "$MONGO_DB" != smart_planter_demo ]]; then
  echo "拒绝备份非演示数据库：$MONGO_DB"
  exit 1
fi

mongodump --uri="$MONGO_URI" --db="$MONGO_DB" --out="$DEST"
echo "备份完成：$DEST/$MONGO_DB"

