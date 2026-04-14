"""Expense CRUD endpoints with receipt scanning."""

import asyncio
import json
import os
import re
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel

from backend.database import get_db
from backend.deps import CurrentUserDep, SuperuserDep
from backend.models import (
    CategorizeRequest,
    CategorizeResponse,
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
    ReceiptScan,
)
from backend.services.ai import categorize_expense, scan_receipt

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

ARCHIVE_DIR = Path(__file__).parent.parent.parent / "data" / "receipts" / "archive"
TMP_DIR = Path(__file__).parent.parent.parent / "data" / "receipts" / "tmp"
DATA_DIR = Path(__file__).parent.parent.parent / "data"


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", "_", text)
    return re.sub(r"_+", "_", text).strip("_") or "unknown"

DEFAULT_CARDS = ["Credit Card", "Debit Card", "ePassi", "Cash", "Payment"]

EXPENSE_SELECT = """
SELECT e.*, u.username AS attributed_username
FROM expenses e
JOIN users u ON u.id = e.user_id
"""


def row_to_expense(row: sqlite3.Row) -> dict:
    d = dict(row)
    items_raw = d.get("items", "[]")
    d["items"] = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
    d["ai_extracted"] = bool(d.get("ai_extracted", 0))
    d["is_shared"] = bool(d.get("is_shared", 1))
    sw_raw = d.get("shared_with")
    d["shared_with"] = json.loads(sw_raw) if sw_raw else []
    d["user_id"] = int(d["user_id"])
    rp_raw = d.get("receipt_paths")
    if rp_raw:
        paths = json.loads(rp_raw)
    elif d.get("receipt_photo_path"):
        paths = [d["receipt_photo_path"]]
    else:
        paths = []
    d["receipt_paths"] = paths
    d["receipt_photo_path"] = paths[0] if paths else None
    return d


def _reassign_paths(paths: list[str], expense_id: int, db: sqlite3.Connection) -> None:
    """Remove the given paths from any expense other than expense_id."""
    if not paths:
        return
    others = db.execute(
        "SELECT id, receipt_paths FROM expenses WHERE id != ? AND receipt_paths IS NOT NULL",
        (expense_id,),
    ).fetchall()
    for other in others:
        other_paths = json.loads(other["receipt_paths"] or "[]")
        updated = [p for p in other_paths if p not in paths]
        if len(updated) != len(other_paths):
            primary = updated[0] if updated else None
            db.execute(
                "UPDATE expenses SET receipt_paths = ?, receipt_photo_path = ? WHERE id = ?",
                (json.dumps(updated), primary, other["id"]),
            )


def _resolve_attributed_user_id(
    expense: ExpenseCreate | ExpenseUpdate,
    current: CurrentUserDep,
    db: sqlite3.Connection,
) -> int | None:
    """Returns target user_id for create/update, or None if field not set by superuser."""
    raw = getattr(expense, "user_id", None)
    if raw is None:
        return None
    if not current.is_superuser:
        return None
    target = db.execute("SELECT id FROM users WHERE id = ?", (raw,)).fetchone()
    if target is None:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    return raw


@router.get("/cards")
def get_cards(_user: CurrentUserDep):
    cards_env = os.getenv("SNAP_CARDS", "")
    if cards_env.strip():
        return [c.strip() for c in cards_env.split(",") if c.strip()]
    return DEFAULT_CARDS


