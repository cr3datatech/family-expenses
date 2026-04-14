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


def _openai_error_detail(exc: BaseException) -> str:
    """Extract a user-facing message from an OpenAI SDK error (401 scope, billing, etc.)."""
    body = getattr(exc, "body", None)
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
    resp = getattr(exc, "response", None)
    if resp is not None:
        try:
            j = resp.json()
            if isinstance(j, dict):
                inner = j.get("error")
                if isinstance(inner, dict) and inner.get("message"):
                    return str(inner["message"])
        except Exception:
            pass
    text = str(exc).strip()
    if len(text) > 1200:
        return text[:1200] + "…"
    return text or "OpenAI request failed."

CURRENCY = os.getenv("SNAP_CURRENCY", "EUR")
SCAN_MODEL = os.getenv("SNAP_SCAN_MODEL", "gpt-4o")

# Formats GPT-4o-mini vision API accepts
_SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


_MAX_EDGE = 1600  # max pixel dimension sent to vision API


def _ensure_jpeg(image_data: bytes, media_type: str) -> tuple[bytes, str]:
    """Convert to JPEG and resize so the long edge is at most _MAX_EDGE pixels."""
    needs_convert = media_type not in _SUPPORTED_TYPES
    img = Image.open(io.BytesIO(image_data))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    if max(img.size) > _MAX_EDGE:
        img.thumbnail((_MAX_EDGE, _MAX_EDGE), Image.LANCZOS)
        needs_convert = True  # must re-encode after resize

    if not needs_convert:
        return image_data, media_type

    if needs_convert and media_type not in _SUPPORTED_TYPES:
        logger.info("Converting %s to JPEG for vision API", media_type)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue(), "image/jpeg"


def scan_receipt(image_data: bytes, media_type: str) -> dict:
    """Extract data from a receipt photo, including a category."""
    image_data, media_type = _ensure_jpeg(image_data, media_type)

    prompt = (
        "Extract data from this receipt. Return ONLY a JSON object with: "
        '"merchant" (string or null), "date" (string ISO date YYYY-MM-DD or null — note: Finnish/European receipts use DD.MM.YYYY, e.g. 12.4.2026 means April 12 = 2026-04-12), '
        '"items" (array of {"name": string, "qty": number, "unit_price": float, "amount": float}), '
        '"total" (float), '
        '"category" (string, Title Case - prefer these: Groceries, Eating Out, Transport, Entertainment, '
        "Health, Utilities, Shopping, Subscriptions, Travel, Coffee, Household, Rent, Car, "
        "Investments, Insurance, Gifts, Education, Other. "
        'Use "Eating Out" for all restaurants/cafes/takeaway, never "Dining"). '
        "Group identical items into one entry with the correct qty. "
        "For example, 3 separate 'Taco al Pastor' at 1.00 each becomes "
        '{"name": "Taco al Pastor", "qty": 3, "unit_price": 1.00, "amount": 3.00}. '
        "amount = qty * unit_price. The sum of all item amounts should equal the total. "
        "On Finnish receipts, an item line (name + total price) is often followed by a sub-line "
        "showing the quantity and unit price, e.g. '2 kpl x 1.49' or '3 kpl a 2.00' — "
        "use those values as qty and unit_price, and the item line price as amount. "
        "A line starting with '-' or marked 'ale'/'alennus' below an item is a discount — "
        "subtract it from that item's amount (do not create a separate item for discounts). "
        "No markdown, just JSON. "
        "If the image is not a receipt, is unreadable, or data cannot be extracted, "
        "still return the JSON object with null for merchant/date/total, empty array for items, and category as 'Other'."
    )

    b64 = base64.standard_b64encode(image_data).decode("utf-8")
    try:
        response = client.chat.completions.create(
            model=SCAN_MODEL,
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
            max_tokens=2048,
        )
    except Exception as e:
        logger.exception("OpenAI API call failed for receipt scan")
        raise ValueError(_openai_error_detail(e)) from e

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()

    usage = response.usage
    input_cost = (usage.prompt_tokens / 1_000_000) * 2.50
    output_cost = (usage.completion_tokens / 1_000_000) * 10.00
    ai_cost = round(input_cost + output_cost, 6)
    logger.info(
        "Receipt scan: model=%s tokens=%d+%d cost=$%.6f",
        SCAN_MODEL, usage.prompt_tokens, usage.completion_tokens, ai_cost,
    )

    try:
        result = json.loads(raw)
        result["model"] = SCAN_MODEL
        result["ai_cost"] = ai_cost
        return result
    except json.JSONDecodeError:
        logger.error("GPT returned non-JSON for receipt scan: %s", raw[:200])
        raise ValueError(f"Could not parse receipt: {raw[:300]}")


def categorize_expense(description: str) -> str:
    """Categorize an expense description into a short category label."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    f"Categorize this expense in 1-2 words, Title Case. "
                    f"Prefer these categories: Groceries, Eating Out, Transport, Entertainment, "
                    f"Health, Utilities, Shopping, Subscriptions, Travel, Coffee, Household, "
                    f"Rent, Car, Investments, Insurance, Gifts, Education, Other. "
                    f'Use "Eating Out" for all restaurants/cafes/takeaway (never "Dining" or "Restaurant"). '
                    f"You may create a new category if none fit, but keep it Title Case and consistent. "
                    f"Reply with ONLY the category, nothing else.\n\n"
                    f"Expense: {description}"
                ),
            }],
            max_tokens=10,
        )
    except Exception as e:
        logger.exception("OpenAI API call failed for categorization")
        raise ValueError(_openai_error_detail(e)) from e
    return response.choices[0].message.content.strip().title()
