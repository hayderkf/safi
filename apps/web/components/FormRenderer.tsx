"use client";
// مُصيِّر الاستمارة الديناميكي: يبني الواجهة من مخطط IR + يقيّم المنطق الشرطي.
// يدعم: الحقول الأساسية + الاختيار (ثابت أو مُسنَد لقائمة ساندة) + المجموعات (صفحة/متكرّر حقيقي)
// + جدول + مصفوفة + range/rate/file/image/signature/map/qrcode. النطاقات المتداخلة عبر تمرير values/onChange محليّين.
import { useState, type ReactNode } from "react";
import { useEffect } from "react";
import type { Column, FormField, MatrixRow, Option, Values } from "@/lib/types";
import { label } from "@/lib/types";
import { isEnabled, isRequired, isVisible, validateForm } from "@/lib/rules";
import { getLookup, type LookupItem } from "@/lib/api";
import SignaturePad from "@/components/SignaturePad";

const optLabel = (o: Option) => o.valueTranslations?.ar || o.valueTranslations?.en || o.valueKey;
const colLabel = (c: Column | MatrixRow) => c.labelTranslations?.ar || c.labelTranslations?.en || c.key;

interface Props {
  fields: FormField[];
  values: Values;
  onChange: (id: string, v: unknown) => void;
}

// ---- تقسيم الاستمارة إلى صفحات (معالج): كل groupField layout:step صفحة ----
interface Page {
  title: string;
  fields: FormField[];
}
function buildPages(fields: FormField[]): Page[] {
  const pages: Page[] = [];
  let loose: FormField[] = [];
  const flush = () => {
    if (loose.length) {
      pages.push({ title: "", fields: loose });
      loose = [];
    }
  };
  for (const f of fields) {
    if (f.type === "groupField" && f.layout === "step") {
      flush();
      pages.push({ title: label(f), fields: f.subFields || [] });
    } else {
      loose.push(f);
    }
  }
  flush();
  return pages;
}

