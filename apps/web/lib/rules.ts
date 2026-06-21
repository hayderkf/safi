// محرّك تقييم القواعد الشرطية (نسخة الويب) — يقابل DSL العقد. يُوحَّد لاحقاً في packages/shared-web.
import type { FormField, Rule, RuleGroup, Values } from "./types";

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
