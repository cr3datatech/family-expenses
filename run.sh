#!/bin/bash
# Start Snap Expenses backend (serves API + frontend)
set -e

cd "$(dirname "$0")"

# Activate virtualenv if present
if [ -f venv/bin/activate ]; then
    source venv/bin/activate
fi

# Load environment
if [ -f .env ]; then
    set -a; source .env; set +a
fi

echo "Starting Snap Expenses on http://localhost:8090"
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8090 --reload
