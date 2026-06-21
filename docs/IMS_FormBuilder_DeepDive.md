# تعمّق في محرك بناء الاستمارات والأدوات الديناميكية (Form Builder Deep-Dive)

> **الغرض:** توثيق دقيق لكيفية بناء الاستمارة في النظام الحالي، ومواصفات كل أداة/نوع حقل، وصيغة القواعد الشرطية (DSL)، وتدفّق توليد الاستمارات بالذكاء الاصطناعي — مرجعاً لإعادة بنائها في النظام الجديد.
> **تاريخ:** 2026-06-12 · **وضع:** قراءة فقط (لم يُعدَّل أي ملف).

---

## 0. خلاصة سريعة + اكتشافات مهمة

- **محرك البناء** كله في `DynimcCoreBuilderProvider.dart` (~5,472 سطر) كـ `ChangeNotifier`، وتعريف الحقل في `FormFieldModel.dart` (~2,602 سطر) مقابل schema خلفي `FormFieldModel.js` (**113 عموداً**).
- **اكتشاف 1 — الذكاء الاصطناعي مبدوء فعلاً:** يوجد مسار خلفي شغّال `POST /be/api/ai/generate-form` (`controllers/aiController.js`) يستخدم **Gemini 3 Pro Preview** مع *system instruction* مفصّل يحوّل وصفاً نصياً إلى مصفوفة حقول بصيغة `FormFieldModel`. أي أن القفزة نحو «الاستمارات الذاتية التشكّل» بدأت داخل النظام القديم ويمكن ترحيل منطقها مباشرة.
- **اكتشاف 2 — جيل أقدم (meta-model):** سكربت `pythdbCopy/copg2.py` يكشف نظاماً سابقاً قائماً على جدول واحد `GenerateMod` (أعمدة مثل `forShowArabic/forShowKurdi`, `itParentForThisModel`, `nameOfModelToFetchFromDataBaseToCompoBox`)، يُنقل من قاعدة `juhacaradmin` إلى `ircs`. هذا سلف نمط «التوليد الديناميكي» الحالي.
- **اكتشاف 3 — تعذّر الوصول للبيانات الحيّة:** منفذ PostgreSQL (`37.59.73.114:5432`) محجوب عن بيئتي ولا توجد ملفات تصدير محلية. لذلك العيّنات أدناه **مستخرجة من الكود** (الـ schema، القيم الافتراضية، و*system instruction* للـ AI) لا من قاعدة البيانات الحيّة. (إن رغبت بعيّنات حقيقية: صدّر بعض صفوف `IMSFormsModel`/`FormFieldModel`/`FormSubmissionFieldModel` إلى CSV/JSON وضعها في المجلد وسأحللها.)

---

## 1. محرك البناء: `DynimcsCoreBuilderProvider`

### 1.1 الحالة التي يديرها
```dart
List<FormFieldModel> _fieldsData = [];          // الحقول (شجرية: groupField تحوي subFields)
Map<String, FormFieldModel> _allFieldsMap = {};  // فهرس O(1) لكل حقل بالـ id
Map<String, Set<String>> _dependentsMap = {};    // خريطة الاعتماديات (من يعتمد على من)
String _formId; String _selectedLanguage="ar"; String _textDirection="rtl";
bool _isDirty; String? _selectedFieldId; String? _activeGroupId;
Map<String, String?> _fieldErrors;
```
يحتفظ بشجرة الحقول + فهرس مسطّح + خريطة اعتماديات (تُبنى من القواعد الشرطية لمعرفة أي الحقول يجب إعادة تقييمها عند تغيّر مصدر).

### 1.2 العمليات الأساسية
| العملية | الدالة | السلوك |
|---|---|---|
| إضافة حقل | `addWidgetField(typeName, ctx)` | ينشئ UUID، يبني `FormFieldModel.fromJson`، يضعه في `_activeGroupId` إن وُجد وإلا في الجذر، `statusCode=5` (محلي جديد). |
| حذف | `removeField(id)` | حذف تكراري عبر الشجرة (`_removeFieldRecursively`). |
| نسخ | `duplicateField(id)` | نسخ بـ id جديد و`statusCode=5`. |
| إعادة ترتيب | `reorderFields(old,new)` | Drag & Drop + `_updateFieldsIndices()` + حفظ Hive فوري. |
| تحديث الفهارس | `_updateAllFieldsMap` / `_buildDependencyMap` / `_updateFieldsIndices` | تُستدعى بعد كل تغيير بنيوي. |

