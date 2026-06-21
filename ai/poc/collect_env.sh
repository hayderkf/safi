#!/usr/bin/env bash
# IMS New System — Environment & Stack Report (READ-ONLY, لا يغيّر شيئاً)
# التشغيل:  bash collect_env.sh   ثم ألصق محتوى الملف الناتج ims_env_report.txt
set +e
OUT="$(dirname "$0")/ims_env_report.txt"
exec > >(tee "$OUT") 2>&1
echo "================ IMS ENV REPORT — $(date) ================"

echo; echo "## نظام التشغيل / المعمارية"
uname -a
command -v sw_vers >/dev/null 2>&1 && sw_vers

echo; echo "## المعالج / الشريحة / الذاكرة"
if [ "$(uname)" = "Darwin" ]; then
  system_profiler SPHardwareDataType 2>/dev/null | grep -E "Chip|Processor|Memory|Cores|Model Name"
  echo "Total RAM bytes: $(sysctl -n hw.memsize 2>/dev/null)"
else
  lscpu 2>/dev/null | grep -E "Model name|^CPU\(s\)|^Architecture"
  grep MemTotal /proc/meminfo 2>/dev/null
fi

echo; echo "## كرت الرسوم (GPU) — يحدّد حجم النموذج"
if [ "$(uname)" = "Darwin" ]; then
  system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset|VRAM|Metal|Vendor|Total Number of Cores"
  echo "(Apple Silicon: الذاكرة موحّدة = RAM أعلاه)"
elif command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv
else
  echo "لا يوجد nvidia-smi (لا GPU من NVIDIA)"
fi

echo; echo "## المساحة الحرة"
df -h . 2>/dev/null

echo; echo "## Ollama"
if command -v ollama >/dev/null 2>&1; then
  ollama --version
  echo "-- النماذج المثبّتة --"
  ollama list
else
  echo "ollama غير موجود في PATH"
fi

echo; echo "## اختبار سريع لـ gemma4:e2b (عربي + JSON)"
if command -v curl >/dev/null 2>&1; then
  curl -s --max-time 180 http://localhost:11434/api/generate -d '{
    "model":"gemma4:e2b",
    "prompt":"أعد فقط مصفوفة JSON صالحة فيها حقل استمارة واحد بهذا الشكل تماماً ودون أي شرح: [{\"type\":\"textField\",\"labelTranslations\":{\"ar\":\"الاسم الكامل\",\"en\":\"Full Name\"},\"isRequired\":true}]",
    "stream":false,
    "options":{"temperature":0.2}
  }' | (command -v python3 >/dev/null 2>&1 && python3 -c "import sys,json
try:
    d=json.load(sys.stdin)
    print('--- مخرَج النموذج ---'); print(d.get('response','(لا يوجد ردّ)'))
    td=d.get('total_duration');
    print('--- tokens(eval_count):',d.get('eval_count'),' | الزمن(ث):', round(td/1e9,1) if td else None)
except Exception as e:
    print('تعذّر تحليل الردّ — هل خدمة Ollama تعمل؟', e)" || cat)
else
  echo "curl غير موجود"
fi

echo; echo "## اللغات / الأدوات"
for t in python3 pip3 node npm docker psql git; do
  if command -v "$t" >/dev/null 2>&1; then printf "%-8s " "$t"; "$t" --version 2>&1 | head -1; else echo "$t: غير موجود"; fi
done

echo; echo "## توفّر pgvector (محاولة — قد تحتاج خادم DB يعمل)"
if command -v psql >/dev/null 2>&1; then
  psql -tAc "SELECT name, default_version FROM pg_available_extensions WHERE name='vector';" 2>/dev/null || echo "(تعذّر الاستعلام بلا بيانات اتصال — تخطٍّ)"
else
  echo "psql غير موجود"
fi

echo; echo "================ نهاية التقرير (حُفظ في $OUT) ================"
