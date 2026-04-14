"""SQLite database for Snap Expenses."""

import json
import os
import sqlite3
from pathlib import Path

from backend.services.passwords import hash_password

DB_PATH = Path(os.getenv("SNAP_DB_PATH", str(Path(__file__).parent.parent / "data" / "snap.db")))

SCHEMA = """
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    merchant TEXT,
    items TEXT DEFAULT '[]',
    total REAL NOT NULL,
    currency TEXT DEFAULT 'EUR',
    category TEXT DEFAULT 'Other',
    card TEXT NOT NULL DEFAULT 'Cash',
    note TEXT,
    receipt_photo_path TEXT,
    ai_extracted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
"""


def get_connection(db_path: str | Path | None = None) -> sqlite3.Connection:
    """Create a database connection with WAL mode and foreign keys."""
    path = str(db_path or DB_PATH)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_superuser INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
        """
    )
    cols = [r[1] for r in conn.execute("PRAGMA table_info(expenses)").fetchall()]
    if "user_id" not in cols:
        conn.execute("ALTER TABLE expenses ADD COLUMN user_id INTEGER REFERENCES users(id)")
    if "is_shared" not in cols:
        conn.execute("ALTER TABLE expenses ADD COLUMN is_shared INTEGER NOT NULL DEFAULT 1")
    if "shared_with" not in cols:
        conn.execute("ALTER TABLE expenses ADD COLUMN shared_with TEXT")
    ucols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "email" not in ucols:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
    if "receipt_paths" not in cols:
        conn.execute("ALTER TABLE expenses ADD COLUMN receipt_paths TEXT")
        rows = conn.execute("SELECT id, receipt_photo_path FROM expenses WHERE receipt_photo_path IS NOT NULL").fetchall()
        for row in rows:
            conn.execute(
                "UPDATE expenses SET receipt_paths = ? WHERE id = ?",
                (json.dumps([row[1]]), row[0]),
            )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now'))
        )
        """
    )


def _bootstrap_admin(conn: sqlite3.Connection) -> None:
    user = os.getenv("SNAP_BOOTSTRAP_ADMIN_USER", "").strip()
    pw = os.getenv("SNAP_BOOTSTRAP_ADMIN_PASSWORD", "")
    email = os.getenv("SNAP_BOOTSTRAP_ADMIN_EMAIL", "").strip() or None
    if not user or not pw:
        return
    n = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if n == 0:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_superuser, email) VALUES (?, ?, 1, ?)",
            (user, hash_password(pw), email),
        )
    elif email:
        conn.execute(
            "UPDATE users SET email = ? WHERE username = ? AND (email IS NULL OR email = '')",
            (email, user),
        )


def _backfill_expense_user_ids(conn: sqlite3.Connection) -> None:
    first = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if first is None:
        return
    uid = first[0]
    conn.execute("UPDATE expenses SET user_id = ? WHERE user_id IS NULL", (uid,))


def _backfill_shared_with(conn: sqlite3.Connection) -> None:
    """Set shared_with for existing shared expenses to Christa + Craig (or all users)."""
    rows = conn.execute(
        "SELECT id FROM users WHERE LOWER(username) IN ('christa', 'craig') ORDER BY id"
    ).fetchall()
    if not rows:
        rows = conn.execute("SELECT id FROM users ORDER BY id").fetchall()
    if not rows:
        return
    user_ids = [r[0] for r in rows]
    conn.execute(
        "UPDATE expenses SET shared_with = ? WHERE is_shared = 1 AND shared_with IS NULL",
        (json.dumps(user_ids),),
    )


def init_db(db_path: str | Path | None = None) -> None:
    """Initialize the database schema and run migrations."""
    conn = get_connection(db_path)
    try:
        _migrate(conn)
        _bootstrap_admin(conn)
        conn.commit()
        _backfill_expense_user_ids(conn)
        _backfill_shared_with(conn)
        conn.commit()
    finally:
        conn.close()


def get_db():
    """FastAPI dependency that yields a database connection."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
