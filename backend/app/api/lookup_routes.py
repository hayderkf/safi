"""البيانات الساندة (القوائم) — إنشاء/تعبئة/استرجاع، مع الإسناد (مصدر/ثقة/إصدار).

العقد: حقل الاختيار يحمل dataSourceKey؛ الواجهة تجلب خياراته من /lookups/{key}.
للتتالي الهرمي: تمرّر ?parent=<قيمة الأب> فتُرشَّح العناصر بـ parent_value_key.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import LookupItem, LookupList
from ..db.session import get_session

router = APIRouter(prefix="/lookups", tags=["lookups"])


# ---------- النماذج ----------
class CreateListRequest(BaseModel):
    key: str
    label: dict[str, str] = Field(default_factory=dict)
    description: str = ""


class ItemIn(BaseModel):
    value_key: str
    label: dict[str, str] = Field(default_factory=dict)
    parent_value_key: str | None = None
    sort_order: int = 0
    source: str = ""
    confidence: float = 1.0
    version: int = 1


class AddItemsRequest(BaseModel):
    items: list[ItemIn] = Field(default_factory=list)


def _item_dict(i: LookupItem) -> dict:
    return {
        "value_key": i.value_key,
        "label": i.label,
        "parent_value_key": i.parent_value_key,
        "source": i.source,
        "confidence": i.confidence,
        "version": i.version,
    }


# ---------- القوائم ----------
@router.post("")
async def create_list(req: CreateListRequest, session: AsyncSession = Depends(get_session)) -> dict:
    existing = (
        await session.execute(select(LookupList).where(LookupList.key == req.key))
    ).scalar_one_or_none()
    if existing:
        # idempotent: نحدّث البيانات الوصفية بدل الرفض
        existing.label = req.label or existing.label
        existing.description = req.description or existing.description
        await session.commit()
        return {"key": existing.key, "created": False}
    lst = LookupList(key=req.key, label=req.label, description=req.description)
    session.add(lst)
    await session.commit()
    return {"key": lst.key, "created": True}


@router.get("")
async def list_lists(session: AsyncSession = Depends(get_session)) -> list[dict]:
    counts = dict(
        (
            await session.execute(
                select(LookupItem.list_key, func.count()).group_by(LookupItem.list_key)
            )
        ).all()
    )
    res = await session.execute(select(LookupList).order_by(LookupList.key))
    return [
        {"key": l.key, "label": l.label, "description": l.description, "item_count": counts.get(l.key, 0)}
        for l in res.scalars()
    ]


@router.get("/{key}")
async def get_list(
    key: str, parent: str | None = None, session: AsyncSession = Depends(get_session)
) -> dict:
    lst = (await session.execute(select(LookupList).where(LookupList.key == key))).scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="القائمة الساندة غير موجودة")
    stmt = select(LookupItem).where(LookupItem.list_key == key)
    if parent is not None:
        stmt = stmt.where(LookupItem.parent_value_key == parent)
    stmt = stmt.order_by(LookupItem.sort_order, LookupItem.value_key)
    items = (await session.execute(stmt)).scalars().all()
    return {"key": key, "label": lst.label, "items": [_item_dict(i) for i in items]}


@router.post("/{key}/items")
async def add_items(
    key: str, req: AddItemsRequest, session: AsyncSession = Depends(get_session)
) -> dict:
    if not (await session.execute(select(LookupList).where(LookupList.key == key))).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="القائمة الساندة غير موجودة")
    for it in req.items:
        session.add(
            LookupItem(
                list_key=key,
                value_key=it.value_key,
                label=it.label,
                parent_value_key=it.parent_value_key,
                sort_order=it.sort_order,
                source=it.source,
                confidence=it.confidence,
                version=it.version,
            )
        )
    await session.commit()
    return {"key": key, "added": len(req.items)}
