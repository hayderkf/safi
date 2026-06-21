"""توليد عناصر البيانات الساندة بالذكاء — يقترح فقط (لا يحفظ)؛ الإنسان يراجع ويعتمد.

يخرج العناصر بالبنية التي يحتاجها النظام (value_key + label{ar,en} + parent_value_key)
مع إسناد المصدر (ai:<model>) ودرجة ثقة مبدئية، تحقيقاً لمبدأ «الإسناد + إنسان في الحلقة».
"""
from __future__ import annotations

import json
import time

from pydantic import ValidationError

from ..ai.prompts import LOOKUP_GENERATION_SYSTEM, repair_instruction
from ..ai.provider import get_provider
from ..config import settings
from .generate import _extract_json_array

_AI_CONFIDENCE = 0.7  # ثقة مبدئية للمولَّد آلياً (أدنى من اليدوي الموثوق) — يضبطها الإنسان عند الاعتماد


def _normalize_items(arr) -> list[dict]:
    if not isinstance(arr, list) or not arr:
        raise ValueError("الجذر ليس مصفوفة أو فارغ")
    src = f"ai:{settings.llm_model}"
    out: list[dict] = []
    for it in arr:
        if not isinstance(it, dict):
            continue
        vk = it.get("value_key") or it.get("valueKey")
        if not vk:
            continue
        label = it.get("label") or it.get("labelTranslations") or {}
        if isinstance(label, str):
            label = {"ar": label}
        item = {
            "value_key": str(vk),
            "label": {"ar": label.get("ar", ""), "en": label.get("en", "")},
            "source": src,
            "confidence": _AI_CONFIDENCE,
        }
        pvk = it.get("parent_value_key") or it.get("parentValueKey")
        if pvk:
            item["parent_value_key"] = str(pvk)
        out.append(item)
    if not out:
        raise ValueError("لا عناصر صالحة في الردّ")
    return out


async def generate_lookup_items(description: str, hierarchical: bool = False) -> dict:
    """وصف → عناصر قائمة ساندة مقترَحة (غير محفوظة)، مع حلقة إصلاح."""
    provider = get_provider()
    t0 = time.time()
    hint = "\nالقائمة هرمية/متتالية: أضِف parent_value_key لكل عنصر ابن." if hierarchical else ""
    user_prompt = f"{description}{hint}"
    last_error = ""

    for attempt in range(1, settings.max_repairs + 2):
        raw = await provider.generate(LOOKUP_GENERATION_SYSTEM, user_prompt, temperature=0.2)
        try:
            items = _normalize_items(_extract_json_array(raw))
            return {
                "ok": True,
                "items": items,
                "meta": {
                    "model": settings.llm_model,
                    "provider": provider.name,
                    "attempts": attempt,
                    "item_count": len(items),
                    "duration_ms": int((time.time() - t0) * 1000),
                },
            }
        except (ValidationError, ValueError, json.JSONDecodeError) as e:
            last_error = str(e)[:500]
            user_prompt = f"{description}{hint}\n\n{repair_instruction(last_error)}"

    return {
        "ok": False,
        "items": [],
        "meta": {"model": settings.llm_model, "error": last_error, "duration_ms": int((time.time() - t0) * 1000)},
    }
