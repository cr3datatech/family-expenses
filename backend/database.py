"""SQLite database for Snap Expenses."""

import os
import sqlite3
from pathlib import Path

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


def init_db(db_path: str | Path | None = None) -> None:
    """Initialize the database schema."""
    conn = get_connection(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()


def get_db():
    """FastAPI dependency that yields a database connection."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
