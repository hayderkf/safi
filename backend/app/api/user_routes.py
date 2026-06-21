"""إدارة المستخدمين والأدوار (تتطلّب صلاحية users:manage).

الإنشاء عبر POST /auth/register؛ هنا: القائمة/التعديل/الحذف + قراءة الأدوار.
حُرّاس السلامة: لا تحذف/تعطّل نفسك، ولا تُزِل آخر مسؤول نشط.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_permission
from ..auth.security import hash_password
from ..db.models import Role, User
from ..db.session import get_session

router = APIRouter(tags=["users"])


class UpdateUserRequest(BaseModel):
    role_keys: list[str] | None = None
    is_active: bool | None = None
    full_name: str | None = None
    email: str | None = None
    password: str | None = None


def _user_out(u: User) -> dict:
    return {
        "id": str(u.id),
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "role_keys": u.role_keys,
        "is_active": u.is_active,
    }


async def _has_other_active_admin(session: AsyncSession, exclude_id: uuid.UUID) -> bool:
    users = (await session.execute(select(User).where(User.is_active.is_(True)))).scalars().all()
    return any(u.id != exclude_id and "admin" in (u.role_keys or []) for u in users)


@router.get("/users")
async def list_users(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_permission("users:manage")),
) -> list[dict]:
    res = await session.execute(select(User).order_by(User.created_at))
    return [_user_out(u) for u in res.scalars()]


@router.get("/roles")
async def list_roles(
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_permission("users:manage")),
) -> list[dict]:
    res = await session.execute(select(Role).order_by(Role.key))
    return [{"key": r.key, "label": r.label, "permissions": r.permissions} for r in res.scalars()]


@router.patch("/users/{user_id}")
async def update_user(
    user_id: uuid.UUID,
    req: UpdateUserRequest,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_permission("users:manage")),
) -> dict:
    u = await session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")

    new_active = u.is_active if req.is_active is None else req.is_active
    new_roles = u.role_keys if req.role_keys is None else req.role_keys
    was_admin = u.is_active and "admin" in (u.role_keys or [])
    will_admin = new_active and "admin" in (new_roles or [])
    if was_admin and not will_admin and not await _has_other_active_admin(session, u.id):
        raise HTTPException(status_code=400, detail="لا يمكن إزالة آخر مسؤول نشط")
    if u.username == admin.username and req.is_active is False:
        raise HTTPException(status_code=400, detail="لا يمكنك تعطيل نفسك")

    if req.role_keys is not None:
        u.role_keys = req.role_keys
    if req.is_active is not None:
        u.is_active = req.is_active
    if req.full_name is not None:
        u.full_name = req.full_name
    if req.email is not None:
        u.email = req.email
    if req.password:
        u.password_hash = hash_password(req.password)
    await session.commit()
    await session.refresh(u)
    return _user_out(u)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    admin: User = Depends(require_permission("users:manage")),
) -> dict:
    u = await session.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="المستخدم غير موجود")
    if u.username == admin.username:
        raise HTTPException(status_code=400, detail="لا يمكنك حذف نفسك")
    if u.is_active and "admin" in (u.role_keys or []) and not await _has_other_active_admin(session, u.id):
        raise HTTPException(status_code=400, detail="لا يمكن حذف آخر مسؤول نشط")
    await session.delete(u)
    await session.commit()
    return {"deleted": str(user_id)}
