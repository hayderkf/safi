#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
IMS PoC — اختبار توليد الاستمارات بالعربية (Ollama، محلي) — نسخة موسّعة.
يختبر البنى المتقدمة: صفحات/Stepper، جداول، مصفوفات، ومجموعات متكررة.
التشغيل:  python3 poc_form_eval.py    (تتطلّب خدمة Ollama تعمل)
"""
import json, re, time, urllib.request, os

OLLAMA = "http://localhost:11434/api/generate"
MODELS = ["gemma4:26b", "qwen2.5:14b"]   # عدّلها حسب ما لديك
OUTDIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "poc_out")
os.makedirs(OUTDIR, exist_ok=True)

SYSTEM = """أنت مولّد استمارات لنظام IMS. حوّل وصف المستخدم إلى مصفوفة JSON فقط (بلا أي شرح أو Markdown).
كل حقل يحوي على الأقل: "id" (نصّي فريد)، "type"، "labelTranslations":{"ar":"..","en":".."}، "isRequired".

أنواع الحقول:
- الأساسية: textField, integerField, doubleField, dateField, fileField, imageField, mapField, noteField
- الاختيار: dropdownField, radioField, checkboxField  → أضف "options":[{"valueKey":"k","valueTranslations":{"ar":"..","en":".."}}]
- groupField (حاوية): تضع حقولاً داخل "subFields". استخدمها لـ:
    • صفحة/خطوة في معالج متعدد الصفحات: أضف "layout":"step" و "labelTranslations" كعنوان الصفحة.
    • قسم متكرّر (بيانات تتكرّر مثل أفراد الأسرة): أضف "isRepeating": true.
- tableField (جدول): أضف "columns":[{"key":"..","labelTranslations":{..},"type":"textField|integerField|.."}]
- matrixField (مصفوفة تقييم): أضف "matrixRows":[{"key":"..","labelTranslations":{..}}] و "options":[..الأعمدة/المقياس..] و "matrixMode":"single".

الحقل المشروط: أضف "visibilityWhen":{"mode":"all","rules":[{"sourceFieldId":"<id>","operator":"==","triggerValue":"<v>"}]}

أعد JSON صالحاً فقط يبدأ بـ [ وينتهي بـ ]."""

TESTS = [
    ("multi_step",
     "أنشئ استمارة تقييم مشروع على شكل معالج من ثلاث صفحات (stepper): "
     "الصفحة الأولى «معلومات المشروع» (اسم المشروع، المحافظة، تاريخ البدء)، "
     "الصفحة الثانية «المؤشرات» (عدد المستفيدين، نسبة الإنجاز، حالة المشروع: جارٍ/متوقف/منجز)، "
     "الصفحة الثالثة «التوصيات» (التقييم العام: ضعيف/متوسط/جيد/ممتاز، وملاحظات)."),
    ("data_table",
     "أنشئ استمارة متابعة شهرية فيها: اسم المركز، "
     "وجدول للأرقام الشهرية أعمدته: الشهر (نص)، عدد الزيارات (رقم)، عدد المستفيدين (رقم)، الكلفة (رقم عشري). "
     "وأضف مصفوفة تقييم لثلاثة معايير (الجودة، الالتزام بالوقت، رضا المستفيدين) على مقياس (ضعيف/متوسط/جيد/ممتاز)."),
    ("repeating_group",
     "أنشئ استمارة تسجيل أسرة: معلومات رب الأسرة (الاسم، رقم الهاتف)، "
     "ثم قسم متكرّر «أفراد الأسرة» يمكن إضافته عدة مرّات، كل فرد فيه: الاسم، العمر (رقم)، "
     "صلة القرابة (اختيار: زوج/زوجة/ابن/ابنة/أخرى)، وهل يدرس؟ (نعم/لا)."),
]

def call(model, prompt):
    body = json.dumps({"model": model, "system": SYSTEM, "prompt": prompt,
                       "stream": False, "options": {"temperature": 0.2}}).encode("utf-8")
    req = urllib.request.Request(OLLAMA, data=body, headers={"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=400) as r:
        d = json.loads(r.read().decode("utf-8"))
    return d.get("response", ""), round(time.time() - t0, 1)

def extract_json(text):
    text = text.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(text)
    except Exception:
        m = re.search(r"\[.*\]", text, re.S)
        if m:
            try: return json.loads(m.group(0))
            except Exception: return None
    return None

def walk(fields, st):
    if not isinstance(fields, list): return
    for f in fields:
        if not isinstance(f, dict): continue
        st["count"] += 1
        lt = f.get("labelTranslations")
        if isinstance(lt, dict) and lt.get("ar"): st["arabic"] += 1
        t = f.get("type")
        if t == "tableField": st["table"] += 1
        if t == "matrixField": st["matrix"] += 1
        if t == "groupField":
            layout = str(f.get("layout") or f.get("displayMode") or "").lower()
            if "step" in layout or "page" in layout: st["steps"] += 1
            if f.get("isRepeating") is True: st["repeating"] += 1
        if f.get("visibilityWhen") or f.get("requiredWhen"): st["conditional"] += 1
        walk(f.get("subFields"), st)

def validate(arr):
    st = {"valid": isinstance(arr, list) and bool(arr), "count": 0, "arabic": 0,
          "steps": 0, "table": 0, "matrix": 0, "repeating": 0, "conditional": 0}
    if st["valid"]: walk(arr, st)
    return st

YN = lambda n: "✅" if n else "—"
print("=" * 78)
print("IMS PoC — اختبار البنى المتقدمة (Stepper / جدول / مصفوفة / تكرار)")
print("=" * 78)
rows = []
for model in MODELS:
    for tid, prompt in TESTS:
        try:
            resp, secs = call(model, prompt)
        except Exception as e:
            print(f"\n[{model}/{tid}] خطأ: {e}"); rows.append((model, tid, "ERR","-","-","-","-","-")); continue
        v = validate(extract_json(resp))
        open(os.path.join(OUTDIR, f"{model.replace(':','_')}__{tid}.json"), "w", encoding="utf-8").write(resp)
        rows.append((model, tid, "✅" if v["valid"] else "❌",
                     YN(v["steps"]), YN(v["table"]), YN(v["matrix"]), YN(v["repeating"]), f"{secs}s"))
        print(f"\n[{model}/{tid}] JSON={'صالح' if v['valid'] else 'لا'} حقول={v['count']} "
              f"steps={v['steps']} table={v['table']} matrix={v['matrix']} repeat={v['repeating']} {secs}s")

print("\n" + "=" * 78)
print(f'{"النموذج":<14}{"الاختبار":<16}{"JSON":<6}{"صفحات":<7}{"جدول":<6}{"مصفوفة":<8}{"تكرار":<7}{"الزمن"}')
print("-" * 78)
for r in rows:
    print(f'{r[0]:<14}{r[1]:<16}{str(r[2]):<6}{str(r[3]):<7}{str(r[4]):<6}{str(r[5]):<8}{str(r[6]):<7}{r[7]}')
print("=" * 78)
print(f"المخرجات الكاملة في: {OUTDIR}  — ألصق الجدول وسأقرأ المخرجات وأقيّم الجودة.")
