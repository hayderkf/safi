"use client";
// الباني المرئي للاستمارات: يبني/يحرّر الـ IR يدوياً مع معاينة حيّة + ربط القوائم الساندة.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Column, FormField, Option, RuleGroup, Values } from "@/lib/types";
import { label } from "@/lib/types";
import FormRenderer from "@/components/FormRenderer";
import AuthBar from "@/components/AuthBar";
import { describeForm, generateForm, getLookups, getForm, listForms, saveForm } from "@/lib/api";
import {
  CHOICE_TYPES,
  OPERATORS,
  PALETTE,
  findById,
  flatten,
  insertInto,
  lintForm,
  makeField,
  moveById,
  removeById,
  updateById,
} from "@/lib/builder";

type Lookup = { key: string; label?: { ar?: string; en?: string }; item_count: number };

export default function BuilderPage() {
  const [fields, setFields] = useState<FormField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("استمارة جديدة");
  const [preview, setPreview] = useState<Values>({});
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [forms, setForms] = useState<{ id: string; title: string; field_count: number }[]>([]);
  const [loadId, setLoadId] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [desc, setDesc] = useState<string | null>(null);
  const [descBusy, setDescBusy] = useState(false);

  useEffect(() => {
    getLookups().then(setLookups).catch(() => setLookups([]));
    listForms().then(setForms).catch(() => setForms([]));
  }, []);

  const selected = selectedId ? findById(fields, selectedId) : null;
  const addTarget = selected?.type === "groupField" ? selected.id : null;
  const issues = lintForm(fields);

  function add(type: string) {
    const f = makeField(type, fields);
    setFields(insertInto(fields, addTarget, f));
    setSelectedId(f.id);
  }
  const patch = (id: string, p: Partial<FormField>) => setFields(updateById(fields, id, p));
  function remove(id: string) {
    setFields(removeById(fields, id));
    if (selectedId === id) setSelectedId(null);
  }
  function rename(oldId: string, raw: string) {
    const nid = raw.trim();
    if (!nid || nid === oldId) return;
    if (findById(fields, nid)) {
      setMsg({ t: `المعرّف «${nid}» مستخدم`, ok: false });
      return;
    }
    setFields(updateById(fields, oldId, { id: nid }));
    setSelectedId(nid);
  }

  async function generateStart() {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await generateForm(aiPrompt);
      if (!r.ok) throw new Error("فشل التوليد");
      setFields(r.fields);
      setSelectedId(null);
      setPreview({});
    } catch (e: any) {
      setMsg({ t: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function loadForm() {
    if (!loadId) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await getForm(loadId);
      setFields(r.ir || []);
      setTitle(r.title || "استمارة");
      setSelectedId(null);
      setPreview({});
    } catch (e: any) {
      setMsg({ t: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  async function describe() {
    if (!fields.length) return;
    setDescBusy(true);
    setMsg(null);
    try {
      const r = await describeForm(fields);
      setDesc(r.description || "(وصف فارغ)");
    } catch (e: any) {
      setMsg({ t: e.message, ok: false });
    } finally {
      setDescBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const { id } = await saveForm(title || "استمارة بلا عنوان", fields);
      setMsg({ t: `تم الحفظ (${id.slice(0, 8)})`, ok: true });
      listForms().then(setForms).catch(() => {});
    } catch (e: any) {
      setMsg({ t: e.message, ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap builder-wrap">
      <div className="topbar">
        <Link href="/" className="navlink">← التوليد</Link>
        <AuthBar />
      </div>
      <h1>Safi — الباني المرئي</h1>
      <div className="sub">أضف الحقول من اللوحة، حرّر خصائصها، وعاين مباشرةً. احفظ عند الجاهزية.</div>

      {/* شريط أدوات: عنوان + حفظ + بدء بـ AI + تحميل موجود */}
      <div className="card">
        <div className="row">
          <input style={{ flex: 1, minWidth: 180 }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الاستمارة" />
          <button onClick={save} disabled={busy || !fields.length}>حفظ</button>
          <button className="add-btn" onClick={describe} disabled={descBusy || !fields.length} title="تحويل الاستمارة إلى وصف لغوي يفهمه النموذج">
            {descBusy ? "…جارٍ" : "تخريج وصف"}
          </button>
          {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.t}</span>}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input style={{ flex: 1, minWidth: 180 }} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="ابدأ بوصف عربي (اختياري) ثم ولّد كنقطة بداية…" />
          <button className="add-btn" onClick={generateStart} disabled={busy || !aiPrompt.trim()}>توليد كبداية</button>
        </div>
        {forms.length > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            <select style={{ flex: 1, minWidth: 180 }} value={loadId} onChange={(e) => setLoadId(e.target.value)}>
              <option value="">— تحميل استمارة محفوظة —</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>{f.title} ({f.field_count} حقل)</option>
              ))}
            </select>
            <button className="add-btn" onClick={loadForm} disabled={busy || !loadId}>تحميل</button>
          </div>
        )}
      </div>

      {desc !== null && (
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <strong>وصف الاستمارة (كما يفهمه النموذج)</strong>
            <div className="row">
              <button type="button" className="add-btn" onClick={() => navigator.clipboard?.writeText(desc)}>نسخ</button>
              <button type="button" className="del-btn" onClick={() => setDesc(null)}>إغلاق</button>
            </div>
          </div>
          <textarea readOnly value={desc} style={{ minHeight: 140, width: "100%" }} />
          <div className="meta">يمكنك لصق هذا الوصف في صفحة التوليد لإعادة إنشاء استمارة مماثلة.</div>
        </div>
      )}

      {fields.length > 0 && issues.length > 0 && (
        <div className="card issues">
          <strong>مشاكل يُستحسن إصلاحها ({issues.length}):</strong>
          <ul>{issues.map((s, i) => <li key={i}>{s.message}</li>)}</ul>
        </div>
      )}

      <div className="builder-grid">
        {/* اللوحة + قائمة الحقول */}
        <div className="card builder-col">
          <div className="col-title">اللوحة {addTarget && <span className="step-badge">داخل: {addTarget}</span>}</div>
          <div className="palette">
            {PALETTE.map((p) => (
              <button key={p.type} type="button" className="pal-btn" onClick={() => add(p.type)}>+ {p.label}</button>
            ))}
          </div>
          <div className="col-title" style={{ marginTop: 14 }}>الحقول ({flatten(fields).length})</div>
          {fields.length === 0 ? (
            <div className="todo">لا حقول بعد — أضف من اللوحة.</div>
          ) : (
            <FieldTree fields={fields} selectedId={selectedId} onSelect={setSelectedId} onMove={(id, d) => setFields(moveById(fields, id, d))} onRemove={remove} />
          )}
        </div>

        {/* محرّر الخصائص */}
        <div className="card builder-col">
          <div className="col-title">الخصائص</div>
          {selected ? (
            <FieldEditor
              field={selected}
              candidates={flatten(fields, selected.id)}
              lookups={lookups}
              onPatch={(p) => patch(selected.id, p)}
              onRename={(nid) => rename(selected.id, nid)}
            />
          ) : (
            <div className="todo">اختر حقلاً لتحرير خصائصه.</div>
          )}
        </div>

        {/* المعاينة الحيّة */}
        <div className="card builder-col">
          <div className="col-title">معاينة حيّة</div>
          {fields.length ? (
            <FormRenderer fields={fields} values={preview} onChange={(id, v) => setPreview((s) => ({ ...s, [id]: v }))} />
          ) : (
            <div className="todo">ستظهر المعاينة هنا.</div>
          )}
        </div>
      </div>
    </main>
  );
}

// ---- شجرة الحقول ----
function FieldTree({
  fields,
  selectedId,
  onSelect,
  onMove,
  onRemove,
  depth = 0,
}: {
  fields: FormField[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, d: "up" | "down") => void;
  onRemove: (id: string) => void;
  depth?: number;
}) {
  return (
    <div className="ftree">
      {fields.map((f) => (
        <div key={f.id}>
          <div className={`frow${selectedId === f.id ? " sel" : ""}`} style={{ marginInlineStart: depth * 14 }}>
            <button type="button" className="fname" onClick={() => onSelect(f.id)}>
              <span className="ftype">{f.type.replace("Field", "")}</span>
              {label(f) || <em className="muted">بلا عنوان</em>}
            </button>
            <div className="facts">
              <button type="button" title="أعلى" onClick={() => onMove(f.id, "up")}>↑</button>
              <button type="button" title="أسفل" onClick={() => onMove(f.id, "down")}>↓</button>
              <button type="button" className="del-x" title="حذف" onClick={() => onRemove(f.id)}>✕</button>
            </div>
          </div>
          {f.subFields && f.subFields.length > 0 && (
            <FieldTree fields={f.subFields} selectedId={selectedId} onSelect={onSelect} onMove={onMove} onRemove={onRemove} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---- محرّر خصائص حقل ----
function FieldEditor({
  field,
  candidates,
  lookups,
  onPatch,
  onRename,
}: {
  field: FormField;
  candidates: FormField[];
  lookups: Lookup[];
  onPatch: (p: Partial<FormField>) => void;
  onRename: (newId: string) => void;
}) {
  const f = field;
  const isChoice = CHOICE_TYPES.has(f.type);
  const usesLookup = !!f.dataSourceKey;

  const setLabel = (lang: "ar" | "en", v: string) => onPatch({ labelTranslations: { ...(f.labelTranslations || {}), [lang]: v } });

  return (
    <div className="editor">
      <Field label="المعرّف (id)">
        <input key={f.id} defaultValue={f.id} onBlur={(e) => onRename(e.target.value)} />
      </Field>
      <div className="muted sm">النوع: {f.type}</div>

      <Field label={f.type === "noteField" ? "نصّ الملاحظة (عربي)" : "العنوان (عربي)"}>
        <input value={f.labelTranslations?.ar ?? ""} onChange={(e) => setLabel("ar", e.target.value)} />
      </Field>
      <Field label="العنوان (إنجليزي)">
        <input value={f.labelTranslations?.en ?? ""} onChange={(e) => setLabel("en", e.target.value)} />
      </Field>

      {f.type !== "noteField" && (
        <label className="chk">
          <input type="checkbox" checked={!!f.isRequired} onChange={(e) => onPatch({ isRequired: e.target.checked })} /> إلزامي
        </label>
      )}

      {/* range */}
      {f.type === "rangeField" && (
        <div className="row">
          <Field label="أدنى"><input type="number" value={f.min ?? 0} onChange={(e) => onPatch({ min: Number(e.target.value) })} /></Field>
          <Field label="أقصى"><input type="number" value={f.max ?? 100} onChange={(e) => onPatch({ max: Number(e.target.value) })} /></Field>
          <Field label="خطوة"><input type="number" value={f.step ?? 1} onChange={(e) => onPatch({ step: Number(e.target.value) })} /></Field>
        </div>
      )}
      {f.type === "rateField" && (
        <Field label="أقصى عدد نجوم"><input type="number" value={f.maxRating ?? 5} onChange={(e) => onPatch({ maxRating: Number(e.target.value) })} /></Field>
      )}

      {/* مجموعة */}
      {f.type === "groupField" && (
        <div className="row">
          <Field label="التخطيط">
            <select value={f.layout ?? ""} onChange={(e) => onPatch({ layout: e.target.value || undefined })}>
              <option value="">عادي</option>
              <option value="step">صفحة (stepper)</option>
            </select>
          </Field>
          <label className="chk">
            <input type="checkbox" checked={!!f.isRepeating} onChange={(e) => onPatch({ isRepeating: e.target.checked || undefined })} /> متكرّر
          </label>
        </div>
      )}

      {/* اختيار: ثابت أو قائمة ساندة */}
      {isChoice && (
        <div className="sect">
          <div className="sect-title">مصدر الخيارات</div>
          <div className="row">
            <label className="chk"><input type="radio" name={`src-${f.id}`} checked={!usesLookup} onChange={() => onPatch({ dataSourceKey: undefined, parentFieldId: undefined })} /> خيارات ثابتة</label>
            <label className="chk"><input type="radio" name={`src-${f.id}`} checked={usesLookup} onChange={() => onPatch({ options: undefined, dataSourceKey: lookups[0]?.key })} /> قائمة ساندة</label>
          </div>
          {usesLookup ? (
            <>
              <Field label="القائمة (dataSourceKey)">
                <select value={f.dataSourceKey ?? ""} onChange={(e) => onPatch({ dataSourceKey: e.target.value })}>
                  {lookups.length === 0 && <option value="">— لا قوائم —</option>}
                  {lookups.map((l) => <option key={l.key} value={l.key}>{l.label?.ar || l.key} ({l.item_count})</option>)}
                </select>
              </Field>
              <Field label="حقل الأب للتتالي (اختياري)">
                <select value={f.parentFieldId ?? ""} onChange={(e) => onPatch({ parentFieldId: e.target.value || undefined })}>
                  <option value="">— بلا تتالٍ —</option>
                  {candidates.map((c) => <option key={c.id} value={c.id}>{c.id} — {label(c)}</option>)}
                </select>
              </Field>
            </>
          ) : (
            <OptionsEditor value={f.options} onChange={(options) => onPatch({ options })} />
          )}
        </div>
      )}

      {/* جدول */}
      {f.type === "tableField" && <ColumnsEditor value={f.columns} onChange={(columns) => onPatch({ columns })} />}

      {/* مصفوفة */}
      {f.type === "matrixField" && (
        <div className="sect">
          <div className="sect-title">الصفوف</div>
          <RowsEditor value={f.matrixRows} onChange={(matrixRows) => onPatch({ matrixRows })} />
          <div className="sect-title" style={{ marginTop: 8 }}>المقياس (الأعمدة)</div>
          <OptionsEditor value={f.options} onChange={(options) => onPatch({ options })} />
          <Field label="النمط">
            <select value={f.matrixMode ?? "single"} onChange={(e) => onPatch({ matrixMode: e.target.value })}>
              <option value="single">اختيار واحد لكل صفّ</option>
              <option value="multiple">متعدّد لكل صفّ</option>
            </select>
          </Field>
        </div>
      )}

      {/* شرط الرؤية + شرط التفعيل (تعطيل) */}
      <RulesEditor title="شرط الرؤية (visibilityWhen)" value={f.visibilityWhen} candidates={candidates} onChange={(visibilityWhen) => onPatch({ visibilityWhen })} />
      <RulesEditor title="شرط التفعيل (enabledWhen) — يُعطَّل إن لم يتحقّق" value={f.enabledWhen} candidates={candidates} onChange={(enabledWhen) => onPatch({ enabledWhen })} />
    </div>
  );
}

function Field({ label: lab, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="efield">
      <label>{lab}</label>
      {children}
    </div>
  );
}

function OptionsEditor({ value, onChange }: { value?: Option[]; onChange: (v: Option[]) => void }) {
  const opts = value || [];
  const set = (i: number, p: Partial<Option>) => onChange(opts.map((o, idx) => (idx === i ? { ...o, ...p } : o)));
  const setAr = (i: number, ar: string) => set(i, { valueTranslations: { ...(opts[i].valueTranslations || {}), ar } });
  return (
    <div className="sect">
      <div className="sect-title">الخيارات</div>
      {opts.map((o, i) => (
        <div className="row mini" key={i}>
          <input style={{ width: 90 }} value={o.valueKey} onChange={(e) => set(i, { valueKey: e.target.value })} placeholder="key" />
          <input style={{ flex: 1 }} value={o.valueTranslations?.ar ?? ""} onChange={(e) => setAr(i, e.target.value)} placeholder="العرض (عربي)" />
          <button type="button" className="del-x" onClick={() => onChange(opts.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={() => onChange([...opts, { valueKey: `opt_${opts.length + 1}`, valueTranslations: { ar: "" } }])}>+ خيار</button>
    </div>
  );
}

function RowsEditor({ value, onChange }: { value?: { key: string; labelTranslations?: { ar?: string } }[]; onChange: (v: any[]) => void }) {
  const rows = value || [];
  const setAr = (i: number, ar: string) => onChange(rows.map((r, idx) => (idx === i ? { ...r, labelTranslations: { ...(r.labelTranslations || {}), ar } } : r)));
  const setKey = (i: number, key: string) => onChange(rows.map((r, idx) => (idx === i ? { ...r, key } : r)));
  return (
    <div>
      {rows.map((r, i) => (
        <div className="row mini" key={i}>
          <input style={{ width: 90 }} value={r.key} onChange={(e) => setKey(i, e.target.value)} placeholder="key" />
          <input style={{ flex: 1 }} value={r.labelTranslations?.ar ?? ""} onChange={(e) => setAr(i, e.target.value)} placeholder="العرض (عربي)" />
          <button type="button" className="del-x" onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={() => onChange([...rows, { key: `row_${rows.length + 1}`, labelTranslations: { ar: "" } }])}>+ صفّ</button>
    </div>
  );
}

function ColumnsEditor({ value, onChange }: { value?: Column[]; onChange: (v: Column[]) => void }) {
  const cols = value || [];
  const set = (i: number, p: Partial<Column>) => onChange(cols.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  const setAr = (i: number, ar: string) => set(i, { labelTranslations: { ...(cols[i].labelTranslations || {}), ar } });
  return (
    <div className="sect">
      <div className="sect-title">الأعمدة</div>
      {cols.map((c, i) => (
        <div className="row mini" key={i}>
          <input style={{ width: 80 }} value={c.key} onChange={(e) => set(i, { key: e.target.value })} placeholder="key" />
          <input style={{ flex: 1 }} value={c.labelTranslations?.ar ?? ""} onChange={(e) => setAr(i, e.target.value)} placeholder="العنوان" />
          <select value={c.type ?? "textField"} onChange={(e) => set(i, { type: e.target.value })}>
            <option value="textField">نص</option>
            <option value="integerField">عدد</option>
            <option value="dateField">تاريخ</option>
          </select>
          <button type="button" className="del-x" onClick={() => onChange(cols.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={() => onChange([...cols, { key: `col_${cols.length + 1}`, type: "textField", labelTranslations: { ar: "" } }])}>+ عمود</button>
    </div>
  );
}

function RulesEditor({ value, candidates, onChange, title }: { value?: RuleGroup; candidates: FormField[]; onChange: (v: RuleGroup | undefined) => void; title: string }) {
  const g = value;
  const rules = g?.rules || [];
  const update = (next: RuleGroup) => onChange(next.rules && next.rules.length ? next : undefined);
  const setRule = (i: number, p: Partial<(typeof rules)[number]>) =>
    update({ mode: g?.mode || "all", rules: rules.map((r, idx) => (idx === i ? { ...r, ...p } : r)) });
  const add = () =>
    update({ mode: g?.mode || "all", rules: [...rules, { sourceFieldId: candidates[0]?.id || "", operator: "==", triggerValue: "" }] });

  return (
    <div className="sect">
      <div className="sect-title">{title}</div>
      {rules.length > 0 && (
        <Field label="الدمج">
          <select value={g?.mode || "all"} onChange={(e) => update({ mode: e.target.value as "all" | "any", rules })}>
            <option value="all">الكل (AND)</option>
            <option value="any">أيّ (OR)</option>
          </select>
        </Field>
      )}
      {rules.map((r, i) => (
        <div className="row mini" key={i}>
          <select style={{ flex: 1 }} value={r.sourceFieldId} onChange={(e) => setRule(i, { sourceFieldId: e.target.value })}>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
          <select value={r.operator} onChange={(e) => setRule(i, { operator: e.target.value })}>
            {OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
          </select>
          <input style={{ width: 90 }} value={(r.triggerValue as string) ?? ""} onChange={(e) => setRule(i, { triggerValue: e.target.value })} placeholder="قيمة" />
          <button type="button" className="del-x" onClick={() => update({ mode: g?.mode || "all", rules: rules.filter((_, idx) => idx !== i) })}>✕</button>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add} disabled={!candidates.length}>+ شرط</button>
    </div>
  );
}
