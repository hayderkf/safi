// عميل API للباك إند (FastAPI على 8601)
import type { FormField, Values } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8601";

async function jpost(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

export async function generateForm(prompt: string): Promise<{ ok: boolean; fields: FormField[]; meta: any }> {
  return jpost("/forms/generate", { prompt });
}

export async function saveForm(title: string, ir: FormField[], source_prompt = ""): Promise<{ id: string }> {
  return jpost("/forms", { title, ir, source_prompt });
}

export async function submitForm(formId: string, data: Values): Promise<{ id: string }> {
  return jpost(`/forms/${formId}/submissions`, { data });
}
