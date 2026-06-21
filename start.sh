#!/usr/bin/env bash
# تشغيل نظام Safi: الباك إند (8601) + الواجهة (3601) في الخلفية مع سجلات
SAFI="$HOME/Documents/Safi"
mkdir -p "$SAFI/.logs"

echo "تشغيل الباك إند..."
cd "$SAFI/backend"
# shellcheck disable=SC1091
source .venv/bin/activate
nohup uvicorn app.main:app --port 8601 > "$SAFI/.logs/backend.log" 2>&1 &
echo "  → http://localhost:8601   (السجل: .logs/backend.log)"

echo "تشغيل الواجهة..."
cd "$SAFI/apps/web"
nohup npm run dev > "$SAFI/.logs/web.log" 2>&1 &
echo "  → http://localhost:3601   (السجل: .logs/web.log)"

echo ""
echo "✅ Safi يعمل. افتح: http://localhost:3601"
echo "تأكّد أن Ollama و Postgres يعملان. للإيقاف: bash ~/Documents/Safi/stop.sh"
