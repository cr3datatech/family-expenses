"""Login, logout, session check."""

import os
import secrets
from datetime import datetime, timedelta, timezone

import sqlite3
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from backend.database import get_db
from backend.deps import SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, CurrentUser, get_current_user
from backend.models import ForgotPasswordRequest, LoginRequest, ResetPasswordRequest
from backend.services.email import send_password_reset_email
from backend.services.passwords import hash_password, verify_password

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


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request, db: sqlite3.Connection = Depends(get_db)):
    """Send a password reset link if the email is registered. Always returns 200 to avoid enumeration."""
    row = db.execute(
        "SELECT id, email FROM users WHERE lower(email) = lower(?)",
        (body.email.strip(),),
    ).fetchone()
    if row is not None and row["email"]:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.execute(
            "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, row["id"], expires.isoformat()),
        )
        db.commit()
        base_url = str(request.base_url).rstrip("/")
        reset_url = f"{base_url}?reset_token={token}"
        try:
            send_password_reset_email(row["email"], reset_url)
        except Exception as exc:
            # Log but don't expose error to caller
            import traceback
            traceback.print_exc()
    return {"ok": True}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute(
        "SELECT token, user_id, expires_at, used FROM password_reset_tokens WHERE token = ?",
        (body.token,),
    ).fetchone()
    if row is None or row["used"]:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    expires_at = datetime.fromisoformat(row["expires_at"])
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Reset link has expired")
    if not body.new_password or len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hash_password(body.new_password), row["user_id"]),
    )
    user_row = db.execute(
        "SELECT id, username, is_superuser, email FROM users WHERE id = ?",
        (row["user_id"],),
    ).fetchone()
    db.execute(
        "UPDATE password_reset_tokens SET used = 1 WHERE token = ?",
        (body.token,),
    )
    db.commit()
    return {
        "ok": True,
        "username": user_row["username"],
    }
