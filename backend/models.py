"""Pydantic models for Snap Expenses."""

from pydantic import BaseModel, Field
from typing import Optional


class ExpenseItem(BaseModel):
    name: str
    qty: float = 1
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
    user_id: Optional[int] = Field(
        default=None,
        description="Superuser only: attribute expense to another user",
    )


class ExpenseUpdate(BaseModel):
    date: Optional[str] = None
    merchant: Optional[str] = None
    items: Optional[list[ExpenseItem]] = None
    total: Optional[float] = None
    currency: Optional[str] = None
    category: Optional[str] = None
    card: Optional[str] = None
    note: Optional[str] = None
    user_id: Optional[int] = Field(
        default=None,
        description="Superuser only: change attributed user",
    )


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
    user_id: int
    attributed_username: str


class ReceiptScan(BaseModel):
    merchant: Optional[str]
    date: Optional[str]
    items: list[ExpenseItem]
    total: float
    category: str
    receipt_path: Optional[str] = None


class CategorizeRequest(BaseModel):
    description: str


class CategorizeResponse(BaseModel):
    category: str


class LoginRequest(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    is_superuser: bool = False
    email: str


class UserUpdate(BaseModel):
    password: Optional[str] = None
    is_superuser: Optional[bool] = None
    email: Optional[str] = None


class UserPublic(BaseModel):
    id: int
    username: str
    is_superuser: bool
    email: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
