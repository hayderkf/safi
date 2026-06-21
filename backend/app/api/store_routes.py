"""نقاط حفظ/استرجاع الاستمارات والإجابات (مدعومة بقاعدة البيانات)."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_permission
from ..db.models import Form, Submission, User
from ..db.session import get_session

router = APIRouter(prefix="/forms", tags=["forms-store"])


# ---------- الاستمارات ----------
class SaveFormRequest(BaseModel):
    title: str = ""
    ir: list = Field(default_factory=list, description="مخطط الاستمارة (مصفوفة الحقول)")
    source_prompt: str = ""


@router.post("")
async def save_form(
    req: SaveFormRequest,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_permission("forms:write")),
) -> dict:
    form = Form(title=req.title, ir=req.ir, source_prompt=req.source_prompt)
    session.add(form)
    await session.commit()
    await session.refresh(form)
    return {"id": str(form.id), "title": form.title, "status": form.status, "version": form.version}


@router.get("")
async def list_forms(session: AsyncSession = Depends(get_session)) -> list[dict]:
    res = await session.execute(select(Form).order_by(Form.created_at.desc()))
    return [
        {"id": str(f.id), "title": f.title, "status": f.status,
         "version": f.version, "field_count": len(f.ir or [])}
        for f in res.scalars()
    ]


@router.get("/{form_id}")
async def get_form(form_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> dict:
    f = await session.get(Form, form_id)
    if not f:
        raise HTTPException(status_code=404, detail="الاستمارة غير موجودة")
    return {"id": str(f.id), "title": f.title, "status": f.status, "version": f.version,
            "source_prompt": f.source_prompt, "ir": f.ir}


# ---------- الإجابات ----------
class SubmitRequest(BaseModel):
    data: dict = Field(default_factory=dict, description="قيم الحقول")


@router.post("/{form_id}/submissions")
async def submit(form_id: uuid.UUID, req: SubmitRequest,
                 session: AsyncSession = Depends(get_session),
                 _user: User = Depends(require_permission("submissions:write"))) -> dict:
    if not await session.get(Form, form_id):
        raise HTTPException(status_code=404, detail="الاستمارة غير موجودة")
    sub = Submission(form_id=form_id, data=req.data)
    session.add(sub)
    await session.commit()
    await session.refresh(sub)
    return {"id": str(sub.id), "form_id": str(form_id), "status": sub.status}


@router.get("/{form_id}/submissions")
async def list_submissions(form_id: uuid.UUID,
                           session: AsyncSession = Depends(get_session)) -> list[dict]:
    res = await session.execute(
        select(Submission).where(Submission.form_id == form_id).order_by(Submission.created_at.desc())
    )
    return [
        {"id": str(s.id), "status": s.status, "data": s.data, "created_at": s.created_at.isoformat()}
        for s in res.scalars()
    ]
