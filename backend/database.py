"""SQLite database for Snap Expenses."""

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
    ucols = [r[1] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
    if "email" not in ucols:
        conn.execute("ALTER TABLE users ADD COLUMN email TEXT")
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
    n = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if n > 0:
        return
    user = os.getenv("SNAP_BOOTSTRAP_ADMIN_USER", "").strip()
    pw = os.getenv("SNAP_BOOTSTRAP_ADMIN_PASSWORD", "")
    if not user or not pw:
        return
    conn.execute(
        "INSERT INTO users (username, password_hash, is_superuser) VALUES (?, ?, 1)",
        (user, hash_password(pw)),
    )


def _backfill_expense_user_ids(conn: sqlite3.Connection) -> None:
    first = conn.execute("SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
    if first is None:
        return
    uid = first[0]
    conn.execute("UPDATE expenses SET user_id = ? WHERE user_id IS NULL", (uid,))


def init_db(db_path: str | Path | None = None) -> None:
    """Initialize the database schema and run migrations."""
    conn = get_connection(db_path)
    try:
        _migrate(conn)
        _bootstrap_admin(conn)
        conn.commit()
        _backfill_expense_user_ids(conn)
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
