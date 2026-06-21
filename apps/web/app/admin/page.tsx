"use client";
// لوحة الإدارة: المستخدمون والأدوار + القوائم الساندة (تتطلّب users:manage).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { can, getUser, onAuthChange, type SessionUser } from "@/lib/auth";
import {
  addLookupItems,
  createLookupList,
  deleteLookupList,
  deleteUser,
  getLookups,
  listRoles,
  listUsers,
  registerUser,
  updateUser,
  type AdminUser,
  type RoleInfo,
} from "@/lib/api";
import AuthBar from "@/components/AuthBar";

type LookupRow = { key: string; label?: { ar?: string }; description?: string; item_count: number };

export default function AdminPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    setUser(getUser());
    return onAuthChange(() => setUser(getUser()));
  }, []);

  const authorized = can(user, "users:manage");

  return (
    <main className="wrap builder-wrap">
      <div className="topbar">
        <Link href="/" className="navlink">← الرئيسية</Link>
        <AuthBar />
      </div>
      <h1>Safi — الإدارة</h1>
      {!authorized ? (
        <div className="card">
          <div className="todo">هذه الصفحة تتطلّب صلاحية الإدارة (users:manage). سجّل الدخول بحساب مسؤول.</div>
        </div>
      ) : (
        <>
          <UsersSection />
          <LookupsSection />
        </>
      )}
    </main>
  );
}

function Msg({ msg }: { msg: { t: string; ok: boolean } | null }) {
  return msg ? <span className={msg.ok ? "msg-ok" : "msg-err"}>{msg.t}</span> : null;
}

