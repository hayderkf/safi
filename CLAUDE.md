# CLAUDE.md — Safi

نظام **Safi**: منصة تقييم ومتابعة قابلة للبرمجة، معزّزة بالذكاء الاصطناعي (تخلف IMS القديم وتتجاوزه).
هذا الملف يُقرأ تلقائياً من Claude Code. **اقرأ `docs/` قبل أي قرار معماري.**

## القواعد الذهبية
- راجع `docs/IMS_New_System_Founding_Vision.md` و`docs/IMS_Technical_Challenges_Register.md` و`docs/IMS_New_System_Tech_Stack.md` قبل البناء.
- **لا أسرار في الكود** (متغيرات بيئة فقط). **لا بناء SQL نصّي** — ORM/parameterized.
- كل مخرَج ذكاء: **مصدر + درجة ثقة + إنسان في الحلقة**. إسناد مغلق (لا مصادر خارجية إلا بإذن).
- **العربية أولاً + RTL**. النموذج محلي (سيادة بيانات).
- **أرضية التكافؤ:** لا ينزل النظام عن قدرات IMS القديم.
- أبقِ الوثائق **موجزة وحديثة**؛ حدّثها مع كل قرار.

## المكدّس
- **الفرونت (ويب الآن):** Next.js + TypeScript. لاحقاً: `android`/`ios`/`desktop` كلٌّ **native** بتخصصه (لا Flutter).
- **الباك إند:** Python / FastAPI (async).
- **قاعدة البيانات:** PostgreSQL 17 + pgvector — تخزين هجين (JSONB لكل عينة + Views/أعمدة مولّدة).
- **الذكاء:** `qwen2.5:14b` محلي عبر Ollama، **خلف طبقة تجريد مزوّد**. Embeddings: BGE `bge-m3`.
- **سير العمل:** ReactFlow (محرّر) + Temporal (تنفيذ — أساسي؛ بديل statechart عند ضعف الأداء، DR-1).

## البنية
- `apps/web` — Next.js (نبدأ هنا).
- `apps/{android,ios,desktop}` — لاحقاً، native لكل منصة.
- `packages/shared-web` — للويب فقط (TS): أنواع IR + محرّك القواعد + عميل API + مُصيِّر العرض.
- `backend` — FastAPI؛ **المصدر الموحّد للعقد** (IR + API + قواعد).
- `ai` — تجريد المزوّد + الموجّهات + التقييم (`ai/poc` نتائج إثبات المفهوم).
- `infra` — Docker Compose (نشر فقط).
- `docs` — الوثائق والعقود.

## مصدر الحقيقة الموحّد (حاسم)
العقد = **مخطط الاستمارة IR (`docs/IR_SCHEMA.md`) + API + قواعد DSL**، يُعرَّف في `backend`. كل منصة **تنفّذ ضدّه** — لا كود مشترك بين اللغات، بل عقد مشترك يمنع التباعد.

## التشغيل (تطوير محلي — بلا Docker)
- Postgres محلي + تفعيل امتداد `pgvector`.
- Backend: `venv` بـ Python **3.12** + `uvicorn`.
- Web: `npm`/`pnpm` + `next dev`.
- Ollama يشغّل `qwen2.5:14b` على `localhost:11434`.
- Docker لاحقاً: للنشر + خدمات MinIO/Temporal فقط.

## الحالة الراهنة (ابدأ من هنا)
اقرأ **`docs/STATUS.md`** (ما أُنجز وما التالي) و**`docs/DECISIONS_AND_JOURNEY.md`** (لماذا اخترنا ما اخترنا + النقاط المضيئة). التشغيل: `start.sh` / `stop.sh`.

## خطة البناء
انظر `docs/BUILD_PLAN.md`. **ابدأ بالهيكل الماشي وخدمة التوليد قبل التوسّع.**