export default function FormRenderer({ fields, values, onChange }: Props) {
  const pages = buildPages(fields);
  const wizard = pages.length > 1 && fields.some((f) => f.type === "groupField" && f.layout === "step");
  const [step, setStep] = useState(0);

  if (!wizard) {
    return (
      <>
        {fields.map((f) => (
          <FieldView key={f.id} f={f} values={values} onChange={onChange} />
        ))}
      </>
    );
  }

  const cur = Math.min(step, pages.length - 1);
  const page = pages[cur];
  const pageErrors = validateForm(page.fields, values);

  return (
    <div className="wizard">
      <div className="steps">
        {pages.map((p, i) => (
          <button
            key={i}
            type="button"
            className={`stepdot${i === cur ? " on" : ""}${i < cur ? " done" : ""}`}
            onClick={() => setStep(i)}
          >
            <span className="stepnum">{i + 1}</span>
            {p.title || `صفحة ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="wizard-page">
        {page.fields.map((f) => (
          <FieldView key={f.id} f={f} values={values} onChange={onChange} />
        ))}
      </div>
      {cur < pages.length - 1 && pageErrors.length > 0 && (
        <div className="issues" style={{ marginTop: 8 }}>
          أكمل قبل المتابعة: {pageErrors.map((e) => e.label).join("، ")}
        </div>
      )}
      <div className="wizard-nav">
        <button type="button" className="add-btn" disabled={cur === 0} onClick={() => setStep(cur - 1)}>
          ◄ السابق
        </button>
        <span className="meta">صفحة {cur + 1} من {pages.length}</span>
        {cur < pages.length - 1 && (
          <button
            type="button"
            disabled={pageErrors.length > 0}
            onClick={() => setStep(cur + 1)}
            title={pageErrors.length > 0 ? "أكمل الحقول المطلوبة في هذه الصفحة" : ""}
          >
            التالي ►
          </button>
        )}
      </div>
    </div>
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
  const dis = !isEnabled(f, values); // التعطيل الشرطي (يتتالى أصيلاً عبر fieldset)
  const v = values[f.id];

  let content: ReactNode;

  if (f.type === "groupField") {
    content = f.isRepeating ? (
      <RepeatingGroup f={f} v={v} onChange={onChange} lab={lab} />
    ) : (
      <div className="group">
        <div className="gtitle">
          {lab}
          {f.layout === "step" && <span className="step-badge">قسم</span>}
        </div>
        {(f.subFields || []).map((sf) => (
          <FieldView key={sf.id} f={sf} values={values} onChange={onChange} />
        ))}
      </div>
    );
  } else if (f.type === "noteField") {
    content = (
      <div className="field">
        <div className="note">{lab}</div>
      </div>
    );
  } else if ((f.type === "dropdownField" || f.type === "radioField" || f.type === "checkboxField") && f.dataSourceKey) {
    content = <LookupChoice f={f} v={v} values={values} onChange={onChange} lab={lab} req={req} />;
  } else {
    const Lbl = () => (
      <label>
        {lab}
        {req && <span className="req"> *</span>}
      </label>
    );
    content = renderLeaf(f, v, onChange, Lbl, lab, req);
  }

  return (
    <fieldset className="field-fs" disabled={dis}>
      {content}
    </fieldset>
  );
}

// ---- تصيير الحقول الورقية (غير الحاويات) ----
function renderLeaf(
  f: FormField,
  v: unknown,
  onChange: (id: string, v: unknown) => void,
  Lbl: () => ReactNode,
  lab: string,
  req: boolean,
): ReactNode {
  switch (f.type) {
    case "textField":
      return (
        <div className="field">
          <Lbl />
          <input
            value={(v as string) ?? ""}
            placeholder={f.placeholder}
            onChange={(e) => onChange(f.id, e.target.value)}
          />
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
            step={f.type === "integerField" ? 1 : "any"}
            value={(v as number) ?? ""}
            placeholder={f.placeholder}
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

    case "rangeField": {
      const min = f.min ?? 0;
      const max = f.max ?? 100;
      const step = f.step ?? 1;
      const cur = typeof v === "number" ? v : min;
      return (
        <div className="field">
          <Lbl />
          <div className="range-row">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={cur}
              onChange={(e) => onChange(f.id, Number(e.target.value))}
            />
            <span className="range-val">{cur}</span>
          </div>
        </div>
      );
    }

    case "rateField": {
      const maxR = f.maxRating ?? f.max ?? 5;
      const cur = typeof v === "number" ? v : 0;
      return (
        <div className="field">
          <Lbl />
          <div className="stars">
            {Array.from({ length: maxR }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`star${n <= cur ? " on" : ""}`}
                onClick={() => onChange(f.id, n === cur ? 0 : n)}
                aria-label={`${n}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      );
    }

    case "fileField":
    case "imageField":
    case "audioField":
    case "videoField": {
      const accept =
        f.type === "imageField" ? "image/*" : f.type === "audioField" ? "audio/*" : f.type === "videoField" ? "video/*" : undefined;
      const meta = v as { name?: string; size?: number } | undefined;
      return (
        <div className="field">
          <Lbl />
          <input
            type="file"
            accept={accept}
            onChange={(e) => {
              const file = e.target.files?.[0];
              onChange(f.id, file ? { name: file.name, size: file.size, type: file.type } : null);
            }}
          />
          {meta?.name && (
            <div className="filehint">
              {meta.name} ({Math.round((meta.size ?? 0) / 1024)} ك.ب) — الرفع الفعلي لاحقاً (تخزين الكائنات)
            </div>
          )}
        </div>
      );
    }

    case "signatureField":
      return (
        <div className="field">
          <Lbl />
          <SignaturePad value={v as string | undefined} onChange={(d) => onChange(f.id, d)} />
        </div>
      );

    case "mapField": {
      const pt = (v as { lat?: number; lng?: number }) ?? {};
      const set = (k: "lat" | "lng", val: string) => onChange(f.id, { ...pt, [k]: val === "" ? null : Number(val) });
      const locate = () => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((p) =>
          onChange(f.id, { lat: p.coords.latitude, lng: p.coords.longitude })
        );
      };
      return (
        <div className="field">
          <Lbl />
          <div className="map-row">
            <input type="number" step="any" placeholder="خط العرض (lat)" value={pt.lat ?? ""} onChange={(e) => set("lat", e.target.value)} />
            <input type="number" step="any" placeholder="خط الطول (lng)" value={pt.lng ?? ""} onChange={(e) => set("lng", e.target.value)} />
            <button type="button" className="add-btn" onClick={locate}>📍 موقعي</button>
          </div>
        </div>
      );
    }

    case "qrcodeField":
      return (
        <div className="field">
          <Lbl />
          <input
            value={(v as string) ?? ""}
            placeholder="أدخل الرمز يدوياً (المسح بالكاميرا لاحقاً)"
            onChange={(e) => onChange(f.id, e.target.value)}
          />
        </div>
      );

    case "tableField":
      return <TableField f={f} v={v} onChange={onChange} lab={lab} req={req} />;

    case "matrixField":
      return <MatrixField f={f} v={v} onChange={onChange} lab={lab} req={req} />;

    default:
      return (
        <div className="field">
          <Lbl />
          <div className="todo">نوع غير مدعوم في الواجهة بعد: {f.type}</div>
        </div>
      );
  }
}

// ---- قسم متكرّر حقيقي: القيمة مصفوفة نطاقات؛ كل عنصر يعرض subFields في نطاقه ----
function RepeatingGroup({
  f,
  v,
  onChange,
  lab,
}: {
  f: FormField;
  v: unknown;
  onChange: (id: string, v: unknown) => void;
  lab: string;
}) {
  const rows: Values[] = Array.isArray(v) ? (v as Values[]) : [];
  const setRows = (next: Values[]) => onChange(f.id, next);
  const add = () => setRows([...rows, {}]);
  const remove = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const updateRow = (i: number, sid: string, sv: unknown) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [sid]: sv } : r)));

  return (
    <div className="group repeating">
      <div className="gtitle">
        {lab}
        <span className="step-badge">متكرّر</span>
      </div>
      {rows.map((row, i) => (
        <div className="repeat-item" key={i}>
          <div className="repeat-head">
            <span>#{i + 1}</span>
            <button type="button" className="del-btn" onClick={() => remove(i)}>
              حذف
            </button>
          </div>
          {(f.subFields || []).map((sf) => (
            <FieldView key={sf.id} f={sf} values={row} onChange={(sid, sv) => updateRow(i, sid, sv)} />
          ))}
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>
        + إضافة
      </button>
    </div>
  );
}

// ---- جدول: القيمة مصفوفة صفوف؛ كل صف كائن مفاتيحه أعمدة ----
function TableField({
  f,
  v,
  onChange,
  lab,
  req,
}: {
  f: FormField;
  v: unknown;
  onChange: (id: string, v: unknown) => void;
  lab: string;
  req: boolean;
}) {
  const cols = f.columns || [];
  const rows: Values[] = Array.isArray(v) ? (v as Values[]) : [];
  const setRows = (next: Values[]) => onChange(f.id, next);
  const add = () => setRows([...rows, {}]);
  const remove = (i: number) => setRows(rows.filter((_, idx) => idx !== i));
  const setCell = (i: number, key: string, val: unknown) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [key]: val } : r)));

  const cellType = (t?: string) =>
    t === "integerField" || t === "doubleField" || t === "numberField"
      ? "number"
      : t === "dateField"
      ? "date"
      : "text";

  return (
    <div className="field">
      <label>
        {lab}
        {req && <span className="req"> *</span>}
      </label>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c.key}>{colLabel(c)}</th>
              ))}
              <th className="tbl-x"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key}>
                    <input
                      type={cellType(c.type)}
                      value={(row[c.key] as string | number) ?? ""}
                      onChange={(e) =>
                        setCell(i, c.key, cellType(c.type) === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)
                      }
                    />
                  </td>
                ))}
                <td className="tbl-x">
                  <button type="button" className="del-btn" onClick={() => remove(i)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length + 1} className="tbl-empty">
                  لا صفوف بعد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="add-btn" onClick={add}>
        + صفّ
      </button>
    </div>
  );
}

