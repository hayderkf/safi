# STATUS — حالة المشروع الحالية (نقطة التسليم)

> آخر تحديث: 2026-06-20 · هذه الوثيقة تخبر أي وكيل (Claude Code) **أين توقّفنا وما التالي**. اقرأ `CLAUDE.md` و`docs/BUILD_PLAN.md` و`docs/IR_SCHEMA.md` معها.

## ما يعمل الآن ✅ (المراحل 0–3 منجزة، الواجهة v1)
- **الباك إند (FastAPI، 8601):**
  - `POST /forms/generate` — وصف عربي → مخطط IR متحقَّق منه (طبقة تجريد مزوّد → Ollama `qwen2.5:14b`، تحقّق Pydantic + حلقة إصلاح).
  - `POST /forms`, `GET /forms`, `GET /forms/{id}` — حفظ/استرجاع (Postgres، تخزين هجين JSONB).
  - `POST /forms/{id}/submissions`, `GET /forms/{id}/submissions` — الإجابات.
  - الجداول تُنشأ تلقائياً عند الإقلاع (`init_db`). قاعدة البيانات: `safi`.
- **الواجهة (Next.js، 3601):** صفحة تولّد استمارة، تعرضها كنموذج حيّ (RTL)، تعبّئها وتحفظها.
  - المُصيِّر يدعم: text, integer, double, date, datetime, time, dropdown, radio, checkbox, note, groupField + **المنطق الشرطي (visibilityWhen)**.

## التشغيل
- `bash ~/Documents/Safi/start.sh` (تشغيل) · `bash ~/Documents/Safi/stop.sh` (إيقاف).
- المتطلّبات: Ollama يشغّل `qwen2.5:14b`، Postgres يعمل وبه قاعدة `safi`.
- المنافذ: الباك إند **8601**، الواجهة **3601**.

## خريطة الملفات
- `backend/app/ai/provider.py` تجريد المزوّد · `ai/prompts.py` العقد · `forms/ir.py` نماذج IR · `forms/generate.py` التوليد+الإصلاح · `db/models.py` الجداول · `api/routes.py` التوليد · `api/store_routes.py` الحفظ.
- `apps/web/lib/{types,rules,api}.ts` · `components/FormRenderer.tsx` · `app/page.tsx`.
- `ai/poc/` نتائج إثبات المفهوم (مرجع).

## التالي (اختر من BUILD_PLAN)
- **توسعة المُصيِّر:** map, signature, file/image, matrix, table, و**التكرار الحقيقي** (groupField isRepeating بقيم مصفوفية).
- **الإسناد للبيانات الساندة (المرحلة ٤):** جداول قوائم ساندة + ربط حقول الاختيار (`dataSourceKey`) ببيانات حقيقية بدل الخيارات النائبة.
- **الباني المرئي للاستمارات:** محرّر سحب وإفلات (الويب) لتحرير الـ IR يدوياً.
- **المرحلة ٥:** الهوية والصلاحيات (RBAC) وسير المراجعة.

## بنود مفتوحة / ملاحظات
- **بناء بنيوي محسّن:** الانتقال إلى **structured output (JSON schema)** + few-shot لضمان مخرَج صالح دائماً (حالياً نعتمد التحقّق + حلقة الإصلاح).
- **Python 3.12** موصى للباك إند (3.14 على الجهاز قد يسبّب مشاكل تثبيت).
- **pgvector / MinIO / Temporal**: مؤجّلة لمراحلها (٦، التغليف، ٧).
- لا توجد هجرات Alembic بعد (نستخدم `create_all` للتطوير) — تُضاف قبل الإنتاج.
- العلاقات منطقية بلا FK صارمة (استراتيجية النظام).

## أرضية التكافؤ
راجع `docs/IMS_New_System_Tech_Stack.md` §8 — لا ينزل الجديد عن قدرات IMS القديم.
