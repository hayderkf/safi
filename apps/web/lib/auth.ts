// إدارة جلسة المصادقة (الرمز + المستخدم) في localStorage + إرفاق ترويسة Bearer.
export interface SessionUser {
  username: string;
  full_name?: string;
  role_keys?: string[];
  permissions?: string[];
}

const TKEY = "safi_token";
const UKEY = "safi_user";
const EVT = "safi-auth"; // حدث داخلي لمزامنة شريط المصادقة عبر المكوّنات

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TKEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const s = localStorage.getItem(UKEY);
  try {
    return s ? (JSON.parse(s) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: SessionUser) {
  localStorage.setItem(TKEY, token);
  localStorage.setItem(UKEY, JSON.stringify(user));
  window.dispatchEvent(new Event(EVT));
}

export function clearSession() {
  localStorage.removeItem(TKEY);
  localStorage.removeItem(UKEY);
  window.dispatchEvent(new Event(EVT));
}

export function onAuthChange(cb: () => void): () => void {
  window.addEventListener(EVT, cb);
  return () => window.removeEventListener(EVT, cb);
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export const can = (user: SessionUser | null, perm: string) =>
  !!user && (user.permissions?.includes("*") || user.permissions?.includes(perm)) === true;
