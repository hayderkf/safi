// أنواع مخطط الاستمارة (IR) — نسخة الويب من العقد. انظر docs/IR_SCHEMA.md
export type Translations = { ar?: string; en?: string; [k: string]: string | undefined };

export interface Option {
  valueKey: string;
  valueTranslations?: Translations;
}

export interface Rule {
  sourceFieldId: string;
  operator: string;
  triggerValue?: unknown;
}

export interface RuleGroup {
  mode?: "all" | "any";
  rules?: Rule[];
}

export interface Column {
  key: string;
  type?: string;
  labelTranslations?: Translations;
}

export interface MatrixRow {
  key: string;
  labelTranslations?: Translations;
}

export interface FormField {
  id: string;
  type: string;
  labelTranslations?: Translations;
  isRequired?: boolean;
  options?: Option[];
  dataSourceKey?: string;
  subFields?: FormField[];
  layout?: string;
  isRepeating?: boolean;
  columns?: Column[];
  matrixRows?: MatrixRow[];
  matrixMode?: string;
  // خصائص عرض اختيارية (يسمح بها العقد عبر extra="allow")
  min?: number;
  max?: number;
  step?: number;
  maxRating?: number;
  placeholder?: string;
  visibilityWhen?: RuleGroup;
  requiredWhen?: RuleGroup;
  enabledWhen?: RuleGroup;
}

export type Values = Record<string, unknown>;

export const label = (f: { labelTranslations?: Translations; id?: string }, lang = "ar") =>
  f.labelTranslations?.[lang] || f.labelTranslations?.en || f.id || "";
