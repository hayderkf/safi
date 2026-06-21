// محرّك تقييم القواعد الشرطية (نسخة الويب) — يقابل DSL العقد. يُوحَّد لاحقاً في packages/shared-web.
import type { FormField, Rule, RuleGroup, Values } from "./types";
import { label } from "./types";

function evalRule(r: Rule, values: Values): boolean {
  const cur = values[r.sourceFieldId];
  const t = r.triggerValue;
  switch (r.operator) {
    case "==":
      return cur === t;
    case "!=":
      return cur !== t;
    case "isEmpty":
      return cur == null || cur === "" || (Array.isArray(cur) && cur.length === 0);
    case "isNotEmpty":
      return !(cur == null || cur === "" || (Array.isArray(cur) && cur.length === 0));
    case "contains":
      return Array.isArray(cur) ? cur.includes(t) : String(cur ?? "").includes(String(t));
    case "in":
      return Array.isArray(t) ? (t as unknown[]).includes(cur) : false;
    case ">":
      return Number(cur) > Number(t);
    case "<":
      return Number(cur) < Number(t);
    case ">=":
      return Number(cur) >= Number(t);
    case "<=":
      return Number(cur) <= Number(t);
    default:
      return true;
  }
}

export function evalGroup(g: RuleGroup | undefined, values: Values, fallback = true): boolean {
  if (!g || !g.rules || g.rules.length === 0) return fallback;
  const res = g.rules.map((r) => evalRule(r, values));
  return g.mode === "any" ? res.some(Boolean) : res.every(Boolean);
}

export const isVisible = (f: FormField, values: Values) => evalGroup(f.visibilityWhen, values, true);
export const isRequired = (f: FormField, values: Values) =>
  f.requiredWhen ? evalGroup(f.requiredWhen, values, false) : !!f.isRequired;
export const isEnabled = (f: FormField, values: Values) =>
  f.enabledWhen ? evalGroup(f.enabledWhen, values, true) : true;

// ---- تحقّق الإرسال: الحقول المطلوبة الظاهرة غير المعبّأة ----
export function isEmptyValue(v: unknown): boolean {
  if (v == null || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export interface FieldError {
  id: string;
  label: string;
  message: string;
}

export function validateForm(fields: FormField[], values: Values): FieldError[] {
  const errors: FieldError[] = [];
  const walk = (items: FormField[]) => {
    for (const f of items) {
      if (!isVisible(f, values)) continue;
      if (f.type === "noteField") continue;
      if (f.type === "groupField" && !f.isRepeating) {
        walk(f.subFields || []); // مجموعة عادية: نفس النطاق المسطّح
        continue;
      }
      if (isRequired(f, values) && isEmptyValue(values[f.id])) {
        const msg = f.type === "groupField" || f.type === "tableField" ? "مطلوب: أضف عنصراً واحداً على الأقل" : "هذا الحقل مطلوب";
        errors.push({ id: f.id, label: label(f), message: msg });
      }
    }
  };
  walk(fields);
  return errors;
}
