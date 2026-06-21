# Safi Backend — خدمة التوليد و API

خدمة Python/FastAPI: تحوّل وصفاً عربياً إلى مخطط استمارة (IR) متحقَّق منه، عبر طبقة تجريد مزوّد (Ollama الآن).

## التشغيل (تطوير محلي)
يتطلّب: Python 3.12 + خدمة Ollama تعمل مع `qwen2.5:14b`.

```bash
cd ~/Documents/Safi/backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # عدّل عند الحاجة
uvicorn app.main:app --reload --port 8601
```

## اختبار
```bash
curl -s http://localhost:8601/health

curl -s http://localhost:8601/forms/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"استمارة تسجيل أسرة نازحة: الاسم، هل يوجد أطفال؟ (نعم/لا)، وإذا نعم أظهر عدد الأطفال (رقم). أضف تاريخ النزوح."}' | python3 -m json.tool
```

التوثيق التفاعلي: http://localhost:8601/docs

> المنافذ المحجوزة لـ Safi: **8601** (الباك إند) و**3601** (الواجهة لاحقاً).

## البنية
- `app/config.py` — الإعدادات (env).
- `app/ai/provider.py` — تجريد المزوّد (LLMProvider + OllamaProvider).
- `app/ai/prompts.py` — التعليمة النظامية (العقد) + رسالة الإصلاح.
- `app/forms/ir.py` — نماذج مخطط الاستمارة (Pydantic) + فحوص الجودة.
- `app/forms/generate.py` — خدمة التوليد + حلقة الإصلاح.
- `app/api/routes.py` — نقطة `/forms/generate`.
- `app/main.py` — تطبيق FastAPI.
