"""Authentication dependencies (session cookie + DB)."""

import os
from datetime import datetime, timezone, timedelta
from typing import Annotated

import sqlite3
from fastapi import Cookie, Depends, HTTPException, Request

from backend.database import get_db

SESSION_COOKIE_NAME = "snap_session"
SESSION_MAX_AGE_SECONDS = int(os.getenv("SNAP_SESSION_MAX_AGE_SECONDS", str(14 * 24 * 3600)))


class CurrentUser:
    __slots__ = ("id", "username", "is_superuser")

    def __init__(self, id: int, username: str, is_superuser: bool):
        self.id = id
        self.username = username
        self.is_superuser = is_superuser


def _parse_expires(raw: str) -> datetime:
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def get_current_user(
    db: sqlite3.Connection = Depends(get_db),
    session_token: str | None = Cookie(None, alias=SESSION_COOKIE_NAME),
) -> CurrentUser:
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    row = db.execute(
        """
        SELECT u.id, u.username, u.is_superuser, s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
        """,
        (session_token,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = _parse_expires(row["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        db.execute("DELETE FROM sessions WHERE id = ?", (session_token,))
        db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    return CurrentUser(
        id=row["id"],
        username=row["username"],
        is_superuser=bool(row["is_superuser"]),
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_superuser(user: CurrentUserDep) -> CurrentUser:
    if not user.is_superuser:
        raise HTTPException(status_code=403, detail="Superuser required")
    return user


SuperuserDep = Annotated[CurrentUser, Depends(require_superuser)]
