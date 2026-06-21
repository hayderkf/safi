"""نقاط API لتوليد الاستمارات."""
from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..forms.generate import generate_form

router = APIRouter(prefix="/forms", tags=["forms"])


class GenerateRequest(BaseModel):
    prompt: str = Field(..., description="وصف الاستمارة بالعربية")
    lang: str = "ar"


@router.post("/generate")
async def generate(req: GenerateRequest) -> dict:
    """وصف عربي → مخطط استمارة (IR) متحقَّق منه."""
    return await generate_form(req.prompt, req.lang)
