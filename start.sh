#!/usr/bin/env bash
# تشغيل نظام Safi: الباك إند (8601) + الواجهة (3601) في الخلفية مع سجلات
SAFI="$HOME/Documents/Safi"
mkdir -p "$SAFI/.logs"

echo "تشغيل الباك إند..."
cd "$SAFI/backend"
# تشغيل uvicorn مباشرةً من ثنائي venv (أصمد من تفعيل البيئة) ومفصولاً عن الطرفية
nohup ./.venv/bin/uvicorn app.main:app --port 8601 </dev/null > "$SAFI/.logs/backend.log" 2>&1 &
disown
echo "  → http://localhost:8601   (السجل: .logs/backend.log)"

echo "تشغيل الواجهة..."
cd "$SAFI/apps/web"
# تشغيل next مباشرةً (لا npm) ومفصولاً — npm يموت أحياناً مع تنظيف مجموعة العمليات
nohup ./node_modules/.bin/next dev -p 3601 </dev/null > "$SAFI/.logs/web.log" 2>&1 &
disown
echo "  → http://localhost:3601   (السجل: .logs/web.log)"

echo ""
echo "✅ Safi يعمل. افتح: http://localhost:3601"
echo "تأكّد أن Ollama و Postgres يعملان. للإيقاف: bash ~/Documents/Safi/stop.sh"
