"""كشف تشابه القوائم الساندة — يمنع تكرار قوائم متطابقة/متقاربة (DR-4: مصدر موحّد).

تشابه لغوي (الاسم العربي + المفتاح) + تداخل المحتوى (عناصر) — بلا تبعيات
(difflib + تطبيع عربي). لاحقاً يمكن تعزيزه بتشابه دلالي عبر embeddings (BGE/pgvector).
"""
from __future__ import annotations

import re
from collections import defaultdict
from difflib import SequenceMatcher

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.models import LookupItem, LookupList

WARN = 0.5   # عتبة التنبيه بالتقارب
BLOCK = 0.8  # عتبة المنع (تطابق/تشابه عالٍ)

_TASHKEEL = re.compile(r"[ً-ْٰـ]")  # حركات + تطويل
_REPL = (("أ", "ا"), ("إ", "ا"), ("آ", "ا"), ("ٱ", "ا"), ("ة", "ه"), ("ى", "ي"), ("ؤ", "و"), ("ئ", "ي"), ("ء", ""))


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = _TASHKEEL.sub("", s)
    for a, b in _REPL:
        s = s.replace(a, b)
    s = re.sub(r"[^0-9a-zء-ي\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a, b).ratio() if a and b else 0.0


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


def _overlap(a: set[str], b: set[str]) -> float:
    # معامل التداخل: كم من الأصغر مُحتوىً في الأكبر (يكشف المجموعات الفرعية المكرّرة)
    return len(a & b) / min(len(a), len(b)) if a and b else 0.0


def name_similarity(k1: str, l1: str, k2: str, l2: str) -> float:
    nl1, nl2 = _norm(l1), _norm(l2)
    label = max(_ratio(nl1, nl2), _jaccard(set(nl1.split()), set(nl2.split())))
    key = _ratio((k1 or "").lower(), (k2 or "").lower())
    return max(label, key)


async def find_similar_lists(
    session: AsyncSession, key: str, label_ar: str, item_labels: list[str] | None = None
) -> tuple[list[dict], bool]:
    """يعيد (المتطابقات فوق عتبة التنبيه، هل يجب المنع)."""
    lists = (
        await session.execute(select(LookupList).where(LookupList.is_active.is_(True)))
    ).scalars().all()

    by_list: dict[str, set[str]] = defaultdict(set)
    new_items = {_norm(x) for x in (item_labels or []) if x}
    if new_items:  # عناصر كل القوائم النشطة دفعة واحدة (للتداخل)
        rows = (
            await session.execute(
                select(LookupItem.list_key, LookupItem.label).where(LookupItem.is_active.is_(True))
            )
        ).all()
        for lk, lbl in rows:
            by_list[lk].add(_norm((lbl or {}).get("ar", "")))

    matches: list[dict] = []
    block = False
    for lst in lists:
        if lst.key == key:
            continue  # نفس المفتاح = تحديث idempotent لا تكرار
        nscore = name_similarity(key, label_ar, lst.key, (lst.label or {}).get("ar", ""))
        others = by_list.get(lst.key, set())
        ovl = _overlap(new_items, others) if new_items else 0.0       # للتنبيه (مجموعة فرعية)
        jac = _jaccard(new_items, others) if new_items else 0.0        # للمنع (شبه تطابق)
        score = max(nscore, ovl)
        if score >= WARN:
            matches.append({
                "key": lst.key,
                "label": lst.label,
                "score": round(score, 2),
                "name_score": round(nscore, 2),
                "overlap": round(ovl, 2),
            })
        if nscore >= BLOCK or jac >= BLOCK:  # المنع: اسم متطابق أو محتوى شبه متطابق
            block = True
    matches.sort(key=lambda m: m["score"], reverse=True)
    return matches, block
