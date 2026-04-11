"""User administration (superuser only)."""

import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from backend.database import get_db
from backend.deps import SuperuserDep
from backend.models import UserCreate, UserPublic, UserUpdate
from backend.services.passwords import hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/", response_model=list[UserPublic])
def list_users(_su: SuperuserDep, db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, username, is_superuser FROM users ORDER BY username"
    ).fetchall()
    return [
        UserPublic(id=r["id"], username=r["username"], is_superuser=bool(r["is_superuser"]))
        for r in rows
    ]


@router.post("/", response_model=UserPublic, status_code=201)
def create_user(
    body: UserCreate,
    _su: SuperuserDep,
    db: sqlite3.Connection = Depends(get_db),
):
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, is_superuser) VALUES (?, ?, ?)",
            (body.username.strip(), hash_password(body.password), 1 if body.is_superuser else 0),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username already exists")
    row = db.execute(
        "SELECT id, username, is_superuser FROM users WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return UserPublic(
        id=row["id"],
        username=row["username"],
        is_superuser=bool(row["is_superuser"]),
    )


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    body: UserUpdate,
    _su: SuperuserDep,
    db: sqlite3.Connection = Depends(get_db),
):
    existing = db.execute(
        "SELECT id, username, is_superuser FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail="User not found")

    updates: dict = {}
    if body.password is not None:
        updates["password_hash"] = hash_password(body.password)
    if body.is_superuser is not None:
        if not body.is_superuser and existing["is_superuser"]:
            others = db.execute(
                "SELECT COUNT(*) FROM users WHERE is_superuser = 1 AND id != ?",
                (user_id,),
            ).fetchone()[0]
            if others == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot remove the last superuser",
                )
        updates["is_superuser"] = 1 if body.is_superuser else 0

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        db.execute(
            f"UPDATE users SET {set_clause} WHERE id = ?",
            list(updates.values()) + [user_id],
        )
        db.commit()

    row = db.execute(
        "SELECT id, username, is_superuser FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    return UserPublic(
        id=row["id"],
        username=row["username"],
        is_superuser=bool(row["is_superuser"]),
    )


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    su: SuperuserDep,
    db: sqlite3.Connection = Depends(get_db),
):
    if user_id == su.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    row = db.execute(
        "SELECT id, is_superuser FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")

    if row["is_superuser"]:
        n = db.execute("SELECT COUNT(*) FROM users WHERE is_superuser = 1").fetchone()[0]
        if n <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last superuser")

    n_exp = db.execute(
        "SELECT COUNT(*) FROM expenses WHERE user_id = ?", (user_id,)
    ).fetchone()[0]
    if n_exp > 0:
        raise HTTPException(
            status_code=409,
            detail="User still has attributed expenses; reassign or delete them first",
        )

    db.execute("DELETE FROM users WHERE id = ?", (user_id,))
    db.commit()
    return None
