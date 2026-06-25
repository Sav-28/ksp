"""
Authentication routes: login and current-user info.
"""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any
import logging

from src.api.auth import authenticate, create_token, OFFICERS, get_current_user

router = APIRouter()


@router.post("/login")
async def login(request: Dict[str, Any]) -> Dict[str, Any]:
    """
    Authenticate an officer and return a signed token.

    INPUT:  {"username": str, "password": str}
    OUTPUT: {"token": str, "name": str, "role": str}
    """
    username = (request.get("username") or "").strip()
    password = request.get("password") or ""

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required",
        )

    if not authenticate(username, password):
        logging.info(f"AUTH: failed login attempt for '{username}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    token = create_token(username)
    officer = OFFICERS[username]
    logging.info(f"AUTH: successful login for '{username}'")
    return {
        "token": token,
        "username": username,
        "name": officer["name"],
        "role": officer["role"],
    }


@router.get("/me")
async def me(username: str = Depends(get_current_user)) -> Dict[str, Any]:
    """Return info about the currently authenticated user."""
    officer = OFFICERS.get(username, {"name": username, "role": "unknown"})
    return {"username": username, "name": officer.get("name"), "role": officer.get("role")}
