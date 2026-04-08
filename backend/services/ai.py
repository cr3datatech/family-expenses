"""AI receipt scanning and expense categorization using OpenAI GPT-4o-mini."""

import io
import json
import os
import base64
import logging

from openai import OpenAI
from PIL import Image

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))

CURRENCY = os.getenv("SNAP_CURRENCY", "EUR")

# Formats GPT-4o-mini vision API accepts
_SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


def _ensure_jpeg(image_data: bytes, media_type: str) -> tuple[bytes, str]:
    """Convert unsupported image formats (HEIC, TIFF, BMP, etc.) to JPEG."""
    if media_type in _SUPPORTED_TYPES:
        return image_data, media_type
    logger.info("Converting %s to JPEG for vision API", media_type)
    img = Image.open(io.BytesIO(image_data))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue(), "image/jpeg"


def scan_receipt(image_data: bytes, media_type: str) -> dict:
    """Extract data from a receipt photo, including a category."""
    image_data, media_type = _ensure_jpeg(image_data, media_type)

    prompt = (
        "Extract data from this receipt. Return ONLY a JSON object with: "
        '"merchant" (string or null), "date" (string ISO date or null), '
        '"items" (array of {"name": string, "qty": integer, "unit_price": float, "amount": float}), '
        '"total" (float), '
        '"category" (string, Title Case - prefer these: Groceries, Eating Out, Transport, Entertainment, '
        "Health, Utilities, Shopping, Subscriptions, Travel, Coffee, Household, Rent, "
        "Investments, Insurance, Gifts, Education, Other. "
        'Use "Eating Out" for all restaurants/cafes/takeaway, never "Dining"). '
        "Group identical items into one entry with the correct qty. "
        "For example, 3 separate 'Taco al Pastor' at 1.00 each becomes "
        '{"name": "Taco al Pastor", "qty": 3, "unit_price": 1.00, "amount": 3.00}. '
        "amount = qty * unit_price. The sum of all item amounts should equal the total. "
        "No markdown, just JSON."
    )

    b64 = base64.standard_b64encode(image_data).decode("utf-8")
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{media_type};base64,{b64}"},
                    },
                    {"type": "text", "text": prompt},
                ],
            }],
            max_tokens=512,
        )
    except Exception:
        logger.exception("OpenAI API call failed for receipt scan")
        raise ValueError("Receipt scan failed - could not reach AI service")

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        logger.error("GPT returned non-JSON for receipt scan: %s", raw[:200])
        raise ValueError("Could not parse receipt - AI returned unexpected format")


def categorize_expense(description: str) -> str:
    """Categorize an expense description into a short category label."""
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{
            "role": "user",
            "content": (
                f"Categorize this expense in 1-2 words, Title Case. "
                f"Prefer these categories: Groceries, Eating Out, Transport, Entertainment, "
                f"Health, Utilities, Shopping, Subscriptions, Travel, Coffee, Household, "
                f"Rent, Investments, Insurance, Gifts, Education, Other. "
                f'Use "Eating Out" for all restaurants/cafes/takeaway (never "Dining" or "Restaurant"). '
                f"You may create a new category if none fit, but keep it Title Case and consistent. "
                f"Reply with ONLY the category, nothing else.\n\n"
                f"Expense: {description}"
            ),
        }],
        max_tokens=10,
    )
    return response.choices[0].message.content.strip().title()