// ---- مصفوفة: صفوف × خيارات (مقياس)؛ single → اختيار واحد لكل صفّ، multiple → متعدّد ----
function MatrixField({
  f,
  v,
  onChange,
  lab,
  req,
}: {
  f: FormField;
  v: unknown;
  onChange: (id: string, v: unknown) => void;
  lab: string;
  req: boolean;
}) {
  const rows = f.matrixRows || [];
  const opts = f.options || [];
  const multiple = f.matrixMode === "multiple";
  const ans = (v as Record<string, unknown>) ?? {};

  const setSingle = (rk: string, ok: string) => onChange(f.id, { ...ans, [rk]: ok });
  const toggleMulti = (rk: string, ok: string) => {
    const cur = Array.isArray(ans[rk]) ? (ans[rk] as string[]) : [];
    const next = cur.includes(ok) ? cur.filter((x) => x !== ok) : [...cur, ok];
    onChange(f.id, { ...ans, [rk]: next });
  };

  return (
    <div className="field">
      <label>
        {lab}
        {req && <span className="req"> *</span>}
      </label>
      <div className="tbl-wrap">
        <table className="tbl matrix">
          <thead>
            <tr>
              <th></th>
              {opts.map((o) => (
                <th key={o.valueKey}>{optLabel(o)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cur = ans[r.key];
              return (
                <tr key={r.key}>
                  <td className="matrix-rowlabel">{colLabel(r)}</td>
                  {opts.map((o) => (
                    <td key={o.valueKey} className="matrix-cell">
                      {multiple ? (
                        <input
                          type="checkbox"
                          checked={Array.isArray(cur) && (cur as string[]).includes(o.valueKey)}
                          onChange={() => toggleMulti(r.key, o.valueKey)}
                        />
                      ) : (
                        <input
                          type="radio"
                          name={`${f.id}__${r.key}`}
                          checked={cur === o.valueKey}
                          onChange={() => setSingle(r.key, o.valueKey)}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---- حقل اختيار مُسنَد لقائمة ساندة: يجلب الخيارات من /lookups/{key} مع التتالي والإسناد ----
function LookupChoice({
  f,
  v,
  values,
  onChange,
  lab,
  req,
}: {
  f: FormField;
  v: unknown;
  values: Values;
  onChange: (id: string, v: unknown) => void;
  lab: string;
  req: boolean;
}) {
  const parentVal = f.parentFieldId ? values[f.parentFieldId] : undefined;
  const parentStr = typeof parentVal === "string" && parentVal !== "" ? parentVal : undefined;
  const blocked = !!f.parentFieldId && !parentStr; // ينتظر اختيار الأب
  const [items, setItems] = useState<LookupItem[]>([]);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!f.dataSourceKey || blocked) {
      setItems([]);
      return;
    }
    let active = true;
    setErr(false);
    getLookup(f.dataSourceKey, parentStr)
      .then((r) => active && setItems(r.items || []))
      .catch(() => {
        if (active) {
          setItems([]);
          setErr(true);
        }
      });
    return () => {
      active = false;
    };
  }, [f.dataSourceKey, parentStr, blocked]);

  // إعادة ضبط القيمة إن لم تعد ضمن الخيارات (تتالٍ: تغيّر الأب يُبطل اختيار الابن)
  useEffect(() => {
    if (blocked) {
      if (v != null && v !== "") onChange(f.id, f.type === "checkboxField" ? [] : "");
      return;
    }
    if (!items.length) return;
    const keys = new Set(items.map((i) => i.value_key));
    if (f.type === "checkboxField") {
      const arr = Array.isArray(v) ? (v as string[]) : [];
      const kept = arr.filter((x) => keys.has(x));
      if (kept.length !== arr.length) onChange(f.id, kept);
    } else if (typeof v === "string" && v !== "" && !keys.has(v)) {
      onChange(f.id, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, blocked]);

  const Lbl = () => (
    <label>
      {lab}
      {req && <span className="req"> *</span>}
    </label>
  );
  const itemLabel = (i: LookupItem) => i.label?.ar || i.label?.en || i.value_key;
  const src = items[0]?.source;
  const Badge = () =>
    items.length ? (
      <span className="prov-badge" title="مصدر البيانات الساندة (نسيج الثقة)">
        ⛓︎ {src ? `مصدر: ${src}` : "قائمة ساندة"} · {items.length} عنصر
      </span>
    ) : null;

  if (blocked)
    return (
      <div className="field">
        <Lbl />
        <div className="todo">اختر القيمة الأب أولاً لعرض الخيارات.</div>
      </div>
    );
  if (err)
    return (
      <div className="field">
        <Lbl />
        <div className="todo">تعذّر جلب القائمة الساندة: {f.dataSourceKey}</div>
      </div>
    );

  if (f.type === "dropdownField")
    return (
      <div className="field">
        <Lbl />
        <select value={(v as string) ?? ""} onChange={(e) => onChange(f.id, e.target.value)}>
          <option value="">—</option>
          {items.map((i) => (
            <option key={i.value_key} value={i.value_key}>
              {itemLabel(i)}
            </option>
          ))}
        </select>
        <Badge />
      </div>
    );

  if (f.type === "radioField")
    return (
      <div className="field">
        <Lbl />
        <div className="opts">
          {items.map((i) => (
            <label key={i.value_key}>
              <input type="radio" name={f.id} checked={v === i.value_key} onChange={() => onChange(f.id, i.value_key)} />
              {itemLabel(i)}
            </label>
          ))}
        </div>
        <Badge />
      </div>
    );

  // checkboxField
  const arr = Array.isArray(v) ? (v as string[]) : [];
  const toggle = (k: string) => onChange(f.id, arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  return (
    <div className="field">
      <Lbl />
      <div className="opts">
        {items.map((i) => (
          <label key={i.value_key}>
            <input type="checkbox" checked={arr.includes(i.value_key)} onChange={() => toggle(i.value_key)} />
            {itemLabel(i)}
          </label>
        ))}
      </div>
      <Badge />
    </div>
  );
}
