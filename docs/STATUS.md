# STATUS — حالة المشروع الحالية (نقطة التسليم)

> آخر تحديث: 2026-06-21 · هذه الوثيقة تخبر أي وكيل (Claude Code) **أين توقّفنا وما التالي**. اقرأ `CLAUDE.md` و`docs/BUILD_PLAN.md` و`docs/IR_SCHEMA.md` معها.

## ما يعمل الآن ✅ (المراحل 0–4 + مصادقة المرحلة ٥ في الباك إند)
- **الباك إند (FastAPI، 8601):**
  - `POST /forms/generate` — وصف عربي → مخطط IR متحقَّق منه (طبقة تجريد مزوّد → Ollama `qwen2.5:14b`، تحقّق Pydantic + حلقة إصلاح).
  - `POST /forms`, `GET /forms`, `GET /forms/{id}` — حفظ/استرجاع (Postgres، تخزين هجين JSONB).
  - `POST /forms/{id}/submissions`, `GET /forms/{id}/submissions` — الإجابات.
  - **البيانات الساندة (المرحلة ٤):** `GET/POST /lookups`, `GET /lookups/{key}` (مع `?parent=` للتتالي), `POST /lookups/{key}/items`. جداول `lookup_lists` + `lookup_items` **بأعمدة إسناد** (`source`/`confidence`/`version`). بذور حيّة: محافظات العراق (18) + أقضية مختارة (15) متتالية. التحقّق الحيّ ✅.
  - **الهوية والصلاحيات (المرحلة ٥):** `POST /auth/login` (JWT)، `GET /auth/me`، `POST /auth/register` (يتطلّب `users:manage`). **RBAC**: جداول `users` + `roles`؛ أدوار مزروعة (admin/reviewer/data_entry/viewer)، ومسؤول أولي `admin/admin` (dev — غيّره). الرمز **HS256 بالمكتبة القياسية** + تجزئة **PBKDF2**. تبعية `require_permission` تحمي: **التوليد** (`forms:generate`)، **حفظ الاستمارات** (`forms:write`)، **الإرسال** (`submissions:write`)، **كتابة القوائم** (`lookups:write`). القراءات مفتوحة. تحقّق حيّ ✅ (بلا رمز=401، admin=200).
  - الجداول تُنشأ تلقائياً عند الإقلاع (`init_db`) + بذور idempotent (`seed_lookups` + `seed_auth`). قاعدة البيانات: `safi`.
- **الواجهة (Next.js، 3601):** صفحة تولّد استمارة، تعرضها كنموذج حيّ (RTL)، تعبّئها وتحفظها.
  - المُصيِّر يدعم **مجموعة الأنواع الكاملة**: text, integer/double/number, date/datetime/time, dropdown, radio, checkbox, note + range, rate, file/image/audio/video, signature (canvas), map (lat/lng + تحديد الموقع), qrcode + **جدول** (`tableField` صفوف ديناميكية بأعمدة مُنمّطة) + **مصفوفة** (`matrixField` single/multiple) + **التكرار الحقيقي** (`groupField isRepeating` كمصفوفة نطاقات بإضافة/حذف) + **المنطق الشرطي** (`visibilityWhen`/`requiredWhen`).
  - **ربط القوائم الساندة:** حقل الاختيار الذي يحمل `dataSourceKey` يجلب خياراته من `/lookups` (مع التتالي عبر `parentFieldId`) ويعرض **شارة الإسناد** (المصدر + العدد). زرّ «تجربة قوائم ساندة» في الصفحة يحمّل استمارة محافظة←قضاء للتأكّد البصري.
  - **الباني المرئي (`/builder`):** لوحة أنواع + شجرة حقول (مجموعات متداخلة، إعادة ترتيب/حذف) + محرّر خصائص كامل (عنوان/إلزام/خيارات ثابتة أو **ربط قائمة ساندة + تتالٍ**/أعمدة جدول/صفوف مصفوفة/شرط رؤية) + **معاينة حيّة**. يبدأ فارغاً أو من توليد AI أو بتحميل استمارة محفوظة، ويحفظ عبر `/forms`.
  - **المصادقة (`AuthBar`):** شريط دخول مُدمج في الصفحتين (تخزين الرمز في localStorage، إرفاق `Authorization` آلياً في `lib/api`، إظهار المستخدم/الأدوار + خروج). التوليد/الحفظ/الإرسال تتطلّب دخولاً (admin/admin).

