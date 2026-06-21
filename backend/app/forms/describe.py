"""خدمة عكس التوليد: مخطط استمارة (IR) → وصف لغوي طبيعي عبر النموذج.

تُغلق الحلقة مع التوليد: المرئي/المخطط → وصف يفهمه النموذج ويمكنه إعادة توليده.
"""
from __future__ import annotations

import json
import time

from ..ai.prompts import FORM_DESCRIPTION_SYSTEM
from ..ai.provider import get_provider
from ..config import settings


async def describe_form(ir: list, lang: str = "ar") -> dict:
    """يحوّل مصفوفة حقول IR إلى وصف عربي طبيعي."""
    provider = get_provider()
    t0 = time.time()
    ir_json = json.dumps(ir, ensure_ascii=False, indent=2)
    prompt = f"صف هذه الاستمارة وصفاً طبيعياً:\n{ir_json}"
    text = await provider.generate(FORM_DESCRIPTION_SYSTEM, prompt, temperature=0.3)
    return {
        "ok": bool(text.strip()),
        "description": text.strip(),
        "meta": {
            "model": settings.llm_model,
            "provider": provider.name,
            "field_count": len(ir) if isinstance(ir, list) else 0,
            "duration_ms": int((time.time() - t0) * 1000),
        },
    }