// ============ المستخدمون ============
function UsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  // نموذج إضافة
  const [nu, setNu] = useState("");
  const [np, setNp] = useState("");
  const [nfull, setNfull] = useState("");
  const [nroles, setNroles] = useState<string[]>(["data_entry"]);

  const reload = useCallback(() => {
    listUsers().then(setUsers).catch((e) => setMsg({ t: e.message, ok: false }));
  }, []);
  useEffect(() => {
    reload();
    listRoles().then(setRoles).catch(() => {});
  }, [reload]);

  const guard = (p: Promise<unknown>) =>
    p.then(() => { setMsg(null); reload(); }).catch((e) => setMsg({ t: e.message, ok: false }));

  function addUser() {
    if (!nu.trim() || np.length < 4) {
      setMsg({ t: "اسم مستخدم وكلمة مرور (٤+) مطلوبة", ok: false });
      return;
    }
    guard(
      registerUser({ username: nu.trim(), password: np, full_name: nfull, role_keys: nroles }).then(() => {
        setNu(""); setNp(""); setNfull(""); setNroles(["data_entry"]);
      })
    );
  }

  const toggleNewRole = (k: string) =>
    setNroles((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const toggleUserRole = (u: AdminUser, k: string) =>
    guard(updateUser(u.id, { role_keys: u.role_keys.includes(k) ? u.role_keys.filter((x) => x !== k) : [...u.role_keys, k] }));

  return (
    <div className="card">
      <div className="col-title">المستخدمون ({users.length}) <Msg msg={msg} /></div>

      {/* إضافة مستخدم */}
      <div className="sect">
        <div className="sect-title">إضافة مستخدم</div>
        <div className="row mini">
          <input style={{ width: 130 }} value={nu} onChange={(e) => setNu(e.target.value)} placeholder="اسم المستخدم" />
          <input style={{ width: 130 }} type="password" value={np} onChange={(e) => setNp(e.target.value)} placeholder="كلمة المرور" />
          <input style={{ flex: 1, minWidth: 120 }} value={nfull} onChange={(e) => setNfull(e.target.value)} placeholder="الاسم الكامل" />
        </div>
        <div className="row mini" style={{ flexWrap: "wrap" }}>
          {roles.map((r) => (
            <label key={r.key} className="chk">
              <input type="checkbox" checked={nroles.includes(r.key)} onChange={() => toggleNewRole(r.key)} /> {r.key}
            </label>
          ))}
          <button className="add-btn" onClick={addUser}>+ إضافة</button>
        </div>
      </div>

      {/* قائمة المستخدمين */}
      {users.map((u) => (
        <div className="sect" key={u.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{u.username} {!u.is_active && <span className="muted sm">(معطّل)</span>}</strong>
            <span className="muted sm">{u.full_name}</span>
          </div>
          <div className="row mini" style={{ flexWrap: "wrap", marginTop: 6 }}>
            {roles.map((r) => (
              <label key={r.key} className="chk">
                <input type="checkbox" checked={u.role_keys.includes(r.key)} onChange={() => toggleUserRole(u, r.key)} /> {r.key}
              </label>
            ))}
          </div>
          <div className="row mini" style={{ marginTop: 6 }}>
            <label className="chk">
              <input type="checkbox" checked={u.is_active} onChange={() => guard(updateUser(u.id, { is_active: !u.is_active }))} /> نشط
            </label>
            <button className="del-btn" onClick={() => guard(deleteUser(u.id))}>حذف</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ القوائم الساندة ============
function LookupsSection() {
  const [lists, setLists] = useState<LookupRow[]>([]);
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [nkey, setNkey] = useState("");
  const [nar, setNar] = useState("");
  const [ndesc, setNdesc] = useState("");
  // إضافة عنصر
  const [itemList, setItemList] = useState("");
  const [ivk, setIvk] = useState("");
  const [iar, setIar] = useState("");
  const [iparent, setIparent] = useState("");

  const reload = useCallback(() => {
    getLookups().then(setLists).catch((e) => setMsg({ t: e.message, ok: false }));
  }, []);
  useEffect(() => reload(), [reload]);

  const guard = (p: Promise<unknown>) =>
    p.then(() => { setMsg(null); reload(); }).catch((e) => setMsg({ t: e.message, ok: false }));

  function addList() {
    if (!nkey.trim()) return;
    guard(createLookupList(nkey.trim(), { ar: nar }, ndesc).then(() => { setNkey(""); setNar(""); setNdesc(""); }));
  }
  function addItem() {
    if (!itemList || !ivk.trim()) return;
    guard(
      addLookupItems(itemList, [
        { value_key: ivk.trim(), label: { ar: iar }, parent_value_key: iparent.trim() || null, source: "admin:manual" },
      ]).then(() => { setIvk(""); setIar(""); setIparent(""); })
    );
  }

  return (
    <div className="card">
      <div className="col-title">القوائم الساندة ({lists.length}) <Msg msg={msg} /></div>

      <div className="sect">
        <div className="sect-title">إنشاء قائمة</div>
        <div className="row mini">
          <input style={{ width: 150 }} value={nkey} onChange={(e) => setNkey(e.target.value)} placeholder="المفتاح (key)" />
          <input style={{ flex: 1, minWidth: 120 }} value={nar} onChange={(e) => setNar(e.target.value)} placeholder="الاسم (عربي)" />
          <button className="add-btn" onClick={addList}>+ قائمة</button>
        </div>
        <input style={{ marginTop: 6 }} value={ndesc} onChange={(e) => setNdesc(e.target.value)} placeholder="وصف (اختياري)" />
      </div>

      <div className="sect">
        <div className="sect-title">إضافة عنصر إلى قائمة</div>
        <div className="row mini" style={{ flexWrap: "wrap" }}>
          <select style={{ width: 170 }} value={itemList} onChange={(e) => setItemList(e.target.value)}>
            <option value="">— اختر قائمة —</option>
            {lists.map((l) => <option key={l.key} value={l.key}>{l.label?.ar || l.key}</option>)}
          </select>
          <input style={{ width: 110 }} value={ivk} onChange={(e) => setIvk(e.target.value)} placeholder="value_key" />
          <input style={{ width: 130 }} value={iar} onChange={(e) => setIar(e.target.value)} placeholder="العرض (عربي)" />
          <input style={{ width: 130 }} value={iparent} onChange={(e) => setIparent(e.target.value)} placeholder="قيمة الأب (للتتالي)" />
          <button className="add-btn" onClick={addItem} disabled={!itemList}>+ عنصر</button>
        </div>
      </div>

      {lists.map((l) => (
        <div className="row mini" key={l.key} style={{ justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 6 }}>
          <span><strong>{l.label?.ar || l.key}</strong> <span className="muted sm">({l.key} · {l.item_count} عنصر)</span></span>
          <button className="del-btn" onClick={() => guard(deleteLookupList(l.key))}>حذف القائمة</button>
        </div>
      ))}
    </div>
  );
}
