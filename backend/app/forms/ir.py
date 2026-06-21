"""نماذج مخطط الاستمارة الموحّد (Form IR) — مصدر الحقيقة للتحقّق. انظر docs/IR_SCHEMA.md

extra="allow" مقصود: نتسامح مع مفاتيح إضافية من النموذج بدل رفضها، ونتحقّق من البنية الجوهرية.
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class FieldType(str, Enum):
    text = "textField"
    integer = "integerField"
    double = "doubleField"
    number = "numberField"
    date = "dateField"
    datetime = "datetimeField"
    time = "timeField"
    file = "fileField"
    image = "imageField"
    audio = "audioField"
    video = "videoField"
    map = "mapField"
    note = "noteField"
    signature = "signatureField"
    qrcode = "qrcodeField"
    range = "rangeField"
    rate = "rateField"
    ranking = "rankingField"
    dropdown = "dropdownField"
    radio = "radioField"
    checkbox = "checkboxField"
    group = "groupField"
    table = "tableField"
    matrix = "matrixField"


CHOICE_TYPES = {FieldType.dropdown, FieldType.radio, FieldType.checkbox}


class Option(BaseModel):
    model_config = ConfigDict(extra="allow")
    valueKey: str
    valueTranslations: dict[str, str] = Field(default_factory=dict)


class Rule(BaseModel):
    model_config = ConfigDict(extra="allow")
    sourceFieldId: str
    operator: str = "=="
    triggerValue: Any = None


class RuleGroup(BaseModel):
    model_config = ConfigDict(extra="allow")
    mode: str = "all"  # all = AND ، any = OR
    rules: list[Rule] = Field(default_factory=list)


class Column(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    type: str = "textField"
    labelTranslations: dict[str, str] = Field(default_factory=dict)


class MatrixRow(BaseModel):
    model_config = ConfigDict(extra="allow")
    key: str
    labelTranslations: dict[str, str] = Field(default_factory=dict)


class FormField(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    type: FieldType
    labelTranslations: dict[str, str] = Field(default_factory=dict)
    isRequired: bool = False

    # اختيار
    options: Optional[list[Option]] = None
    dataSourceKey: Optional[str] = None  # إسناد لقائمة ساندة

    # حاويات / تداخل
    subFields: Optional[list["FormField"]] = None
    layout: Optional[str] = None          # "step" لصفحة معالج
    isRepeating: Optional[bool] = None     # قسم متكرّر

    # جدول / مصفوفة
    columns: Optional[list[Column]] = None
    matrixRows: Optional[list[MatrixRow]] = None
    matrixMode: Optional[str] = None

    # منطق شرطي
    visibilityWhen: Optional[RuleGroup] = None
    requiredWhen: Optional[RuleGroup] = None
    enabledWhen: Optional[RuleGroup] = None


FormField.model_rebuild()


# ---- فحوص جودة ناعمة (لا تُفشل التحقّق، تُرفَق كتحذيرات) ----

def quality_warnings(fields: list[FormField]) -> list[str]:
    warns: list[str] = []

    def walk(items: list[FormField], path: str = "") -> None:
        for f in items:
            where = f"{path}{f.id}"
            if "ar" not in (f.labelTranslations or {}):
                warns.append(f"حقل بلا عنوان عربي: {where}")
            if f.type in CHOICE_TYPES and not f.options and not f.dataSourceKey:
                warns.append(f"حقل اختيار بلا options ولا dataSourceKey: {where}")
            if f.type is FieldType.table and not f.columns:
                warns.append(f"جدول بلا columns: {where}")
            if f.type is FieldType.matrix and not f.matrixRows:
                warns.append(f"مصفوفة بلا matrixRows: {where}")
            if f.subFields:
                walk(f.subFields, where + "/")

    walk(fields)
    return warns
