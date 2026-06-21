"""نقاط API لتوليد الاستمارات."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..auth.deps import require_permission
from ..db.models import User
from ..forms.generate import generate_form

router = APIRouter(prefix="/forms", tags=["forms"])


class GenerateRequest(BaseModel):
    prompt: str = Field(..., description="وصف الاستمارة بالعربية")
    lang: str = "ar"


@router.post("/generate")
async def generate(
    req: GenerateRequest,
    _user: User = Depends(require_permission("forms:generate")),
) -> dict:
    """وصف عربي → مخطط استمارة (IR) متحقَّق منه."""
    return await generate_form(req.prompt, req.lang)
