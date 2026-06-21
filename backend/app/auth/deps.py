"""تبعيات الحماية: المستخدم الحالي من الرمز + التحقّق من الصلاحيات (RBAC)."""
from __future__ import annotations

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import Role, User
from ..db.session import get_session
from .security import TokenError, decode_token

bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    try:
        payload = decode_token(creds.credentials)
    except TokenError as e:
        raise HTTPException(status_code=401, detail=str(e))
    user = (
        await session.execute(select(User).where(User.username == payload.get("sub")))
    ).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="مستخدم غير صالح أو معطّل")
    return user


async def permissions_of(user: User, session: AsyncSession) -> set[str]:
    if not user.role_keys:
        return set()
    roles = (
        await session.execute(select(Role).where(Role.key.in_(user.role_keys)))
    ).scalars().all()
    perms: set[str] = set()
    for r in roles:
        perms.update(r.permissions or [])
    return perms


def require_permission(perm: str):
    """مولّد تبعية: يسمح إن كان للمستخدم الصلاحية أو الصلاحية الشاملة (*)."""
    async def dep(
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        perms = await permissions_of(user, session)
        if "*" not in perms and perm not in perms:
            raise HTTPException(status_code=403, detail=f"صلاحية ناقصة: {perm}")
        return user

    return dep
