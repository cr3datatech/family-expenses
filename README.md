# Snap Expenses

AI-powered expense tracker with receipt scanning. Snap a photo of your receipt and the AI extracts the merchant, items, and total automatically. Also supports manual entry, editing, history, and monthly summaries.

## Features

- **Receipt scanning** - Take a photo, AI extracts line items, merchant, total, and category
- **Manual entry** - Quick form with auto-categorization
- **Monthly summary** - See spending breakdown by category
- **History** - Browse all past expenses grouped by month
- **Edit & delete** - Modify or remove any expense
- **Configurable** - Set your own payment methods and currency

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/snap-expenses.git
cd snap-expenses

# Backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
npm run build
cd ..
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
```

**Getting an OpenAI API key:**
1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to API Keys and create a new key
4. Copy it into your `.env` file

The receipt scanning uses GPT-4o-mini which costs roughly $0.01-0.02 per scan.

### 3. Run

```bash
chmod +x run.sh
./run.sh
```

Or manually:

```bash
source venv/bin/activate
source .env
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8090
```

Open [http://localhost:8090](http://localhost:8090) in your browser.

## Configuration

All settings are in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key |
| `SNAP_CURRENCY` | `EUR` | Default currency |
| `SNAP_CARDS` | `Cash,Debit Card,Credit Card` | Payment methods (comma-separated) |
| `SNAP_DB_PATH` | `./data/snap.db` | Database file location |

### Custom payment methods

Set `SNAP_CARDS` in your `.env` to your own cards:

```
SNAP_CARDS=My Visa,Joint Account,Cash,Revolut
```

## Tech Stack

- **Backend:** Python, FastAPI, SQLite
- **Frontend:** Next.js, React, Tailwind CSS
- **AI:** OpenAI GPT-4o-mini (vision for receipts, text for categorization)

## Mobile Use

The app is designed mobile-first. On your phone, the "Scan a receipt" button opens your camera directly. For the best experience, add it to your home screen:

- **iOS Safari:** Share > Add to Home Screen
- **Android Chrome:** Menu > Add to Home Screen

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses/` | List expenses (optional: `year`, `month`, `card` params) |
| GET | `/api/expenses/summary/{year}/{month}` | Monthly summary |
| GET | `/api/expenses/cards` | Get configured payment methods |
| POST | `/api/expenses/` | Create expense |
| POST | `/api/expenses/scan` | Scan receipt photo |
| POST | `/api/expenses/categorize` | Auto-categorize description |
| PUT | `/api/expenses/{id}` | Update expense |
| DELETE | `/api/expenses/{id}` | Delete expense |

## Project Structure

```
snap-expenses/
  backend/
    app.py              # FastAPI server
    database.py         # SQLite setup
    models.py           # Data models
    routers/expenses.py # API endpoints
    services/ai.py      # OpenAI receipt scanning
  frontend/
    app/page.tsx        # Main UI
    components/         # Modal, PhotoCapture, Toast
    lib/api.ts          # API client
  data/                 # Database + receipt photos (auto-created)
  .env.example          # Configuration template
  requirements.txt      # Python dependencies
  run.sh                # Start script
```
