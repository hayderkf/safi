// عميل API للباك إند (FastAPI على 8601)
import type { FormField, Translations, Values } from "./types";
import { authHeaders, setSession, type SessionUser } from "./auth";

const BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8601";

function check(r: Response, path: string) {
  if (r.ok) return;
  if (r.status === 401 || r.status === 403) throw new Error("يتطلّب تسجيل الدخول (صلاحية ناقصة)");
  throw new Error(`${path} → ${r.status}`);
}

async function jpost(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  check(r, path);
  return r.json();
}

async function jget(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } });
  check(r, path);
  return r.json();
}

// ---- المصادقة ----
export async function login(username: string, password: string): Promise<SessionUser> {
  const r = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!r.ok) throw new Error("بيانات الدخول غير صحيحة");
  const d = await r.json();
  setSession(d.access_token, d.user);
  return d.user;
}

export async function generateForm(prompt: string): Promise<{ ok: boolean; fields: FormField[]; meta: any }> {
  return jpost("/forms/generate", { prompt });
}

export async function saveForm(title: string, ir: FormField[], source_prompt = ""): Promise<{ id: string }> {
  return jpost("/forms", { title, ir, source_prompt });
}

export async function listForms(): Promise<{ id: string; title: string; field_count: number }[]> {
  return jget("/forms");
}

export async function getForm(id: string): Promise<{ id: string; title: string; ir: FormField[] }> {
  return jget(`/forms/${id}`);
}

export async function submitForm(formId: string, data: Values): Promise<{ id: string }> {
  return jpost(`/forms/${formId}/submissions`, { data });
}

// ---- البيانات الساندة (القوائم + الإسناد) ----
export interface LookupItem {
  value_key: string;
  label?: Translations;
  parent_value_key?: string | null;
  source?: string;
  confidence?: number;
  version?: number;
}

export async function getLookup(
  key: string,
  parent?: string
): Promise<{ key: string; label?: Translations; items: LookupItem[] }> {
  const q = parent != null ? `?parent=${encodeURIComponent(parent)}` : "";
  return jget(`/lookups/${encodeURIComponent(key)}${q}`);
}

export async function getLookups(): Promise<
  { key: string; label?: Translations; description?: string; item_count: number }[]
> {
  return jget("/lookups");
}
