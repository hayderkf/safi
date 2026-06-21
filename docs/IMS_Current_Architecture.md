# وثيقة المعمارية الحالية لنظام IMS

> **الغرض:** توصيف دقيق للنظام الحالي **كما هو موجود فعلاً في الكود** (وضع قراءة فقط)، ليكون مرجعاً عند تصميم وبناء النظام الذكي الجديد (Python + Next.js + PostgreSQL/pgvector).
> **تاريخ الاستكشاف:** 2026-06-12
> **نطاق الفحص:** `serverIMS` (الباك إند) + `clientIMS/imsweb` (الفرونت إند) + `DocsIMS` + نماذج البيانات.

---

## 1. نظرة عامة (Executive Summary)

نظام IMS منصة **Forms-Based** ديناميكية: بدلاً من برمجة شاشة لكل استمارة، يُخزَّن **تعريف** الاستمارة وحقولها في قاعدة البيانات، وتُبنى واجهة الإدخال ومحرك الـ CRUD تلقائياً من هذا التعريف. الركائز الثلاث:

1. **Generic Router** في الباك إند: نقطة دخول واحدة تنفّذ Get/Insert/Update/Delete/Upsert لأي جدول من خلال اسم `collection` يُرسَل في جسم الطلب — دون راوتر مخصص لكل جدول.
2. **محرك ديناميكي في الفرونت**: `FieldWidgetsFactory` يبني الحقول من تعريفها، و`GenericCrudScreen` + `StaticMethodsRegistry` يولّدان شاشات العرض/البحث/الإضافة/التعديل لأي موديل.
3. **ثلاثية الموديل الموحدة**: لكل كيان (Dart Model) + (Node Schema JSON) + (جدول PostgreSQL) — **بلا أي Foreign Keys**، والعلاقات تُدار منطقياً عبر تطابق المعرّفات النصية.

| البُعد | القيمة الفعلية |
|---|---|
| الباك إند | Node.js + Express 4.21 + Socket.io 4.8 |
| قاعدة البيانات | PostgreSQL 17 (Pool حد أقصى 20 اتصال، SSL) |
| الفرونت إند | Flutter (ويب + موبايل)، الإصدار `1.1.40+104`، Dart SDK ^3.5.4 |
| إدارة الحالة | Provider (`ChangeNotifier`) |
| التخزين المحلي | Hive + sqflite |
| عدد موديلات الباك | **66** ملف schema |
| عدد موديلات Dart | **41** ملف |
| ملفات `.sql` | **0** (الجداول تُنشأ من schemas الـ JS، لا من سكربتات SQL) |
| قيود Foreign Key في الكود | **0** (لا `FOREIGN KEY` ولا `REFERENCES` في أي مكان) |

---

## 2. الباك إند (serverIMS / Node.js)

### 2.1 نقطة الدخول والإعداد
- **`index.js`**: يهيّئ Express + HTTP server + Socket.io (CORS مفتوح `*`، نقلات websocket/polling). الخادم يستمع على **المنفذ 3003** (`0.0.0.0`).
- **`databaseconfig/configdb.js`**: ينشئ `Pool` من `pg` للاتصال بـ PostgreSQL (`max: 20`، `ssl.rejectUnauthorized:false`، مهلات 30 ثانية).
- **التبعيات الرئيسية** (`package.json`): `express`, `pg`, `socket.io`, `jsonwebtoken`, `bcryptjs`, `multer`, `pg-escape`, `@google/generative-ai` (Gemini)، `@sendgrid/mail`, `firebase-admin`.

### 2.2 Generic Router — قلب النظام
- **`routes/generic.js`** يعرّف مساراً واحداً لكل عملية، جميعها محميّة بـ `auth`:
  - قراءة: `/be/generic/get-anydocsdyninit`, `/be/generic/get-anydoc`
  - كتابة: `/be/generic/add-anydoc`, `/be/generic/update-anydoc`
  - upsert خاص بالاستمارات: `/be/generic/upsert-submission-fields`
  - حذف: `/be/generic/delete-anydoc`
- الجدول المستهدف يُحدَّد من `req.body.collection`، والبحث/الترتيب/الصفحات من `searchExpr, sort, page, limit`.
- **`controllers/genericController.js`** يحتوي معالجات: `getDocsdyninit`, `getDoc`, `addDoc`, `addDocWithRet`, `addDocWithMany`, `updateDoc`, `updateGroup`, `deleteDoc`, `deleteGroup`, و`upsertSubmissionWithFieldsCompact`.