@router.get("/", response_model=list[ExpenseResponse])
def list_expenses(
    _user: CurrentUserDep,
    year: int | None = Query(None),
    month: int | None = Query(None),
    card: str | None = Query(None),
    category: str | None = Query(None),
    merchant: str | None = Query(None),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    is_shared: bool | None = Query(None),
    attributed_to: int | None = Query(None),
    shared_with_user: int | None = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    query = f"{EXPENSE_SELECT} WHERE 1=1"
    params: list = []
    if year is not None and month is not None:
        prefix = f"{year}-{month:02d}"
        query += " AND e.date LIKE ?"
        params.append(f"{prefix}%")
    if date_from is not None:
        query += " AND e.date >= ?"
        params.append(date_from)
    if date_to is not None:
        query += " AND e.date <= ?"
        params.append(date_to)
    if card is not None:
        query += " AND e.card = ?"
        params.append(card)
    if category is not None:
        query += " AND e.category = ?"
        params.append(category)
    if merchant is not None:
        query += " AND LOWER(e.merchant) = LOWER(?)"
        params.append(merchant)
    if is_shared is not None:
        query += " AND e.is_shared = ?"
        params.append(1 if is_shared else 0)
    if attributed_to is not None:
        query += " AND e.user_id = ? AND e.is_shared = 0"
        params.append(attributed_to)
    if shared_with_user is not None:
        query += (
            " AND e.is_shared = 1"
            " AND (e.shared_with IS NULL OR EXISTS"
            " (SELECT 1 FROM json_each(e.shared_with) WHERE CAST(value AS INTEGER) = ?))"
        )
        params.append(shared_with_user)
    query += " ORDER BY e.date DESC, e.id DESC"
    rows = db.execute(query, params).fetchall()
    return [row_to_expense(r) for r in rows]


@router.get("/summary/{year}/{month}")
def monthly_summary(
    _user: CurrentUserDep,
    year: int,
    month: int,
    db: sqlite3.Connection = Depends(get_db),
):
    query = f"{EXPENSE_SELECT} AND e.date LIKE ?"
    prefix = f"{year}-{month:02d}"
    params: list = [f"{prefix}%"]
    rows = db.execute(query, params).fetchall()
    expenses = [row_to_expense(r) for r in rows]
    by_category: dict[str, float] = defaultdict(float)
    by_card: dict[str, float] = defaultdict(float)
    total = 0.0
    for e in expenses:
        total += e["total"]
        by_category[e["category"]] += e["total"]
        by_card[e["card"]] += e["total"]
    return {
        "year": year,
        "month": month,
        "total": total,
        "count": len(expenses),
        "by_category": dict(by_category),
        "by_card": dict(by_card),
    }


def _archive_tmp_receipt(tmp_rel_path: str, expense: "ExpenseCreate", username: str) -> str:
    """Move a staged receipt from tmp/ to archive/ and return the new relative path."""
    tmp_file = DATA_DIR / tmp_rel_path
    if not tmp_file.exists():
        return tmp_rel_path  # already gone, keep whatever path was given
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    date_str = (expense.date or "").replace("-", "")[:8] or datetime.now().strftime("%Y%m%d")
    cat_slug = _slugify(expense.category or "other")
    merchant_slug = _slugify(expense.merchant or "unknown")
    user_slug = _slugify(username)
    base_name = f"{date_str}_{cat_slug}_{merchant_slug}_{user_slug}"
    ext = tmp_file.suffix
    archive_path = ARCHIVE_DIR / f"{base_name}{ext}"
    counter = 2
    while archive_path.exists():
        archive_path = ARCHIVE_DIR / f"{base_name}_{counter}{ext}"
        counter += 1
    tmp_file.rename(archive_path)
    return f"receipts/archive/{archive_path.name}"


@router.post("/", response_model=ExpenseResponse, status_code=201)
def create_expense(
    expense: ExpenseCreate,
    current: CurrentUserDep,
    db: sqlite3.Connection = Depends(get_db),
):
    attributed = _resolve_attributed_user_id(expense, current, db)
    uid = attributed if attributed is not None else current.id

    receipt_path = expense.receipt_photo_path
    if receipt_path and receipt_path.startswith("receipts/tmp/"):
        receipt_path = _archive_tmp_receipt(receipt_path, expense, current.username)

    # Build full receipt_paths list
    paths = list(expense.receipt_paths or [])
    if receipt_path and receipt_path not in paths:
        paths.insert(0, receipt_path)
    primary = paths[0] if paths else None
    receipt_paths_json = json.dumps(paths)

    items_json = json.dumps([item.model_dump() for item in expense.items])
    shared_with_json = json.dumps(expense.shared_with) if expense.is_shared else None
    cursor = db.execute(
        "INSERT INTO expenses (date, merchant, items, total, currency, category, card, note, receipt_photo_path, receipt_paths, ai_extracted, user_id, is_shared, shared_with) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            expense.date,
            expense.merchant,
            items_json,
            expense.total,
            expense.currency,
            expense.category,
            expense.card,
            expense.note,
            primary,
            receipt_paths_json,
            int(expense.ai_extracted),
            uid,
            1 if expense.is_shared else 0,
            shared_with_json,
        ),
    )
    db.commit()
    row = db.execute(
        f"{EXPENSE_SELECT} WHERE e.id = ?", (cursor.lastrowid,)
    ).fetchone()
    return row_to_expense(row)


