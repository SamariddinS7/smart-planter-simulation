#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "用法：./scripts/restore.sh backups/时间戳/smart_planter_demo"
  exit 1
fi

SOURCE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
if [ ! -d "$SOURCE" ] || [ "$(basename "$SOURCE")" != "smart_planter_demo" ]; then
  echo "恢复源必须是 mongodump 生成的 smart_planter_demo 目录。"
  exit 1
fi

MONGO_URI="${MONGO_URI:-mongodb://127.0.0.1:27017}"
MONGO_DB="${MONGO_DB:-smart_planter_demo}"
if [[ "$MONGO_DB" != smart_planter_demo ]]; then
  echo "拒绝恢复到非演示数据库：$MONGO_DB"
  exit 1
fi

echo "即将覆盖 smart_planter_demo。输入 RESTORE_DEMO 继续："
read -r CONFIRM
if [ "$CONFIRM" != "RESTORE_DEMO" ]; then
  echo "已取消。"
  exit 1
fi

mongorestore --uri="$MONGO_URI" --db="$MONGO_DB" --drop "$SOURCE"
echo "恢复完成。"

