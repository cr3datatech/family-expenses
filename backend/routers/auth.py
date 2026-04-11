"""Login, logout, session check."""

import os
import secrets
from datetime import datetime, timedelta, timezone

import sqlite3
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.database import get_db
from backend.deps import SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, CurrentUser, get_current_user
from backend.models import LoginRequest
from backend.services.passwords import verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _cookie_secure() -> bool:
    return os.getenv("SNAP_COOKIE_SECURE", "").lower() in ("1", "true", "yes")


@router.post("/login")
def login(response: Response, body: LoginRequest, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT id, username, password_hash, is_superuser FROM users WHERE username = ?",
        (body.username.strip(),),
    ).fetchone()
    if row is None or not verify_password(body.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc) + timedelta(seconds=SESSION_MAX_AGE_SECONDS)
    expires_iso = expires.isoformat()
    db.execute(
        "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
        (token, row["id"], expires_iso),
    )
    db.commit()
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        max_age=SESSION_MAX_AGE_SECONDS,
        samesite="lax",
        secure=_cookie_secure(),
        path="/",
    )
    return {
        "user": {
            "id": row["id"],
            "username": row["username"],
            "is_superuser": bool(row["is_superuser"]),
        }
    }


@router.post("/logout")
def logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        db.execute("DELETE FROM sessions WHERE id = ?", (token,))
        db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me")
def me(current: CurrentUser = Depends(get_current_user)):
    return {
        "id": current.id,
        "username": current.username,
        "is_superuser": current.is_superuser,
    }
