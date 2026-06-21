"use client";
// مُصيِّر الاستمارة الديناميكي: يبني الواجهة من مخطط IR + يقيّم المنطق الشرطي (نسخة v1).
import type { FormField, Option, Values } from "@/lib/types";
import { label } from "@/lib/types";
import { isRequired, isVisible } from "@/lib/rules";

const optLabel = (o: Option) => o.valueTranslations?.ar || o.valueTranslations?.en || o.valueKey;

interface Props {
  fields: FormField[];
  values: Values;
  onChange: (id: string, v: unknown) => void;
}

export default function FormRenderer({ fields, values, onChange }: Props) {
  return (
    <>
      {fields.map((f) => (
        <FieldView key={f.id} f={f} values={values} onChange={onChange} />
      ))}
    </>
  );
}

function FieldView({
  f,
  values,
  onChange,
}: {
  f: FormField;
  values: Values;
  onChange: (id: string, v: unknown) => void;
}) {
  if (!isVisible(f, values)) return null;

  const lab = label(f);
  const req = isRequired(f, values);
  const v = values[f.id];

  // حاوية (مجموعة / صفحة / متكرّر)
  if (f.type === "groupField") {
    return (
      <div className="group">
        <div className="gtitle">
          {lab}
          {f.layout === "step" && <span className="step-badge">صفحة</span>}
          {f.isRepeating && <span className="step-badge">متكرّر</span>}
        </div>
        {(f.subFields || []).map((sf) => (
          <FieldView key={sf.id} f={sf} values={values} onChange={onChange} />
        ))}
      </div>
    );
  }

  // ملاحظة (عرض فقط)
  if (f.type === "noteField") {
    return (
      <div className="field">
        <div className="note">{lab}</div>
      </div>
    );
  }

  const Lbl = () => (
    <label>
      {lab}
      {req && <span className="req"> *</span>}
    </label>
  );

  switch (f.type) {
    case "textField":
      return (
        <div className="field">
          <Lbl />
          <input value={(v as string) ?? ""} onChange={(e) => onChange(f.id, e.target.value)} />
        </div>
      );

    case "integerField":
    case "doubleField":
    case "numberField":
      return (
        <div className="field">
          <Lbl />
          <input
            type="number"
            value={(v as number) ?? ""}
            onChange={(e) => onChange(f.id, e.target.value === "" ? null : Number(e.target.value))}
          />
        </div>
      );

    case "dateField":
    case "datetimeField":
    case "timeField": {
      const t = f.type === "dateField" ? "date" : f.type === "timeField" ? "time" : "datetime-local";
      return (
        <div className="field">
          <Lbl />
          <input type={t} value={(v as string) ?? ""} onChange={(e) => onChange(f.id, e.target.value)} />
        </div>
      );
    }

    case "dropdownField":
      return (
        <div className="field">
          <Lbl />
          <select value={(v as string) ?? ""} onChange={(e) => onChange(f.id, e.target.value)}>
            <option value="">—</option>
            {(f.options || []).map((o) => (
              <option key={o.valueKey} value={o.valueKey}>
                {optLabel(o)}
              </option>
            ))}
          </select>
        </div>
      );

    case "radioField":
      return (
        <div className="field">
          <Lbl />
          <div className="opts">
            {(f.options || []).map((o) => (
              <label key={o.valueKey}>
                <input type="radio" name={f.id} checked={v === o.valueKey} onChange={() => onChange(f.id, o.valueKey)} />
                {optLabel(o)}
              </label>
            ))}
          </div>
        </div>
      );

    case "checkboxField": {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      const toggle = (k: string) => onChange(f.id, arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
      return (
        <div className="field">
          <Lbl />
          <div className="opts">
            {(f.options || []).map((o) => (
              <label key={o.valueKey}>
                <input type="checkbox" checked={arr.includes(o.valueKey)} onChange={() => toggle(o.valueKey)} />
                {optLabel(o)}
              </label>
            ))}
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="field">
          <Lbl />
          <div className="todo">نوع غير مدعوم في الواجهة بعد: {f.type}</div>
        </div>
      );
  }
}
