"""البيانات الساندة (القوائم) — إنشاء/تعبئة/استرجاع، مع الإسناد (مصدر/ثقة/إصدار).

العقد: حقل الاختيار يحمل dataSourceKey؛ الواجهة تجلب خياراته من /lookups/{key}.
للتتالي الهرمي: تمرّر ?parent=<قيمة الأب> فتُرشَّح العناصر بـ parent_value_key.
"""
from __future__ import annotations

import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth.deps import require_permission
from ..db.models import LookupItem, LookupList, User
from ..db.session import get_session
from ..forms.lookup_excel import parse_lookup_excel
from ..forms.lookup_gen import generate_lookup_items

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


class GenerateLookupRequest(BaseModel):
    description: str
    hierarchical: bool = False


class UpdateItemRequest(BaseModel):
    label: dict[str, str] | None = None
    parent_value_key: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


def _item_dict(i: LookupItem) -> dict:
    return {
        "value_key": i.value_key,
        "label": i.label,
        "parent_value_key": i.parent_value_key,
        "source": i.source,
        "confidence": i.confidence,
        "version": i.version,
        "reviewed_by": i.reviewed_by,
        "reviewed_at": i.reviewed_at.isoformat() if i.reviewed_at else None,
    }


# ---------- القوائم ----------
@router.post("")
async def create_list(
    req: CreateListRequest,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_permission("lookups:write")),
) -> dict:
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


@router.post("/generate")
async def generate_lookup(
    req: GenerateLookupRequest,
    _user: User = Depends(require_permission("lookups:write")),
) -> dict:
    """يقترح عناصر قائمة ساندة بالذكاء (لا يحفظ) — يراجعها المسؤول ويعتمدها."""
    return await generate_lookup_items(req.description, req.hierarchical)


@router.post("/import-excel")
async def import_excel(
    file: UploadFile = File(...),
    _user: User = Depends(require_permission("lookups:write")),
) -> dict:
    """يقرأ ملف .xlsx ويقترح عناصر قائمة (لا يحفظ) — تُراجَع بشرياً ثم تُعتمد."""
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="الملف فارغ")
    try:
        return parse_lookup_excel(data, filename=file.filename or "")
    except Exception as e:  # noqa: BLE001 — نُغلّف أي خطأ قراءة كرسالة واضحة
        raise HTTPException(status_code=400, detail=f"تعذّر قراءة الملف: {e}")


@router.get("")
async def list_lists(session: AsyncSession = Depends(get_session)) -> list[dict]:
    counts = dict(
        (
            await session.execute(
                select(LookupItem.list_key, func.count())
                .where(LookupItem.is_active.is_(True))
                .group_by(LookupItem.list_key)
            )
        ).all()
    )
    res = await session.execute(
        select(LookupList).where(LookupList.is_active.is_(True)).order_by(LookupList.key)
    )
    return [
        {"key": l.key, "kind": l.kind, "label": l.label, "description": l.description,
         "item_count": counts.get(l.key, 0)}
        for l in res.scalars()
    ]


@router.get("/{key}")
async def get_list(
    key: str, parent: str | None = None, session: AsyncSession = Depends(get_session)
) -> dict:
    lst = (
        await session.execute(
            select(LookupList).where(LookupList.key == key, LookupList.is_active.is_(True))
        )
    ).scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="القائمة الساندة غير موجودة")
    stmt = select(LookupItem).where(LookupItem.list_key == key, LookupItem.is_active.is_(True))
    if parent is not None:
        stmt = stmt.where(LookupItem.parent_value_key == parent)
    stmt = stmt.order_by(LookupItem.sort_order, LookupItem.value_key)
    items = (await session.execute(stmt)).scalars().all()
    return {"key": key, "label": lst.label, "items": [_item_dict(i) for i in items]}


@router.delete("/{key}")
async def delete_list(
    key: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_permission("lookups:write")),
) -> dict:
    """حذف ناعم: تعطيل القائمة وعناصرها (لا نُيتّم إجابات تخزّن value_key)."""
    lst = (await session.execute(select(LookupList).where(LookupList.key == key))).scalar_one_or_none()
    if not lst:
        raise HTTPException(status_code=404, detail="القائمة الساندة غير موجودة")
    lst.is_active = False
    await session.execute(
        update(LookupItem).where(LookupItem.list_key == key).values(is_active=False)
    )
    await session.commit()
    return {"deactivated": key}


@router.post("/{key}/items")
async def add_items(
    key: str,
    req: AddItemsRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("lookups:write")),
) -> dict:
    """إضافة/تحديث عناصر (upsert على (list_key, value_key)) مع ختم المراجعة البشرية."""
    if not (await session.execute(select(LookupList).where(LookupList.key == key))).scalar_one_or_none():
        raise HTTPException(status_code=404, detail="القائمة الساندة غير موجودة")
    now = datetime.datetime.now(datetime.timezone.utc)
    added = updated = 0
    for it in req.items:
        existing = (
            await session.execute(
                select(LookupItem).where(LookupItem.list_key == key, LookupItem.value_key == it.value_key)
            )
        ).scalar_one_or_none()
        if existing:  # تحديث + إعادة تفعيل (تفادي خرق قيد التفرّد)
            existing.label = it.label or existing.label
            existing.parent_value_key = it.parent_value_key
            existing.sort_order = it.sort_order
            existing.source = it.source or existing.source
            existing.confidence = it.confidence
            existing.is_active = True
            existing.reviewed_by = user.username
            existing.reviewed_at = now
            updated += 1
        else:
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
                    reviewed_by=user.username,
                    reviewed_at=now,
                )
            )
            added += 1
    await session.commit()
    return {"key": key, "added": added, "updated": updated}


async def _get_item(session: AsyncSession, key: str, value_key: str) -> LookupItem:
    item = (
        await session.execute(
            select(LookupItem).where(LookupItem.list_key == key, LookupItem.value_key == value_key)
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="العنصر غير موجود")
    return item


@router.patch("/{key}/items/{value_key}")
async def update_item(
    key: str,
    value_key: str,
    req: UpdateItemRequest,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_permission("lookups:write")),
) -> dict:
    """تعديل عنصر واحد (عرض/أب/ترتيب/تفعيل) مع ختم المراجعة."""
    item = await _get_item(session, key, value_key)
    if req.label is not None:
        item.label = req.label
    if req.parent_value_key is not None:
        item.parent_value_key = req.parent_value_key or None
    if req.sort_order is not None:
        item.sort_order = req.sort_order
    if req.is_active is not None:
        item.is_active = req.is_active
    item.reviewed_by = user.username
    item.reviewed_at = datetime.datetime.now(datetime.timezone.utc)
    await session.commit()
    return {"updated": value_key}


@router.delete("/{key}/items/{value_key}")
async def delete_item(
    key: str,
    value_key: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(require_permission("lookups:write")),
) -> dict:
    """حذف ناعم لعنصر واحد (لا يُيتّم الإجابات التي تخزّن value_key)."""
    item = await _get_item(session, key, value_key)
    item.is_active = False
    await session.commit()
    return {"deactivated": value_key}
