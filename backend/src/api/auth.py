"""
Lightweight authentication for the KSP Crime AI API.

Uses stateless HMAC-signed tokens (no external JWT dependency). A token encodes
the username and an expiry timestamp, signed with a server secret. This is
suitable for an MVP/demo; a production system would use proper JWT + a user
store + password hashing (bcrypt) + HTTPS.
"""
import os
import hmac
import hashlib
import base64
import json
import time
from typing import Optional

from fastapi import Header, HTTPException, status

# Server secret used to sign tokens. MUST be overridden in production via env.
SECRET_KEY = os.getenv("KSP_SECRET_KEY", "dev-secret-change-me-in-production")

# Token validity period (seconds). Default 8 hours (a police shift).
TOKEN_TTL = int(os.getenv("KSP_TOKEN_TTL", str(8 * 3600)))

# Whether auth is enforced. Set KSP_AUTH_REQUIRED=false to disable (e.g. demos).
AUTH_REQUIRED = os.getenv("KSP_AUTH_REQUIRED", "true").lower() != "false"

# Demo officer accounts. In production these would live in a DB with hashed
# passwords. Format: username -> {"password": ..., "name": ..., "role": ...}
OFFICERS = {
    "officer": {"password": "ksp@2024", "name": "Duty Officer", "role": "officer"},
    "admin": {"password": "admin@2024", "name": "Administrator", "role": "admin"},
}


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _sign(payload_b64: str) -> str:
    sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).digest()
    return _b64encode(sig)


def create_token(username: str) -> str:
    """Create a signed token for the given username."""
    payload = {
        "sub": username,
        "exp": int(time.time()) + TOKEN_TTL,
    }
    payload_b64 = _b64encode(json.dumps(payload).encode())
    signature = _sign(payload_b64)
    return f"{payload_b64}.{signature}"


def verify_token(token: str) -> Optional[str]:
    """
    Verify a token's signature and expiry.
    Returns the username if valid, otherwise None.
    """
    try:
        payload_b64, signature = token.split(".")
    except ValueError:
        return None

    # Constant-time signature comparison
    expected_sig = _sign(payload_b64)
    if not hmac.compare_digest(expected_sig, signature):
        return None

    try:
        payload = json.loads(_b64decode(payload_b64))
    except Exception:
        return None

    if payload.get("exp", 0) < int(time.time()):
        return None  # expired

    return payload.get("sub")


def authenticate(username: str, password: str) -> bool:
    """Check username/password against the officer store."""
    officer = OFFICERS.get(username)
    if not officer:
        return False
    # Constant-time password comparison
    return hmac.compare_digest(officer["password"], password)


def get_current_user(authorization: Optional[str] = Header(default=None)) -> str:
    """
    FastAPI dependency that extracts and validates the bearer token.
    Returns the username. Raises 401 if invalid (when auth is required).
    """
    if not AUTH_REQUIRED:
        # Auth disabled — return an anonymous principal
        if authorization and authorization.startswith("Bearer "):
            user = verify_token(authorization[7:])
            if user:
                return user
        return "anonymous"

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[7:]
    username = verify_token(token)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return username
