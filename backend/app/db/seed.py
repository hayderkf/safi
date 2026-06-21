"""بذور البيانات الساندة (تطوير): قوائم حقيقية مع إسناد.

idempotent: لا يُدرج قائمة موجودة مسبقاً. يُستدعى عند الإقلاع بعد init_db.
البيانات: محافظات العراق (18) + أقضية مختارة (تتالٍ هرمي عبر parent_value_key).
المصدر مُعلَّم على كل عنصر (نسيج الثقة). الاستيراد الكامل من GADM لاحقاً.
"""
from __future__ import annotations

from sqlalchemy import select

from .models import LookupItem, LookupList
from .session import SessionLocal

_SRC = "seed:manual"

# المحافظات (value_key لاتيني ثابت، العرض عربي/إنجليزي)
GOVERNORATES = [
    ("baghdad", "بغداد", "Baghdad"),
    ("basra", "البصرة", "Basra"),
    ("nineveh", "نينوى", "Nineveh"),
    ("dhiqar", "ذي قار", "Dhi Qar"),
    ("anbar", "الأنبار", "Anbar"),
    ("diyala", "ديالى", "Diyala"),
    ("babil", "بابل", "Babil"),
    ("karbala", "كربلاء", "Karbala"),
    ("najaf", "النجف", "Najaf"),
    ("wasit", "واسط", "Wasit"),
    ("maysan", "ميسان", "Maysan"),
    ("muthanna", "المثنى", "Muthanna"),
    ("qadisiyyah", "القادسية", "Qadisiyyah"),
    ("saladin", "صلاح الدين", "Saladin"),
    ("kirkuk", "كركوك", "Kirkuk"),
    ("erbil", "أربيل", "Erbil"),
    ("dohuk", "دهوك", "Dohuk"),
    ("sulaymaniyah", "السليمانية", "Sulaymaniyah"),
]

# أقضية مختارة (parent = value_key المحافظة) — عيّنة للتتالي
DISTRICTS = [
    ("baghdad", "karkh", "الكرخ", "Karkh"),
    ("baghdad", "rusafa", "الرصافة", "Rusafa"),
    ("baghdad", "adhamiyah", "الأعظمية", "Adhamiyah"),
    ("baghdad", "sadr_city", "مدينة الصدر", "Sadr City"),
    ("baghdad", "abu_ghraib", "أبو غريب", "Abu Ghraib"),
    ("basra", "basra_center", "مركز البصرة", "Basra Center"),
    ("basra", "zubair", "الزبير", "Zubair"),
    ("basra", "abu_alkhaseeb", "أبو الخصيب", "Abu Al-Khaseeb"),
    ("basra", "qurna", "القرنة", "Qurna"),
    ("basra", "faw", "الفاو", "Faw"),
    ("erbil", "erbil_center", "مركز أربيل", "Erbil Center"),
    ("erbil", "shaqlawa", "شقلاوة", "Shaqlawa"),
    ("erbil", "soran", "سوران", "Soran"),
    ("erbil", "koya", "كويسنجق", "Koya"),
    ("erbil", "makhmur", "مخمور", "Makhmur"),
]


async def seed_lookups() -> None:
    async with SessionLocal() as session:
        existing = set(
            (await session.execute(select(LookupList.key))).scalars().all()
        )

        if "iraq_governorates" not in existing:
            session.add(
                LookupList(
                    key="iraq_governorates",
                    label={"ar": "محافظات العراق", "en": "Iraq Governorates"},
                    description="القائمة الرسمية لمحافظات العراق الثماني عشرة.",
                )
            )
            for i, (vk, ar, en) in enumerate(GOVERNORATES):
                session.add(
                    LookupItem(
                        list_key="iraq_governorates",
                        value_key=vk,
                        label={"ar": ar, "en": en},
                        sort_order=i,
                        source=_SRC,
                        confidence=1.0,
                    )
                )

        if "iraq_districts" not in existing:
            session.add(
                LookupList(
                    key="iraq_districts",
                    label={"ar": "أقضية العراق", "en": "Iraq Districts"},
                    description="أقضية مختارة (عيّنة) مرتبطة بالمحافظات للتتالي.",
                )
            )
            for i, (parent, vk, ar, en) in enumerate(DISTRICTS):
                session.add(
                    LookupItem(
                        list_key="iraq_districts",
                        value_key=vk,
                        label={"ar": ar, "en": en},
                        parent_value_key=parent,
                        sort_order=i,
                        source=_SRC,
                        confidence=1.0,
                    )
                )

        await session.commit()