@router.post("/scan", response_model=ReceiptScan)
async def scan_receipt_endpoint(_user: CurrentUserDep, photo: UploadFile = File(...)):
    image_data = await photo.read()
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    # Save to staging area while AI processes — only moves to archive on expense save
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = Path(photo.filename or "receipt.jpg").suffix.lower() or ".jpg"
    tmp_path = TMP_DIR / f"{timestamp}{ext}"
    tmp_path.write_bytes(image_data)

    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, scan_receipt, image_data, photo.content_type)
    except (ValueError, Exception) as e:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(e))

    result["receipt_path"] = f"receipts/tmp/{tmp_path.name}"
    return result


@router.get("/search", response_model=list[ExpenseResponse])
def search_expenses(
    _user: CurrentUserDep,
    q: str = Query(""),
    db: sqlite3.Connection = Depends(get_db),
):
    if not q.strip():
        return []
    term = f"%{q.strip()}%"
    rows = db.execute(
        f"{EXPENSE_SELECT} WHERE e.merchant LIKE ? OR e.category LIKE ? OR e.note LIKE ? OR e.items LIKE ? OR e.date LIKE ? OR e.card LIKE ?"
        " ORDER BY e.date DESC, e.id DESC",
        (term, term, term, term, term, term),
    ).fetchall()
    return [row_to_expense(r) for r in rows]


@router.get("/archive")
def list_archive(_user: CurrentUserDep, db: sqlite3.Connection = Depends(get_db)):
    """Return archived receipt filenames sorted descending (newest first), with expense link flag."""
    if not ARCHIVE_DIR.exists():
        return []
    files = sorted([f.name for f in ARCHIVE_DIR.iterdir() if f.is_file()], reverse=True)
    linked = {
        row["receipt_photo_path"].split("/")[-1]
        for row in db.execute("SELECT receipt_photo_path FROM expenses WHERE receipt_photo_path IS NOT NULL").fetchall()
    }
    return [{"name": f, "has_expense": f in linked} for f in files]


@router.get("/scanned")
def list_scanned(_user: CurrentUserDep, db: sqlite3.Connection = Depends(get_db)):
    """Return all scanned receipt images (archive + tmp) with linked expense data."""
    expense_rows = db.execute(f"{EXPENSE_SELECT} WHERE e.receipt_paths IS NOT NULL").fetchall()
    # Index every path (not just the primary) so secondary images resolve correctly
    expense_by_path: dict = {}
    for row in expense_rows:
        exp = row_to_expense(row)
        for path in exp["receipt_paths"]:
            expense_by_path[path] = exp

    result = []
    for location, directory in [("archive", ARCHIVE_DIR), ("tmp", TMP_DIR)]:
        if not directory.exists():
            continue
        for f in sorted(directory.iterdir()):
            if not f.is_file():
                continue
            rel_path = f"receipts/{location}/{f.name}"
            expense = expense_by_path.get(rel_path)
            # Derive month from expense date or filename prefix (YYYYMMDD_...)
            if expense:
                month = expense["date"][:7]
            elif len(f.name) >= 8 and f.name[:8].isdigit():
                month = f"{f.name[:4]}-{f.name[4:6]}"
            else:
                month = "unknown"
            result.append({
                "filename": f.name,
                "path": rel_path,
                "location": location,
                "expense": expense,
                "month": month,
            })
    return result


@router.post("/scanned/upload", status_code=201)
async def upload_orphaned_image(_user: CurrentUserDep, photo: UploadFile = File(...)):
    """Save an uploaded image directly to archive as an orphaned image."""
    image_data = await photo.read()
    ext = Path(photo.filename or "image.jpg").suffix.lower() or ".jpg"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = ARCHIVE_DIR / f"{timestamp}{ext}"
    counter = 2
    while archive_path.exists():
        archive_path = ARCHIVE_DIR / f"{timestamp}_{counter}{ext}"
        counter += 1
    archive_path.write_bytes(image_data)
    return {"path": f"receipts/archive/{archive_path.name}", "filename": archive_path.name}


