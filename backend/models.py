"""Pydantic models for Snap Expenses."""

from pydantic import BaseModel
from typing import Optional


class ExpenseItem(BaseModel):
    name: str
    qty: int = 1
    unit_price: float | None = None
    amount: float


class ExpenseCreate(BaseModel):
    date: str
    merchant: Optional[str] = None
    items: list[ExpenseItem] = []
    total: float
    currency: str = "EUR"
    category: str = "Other"
    card: str = "Cash"
    note: Optional[str] = None
    receipt_photo_path: Optional[str] = None
    ai_extracted: bool = False


class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    merchant: Optional[str] = None
    items: Optional[list[ExpenseItem]] = None
    total: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    card: Optional[str] = None
    note: Optional[str] = None


class ExpenseResponse(BaseModel):
    id: int
    date: str
    merchant: Optional[str]
    items: list[ExpenseItem]
    total: float
    currency: str
    category: str
    card: str
    note: Optional[str]
    receipt_photo_path: Optional[str]
    ai_extracted: bool
    created_at: str


class ReceiptScan(BaseModel):
    merchant: Optional[str]
    date: Optional[str]
    items: list[ExpenseItem]
    total: float
    category: str


class CategorizeRequest(BaseModel):
    description: str


class CategorizeResponse(BaseModel):
    category: str
