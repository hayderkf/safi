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

async function jsend(method: string, path: string, body?: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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

export async function describeForm(ir: FormField[]): Promise<{ ok: boolean; description: string; meta: any }> {
  return jpost("/forms/describe", { ir });
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
  reviewed_by?: string | null;
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

// ---- الإدارة (تتطلّب users:manage / lookups:write) ----
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  role_keys: string[];
  is_active: boolean;
}
export interface RoleInfo {
  key: string;
  label?: Translations;
  permissions: string[];
}

export const listUsers = (): Promise<AdminUser[]> => jget("/users");
export const listRoles = (): Promise<RoleInfo[]> => jget("/roles");
export const registerUser = (body: {
  username: string;
  password: string;
  full_name?: string;
  email?: string;
  role_keys?: string[];
}): Promise<AdminUser> => jpost("/auth/register", body);
export const updateUser = (
  id: string,
  patch: Partial<{ role_keys: string[]; is_active: boolean; full_name: string; email: string; password: string }>
): Promise<AdminUser> => jsend("PATCH", `/users/${id}`, patch);
export const deleteUser = (id: string): Promise<{ deleted: string }> => jsend("DELETE", `/users/${id}`);

export interface ProposedLookupItem {
  value_key: string;
  label: Translations;
  parent_value_key?: string | null;
  source?: string;
  confidence?: number;
}
export const createLookupList = (
  key: string,
  label: Translations,
  description = "",
  opts?: { force?: boolean; item_labels?: string[] }
): Promise<unknown> =>
  jpost("/lookups", { key, label, description, force: opts?.force ?? false, item_labels: opts?.item_labels ?? [] });
export interface SimilarMatch {
  key: string;
  label?: Translations;
  score: number;
  name_score: number;
  overlap: number;
}
export const checkSimilarLookup = (body: {
  key: string;
  label?: Translations;
  item_labels?: string[];
}): Promise<{ matches: SimilarMatch[]; block: boolean }> => jpost("/lookups/check-similar", body);
export const addLookupItems = (key: string, items: ProposedLookupItem[]): Promise<unknown> =>
  jpost(`/lookups/${encodeURIComponent(key)}/items`, { items });
export const deleteLookupList = (key: string): Promise<unknown> =>
  jsend("DELETE", `/lookups/${encodeURIComponent(key)}`);
export const updateLookupItem = (
  key: string,
  valueKey: string,
  patch: { label?: Translations; parent_value_key?: string | null; sort_order?: number; is_active?: boolean }
): Promise<unknown> =>
  jsend("PATCH", `/lookups/${encodeURIComponent(key)}/items/${encodeURIComponent(valueKey)}`, patch);
export const deleteLookupItem = (key: string, valueKey: string): Promise<unknown> =>
  jsend("DELETE", `/lookups/${encodeURIComponent(key)}/items/${encodeURIComponent(valueKey)}`);
export const generateLookup = (
  description: string,
  hierarchical: boolean
): Promise<{ ok: boolean; items: ProposedLookupItem[]; meta: any }> =>
  jpost("/lookups/generate", { description, hierarchical });

export async function importLookupExcel(
  file: File
): Promise<{ ok: boolean; list_key: string; list_label: Translations; items: ProposedLookupItem[]; warnings: string[]; meta: any }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${BASE}/lookups/import-excel`, { method: "POST", headers: { ...authHeaders() }, body: fd });
  check(r, "/lookups/import-excel");
  return r.json();
}
