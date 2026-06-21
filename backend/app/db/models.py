"""نماذج قاعدة البيانات — تخزين هجين: تعريف الاستمارة (IR) والإجابات كـ JSONB.

العلاقات منطقية (form_id مفهرس) دون قيود FK صارمة (استراتيجية النظام)؛ تُضاف قيود انتقائياً عند الحاجة.
"""
from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Form(Base):
    __tablename__ = "forms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="draft")   # draft | published
    version: Mapped[int] = mapped_column(Integer, default=1)
    ir: Mapped[list] = mapped_column(JSONB, default=list)          # مخطط الاستمارة (مصفوفة الحقول)
    source_prompt: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Submission(Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    form_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)  # علاقة منطقية
    data: Mapped[dict] = mapped_column(JSONB, default=dict)        # الإجابات (وثيقة هجينة)
    status: Mapped[str] = mapped_column(String, default="submitted")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