## التشغيل
- `bash ~/Documents/Safi/start.sh` (تشغيل) · `bash ~/Documents/Safi/stop.sh` (إيقاف).
- المتطلّبات: Ollama يشغّل `qwen2.5:14b`، Postgres يعمل وبه قاعدة `safi`.
- المنافذ: الباك إند **8601**، الواجهة **3601**.

## خريطة الملفات
- `backend/app/ai/provider.py` تجريد المزوّد · `ai/prompts.py` العقد · `forms/ir.py` نماذج IR · `forms/generate.py` التوليد+الإصلاح · `db/models.py` الجداول (forms/submissions + lookup_lists/items + users/roles) · `db/seed.py` البذور · `auth/security.py` (تجزئة+JWT) · `auth/deps.py` (المستخدم الحالي + require_permission) · `api/{routes,store_routes,lookup_routes,auth_routes}.py`.
- `apps/web/lib/{types,rules,api,builder}.ts` · `components/{FormRenderer,SignaturePad}.tsx` · `app/page.tsx` (التوليد) · `app/builder/page.tsx` (الباني).
- `ai/poc/` نتائج إثبات المفهوم (مرجع).

## التالي (اختر من BUILD_PLAN)
- ✅ **توسعة المُصيِّر — منجز** (range/rate/file/image/signature/map/qrcode + جدول + مصفوفة + التكرار الحقيقي). فرع `feat/renderer-expansion`.
- ✅ **البيانات الساندة والإسناد (المرحلة ٤) — منجز** (قوائم + عناصر بإسناد + تتالٍ + ربط الواجهة + شارة الإسناد). نفس الفرع.
- ✅ **الباني المرئي للاستمارات — منجز** (`/builder`: لوحة + شجرة + محرّر خصائص + ربط القوائم + معاينة + حفظ/تحميل/بدء بـ AI). نفس الفرع.
- ✅ **المرحلة ٥ (المصادقة) — منجزة:** RBAC في الباك إند + ربط واجهة الدخول + حماية التوليد/الحفظ/الإرسال/كتابة القوائم. **التالي:** **سير المراجعة** (حالات الاستمارة/العينة: مسودة→مراجعة→معتمد/مرفوض + صلاحية `forms:review` + سجلّ تدقيق)، و**لوحة إدارة المستخدمين/الأدوار** في الواجهة، و**مستخدم خارجي بلا حساب** (رابط/رمز إرسال عام).
- **تحسينات الباني (لاحقاً):** سحب وإفلات فعلي، تحرير `requiredWhen`/`enabledWhen`، تحديث المراجع تلقائياً عند تغيير المعرّف، تحرير `subFields` بين المجموعات.

## بنود مفتوحة / ملاحظات
- **بناء بنيوي محسّن:** الانتقال إلى **structured output (JSON schema)** + few-shot لضمان مخرَج صالح دائماً (حالياً نعتمد التحقّق + حلقة الإصلاح).
- **Python 3.12** موصى للباك إند (3.14 على الجهاز قد يسبّب مشاكل تثبيت).
- **pgvector / MinIO / Temporal**: مؤجّلة لمراحلها (٦، التغليف، ٧).
- لا توجد هجرات Alembic بعد (نستخدم `create_all` للتطوير) — تُضاف قبل الإنتاج.
- العلاقات منطقية بلا FK صارمة (استراتيجية النظام).
- **البيانات الساندة:** البذور الحالية عيّنة يدوية (18 محافظة + 15 قضاء). الاستيراد الكامل للأقضية/النواحي من GADM (`IMSDIR/gadm41_IRQ_*.json`) متبقٍّ. لا واجهة إدارة للقوائم بعد (عبر API فقط) — تأتي مع الباني/لوحة الإدارة.
- **المصادقة (مهم للإنتاج):** JWT بالمكتبة القياسية (HS256) وتجزئة PBKDF2 — كافٍ للتطوير؛ يُرقَّى لاحقاً إلى مكتبة JWT موثّقة + argon2/bcrypt. **غيّر `admin/admin` و`JWT_SECRET` عبر البيئة قبل أي نشر.** حالياً المُنفَّذ فقط `lookups:write`؛ حماية بقية المسارات تأتي مع ربط واجهة الدخول. الرمز عديم الحالة (يبطل عند إعادة التشغيل إن لم يُضبط `JWT_SECRET`).

## أرضية التكافؤ
راجع `docs/IMS_New_System_Tech_Stack.md` §8 — لا ينزل الجديد عن قدرات IMS القديم.
