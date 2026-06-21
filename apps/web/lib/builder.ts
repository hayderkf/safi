// أدوات الباني المرئي: عمليات شجرية غير قابلة للتغيير (immutable) على مصفوفة حقول IR.
import type { FormField } from "./types";

export interface PaletteItem {
  type: string;
  label: string;
}

// لوحة الأنواع (مطابقة لما يدعمه المُصيِّر)
export const PALETTE: PaletteItem[] = [
  { type: "textField", label: "نص" },
  { type: "integerField", label: "عدد صحيح" },
  { type: "doubleField", label: "عدد عشري" },
  { type: "dateField", label: "تاريخ" },
  { type: "datetimeField", label: "تاريخ ووقت" },
  { type: "timeField", label: "وقت" },
  { type: "dropdownField", label: "قائمة منسدلة" },
  { type: "radioField", label: "اختيار واحد" },
  { type: "checkboxField", label: "اختيار متعدد" },
  { type: "rangeField", label: "منزلق" },
  { type: "rateField", label: "تقييم نجوم" },
  { type: "fileField", label: "ملف" },
  { type: "imageField", label: "صورة" },
  { type: "signatureField", label: "توقيع" },
  { type: "mapField", label: "موقع" },
  { type: "qrcodeField", label: "رمز QR" },
  { type: "noteField", label: "ملاحظة" },
  { type: "groupField", label: "مجموعة/قسم" },
  { type: "tableField", label: "جدول" },
  { type: "matrixField", label: "مصفوفة" },
];

export const CHOICE_TYPES = new Set(["dropdownField", "radioField", "checkboxField"]);
export const OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "isEmpty", "isNotEmpty", "contains", "in"];

const base = (type: string) => type.replace(/Field$/, "") || "field";

// معرّف فريد مقروء (text_1, group_2, ...) لا يتعارض مع الموجود
export function newId(type: string, fields: FormField[]): string {
  const ids = new Set<string>();
  const walk = (fs: FormField[]) => fs.forEach((f) => { ids.add(f.id); if (f.subFields) walk(f.subFields); });
  walk(fields);
  const b = base(type);
  let n = 1;
  while (ids.has(`${b}_${n}`)) n++;
  return `${b}_${n}`;
}

export function makeField(type: string, fields: FormField[]): FormField {
  const f: FormField = { id: newId(type, fields), type, labelTranslations: { ar: "" }, isRequired: false };
  if (CHOICE_TYPES.has(type)) {
    f.options = [
      { valueKey: "opt_1", valueTranslations: { ar: "الخيار ١" } },
      { valueKey: "opt_2", valueTranslations: { ar: "الخيار ٢" } },
    ];
  } else if (type === "groupField") {
    f.subFields = [];
  } else if (type === "tableField") {
    f.columns = [{ key: "col_1", type: "textField", labelTranslations: { ar: "العمود ١" } }];
  } else if (type === "matrixField") {
    f.matrixRows = [{ key: "row_1", labelTranslations: { ar: "الصفّ ١" } }];
    f.options = [{ valueKey: "opt_1", valueTranslations: { ar: "نعم" } }, { valueKey: "opt_2", valueTranslations: { ar: "لا" } }];
    f.matrixMode = "single";
  } else if (type === "noteField") {
    f.labelTranslations = { ar: "نصّ الملاحظة" };
  }
  return f;
}

export function findById(fields: FormField[], id: string): FormField | null {
  for (const f of fields) {
    if (f.id === id) return f;
    if (f.subFields) {
      const r = findById(f.subFields, id);
      if (r) return r;
    }
  }
  return null;
}

export function updateById(fields: FormField[], id: string, patch: Partial<FormField>): FormField[] {
  return fields.map((f) => {
    if (f.id === id) return { ...f, ...patch };
    if (f.subFields) return { ...f, subFields: updateById(f.subFields, id, patch) };
    return f;
  });
}

export function removeById(fields: FormField[], id: string): FormField[] {
  return fields
    .filter((f) => f.id !== id)
    .map((f) => (f.subFields ? { ...f, subFields: removeById(f.subFields, id) } : f));
}

export function moveById(fields: FormField[], id: string, dir: "up" | "down"): FormField[] {
  const idx = fields.findIndex((f) => f.id === id);
  if (idx !== -1) {
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= fields.length) return fields;
    const copy = [...fields];
    [copy[idx], copy[j]] = [copy[j], copy[idx]];
    return copy;
  }
  return fields.map((f) => (f.subFields ? { ...f, subFields: moveById(f.subFields, id, dir) } : f));
}

export function insertInto(fields: FormField[], parentId: string | null, field: FormField): FormField[] {
  if (parentId === null) return [...fields, field];
  return fields.map((f) => {
    if (f.id === parentId) return { ...f, subFields: [...(f.subFields || []), field] };
    if (f.subFields) return { ...f, subFields: insertInto(f.subFields, parentId, field) };
    return f;
  });
}

// ---- فحص جودة الاستمارة (lint) قبل الحفظ ----
export interface LintIssue {
  message: string;
}

export function lintForm(fields: FormField[]): LintIssue[] {
  const issues: LintIssue[] = [];
  const counts = new Map<string, number>();
  const walk = (items: FormField[]) => {
    for (const f of items) {
      counts.set(f.id, (counts.get(f.id) || 0) + 1);
      const ar = f.labelTranslations?.ar?.trim();
      if (f.type !== "noteField" && !ar) issues.push({ message: `«${f.id}»: بلا عنوان عربي` });
      if (CHOICE_TYPES.has(f.type) && !f.dataSourceKey && !(f.options && f.options.length))
        issues.push({ message: `«${f.id}»: حقل اختيار بلا خيارات ولا قائمة ساندة` });
      if (f.type === "tableField" && !(f.columns && f.columns.length))
        issues.push({ message: `«${f.id}»: جدول بلا أعمدة` });
      if (f.type === "matrixField" && !(f.matrixRows && f.matrixRows.length))
        issues.push({ message: `«${f.id}»: مصفوفة بلا صفوف` });
      if (f.type === "groupField" && !(f.subFields && f.subFields.length))
        issues.push({ message: `«${f.id}»: مجموعة فارغة` });
      if (f.subFields) walk(f.subFields);
    }
  };
  walk(fields);
  for (const [id, n] of counts) if (n > 1) issues.push({ message: `معرّف مكرّر: «${id}» (${n} مرّات)` });
  return issues;
}

// كل الحقول مسطّحة (للإشارة في القواعد/التتالي) عدا معرّف مستثنى
export function flatten(fields: FormField[], excludeId?: string): FormField[] {
  const out: FormField[] = [];
  const walk = (fs: FormField[]) =>
    fs.forEach((f) => {
      if (f.id !== excludeId) out.push(f);
      if (f.subFields) walk(f.subFields);
    });
  walk(fields);
  return out;
}
