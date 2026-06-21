"use client";
import { useState } from "react";
import Link from "next/link";
import type { FormField, Values } from "@/lib/types";
import { generateForm, saveForm, submitForm } from "@/lib/api";
import FormRenderer from "@/components/FormRenderer";

// استمارة تجريبية لتأكيد ربط القوائم الساندة + التتالي (محافظة → قضاء)
const DEMO_LOOKUP_IR: FormField[] = [
  { id: "gov", type: "dropdownField", labelTranslations: { ar: "المحافظة" }, isRequired: true, dataSourceKey: "iraq_governorates" },
  { id: "dist", type: "dropdownField", labelTranslations: { ar: "القضاء" }, isRequired: true, dataSourceKey: "iraq_districts", parentFieldId: "gov" },
];

export default function Home() {
  const [prompt, setPrompt] = useState(
    "استمارة تسجيل أسرة نازحة: الاسم، هل يوجد أطفال؟ (نعم/لا)، وإذا نعم أظهر عدد الأطفال (رقم). أضف تاريخ النزوح."
  );
  const [fields, setFields] = useState<FormField[] | null>(null);
  const [values, setValues] = useState<Values>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [meta, setMeta] = useState<any>(null);

  const onChange = (id: string, v: unknown) => setValues((s) => ({ ...s, [id]: v }));

  function loadDemo() {
    setMsg(null);
    setMeta(null);
    setValues({});
    setFields(DEMO_LOOKUP_IR);
  }

  async function gen() {
    setLoading(true);
    setMsg(null);
    setFields(null);
    setValues({});
    try {
      const r = await generateForm(prompt);
      if (!r.ok) throw new Error(r.meta?.error || "فشل التوليد");
      setFields(r.fields);
      setMeta(r.meta);
    } catch (e: any) {
      setMsg({ t: e.message, ok: false });
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!fields) return;
    setLoading(true);
    setMsg(null);
    try {
      const { id } = await saveForm("استمارة مولّدة", fields, prompt);
      await submitForm(id, values);
      setMsg({ t: `تم الحفظ والإرسال (استمارة ${id.slice(0, 8)})`, ok: true });
    } catch (e: any) {
      setMsg({ t: e.message, ok: false });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Safi — توليد الاستمارات</h1>
        <Link href="/builder" className="navlink">الباني المرئي ←</Link>
      </div>
      <div className="sub">اكتب وصفاً عربياً للاستمارة، ثم ولّدها واملأها وأرسلها.</div>

      <div className="card">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={gen} disabled={loading}>
            {loading ? "…جارٍ" : "توليد الاستمارة"}
          </button>
          <button type="button" className="add-btn" onClick={loadDemo} disabled={loading}>
            تجربة قوائم ساندة (محافظة ← قضاء)
          </button>
          {meta && (
            <span className="meta">
              النموذج: {meta.model} · حقول: {meta.field_count} · {Math.round(meta.duration_ms / 1000)}ث
            </span>
          )}
        </div>
      </div>

      {fields && (
        <div className="card">
          <FormRenderer fields={fields} values={values} onChange={onChange} />
          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={save} disabled={loading}>
              حفظ وإرسال
            </button>
            {msg && <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.t}</span>}
          </div>
        </div>
      )}

      {!fields && msg && (
        <div className="card">
          <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.t}</span>
        </div>
      )}
    </main>
  );
}
