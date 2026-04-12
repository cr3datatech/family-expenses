"""Snap Expenses - AI-powered expense tracker with receipt scanning."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.database import init_db
from backend.routers import auth, expenses, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    init_db()
    yield


app = FastAPI(title="Snap Expenses", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(expenses.router)

# Mount receipt archive so images are directly accessible
receipts_dir = Path(__file__).parent.parent / "data" / "receipts"
receipts_dir.mkdir(parents=True, exist_ok=True)
app.mount("/receipts", StaticFiles(directory=str(receipts_dir)), name="receipts")

# Mount static frontend if built
frontend_out = Path(__file__).parent.parent / "frontend" / "out"
if frontend_out.exists():
    app.mount("/", StaticFiles(directory=str(frontend_out), html=True), name="frontend")
