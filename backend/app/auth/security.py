"""أمن المصادقة بالمكتبة القياسية فقط (بلا تبعيات):
- تجزئة كلمة المرور: PBKDF2-HMAC-SHA256 بملح فريد.
- الرمز: JWT HS256 موقّع بـ hmac.

ملاحظة إنتاج: يُنصَح لاحقاً بـ argon2/bcrypt للتجزئة ومكتبة JWT موثّقة (PyJWT/jose).
السرّ من البيئة (settings.jwt_secret)؛ إن فرغ يُولَّد لكل تشغيل (تطوير فقط).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from ..config import settings

# سرّ التوقيع: من البيئة، أو عشوائي لكل تشغيل (تطوير — الرموز تبطل عند إعادة التشغيل)
_SECRET = (settings.jwt_secret or secrets.token_hex(32)).encode()

_PBKDF2_ITERS = 240_000


# ---------- كلمة المرور ----------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ITERS)
    return f"pbkdf2_sha256${_PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


# ---------- JWT HS256 ----------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def create_token(subject: str, roles: list[str], extra: dict | None = None) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": subject,
        "roles": roles,
        "iat": now,
        "exp": now + settings.jwt_expire_minutes * 60,
        **(extra or {}),
    }
    seg = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(payload).encode())}"
    sig = hmac.new(_SECRET, seg.encode(), hashlib.sha256).digest()
    return f"{seg}.{_b64(sig)}"


class TokenError(Exception):
    pass


def decode_token(token: str) -> dict:
    try:
        h_seg, p_seg, sig_seg = token.split(".")
    except ValueError:
        raise TokenError("صيغة رمز غير صالحة")
    expected = hmac.new(_SECRET, f"{h_seg}.{p_seg}".encode(), hashlib.sha256).digest()
    if not hmac.compare_digest(_b64(expected), sig_seg):
        raise TokenError("توقيع غير صالح")
    payload = json.loads(_b64d(p_seg))
    if payload.get("exp", 0) < int(time.time()):
        raise TokenError("انتهت صلاحية الرمز")
    return payload
