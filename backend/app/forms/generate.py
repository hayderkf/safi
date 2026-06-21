"""خدمة توليد الاستمارات: تستدعي المزوّد، تستخرج JSON، تتحقّق من المخطط، وتعيد المحاولة عند الفشل."""
from __future__ import annotations

import json
import re
import time

from pydantic import ValidationError

from ..ai.prompts import FORM_GENERATION_SYSTEM, repair_instruction
from ..ai.provider import get_provider
from ..config import settings
from .ir import FormField, quality_warnings


def _extract_json_array(text: str):
    """يستخرج مصفوفة JSON من ردّ النموذج (يزيل code fences ويلتقط [ ... ])."""
    t = text.strip().replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(t)
    except Exception:
        m = re.search(r"\[.*\]", t, re.S)
        if m:
            return json.loads(m.group(0))  # قد يرفع استثناءً يلتقطه المستدعي
        raise ValueError("لم يُعثر على مصفوفة JSON في الردّ")


def _validate(raw) -> list[FormField]:
    if not isinstance(raw, list):
        raise ValueError("الجذر ليس مصفوفة")
    if not raw:
        raise ValueError("المصفوفة فارغة")
    return [FormField.model_validate(item) for item in raw]


async def generate_form(prompt: str, lang: str = "ar") -> dict:
    """يولّد مخطط استمارة من وصف نصّي، مع حلقة إصلاح عند فشل المخطط."""
    provider = get_provider()
    user_prompt = prompt
    last_error = ""
    t0 = time.time()

    for attempt in range(1, settings.max_repairs + 2):  # محاولة أولى + إصلاحات
        raw_text = await provider.generate(FORM_GENERATION_SYSTEM, user_prompt)
        try:
            parsed = _extract_json_array(raw_text)
            fields = _validate(parsed)
            return {
                "ok": True,
                "fields": [f.model_dump(exclude_none=True) for f in fields],
                "meta": {
                    "model": settings.llm_model,
                    "provider": provider.name,
                    "attempts": attempt,
                    "field_count": len(fields),
                    "warnings": quality_warnings(fields),
                    "duration_ms": int((time.time() - t0) * 1000),
                },
            }
        except (ValidationError, ValueError, json.JSONDecodeError) as e:
            last_error = str(e)[:500]
            # أضف تعليمة الإصلاح للمحاولة التالية
            user_prompt = f"{prompt}\n\n{repair_instruction(last_error)}"

    return {
        "ok": False,
        "fields": [],
        "meta": {
            "model": settings.llm_model,
            "provider": provider.name,
            "attempts": settings.max_repairs + 1,
            "error": last_error,
            "duration_ms": int((time.time() - t0) * 1000),
        },
    }
