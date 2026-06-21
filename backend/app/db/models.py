"""نماذج قاعدة البيانات — تخزين هجين: تعريف الاستمارة (IR) والإجابات كـ JSONB.

العلاقات منطقية (form_id مفهرس) دون قيود FK صارمة (استراتيجية النظام)؛ تُضاف قيود انتقائياً عند الحاجة.
"""
from __future__ import annotations

import datetime
import uuid

from sqlalchemy import Boolean, DateTime, Float, Integer, String, UniqueConstraint, func
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


# ---------- البيانات الساندة (القوائم) + الإسناد ----------
# يجسّد مبدأ «الإسناد قبل كل شيء»: النظام يربط القيم من قائمة موثوقة بدل أن يهلوسها النموذج.
class LookupList(Base):
    __tablename__ = "lookup_lists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String, unique=True, index=True)   # المفتاح المرجعي (dataSourceKey)
    kind: Mapped[str] = mapped_column(String, default="list")           # بذرة DR-4: نوع المورد المعرفي
    label: Mapped[dict] = mapped_column(JSONB, default=dict)            # ترجمات الاسم {ar,en}
    description: Mapped[str] = mapped_column(String, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)      # حذف ناعم (لا نُيتّم إجابات تاريخية)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class LookupItem(Base):
    __tablename__ = "lookup_items"
    # تفرّد القيمة داخل القائمة (يمنع الازدواج الذي يُفسد الربط)
    __table_args__ = (UniqueConstraint("list_key", "value_key", name="uq_lookup_item_list_value"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_key: Mapped[str] = mapped_column(String, index=True)           # علاقة منطقية بـ lookup_lists.key
    value_key: Mapped[str] = mapped_column(String)                      # القيمة المخزّنة في الإجابة
    label: Mapped[dict] = mapped_column(JSONB, default=dict)            # ترجمات العرض {ar,en}
    parent_value_key: Mapped[str | None] = mapped_column(String, index=True, nullable=True)  # للتتالي الهرمي
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)      # حذف ناعم (الإجابات تخزّن value_key)
    # ---- الإسناد (نسيج الثقة) ----
    source: Mapped[str] = mapped_column(String, default="")             # مصدر القيمة (seed/admin/ai/excel)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)       # موثوقية المصدر
    version: Mapped[int] = mapped_column(Integer, default=1)            # إصدار البيان
    # ---- الحوكمة (إنسان في الحلقة) ----
    reviewed_by: Mapped[str | None] = mapped_column(String, nullable=True)   # من اعتمده بشرياً
    reviewed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ---------- الهوية والصلاحيات (RBAC) ----------
class Role(Base):
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String, unique=True, index=True)   # admin | reviewer | data_entry | viewer
    label: Mapped[dict] = mapped_column(JSONB, default=dict)            # ترجمات الاسم {ar,en}
    permissions: Mapped[list] = mapped_column(JSONB, default=list)      # قائمة صلاحيات؛ "*" = الكل
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[str] = mapped_column(String, default="")
    full_name: Mapped[str] = mapped_column(String, default="")
    password_hash: Mapped[str] = mapped_column(String, default="")      # pbkdf2_sha256$... (لا كلمة مرور خام)
    role_keys: Mapped[list] = mapped_column(JSONB, default=list)        # أدوار المستخدم (علاقة منطقية بـ roles.key)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