### 2.3 مولّد الاستعلامات الديناميكي
- **`databaseconfig/trimbuildquery.js`** (~1,600 سطر) هو المحرك: `buildQuery()` يبني `select/insert/update/delete/selectview/selectcount`، و`buildStatmentForInsert()`/`buildstatmentForUpdate()` يحوّلان كائن البيانات إلى جُمَل SQL حسب نوع كل حقل (uuid, string, json, listjson, date, datetime...).
- **بحث متقدم** عبر `buildQueryCondition()` يدعم: نطاقات (range)، بحث داخل JSONB بالمفتاح/القيمة (`labelTranslations->>'ar' ILIKE ...`)، بحث حسب نوع القيمة، بحث حسب الحقول، و SQL خام، مع منطق `AND/OR` ديناميكي.

> ⚠️ **ملاحظة أمنية (للنظام الجديد):** كثير من الشروط تُبنى عبر **string interpolation** مباشرة للقيم، ما يفتح باب **SQL Injection**. كما توجد **أسرار مزروعة في الكود** (بيانات اتصال قاعدة البيانات في `configdb.js`، مفتاح توقيع JWT `"passwordKey"`، توكنات WhatsApp). يجب في النظام الجديد استخدام **Parameterized Queries / ORM** ونقل كل الأسرار إلى متغيرات بيئة.

### 2.4 المصادقة والصلاحيات
- **`middlewares/auth.js`**: يقرأ التوكن من هيدر `x-auth-token`، يتحقق عبر `jwt.verify(token, "passwordKey")`، ويضع `req.user`. يوجد أيضاً `middlewares/admin.js` لمسارات إدارية.
- **`routes/auth.js`**: register / login / verify / resetPassword (تجزئة كلمات المرور بـ bcryptjs).

### 2.5 Realtime والتكاملات
- **`sockets/surSocket.js`**: يتحقق من JWT عند الاتصال، يمنع الجلسات المكررة، يضمّ المستخدم إلى غرفة `USER:{uid}`، ويسجّل حالة الاتصال في قاعدة البيانات.
- **`services/SurvNotificationService.js`**: يُطلق إشعارات فورية عند أحداث مثل إضافة عضو لفريق، نشر استمارة لفريق، أو تغيّر حالة عينة — بالبث إلى غرفة المستخدم (`new_notification`).
- **`whatsapproutecont/whatsapp.js`**: تكامل مع WhatsApp Business API (Graph API) لإرسال قوالب الرسائل.
- **`uploads/`** + `routes/uploadfile.js`: رفع الملفات/الصور (يشمل مساراً يستقبل Base64 ويكتبه على القرص ثم يحدّث السجل).

---

## 3. الفرونت إند (clientIMS/imsweb / Flutter)

### 3.1 البنية وإدارة الحالة
- **State**: نمط **Provider**؛ المحور هو **`provider/dynimcGeneralProvider.dart`** الذي يخزّن لكل موديل: حالة العرض (0=قائمة، 1=إضافة، 2=تعديل)، الكائن الحالي، والقيم القصوى — ويستدعي `notifyListeners()`.
- **التبعيات البارزة** (`pubspec.yaml`): `provider`, `http`, `socket_io_client`, `hive`/`hive_flutter`/`sqflite`, `pluto_grid`, `flutter_quill`, `google_maps_flutter`, `image_picker`/`camera`, `excel`/`csv`/`pdf` (تصدير).

### 3.2 المحرك الديناميكي للاستمارات
- **`FormFieldModel.dart`** يعرّف الحقل: النوع (`FieldType`)، ترجمات متعددة اللغات (`labelTranslations`)، القيمة، أوضاع القيمة الافتراضية/الإلزام/الرؤية/التفعيل (direct أو conditional)، قواعد القيم المشروطة، الخيارات، الحقول الفرعية (`subFields`)، خصائص المظهر، والمدققات.
- **`FieldWidgetsFactory.dart`**: دالة `getFieldWidget(model, index)` تحوّل التعريف إلى Widget عبر `switch` على النوع. الأنواع المدعومة تشمل: نص، عدد صحيح/عشري، حقل جمع محسوب، قائمة منسدلة، راديو، صناديق اختيار، خرائط (نقطة/خط/مضلع)، ملفات، QR، تاريخ/وقت، ملاحظة، مدى، تقييم، ترتيب، جدول، توقيع، إقرار، مجموعة، و**Matrix** (جداول فرعية متكررة).

