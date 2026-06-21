"""محلّل ملفات Excel للبيانات الساندة — يقترح عناصر (لا يحفظ)؛ تُراجَع بشرياً ثم تُعتمد.

مستوحى من النظام القديم (importSupportiveListsFromExcelWeb) لكن مطابقاً لنموذج Safi:
قائمة واحدة لكل ملف (التتالي عبر عمود parent_value_key داخل العناصر).
عناوين الأعمدة مرنة (snake_case أو camelCase القديمة أو عربية)، أول صفّ = العناوين.
"""
from __future__ import annotations

import io
import re

from openpyxl import load_workbook

# مرادفات العناوين (تُطابَق بعد التنميط: حروف صغيرة، إزالة فراغات وشُرَط)
_ALIASES = {
    "value_key": ["valuekey", "value", "key", "code", "المفتاح", "القيمة"],
    "label_ar": ["labelar", "ar", "valuear", "arabic", "العربية", "الاسم", "الاسمعربي"],
    "label_en": ["labelen", "en", "valueen", "english", "الانجليزية"],
    "parent_value_key": ["parentvaluekey", "parent", "parentkey", "الأب", "الاب"],
    "list_key": ["listkey", "list", "مفتاحالقائمة"],
    "list_label": ["listlabel", "listtitle", "maintitle", "title", "اسمالقائمة", "عنوانالقائمة"],
}


def _norm(h: str) -> str:
    return re.sub(r"[\s_\-]+", "", str(h or "").strip().lower())


def _build_header_map(header_row) -> dict[str, int]:
    """يربط كل دور (value_key…) برقم العمود حسب المرادفات."""
    norm_to_idx = {}
    for i, cell in enumerate(header_row):
        norm_to_idx[_norm(cell)] = i
    out: dict[str, int] = {}
    for role, aliases in _ALIASES.items():
        candidates = [_norm(role)] + [_norm(a) for a in aliases]
        for c in candidates:
            if c in norm_to_idx:
                out[role] = norm_to_idx[c]
                break
    return out


def parse_lookup_excel(data: bytes, filename: str = "") -> dict:
    """يحوّل ملف .xlsx إلى عناصر مقترَحة لقائمة ساندة واحدة (غير محفوظة)."""
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    rows = ws.iter_rows(values_only=True)

    try:
        header = next(rows)
    except StopIteration:
        return {"ok": False, "items": [], "warnings": ["الملف فارغ"], "list_key": "", "list_label": {}}

    hmap = _build_header_map(header)
    if "value_key" not in hmap:
        return {
            "ok": False, "items": [], "list_key": "", "list_label": {},
            "warnings": ["لم يُعثر على عمود المفتاح (value_key / valueKey / key)."],
        }

    src = f"excel:{filename}" if filename else "excel"
    seen: set[str] = set()
    items: list[dict] = []
    warnings: list[str] = []
    list_keys: set[str] = set()
    list_key = ""
    list_label: dict[str, str] = {}
    total = skipped = 0

    def cell(row, role):
        idx = hmap.get(role)
        if idx is None or idx >= len(row):
            return ""
        v = row[idx]
        return str(v).strip() if v is not None else ""

    for row in rows:
        if row is None or all(c is None for c in row):
            continue
        total += 1
        vk = cell(row, "value_key")
        if not vk:
            skipped += 1
            continue
        if vk in seen:
            warnings.append(f"عنصر مكرّر حُذف: value_key=«{vk}»")
            skipped += 1
            continue
        seen.add(vk)

        lk = cell(row, "list_key")
        if lk:
            list_keys.add(lk)
            if not list_key:
                list_key = lk
        ll = cell(row, "list_label")
        if ll and not list_label:
            list_label = {"ar": ll}

        label = {"ar": cell(row, "label_ar"), "en": cell(row, "label_en")}
        item = {"value_key": vk, "label": label, "source": src, "confidence": 0.9}
        pvk = cell(row, "parent_value_key")
        if pvk:
            item["parent_value_key"] = pvk
        items.append(item)

    if len(list_keys) > 1:
        warnings.append(
            f"الملف يحوي {len(list_keys)} قوائم؛ عُرضت «{list_key}» فقط — قسّم الملف أو ارفع قائمة لكل ملف."
        )

    return {
        "ok": bool(items),
        "list_key": list_key,
        "list_label": list_label,
        "items": items,
        "warnings": warnings,
        "meta": {"rows": total, "imported": len(items), "skipped": skipped, "sheet": ws.title},
    }
