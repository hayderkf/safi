#!/usr/bin/env bash
# اختبار الدورة الكاملة: حفظ ← قائمة ← إرسال إجابة ← عرض الإجابات
set -e
BASE="http://localhost:8601"

echo "== 1) حفظ استمارة =="
FID=$(curl -s "$BASE/forms" -H "Content-Type: application/json" \
  -d '{"title":"تجربة","ir":[{"id":"name","type":"textField","labelTranslations":{"ar":"الاسم","en":"Name"},"isRequired":true}]}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
echo "Form ID: $FID"

echo ""; echo "== 2) قائمة الاستمارات =="
curl -s "$BASE/forms" | python3 -m json.tool

echo ""; echo "== 3) إرسال إجابة =="
curl -s "$BASE/forms/$FID/submissions" -H "Content-Type: application/json" \
  -d '{"data":{"name":"حيدر"}}' | python3 -m json.tool

echo ""; echo "== 4) عرض الإجابات =="
curl -s "$BASE/forms/$FID/submissions" | python3 -m json.tool
