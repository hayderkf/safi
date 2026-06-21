"""مسارات المصادقة: تسجيل (للمسؤول) + دخول (JWT) + المستخدم الحالي."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import get_current_user, permissions_of, require_permission
from ..auth.security import create_token, hash_password, verify_password
from ..db.models import User
from ..db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    username: str
    password: str = Field(min_length=4)
    email: str = ""
    full_name: str = ""
    role_keys: list[str] = Field(default_factory=lambda: ["viewer"])


class LoginRequest(BaseModel):
    username: str
    password: str


def _user_out(u: User, perms: set[str] | None = None) -> dict:
    out = {
        "id": str(u.id),
        "username": u.username,
        "email": u.email,
        "full_name": u.full_name,
        "role_keys": u.role_keys,
        "is_active": u.is_active,
    }
    if perms is not None:
        out["permissions"] = sorted(perms)
    return out


@router.post("/register")
async def register(
    req: RegisterRequest,
    session: AsyncSession = Depends(get_session),
    _admin: User = Depends(require_permission("users:manage")),
) -> dict:
    exists = (await session.execute(select(User).where(User.username == req.username))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="اسم المستخدم مستخدم")
    user = User(
        username=req.username,
        email=req.email,
        full_name=req.full_name,
        password_hash=hash_password(req.password),
        role_keys=req.role_keys,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return _user_out(user)


@router.post("/login")
async def login(req: LoginRequest, session: AsyncSession = Depends(get_session)) -> dict:
    user = (await session.execute(select(User).where(User.username == req.username))).scalar_one_or_none()
    if not user or not user.is_active or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    token = create_token(user.username, user.role_keys or [])
    perms = await permissions_of(user, session)
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user, perms)}


@router.get("/me")
async def me(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    perms = await permissions_of(user, session)
    return _user_out(user, perms)