### 1.3 الحفظ والتحميل والإصدارات
- **حفظ محلي (Hive):** `saveStateToHive()` يُسطّح الشجرة (`FlattenFields`)، ويحوّل كل حقل إلى JSON مع تفريغ `subFields` (التخزين مسطّح + إعادة بناء التداخل لاحقاً)، في صندوق `FormFieldModel` بمفتاح `formId`.
- **تحميل للتصميم:** `_loadFormDataForDesigner()` يجلب من Hive ومن الخادم (`getFormFieldModelServiceFutureListDynNextPrev` بترتيب `"Index" ASC`، حتى 5000 حقل)، ثم **يدمج** بأولوية المحلي، ويعيّن `statusCode`: **4** = خادم فقط، **5** = محلي فقط، **6** = الاثنان. ثم يفرز بـ `Index` ويعيد بناء التداخل (`_rebuildNestedStructure`).
- **الإصدارات:** `IMSFormsModel` يحمل `version_number` و`structure_locked`؛ النشر ينسخ نسخة في `FormPublishedModel` بـ `version_number`. (قفل البنية يمنع تعديل استمارة منشورة لها عيّنات.)

> **درس للنظام الجديد:** نمط «المسطّح في التخزين + إعادة بناء الشجرة في الذاكرة» + دمج محلي/خادم بـ `statusCode` هو جوهر قدرة الـ Offline. يمكن استبداله بآلية sync أنظف (مثل CRDT أو طابع زمني/إصدار لكل حقل) في النظام الجديد.

---

## 2. كتالوج أنواع الحقول (FieldType) ومواصفاتها

الـ `enum FieldType` الفعلي يضم **27 نوعاً نشطاً**. الـ schema الخلفي يخصّص مجموعات أعمدة لكل عائلة:

| النوع | العائلة | أبرز الخصائص المخصّصة (من الـ schema) |
|---|---|---|
| `textField`, `noteField` | نص | `maxLines`, `placeholder`, `customRegExp`, `validationType`, `validators`, `isLimitEnabled` |
| `integerField`, `doubleField`, `numberField` | رقم | `minValue`, `maxValue`, `validators` |
| `sumField` | محسوب | `sumConfig` = `{ operands:[fieldIds], integerOnly:bool }` |
| `dropdownField`, `radioField`, `checkboxField`, `multiSelect` | اختيار | `options` (listjson), `dataSourceKey`, `parentFieldId`, `valueField`, `displayField`, `allowMultiple`, `autoOpenOnFocus` |
| `dateField`, `datetimeField`, `timeField`, `DateRangeField` | زمني | `firstDate/lastDate/initialDate(Time)`, `dateFormat`, `timeFormat`(24), `firstTime/lastTime` |
| `fileField`, `imageField`, `audioField`, `videoField` | ملفات | `category`(any/documents/image/audio/video/custom), `customExtensions`, `maxFileSizeMB`, `min/maxFileCount`, `limitFileCount`, `storeInHive`, `initialFiles` |
| `signatureField` | توقيع | `signatureMode`(signature/freeDraw), `signaturePenColor`, `signatureStrokeWidth`, `signatureBackgroundColor/ImageUrl/Bytes`, `signatureCanvasHeight`, `signatureAvailablePenColors/StrokeWidths`, `signatureShowToolbar` |
| `mapField` | جغرافي | `mapFeatureType`(point/line/polygon), `mapInitialBaseLayer`, `mapInitialCenterLat/Lng`, `mapInitialZoom`, `mapMarker/Line/PolygonColor`, `mapMaxPointsForLine/Polygon`, `mapShowAdministrativeBoundaries` |
| `rangeField` (Slider) | مدى | `sliderMode`(single/range), `sliderOrientation`, `sliderDivisions`, `minValue/maxValue` |
| `rateField`, `rankingField` | تقييم/ترتيب | `options`, `validators` |
| `qrcodeField` | QR | `qrMode`(generate/scan), `qrTemplate`, `qrScanMapping` (listjson: تعيين أجزاء الكود لحقول) |
| `matrixField` | مصفوفة | `matrixRows` (listjson), `matrixMode`(single=radio / multiple=checkbox), `isRepeating` |
| `groupField` | تجميع/تكرار | `subFields` (listjson متداخل), `groupId`, `isRepeating` |
| `tableField`, `approvalField`, `hideField` | خاص | حقول مظهر/منطق عامة |

