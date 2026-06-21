# IR_SCHEMA — مخطط الاستمارة الموحّد (Form Intermediate Representation)

العقد الذي تُولّده طبقة الذكاء وتنفّذه كل المنصات. **مصدر الحقيقة الموحّد** للاستمارات.
(مستخلَص ومُتحقَّق منه في الـ PoC — راجع `ai/poc/`.)

## الشكل العام
الاستمارة = **مصفوفة حقول JSON**. كل حقل كائن.

## الحقول المشتركة (لكل حقل)
```json
{
  "id": "نصّي فريد",
  "type": "<نوع الحقل>",
  "labelTranslations": { "ar": "...", "en": "..." },
  "isRequired": true
}
```

## أنواع الحقول
- **أساسية:** `textField`, `integerField`, `doubleField`, `dateField`, `datetimeField`, `timeField`, `fileField`, `imageField`, `mapField`, `noteField`, `signatureField`, `qrcodeField`, `rangeField`, `rateField`.
- **اختيار:** `dropdownField`, `radioField`, `checkboxField` — تحمل `options`:
```json
"options": [{ "valueKey": "k", "valueTranslations": { "ar": "..", "en": ".." } }]
```
- **حاوية `groupField`:** تضع حقولاً في `subFields`. استخداماتها:
  - **صفحة/خطوة (stepper):** `"layout": "step"` + عنوان في `labelTranslations`.
  - **قسم متكرّر:** `"isRepeating": true`.
- **جدول `tableField`:** `"columns": [{ "key", "labelTranslations", "type" }]`.
- **مصفوفة `matrixField`:** `"matrixRows": [{ "key", "labelTranslations" }]` + `"options"` (الأعمدة/المقياس) + `"matrixMode": "single|multiple"`.

## السلوكيات الشرطية (DSL)
لكل حقل خمسة سلوكيات: الإلزام/الرؤية/التفعيل/القيمة الشرطية/القيمة الافتراضية. تُحكَم بمجموعة قواعد:
```json
"visibilityWhen": {
  "mode": "all",                // all = AND ، any = OR
  "rules": [
    { "sourceFieldId": "<id>", "operator": "==", "triggerValue": "<v>" }
  ]
}
```
نظائرها: `requiredWhen`, `enabledWhen`. والمعاملات: `==, !=, >, <, >=, <=, isEmpty, isNotEmpty, contains, in`.

## الإسناد للبيانات الساندة
حقل الاختيار قد يُسنَد لقائمة ساندة بدل `options` ثابتة:
`"dataSourceKey": "<listKey>"`, `"displayField"`, `"valueField"`, `"parentFieldId"` (للتتالي).
> الذكاء يولّد **البنية** ونوع الحقل؛ النظام يربط القائمة بالبيانات الحقيقية (لا يهلوس القيم).

## مثال مختصر (شرط + خيارات)
```json
[
  { "id": "has_children", "type": "radioField",
    "labelTranslations": { "ar": "هل يوجد أطفال؟", "en": "Children?" }, "isRequired": true,
    "options": [{ "valueKey": "yes", "valueTranslations": { "ar": "نعم", "en": "Yes" } },
                { "valueKey": "no",  "valueTranslations": { "ar": "لا",  "en": "No" } }] },
  { "id": "children_count", "type": "integerField",
    "labelTranslations": { "ar": "عدد الأطفال", "en": "Children count" }, "isRequired": true,
    "visibilityWhen": { "mode": "all", "rules": [
      { "sourceFieldId": "has_children", "operator": "==", "triggerValue": "yes" } ] } }
]
```

## تخزين الإجابات (هجين)
رأس العينة + وثيقة `data` JSONB، مع Views تحليلية مولّدة للحقول المعلّمة `isStatistical`. الحقول المتكررة عبر `path`/`rowKey`.