### 3.3 محرك CRUD الديناميكي
- **`GenericCrudScreen`** (في `pages/.../FormsListDir/MainListFormsMAnagae.dart`): يأخذ `modelName` فقط، ويدير القائمة + البحث (`SearchDynModel` + AND/OR) + الترتيب + الترقيم، ويستدعي طبقة الخدمة لجلب العدد ثم الصفحات.
- **`StaticMethodsRegistry.dart`**: خريطة مركزية تربط اسم الموديل بدواله الثابتة (`staticForShowInMainView`, `staticForDirectInMainView`, `staticRequiredField`, `staticForSortInMainView`, `staticForSerchInMainView`, `fromMap`, `generateFullTextSearch`, `getTransEnAr`...). هي الآلية التي تجعل الشاشات الجنرية تعمل لأي موديل دون كود مخصص.
- **`GenericAddEditScreen`**: يبني نموذج الإدخال من نتائج `StaticMethodsRegistry` (الحقول، الإلزامية، للقراءة فقط، الأنواع، الخيارات)، مع دعم RTL كامل.
- **`BaseServiceFutureList` / `BaseServiceFutureListDynSerch`** + **`MyToFromServer/MDbBasicInfo.dart`**: طبقة الشبكة التي تنادي مسارات الـ Generic Router (تُبنى عناوينها في `constants/global_variables.dart` فوق `Environment.apiUrl`).

### 3.4 العمل دون اتصال (Offline)
- **`buildHiveServices/HiveService.dart`**: حفظ/استرجاع/دمج البيانات في صناديق Hive (بما فيها قوائم البايتات للصور)، تُهيّأ عبر `Hive.initFlutter()` في `main.dart` — أساس المزامنة اللاحقة للفرق الميدانية.

---

## 4. استراتيجية نموذج البيانات — الثلاثية الموحدة

لكل كيان ثلاثة تمثيلات متطابقة (مثال حقيقي: **`BInfoCategory`**):

**(أ) Dart Model** — `clientIMS/imsweb/lib/model/IMSModels/BInfoCategory.dart`: حقول + `toJson`/`toJsonID`/`fromMap` + `getDynVal`/`setDynVal` + ترجمات + تصدير CSV.

**(ب) Node Schema (JSON)** — `serverIMS/models/BInfoCategory.js`:
```javascript
const BInfoCategory = {
  comment: 'table for BInfoCategory',
  tabelname: 'BInfoCategory',
  fields: [
    { columnName: 'id',          type: 'uuid',    input: false, default: "" },
    { columnName: 'Index',       type: 'integer', input: true,  default: 0  },
    { columnName: 'FulTxtSrh',   type: 'string',  input: true,  default: "" },
    { columnName: 'CategoryEn',  type: 'string',  input: true,  default: "" },
    { columnName: 'CategoryAr',  type: 'string',  input: true,  default: "" },
    { columnName: 'Description', type: 'string',  input: true,  default: "" },
  ]
};
```

**(ج) جدول PostgreSQL** — لا يوجد ملف `.sql`؛ الجدول يُشتق من الـ schema أعلاه. الأنواع الفعلية المستخدمة عبر الموديلات الـ66 (بالتكرار): `string` (313)، `integer` (67)، `uuid` (49)، `boolean` (31)، `datetime` (29)، `json` (28)، `double` (14)، `listjson` (13)، `date` (8)، `smallint` (6)، `timestamp` (2)، `time` (2).

> **بلا Foreign Keys:** تأكيد بالفحص — لا `FOREIGN KEY` ولا `REFERENCES` في أي ملف. العلاقات (مثل `formId`, `team_id`, `project_id`, `submissionId`) منطقية فقط عبر تطابق القيم النصية، دون قيود تكاملية على مستوى قاعدة البيانات. هذا يعطي مرونة في إنشاء الجداول لكنه ينقل عبء سلامة البيانات بالكامل إلى طبقة التطبيق.

---

## 5. نموذج الاستمارات الديناميكية (جوهر النظام)

التخزين يقوم على فصل **التعريف** عن **الإجابات**:

