#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "未找到 Node.js 或 npm。"
  exit 1
fi

if ! mongosh --quiet --eval 'db.runCommand({ping:1})' 'mongodb://127.0.0.1:27017/admin?serverSelectionTimeoutMS=2000' >/dev/null 2>&1; then
  echo "MongoDB 未运行。请先启动 MongoDB。"
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 .env。真实 AI 需要在其中填写 DeepSeek 密钥和模型名称。"
fi

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund
fi

LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
echo "电脑访问：http://localhost:5173/"
if [ -n "$LAN_IP" ]; then
  echo "手机访问：http://${LAN_IP}:5173/"
else
  echo "未检测到局域网 IP，请查看 npm run dev 输出的 Network 地址。"
fi

exec npm run dev

