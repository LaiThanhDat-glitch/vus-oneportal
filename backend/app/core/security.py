import base64
import hashlib
import os
from datetime import datetime, timedelta, timezone

import jwt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pwdlib import PasswordHash

from app.core.config import settings

password_hash = PasswordHash.recommended()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_access_token(subject: str, role: str, expires_minutes: int = 60) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": subject, "role": role, "iat": now, "exp": now + timedelta(minutes=expires_minutes)},
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def create_attendance_token(session_id: str, teacher_id: str, demo: bool = False) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": teacher_id,
            "session_id": session_id,
            "purpose": "attendance",
            "demo": demo,
            "iat": now,
            "exp": now + timedelta(seconds=60),
        },
        settings.secret_key,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])


def encrypt_sensitive(value: str | None) -> str | None:
    if value is None:
        return None
    key = hashlib.sha256(settings.sensitive_data_key.encode("utf-8")).digest()
    nonce = os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, value.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("ascii")


def decrypt_sensitive(value: str | None) -> str | None:
    if value is None:
        return None
    key = hashlib.sha256(settings.sensitive_data_key.encode("utf-8")).digest()
    payload = base64.urlsafe_b64decode(value.encode("ascii"))
    return AESGCM(key).decrypt(payload[:12], payload[12:], None).decode("utf-8")