**خصائص مشتركة لكل حقل** (بغضّ النظر عن النوع): الهوية (`id`, `formId`, `groupId`, `Index`, `statusCode`)، الترجمات (`labelTranslations`, `subLabelTranslations`)، القيمة (`value`, `defaultValue*`)، المظهر (`title*`/`subTitle*` للخط واللون + `backgroundColor`)، والسلوكيات الخمسة (القسم 3)، و`isStatistical` (هل يُضمَّن في التحليلات).

**شكل عنصر `options`** (كما يولّده الـ AI ويتوقّعه المحرك):
```json
{ "valueKey": "opt1", "valueTranslations": { "ar": "خيار ١", "en": "Option 1" } }
```

---

## 3. السلوكيات الخمسة + صيغة القواعد الشرطية (DSL)

كل حقل يملك **خمسة سلوكيات** قابلة للأتمتة، يديرها `FiveBehaviorsEditor.dart`: **الإلزام (required)**، **الرؤية (visibility)**، **التفعيل (enabled)**، **القيم الشرطية (conditionalValueRules)**، و**القيمة الافتراضية (defaultValue)**.

كل سلوك له **وضع** (`*Mode`): `direct` (قيمة ثابتة) أو `conditional` (محكوم بمجموعة قواعد `*When`).

### 3.1 وحدة البناء: RuleGroup
```json
{
  "mode": "all",          // all = AND ، any = OR
  "rules": [
    { "sourceFieldId": "<id الحقل المصدر>", "operator": "==", "triggerValue": "yes" }
  ]
}
```
**المعاملات المدعومة** (من `_evaluateRule` و`checkVisibility.dart`): `==`, `!=`, `>`, `<`, `>=`, `<=`, `isEmpty`, `isNotEmpty`, `contains`, `in`, `startsWith`, `endsWith`, `between`. مقارنة المساواة تستخدم `DeepCollectionEquality` (تدعم القيم المركّبة).

### 3.2 أمثلة JSON واقعية لكل سلوك
**إلزام مشروط** (مطلوب إذا كان الحقل الآخر = نعم):
```json
{ "requiredMode": "conditional",
  "requiredWhen": { "mode": "all", "rules": [
    { "sourceFieldId": "has_children", "operator": "==", "triggerValue": "yes" } ] } }
```
**رؤية مشروطة** (يظهر إذا العمر > 18 أو الدور يحوي admin):
```json
{ "visibilityMode": "conditional",
  "visibilityWhen": { "mode": "any", "rules": [
    { "sourceFieldId": "age", "operator": ">", "triggerValue": 18 },
    { "sourceFieldId": "role", "operator": "contains", "triggerValue": "admin" } ] } }
```
**قيم شرطية** (يضبط القيمة تلقائياً حسب حقل آخر):
```json
{ "conditionalValueRules": [
  { "when": { "mode": "all", "rules": [
      { "sourceFieldId": "country", "operator": "==", "triggerValue": "IQ" } ] },
    "set": { "type": "static", "value": "العراق" },
    "enforce": "realtime" },
  { "when": { "mode": "all", "rules": [
      { "sourceFieldId": "country", "operator": "==", "triggerValue": "SA" } ] },
    "set": { "type": "field", "fieldId": "default_city" } } ] }
```
**قيمة افتراضية ديناميكية** (تاريخ اليوم / قيمة حقل آخر):
```json
{ "defaultValueMode": "dynamic", "defaultValueExpr": { "type": "func", "name": "today" } }
{ "defaultValueMode": "dynamic", "defaultValueExpr": { "type": "field", "fieldId": "manager_name" } }
```
**تحقّق متقاطع (validators)** (يجب أن يكون ≥ تاريخ البداية + 5 أيام):
```json
{ "otherFieldId": "date_start", "operator": ">=", "useOffset": true,
  "offset": 5, "unit": "days", "message": "يجب أن يكون بعد تاريخ البداية بـ 5 أيام" }
```

> **درس للنظام الجديد:** هذا الـ DSL ناضج وقابل للترحيل كما هو إلى Python/Pydantic (محرّك تقييم واحد للقواعد على الخادم والعميل). يُنصح بتوحيد التمثيلين المتعايشين حالياً (`requiredWhen/...When` الحديث مقابل `visibilityRules`/`checkVisibility` القديم) في صيغة واحدة.

---

## 4. توليد الاستمارة بالذكاء الاصطناعي (موجود فعلاً)

