"use client";
// شريط المصادقة: يعرض المستخدم الحالي + خروج، أو نموذج دخول مُدمج.
import { useEffect, useState } from "react";
import { clearSession, getUser, onAuthChange, type SessionUser } from "@/lib/auth";
import { login } from "@/lib/api";

export default function AuthBar() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [u, setU] = useState("admin");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setUser(getUser());
    return onAuthChange(() => setUser(getUser()));
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(u, p);
      setP("");
    } catch {
      setErr("بيانات غير صحيحة");
    } finally {
      setBusy(false);
    }
  }

  if (user)
    return (
      <div className="authbar">
        <span>
          👤 {user.username} <span className="muted sm">({(user.role_keys || []).join("، ") || "بلا دور"})</span>
        </span>
        <button type="button" className="del-btn" onClick={() => clearSession()}>خروج</button>
      </div>
    );

  return (
    <form className="authbar" onSubmit={doLogin}>
      <input style={{ width: 110 }} value={u} onChange={(e) => setU(e.target.value)} placeholder="المستخدم" />
      <input style={{ width: 110 }} type="password" value={p} onChange={(e) => setP(e.target.value)} placeholder="كلمة المرور" />
      <button type="submit" className="add-btn" disabled={busy}>{busy ? "…" : "دخول"}</button>
      {err && <span className="msg-err sm">{err}</span>}
    </form>
  );
}
