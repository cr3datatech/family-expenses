"""Expense CRUD endpoints with receipt scanning."""

import json
import os
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile

from backend.database import get_db
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

UPLOAD_DIR = Path(__file__).parent.parent.parent / "data" / "receipts"

# Payment methods - configurable via SNAP_CARDS env var (comma-separated)
DEFAULT_CARDS = ["Cash", "Debit Card", "Credit Card"]


def row_to_expense(row: sqlite3.Row) -> dict:
    """Convert an sqlite3.Row to a dict, parsing JSON items field."""
    d = dict(row)
    items_raw = d.get("items", "[]")
    d["items"] = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
    d["ai_extracted"] = bool(d.get("ai_extracted", 0))
    return d


@router.get("/cards")
def get_cards():
    """Return configured payment methods."""
    cards_env = os.getenv("SNAP_CARDS", "")
    if cards_env.strip():
        return [c.strip() for c in cards_env.split(",") if c.strip()]
    return DEFAULT_CARDS


@router.get("/", response_model=list[ExpenseResponse])
def list_expenses(
    year: int | None = Query(None),
    month: int | None = Query(None),
    card: str | None = Query(None),
    db: sqlite3.Connection = Depends(get_db),
):
    query = "SELECT * FROM expenses WHERE 1=1"
    params: list = []
    if year is not None and month is not None:
        prefix = f"{year}-{month:02d}"
        query += " AND date LIKE ?"
        params.append(f"{prefix}%")
    if card is not None:
        query += " AND card = ?"
        params.append(card)
    query += " ORDER BY date DESC, id DESC"
    rows = db.execute(query, params).fetchall()
    return [row_to_expense(r) for r in rows]


@router.get("/summary/{year}/{month}")
def monthly_summary(
    year: int,
    month: int,
    db: sqlite3.Connection = Depends(get_db),
):
    query = "SELECT * FROM expenses WHERE date LIKE ?"
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


@router.post("/", response_model=ExpenseResponse, status_code=201)
def create_expense(expense: ExpenseCreate, db: sqlite3.Connection = Depends(get_db)):
    items_json = json.dumps([item.model_dump() for item in expense.items])
    cursor = db.execute(
        "INSERT INTO expenses (date, merchant, items, total, currency, category, card, note, receipt_photo_path, ai_extracted) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            expense.date,
            expense.merchant,
            items_json,
            expense.total,
            expense.currency,
            expense.category,
            expense.card,
            expense.note,
            expense.receipt_photo_path,
            int(expense.ai_extracted),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM expenses WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_expense(row)


@router.post("/scan", response_model=ReceiptScan)
async def scan_receipt_endpoint(photo: UploadFile = File(...)):
    image_data = await photo.read()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{photo.filename}"
    save_path = UPLOAD_DIR / filename
    save_path.write_bytes(image_data)
    try:
        result = scan_receipt(image_data, photo.content_type)
    except (ValueError, Exception) as e:
        raise HTTPException(status_code=422, detail=str(e))
    return result


@router.post("/categorize", response_model=CategorizeResponse)
def categorize_endpoint(req: CategorizeRequest):
    category = categorize_expense(req.description)
    return CategorizeResponse(category=category)


@router.put("/{expense_id}", response_model=ExpenseResponse)
def update_expense(expense_id: int, expense: ExpenseUpdate, db: sqlite3.Connection = Depends(get_db)):
    existing = db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if existing is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    updates = expense.model_dump(exclude_unset=True)
    if "items" in updates and updates["items"] is not None:
        updates["items"] = json.dumps([item if isinstance(item, dict) else item.model_dump() for item in updates["items"]])
    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [expense_id]
        db.execute(f"UPDATE expenses SET {set_clause} WHERE id = ?", values)
        db.commit()

    row = db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    return row_to_expense(row)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT * FROM expenses WHERE id = ?", (expense_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    db.commit()
    return Response(status_code=204)
