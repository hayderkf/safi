"""طبقة تجريد المزوّد للذكاء — واجهة موحّدة تعزل منطق الأعمال عن أي مزوّد بعينه.

التبديل بين Ollama / نموذج حيّ / غيره يكون هنا فقط (DR-2). لا تنادِ Ollama مباشرةً
من منطق الأعمال؛ استعمل get_provider().
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import httpx

from ..config import settings


class LLMProvider(ABC):
    """واجهة موحّدة لأي نموذج لغوي."""

    name: str = "base"

    @abstractmethod
    async def generate(self, system: str, prompt: str, temperature: float | None = None) -> str:
        """يعيد نصّ الردّ الخام."""
        raise NotImplementedError


class OllamaProvider(LLMProvider):
    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout: int = 300):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    async def generate(self, system: str, prompt: str, temperature: float | None = None) -> str:
        payload = {
            "model": self.model,
            "system": system,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": settings.llm_temperature if temperature is None else temperature},
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            r = await client.post(f"{self.base_url}/api/generate", json=payload)
            r.raise_for_status()
            return r.json().get("response", "")


def get_provider() -> LLMProvider:
    """مصنع المزوّد حسب الإعدادات."""
    if settings.llm_provider == "ollama":
        return OllamaProvider(settings.ollama_base_url, settings.llm_model, settings.llm_timeout)
    raise ValueError(f"مزوّد غير مدعوم: {settings.llm_provider}")