@router.delete("/scanned/orphaned", status_code=200)
def delete_orphaned_images(_user: SuperuserDep, db: sqlite3.Connection = Depends(get_db)):
    """Delete all scanned images not attached to any expense."""
    all_rows = db.execute("SELECT receipt_paths, receipt_photo_path FROM expenses").fetchall()
    linked_paths = set()
    for row in all_rows:
        if row["receipt_paths"]:
            linked_paths.update(json.loads(row["receipt_paths"]))
        elif row["receipt_photo_path"]:
            linked_paths.add(row["receipt_photo_path"])
    deleted = []
    for location, directory in [("archive", ARCHIVE_DIR), ("tmp", TMP_DIR)]:
        if not directory.exists():
            continue
        for f in directory.iterdir():
            if not f.is_file():
                continue
            rel_path = f"receipts/{location}/{f.name}"
            if rel_path not in linked_paths:
                f.unlink()
                deleted.append(rel_path)
    return {"deleted": deleted, "count": len(deleted)}


@router.post("/categorize", response_model=CategorizeResponse)
def categorize_endpoint(_user: CurrentUserDep, req: CategorizeRequest):
    category = categorize_expense(req.description)
    return CategorizeResponse(category=category)


@router.get("/analytics")
def analytics(
    _user: CurrentUserDep,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    conditions = ["1=1"]
    params: list = []
    if date_from:
        conditions.append("e.date >= ?")
        params.append(date_from)
    if date_to:
        conditions.append("e.date <= ?")
        params.append(date_to)
    where = " AND ".join(conditions)

    total_row = db.execute(
        f"SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count FROM expenses e WHERE {where}",
        params,
    ).fetchone()

    by_category = db.execute(
        f"SELECT category, SUM(total) AS total, COUNT(*) AS count FROM expenses e WHERE {where}"
        " GROUP BY category ORDER BY total DESC",
        params,
    ).fetchall()

    by_card = db.execute(
        f"SELECT card, SUM(total) AS total, COUNT(*) AS count FROM expenses e WHERE {where}"
        " GROUP BY card ORDER BY total DESC",
        params,
    ).fetchall()

    by_merchant = db.execute(
        f"SELECT"
        f"  UPPER(SUBSTR(LOWER(merchant), 1, 1)) || SUBSTR(LOWER(merchant), 2) AS merchant,"
        f"  SUM(total) AS total, COUNT(*) AS count"
        f" FROM expenses e"
        f" WHERE {where} AND merchant IS NOT NULL"
        f" GROUP BY LOWER(merchant) ORDER BY total DESC LIMIT 15",
        params,
    ).fetchall()

    by_month = db.execute(
        f"SELECT strftime('%Y-%m', e.date) AS month, SUM(total) AS total, COUNT(*) AS count"
        f" FROM expenses e WHERE {where} GROUP BY month ORDER BY month DESC",
        params,
    ).fetchall()

    top_items = db.execute(
        f"""
        SELECT
            json_extract(item.value, '$.name') AS name,
            SUM(CAST(json_extract(item.value, '$.amount') AS REAL)) AS total_amount,
            SUM(CAST(json_extract(item.value, '$.qty') AS INTEGER)) AS total_qty,
            AVG(CAST(json_extract(item.value, '$.unit_price') AS REAL)) AS avg_unit_price
        FROM expenses e, json_each(e.items) AS item
        WHERE {where}
        GROUP BY name
        ORDER BY total_amount DESC
        LIMIT 50
        """,
        params,
    ).fetchall()

    return {
        "total": total_row["total"],
        "count": total_row["count"],
        "by_category": [dict(r) for r in by_category],
        "by_card": [dict(r) for r in by_card],
        "by_merchant": [dict(r) for r in by_merchant],
        "by_month": [dict(r) for r in by_month],
        "top_items": [dict(r) for r in top_items],
    }


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(
    expense_id: int,
    expense: ExpenseUpdate,
    current: CurrentUserDep,
    db: sqlite3.Connection = Depends(get_db),
):
    existing = db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    updates = expense.model_dump(exclude_unset=True)
    if "user_id" in updates:
        if not current.is_superuser:
            del updates["user_id"]
        else:
            uid = updates["user_id"]
            if uid is None:
                del updates["user_id"]
            else:
                ok = db.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone()
                if ok is None:
                    raise HTTPException(status_code=400, detail="Invalid user_id")

    if "is_shared" in updates:
        updates["is_shared"] = 1 if updates["is_shared"] else 0

    if "shared_with" in updates:
        updates["shared_with"] = json.dumps(updates["shared_with"]) if updates["shared_with"] is not None else None

    if "items" in updates and updates["items"] is not None:
        updates["items"] = json.dumps(
            [item if isinstance(item, dict) else item.model_dump() for item in updates["items"]]
        )

    if "receipt_paths" in updates:
        paths = updates["receipt_paths"] or []
        _reassign_paths(paths, expense_id, db)
        primary = paths[0] if paths else None
        updates["receipt_paths"] = json.dumps(paths)
        updates["receipt_photo_path"] = primary

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [expense_id]
        db.execute(f"UPDATE expenses SET {set_clause} WHERE id = ?", values)
        db.commit()

    row = db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)).fetchone()
    return row_to_expense(row)