| الجدول | الدور |
|---|---|
| `IMSFormsModel` | تعريف الاستمارة (العنوان، الإصدار، الحالة، السياق التنظيمي: department/activity/project/program/donor، نمط الموافقة، التقييد الزمني). |
| `FormFieldModel` | تعريف كل حقل كصف مستقل (schema ضخم ~616 سطراً يغطي: النوع، الترجمات، الخيارات، المظهر، الإلزام/الرؤية المشروطة، إعدادات Matrix/QR/Map/Validators...). |
| `View_FormWithFields` | VIEW يدمج الاستمارة مع حقولها للقراءة. |
| `FormPublishedModel` (+ `...ToTeamModel` / `...ToUserModel`) | نشر الاستمارة وتحديد الفرق/المستخدمين المستهدفين والصلاحية الزمنية. |
| `FormSubmissionModel` | رأس العينة المُدخلة (من أدخلها، متى، حالة المراجعة/الموافقة). |
| `FormSubmissionFieldModel` | قيمة كل حقل كصف مستقل (`value` كـ JSONB + `value_type`)، مع `groupId`/`rowKey`/`path` لدعم الحقول المتكررة والمصفوفات. |

**دورة الحياة:** إنشاء استمارة → إضافة حقول (صفوف في `FormFieldModel`) → نشر → تعبئة (رأس في `FormSubmissionModel` + صف لكل قيمة في `FormSubmissionFieldModel`) → مراجعة/موافقة (عبر حالات + إشعارات Socket). الإدخال يتم عبر مسار `upsert-submission-fields` ضمن Transaction واحدة.

**Master Data** (تصنيفات، مانحون، مشاريع، برامج، أقسام، أنشطة، مواقع...) جداول `BInfo*` و`Setting*` بنفس الهيكل الموحد (`id, Index, FulTxtSrh, *Ar, *En, Description`)، تُجلب عبر نفس الـ Generic Router وتُعاد استخدامها كمصادر بيانات للحقول.

---

## 6. مخطط معماري مبسّط

```
Flutter (ويب/موبايل)            Node.js / Express              PostgreSQL 17
─────────────────────         ──────────────────────        ─────────────────
FieldWidgetsFactory  ──┐                                     IMSFormsModel
FormFieldModel         │                                     FormFieldModel
GenericCrudScreen      ├─ HTTP/JSON ─► Generic Router ─SQL─► FormSubmissionModel
StaticMethodsRegistry  │   x-auth-token  (collection)        FormSubmissionFieldModel
DynimcGeneralProvider  │                 trimbuildquery.js   BInfo* / Setting* (Master Data)
Hive (Offline)       ──┘                 genericController   View_FormWithFields
        ▲                                      │             (لا Foreign Keys)
        └────────── Socket.io (USER:{uid}) ◄───┘
```

---

## 7. خلاصة لأغراض بناء النظام الجديد

ما يجب **الحفاظ على فكرته** عند الانتقال إلى Python + Next.js + pgvector:

1. **فصل التعريف عن البيانات** (form definition ↔ submissions) — أساس قوي يمكن البناء عليه، ويتكامل طبيعياً مع توليد الاستمارات بالـ LLM.
2. **نمط الـ Generic/Dynamic CRUD** — يُعاد تصميمه بأمان عبر طبقة موحّدة (مثل SQLAlchemy/Pydantic) بدل بناء SQL نصياً.
3. **JSONB لقيم الحقول** — يبقى مناسباً، ويُضاف إليه **عمود `vector` (pgvector/BGE)** للبحث الدلالي والتحليل السياقي.
4. **Offline-first** — يبقى متطلباً للفرق الميدانية.

ما يجب **معالجته/تصحيحه**:

1. **الأمان**: إزالة الأسرار من الكود (متغيرات بيئة/أسرار مُدارة)، واعتماد Parameterized Queries/ORM لإغلاق ثغرات الحقن، ومفتاح JWT قوي.
2. **سلامة البيانات**: إعادة النظر في غياب الـ Foreign Keys — يمكن إدخال قيود/فهارس انتقائية حيث يلزم، أو ضمان السلامة في طبقة الخدمة صراحةً.
3. **توحيد معالجة الأخطاء والتحقق (validation)** وإضافة اختبارات.
4. **الذكاء**: إضافة طبقة LLM لتوليد الـ schema ديناميكياً، وطبقة Embeddings (BGE) فوق `FormSubmissionFieldModel`/الوثائق لتمكين البحث الدلالي، استخراج الأنماط، والتنبؤ — وهي القفزة من «نظام إداري ثابت» إلى «نظام معرفي ذكي».

---
*هذه الوثيقة مبنية على فحص الكود الفعلي (read-only) ولم يُعدَّل أي ملف من النظام الحالي.*