**التدفّق:** `AiAssistantPanel` ← `FormAiService.generateFormJson(prompt, token)` ← `POST /be/api/ai/generate-form` ← Gemini ← يعيد مصفوفة حقول JSON ← `_processAndImportJson()` يستبدل المعرّفات بـ UUID جديدة، يضبط `formId`/`statusCode=5`/`Index` تصاعدياً، يبني `FormFieldModel.fromJsonServer`، ثم `provider.addImportedFields(...)`.

**الـ system instruction في الخادم** (`aiController.js`) هو فعلياً **العقد القانوني لشكل الحقل** — يحدّد: إعادة مصفوفة JSON فقط، الحقول الإلزامية لكل عنصر (`id`, `type`, `labelTranslations`, `subLabelTranslations`, `statusCode:5`, `Index`, `isRequired`, `formId:"TEMP_ID"`, `groupId:null`, `value:null`)، الأنواع المدعومة، والتداخل عبر `groupField` + `subFields`، وشكل `options` بـ `valueKey`/`valueTranslations`. الإعداد: `model: "gemini-3-pro-preview"`, `responseMimeType: "application/json"`, `temperature: 0.2`.

> **درس للنظام الجديد:** هذا بالضبط ما نريد توسيعه: من «توليد حقول» إلى **توليد schema كامل (UI + جدول DB)** + ربط مصادر بيانات + توليد قواعد تحقق. الـ system instruction الحالي نقطة انطلاق ممتازة لإعادة الصياغة في طبقة LLM بـ Python.

---

## 5. عيّنة بيانات تمثيلية (مستخرجة من الكود)

بما أنّ قاعدة البيانات الحيّة غير متاحة، هذه عيّنة **مكافئة لِما يُخزَّن فعلاً** في `FormFieldModel`، مبنية على القيم الافتراضية للـ schema وصيغة مخرجات الـ AI — حقل قائمة منسدلة بإلزام مشروط:

```json
{
  "id": "0b6f...uuid", "formId": "f12a...uuid", "groupId": null,
  "Index": 3, "statusCode": 6, "type": "dropdownField",
  "labelTranslations": { "ar": "المحافظة", "en": "Governorate" },
  "subLabelTranslations": { "ar": "", "en": "" },
  "value": null, "defaultValueMode": "empty",
  "options": null, "dataSourceKey": "BInfoWorkLocations",
  "valueField": "valueKey", "displayField": "mainTitle",
  "titleFontSize": 14, "titleFontWeight": "normal",
  "titleTextColor": "#000000", "backgroundColor": "#ffffff",
  "requiredMode": "conditional",
  "requiredWhen": { "mode": "all", "rules": [
    { "sourceFieldId": "needs_location", "operator": "==", "triggerValue": "yes" } ] },
  "visibilityMode": "direct", "visibleDirect": true,
  "enabledMode": "direct", "enabledDirect": true,
  "isStatistical": true
}
```
ويُخزَّن **جواب** هذا الحقل (عند التعبئة) في `FormSubmissionFieldModel` هكذا: `{ submissionId, formId, fieldId:"0b6f...", path:"governorate", value:{ "text":"بغداد" }, value_type:"text" }` (القيمة JSONB، و`groupId/rowKey/path` للحقول المتكررة).

---

## 5.5 نظام البيانات الساندة (Supportive Lists) — طبقة المرجعيات الديناميكية

هذا ليس مجرد Master Data ثابت، بل **نظام قوائم مرجعية مركزي، هرمي، متعدد اللغات، متتبَّع الاستخدام، وقابل للبحث النصّي**، يغذّي كل حقول الاختيار (`dropdownField`, `radioField`, `checkboxField`, `multiSelect`). يتكوّن من جدولين:

### الجدول 1 — `SupportiveListItemModel` (القائمة الساندة)
| الحقل | النوع | الدور |
|---|---|---|
| `listKey` | string | **المفتاح المرجعي**؛ يشير إليه حقل الاختيار عبر `dataSourceKey`. |
| `mainTitle` / `titleTranslations` | string/json | اسم القائمة متعدد اللغات. |
| `listItems` | listjson | العناصر؛ كل عنصر: `{ valueKey, valueTranslations:{ar,en,...}, parentValueKey }`. |
| `parentValueKey` (داخل العنصر) | — | **تسلسل داخل نفس القائمة** (عنصر يتبع عنصراً آخر). |
| `parentListKey` | string | **تسلسل هرمي بين القوائم** (قائمة تتبع قائمة أب). |
| `extraJson` | listjson | بيانات وصفية إضافية لكل عنصر. |
| `haveDisplayMedia` | boolean | هل لكل عنصر صورة/وسائط عرض. |
| `usageType` | integer | **تتبّع الاستخدام**: 0=لا شيء، 1=واجهة فرعية، 2=استمارة ديناميكية، 3=كلاهما. |
| `lastUsageQueryResult` | listjson | كاش لأماكن الاستخدام، مثل `[{ formName, fieldName }]`. |
| `isLocked` | boolean | قفل القائمة المستخدمة لمنع التعديل المُفسد. |
| `search_text` | string | **(يُدار بـ trigger في DB)** نص موحّد: `unaccent` + تجميع من `listItems`. |
| `search_vector` | **tsvector** | **(يُدار بـ trigger في DB)** فهرس بحث نصّي كامل مبني على `search_text`. |

> ملاحظة: العمودان `search_text` و`search_vector` لهما `input:false` لأنهما يُحدَّثان آلياً عبر database trigger، لا من الواجهة.

### الجدول 2 — `SupportiveListLinkModel` (روابط القوائم المتتالية)
يعرّف العلاقات بين القوائم لتمكين **القوائم المنسدلة المترابطة (cascading)**:
`sourceListKey` → `targetListKey` مع `relationType` و`conditionJson` (شرط الربط) — مثال: محافظة ← قضاء ← ناحية.

### كيف ترتبط بحقل الاختيار
في `FormFieldModel`: `dataSourceKey` (= `listKey` للقائمة)، `displayField` (افتراضي `mainTitle`)، `valueField` (افتراضي `valueKey`)، و`parentFieldId` (الحقل الذي تُرشَّح قيم هذا الحقل بناءً على قيمته). عند التعبئة، تُرشَّح عناصر القائمة بمطابقة `parentValueKey`/الرابط مع قيمة الحقل الأب لتحقيق التتالي.

### الإدارة
مجلد `pages/adminIMS/SupportiveListItemDir/` يوفّر: إضافة/تعديل القوائم، **استيراد من Excel** (`importSupportiveListsFromExcelWeb`)، وشاشة **عرض الاستخدام** (`show_Usage`) — أين تُستعمل القائمة قبل تعديلها/قفلها.

> **دلالة محورية للنظام الجديد** 🔑: وجود `tsvector` + triggers يعني أن النظام القديم **بدأ فعلاً بالبحث النصّي الكامل** على المرجعيات. الترقية إلى **pgvector + BGE** ليست بناءً من الصفر، بل **استبدال/إغناء** لطبقة `search_vector` القائمة ببحث دلالي (semantic) — ما يجعل القوائم الساندة، إجابات الحقول، والوثائق قابلة للاستعلام بالمعنى لا بالنص الحرفي فقط. كما أن `usageType`/`lastUsageQueryResult` تمنح أساساً جاهزاً لـ "أثر الاستخدام" (lineage) الذي يفيد التحليلات والأرشفة المؤتمتة.

---

## 6. التوصيات لإعادة البناء (Python + Next.js + pgvector)

ما **يُحافَظ عليه فكرياً**: فصل التعريف عن الإجابات؛ الـ DSL الموحّد للسلوكيات الخمسة؛ كتالوج الأنواع الـ27؛ نمط Offline (تخزين مسطّح + إعادة بناء شجري + دمج بحالة)؛ ومسار توليد الـ AI القائم.

ما **يُطوَّر**: (1) توحيد محرّك تقييم القواعد في مكتبة مشتركة واحدة (Python على الخادم، تقييم على عميل Next.js)؛ (2) ترقية توليد الـ AI ليُنتج **schema قاعدة بيانات + embeddings** لا حقول واجهة فقط؛ (3) إضافة عمود `vector` (pgvector/BGE) على إجابات الحقول والوثائق لتمكين البحث الدلالي والتحليل التنبّؤي؛ (4) إغلاق ثغرات الحقن ونقل الأسرار (مفاتيح Gemini/JWT/DB المزروعة حالياً في الكود) إلى إدارة أسرار، واعتماد ORM/Parameterized Queries.

---
*مبني على فحص الكود الفعلي (read-only). العيّنات مستخرجة من schema الكود ومخرجات الـ AI، لا من قاعدة البيانات الحيّة (المنفذ 5432 محجوب عن بيئة الفحص).*