class ExpenseImagesBody(BaseModel):
    paths: list[str]

    class Config:
        extra = "forbid"


@router.post("/{expense_id}/images/scan", response_model=ExpenseResponse)
async def scan_and_attach_image(
    expense_id: int,
    current: CurrentUserDep,
    photo: UploadFile = File(...),
    db: sqlite3.Connection = Depends(get_db),
):
    """Upload an image, archive it named after the expense's first image, and attach it."""
    row = db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    expense = row_to_expense(row)
    image_data = await photo.read()
    ext = Path(photo.filename or "receipt.jpg").suffix.lower() or ".jpg"

    existing_paths = expense["receipt_paths"]
    if existing_paths:
        base_name = Path(existing_paths[0]).stem  # e.g. "20260411_eating_out_nordcenter_craig_2"
    else:
        date_str = expense["date"].replace("-", "")
        cat_slug = _slugify(expense["category"])
        merchant_slug = _slugify(expense["merchant"] or expense["category"])
        user_slug = _slugify(current.username)
        base_name = f"{date_str}_{cat_slug}_{merchant_slug}_{user_slug}"

    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = ARCHIVE_DIR / f"{base_name}{ext}"
    counter = 2
    while archive_path.exists():
        archive_path = ARCHIVE_DIR / f"{base_name}_{counter}{ext}"
        counter += 1

    archive_path.write_bytes(image_data)
    new_rel_path = f"receipts/archive/{archive_path.name}"

    new_paths = existing_paths + [new_rel_path]
    db.execute(
        "UPDATE expenses SET receipt_paths = ?, receipt_photo_path = ? WHERE id = ?",
        (json.dumps(new_paths), new_paths[0], expense_id),
    )
    db.commit()

    row = db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)).fetchone()
    return row_to_expense(row)


@router.put("/{expense_id}/images", response_model=ExpenseResponse)
def set_expense_images(
    expense_id: int,
    body: ExpenseImagesBody,
    _user: CurrentUserDep,
    db: sqlite3.Connection = Depends(get_db),
):
    """Replace all image paths for an expense, cascading removal from any other expense."""
    row = db.execute("SELECT id FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    paths = body.paths
    _reassign_paths(paths, expense_id, db)
    primary = paths[0] if paths else None
    db.execute(
        "UPDATE expenses SET receipt_paths = ?, receipt_photo_path = ? WHERE id = ?",
        (json.dumps(paths), primary, expense_id),
    )
    db.commit()
    row = db.execute(f"{EXPENSE_SELECT} WHERE e.id = ?", (expense_id,)).fetchone()
    return row_to_expense(row)


@router.delete("/archive/{filename}", status_code=204)
def delete_archive_file(
    filename: str,
    _user: SuperuserDep,
    delete_expense: bool = Query(False),
    db: sqlite3.Connection = Depends(get_db),
):
    archive_path = ARCHIVE_DIR / filename
    if archive_path.exists():
        archive_path.unlink()
    if delete_expense:
        relative = f"receipts/archive/{filename}"
        db.execute("DELETE FROM expenses WHERE receipt_photo_path = ?", (relative,))
        db.commit()
    return Response(status_code=204)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    _user: SuperuserDep,
    delete_archive: bool = Query(False),
    db: sqlite3.Connection = Depends(get_db),
):
    row = db.execute("SELECT id, receipt_photo_path, receipt_paths FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    if delete_archive:
        paths = json.loads(row["receipt_paths"] or "[]") if row["receipt_paths"] else (
            [row["receipt_photo_path"]] if row["receipt_photo_path"] else []
        )
        for path in paths:
            (DATA_DIR / path).unlink(missing_ok=True)
    db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    db.commit()
    return Response(status_code=204)
