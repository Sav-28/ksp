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
import binascii
from typing import Optional, List

from fastapi import Header, HTTPException, status

# Server secret used to sign tokens. MUST be overridden in production via env.
SECRET_KEY = os.getenv("KSP_SECRET_KEY", "dev-secret-change-me-in-production")

# Token validity period (seconds). Default 8 hours (a police shift).
TOKEN_TTL = int(os.getenv("KSP_TOKEN_TTL", str(8 * 3600)))

# Whether auth is enforced. Set KSP_AUTH_REQUIRED=false to disable (e.g. demos).
AUTH_REQUIRED = os.getenv("KSP_AUTH_REQUIRED", "true").lower() != "false"

# Password hashing (PBKDF2-HMAC-SHA256, stdlib — no external bcrypt dependency).
_PW_SALT = os.getenv("KSP_PW_SALT", "kspsalt2024").encode()
_PW_ITERATIONS = 100_000


def hash_password(password: str) -> str:
    """Return a hex PBKDF2 hash of the password."""
    return binascii.hexlify(
        hashlib.pbkdf2_hmac("sha256", password.encode(), _PW_SALT, _PW_ITERATIONS)
    ).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time verification of a password against its stored hash."""
    return hmac.compare_digest(hash_password(password), password_hash)


# Demo accounts with HASHED passwords (plaintext is never stored). Roles drive
# access control (Area 10). The four operational roles map to the personas in
# the problem statement; officer/admin are kept for backward compatibility.
#   investigator / invest@2024   analyst / analyst@2024
#   supervisor  / super@2024     policymaker / policy@2024
#   officer     / ksp@2024       admin / admin@2024
OFFICERS = {
    "investigator": {
        "password_hash": "9cf976de90313d7da2f1bf4283cc55cc6f2cfa02347dba054c393eecf8cb064d",
        "name": "Investigating Officer", "role": "investigator",
    },
    "analyst": {
        "password_hash": "2fa958ce947a6c1730f5175e60d2fb7a0af279b3fb3b85117ba67a2fc795da6b",
        "name": "Crime Analyst", "role": "analyst",
    },
    "supervisor": {
        "password_hash": "5df7e553969f962f67818d0d9aeeb3b448069ae5fb09907ef6ebdf3d07fc443f",
        "name": "Supervisor", "role": "supervisor",
    },
    "policymaker": {
        "password_hash": "a5a63fadeb7ddc7333a062bc92853e78614ee67fd4eeb5e75b94d4b8340dcb48",
        "name": "Policymaker", "role": "policymaker",
    },
    "officer": {
        "password_hash": "0e64b899fd9584132a49edbf235e168a00cb38ade5ab4f5a94266095e4c9c6a6",
        "name": "Duty Officer", "role": "officer",
    },
    "admin": {
        "password_hash": "dc2cd9f0726696aeb1e67083c120af7ca0acc813668aa237a6466baec4e50746",
        "name": "Administrator", "role": "admin",
    },
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
    """Check username/password against the officer store (hashed)."""
    officer = OFFICERS.get(username)
    if not officer:
        return False
    return verify_password(password, officer["password_hash"])


def get_user_role(username: str) -> Optional[str]:
    """Return the role for a username, if known."""
    officer = OFFICERS.get(username)
    return officer["role"] if officer else None


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


def require_role(*allowed_roles: str):
    """
    Dependency factory enforcing role-based access control (Area 10).
    Usage: username: str = Depends(require_role("admin"))
    """
    def _checker(authorization: Optional[str] = Header(default=None)) -> str:
        username = get_current_user(authorization)
        if not AUTH_REQUIRED:
            return username
        role = get_user_role(username)
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Requires role: {', '.join(allowed_roles)}.",
            )
        return username
    return _checker


# --- Write-capability roles (Area 10) -------------------------------------
# Roles allowed to REGISTER a new FIR. Analysts and policymakers consume
# intelligence but do not file crimes.
CAN_REGISTER_ROLES = ("investigator", "officer", "supervisor", "admin")
# Roles allowed to UPDATE an existing investigation's status/outcome.
CAN_UPDATE_ROLES = ("investigator", "supervisor", "admin")


def can_register(username: str) -> bool:
    """Whether the given user's role may register a new FIR."""
    if not AUTH_REQUIRED:
        return True
    return get_user_role(username) in CAN_REGISTER_ROLES
