# Snap Expenses

AI-powered expense tracker with receipt scanning. Snap a photo of your receipt and the AI extracts the merchant, items, total, and category automatically. Also supports manual entry, editing, history, and monthly summaries.

## Features

- **Receipt scanning** - Take a photo, AI extracts line items, merchant, total, and category
- **Manual entry** - Quick form with auto-categorization
- **Monthly summary** - See spending breakdown by category
- **History** - Browse all past expenses grouped by month
- **Edit & delete** - Modify or remove any expense
- **Configurable** - Set your own payment methods and currency

## Setup and run (exact steps)

These are the steps that get the app running locally: backend venv + `requirements.txt`, a **built** frontend (`frontend/out`), a filled-in `.env`, then `run.sh`.

### Prerequisites

- **Git**
- **Python 3.12.3** (recommended; matches many production servers). This repo includes [`.python-version`](.python-version) for [pyenv](https://github.com/pyenv/pyenv): install with `pyenv install 3.12.3`, then in the project directory pyenv will use 3.12.3 automatically. You can also use another **3.12.x** (e.g. Homebrew `python@3.12`) as long as `python3 --version` shows 3.12 before you create the venv.
- **Node.js** and **npm** (for the frontend build)

### 1. Clone and enter the project

```bash
git clone <your-repository-url>
cd snap-expenses
```

Ensure Python 3.12 is active (e.g. `python3 --version` → `Python 3.12.x`).

### 2. Backend: virtualenv and Python dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

On **Windows** (PowerShell): `venv\Scripts\activate` instead of `source venv/bin/activate`.

### 3. Frontend: install packages and build static files

The server serves the UI from `frontend/out` (Next.js static export). You must run a build at least once.

```bash
cd frontend
npm install
npm run build
cd ..
```

After you change frontend code, run `npm run build` again before expecting updates in the browser.

### 4. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and set your key:

```bash
OPENAI_API_KEY=sk-...your-real-key...
```

**Important:** If `SNAP_CARDS` includes spaces, keep the value in **double quotes** (see `.env.example`). Otherwise `run.sh` may fail when sourcing `.env` with errors like `command not found`.

**OpenAI API key:** [platform.openai.com](https://platform.openai.com) → API keys → create and paste into `.env`. Receipt scanning uses GPT-4o-mini (roughly $0.01–0.02 per scan).

**Optional — HEIC (iPhone) photos:** For reliable HEIC support, install in the same venv: `pip install pillow-heif`.

### 5. Start the application

From the **project root**, with the venv activated:

```bash
chmod +x run.sh
./run.sh
```

This loads `.env`, then starts Uvicorn with `--reload` on port **8090**.

Open **[http://localhost:8090](http://localhost:8090)**.

- If the UI is missing but the API works, confirm `frontend/out` exists (step 3).
- API browser: **[http://localhost:8090/docs](http://localhost:8090/docs)**.
- If you see **“Address already in use”** on 8090, stop the other process using that port or pick another port by changing `run.sh` and the URL accordingly.

**Manual start** (equivalent to activating the venv and then running `run.sh`):

```bash
source venv/bin/activate
set -a
source .env
set +a
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8090 --reload
```

### Checklist

| # | What to run |
|---|-------------|
| 1 | `python3 -m venv venv` → `source venv/bin/activate` → `pip install -r requirements.txt` |
| 2 | `cd frontend` → `npm install` → `npm run build` → `cd ..` |
| 3 | `cp .env.example .env` → edit `OPENAI_API_KEY` (quote `SNAP_CARDS` if needed) |
| 4 | `source venv/bin/activate` → `./run.sh` → open `http://localhost:8090` |

## Configuration

All settings are in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | Your OpenAI API key |
| `SNAP_CURRENCY` | `EUR` | Default currency |
| `SNAP_CARDS` | `Cash,Debit Card,Credit Card` (use quotes in `.env` if values contain spaces) | Payment methods (comma-separated) |
| `SNAP_DB_PATH` | `./data/snap.db` | SQLite database file |

### Custom payment methods

Example:

```bash
SNAP_CARDS="My Visa,Joint Account,Cash,Revolut"
```

## GitHub SSH setup

Push and pull from GitHub using SSH so you never have to enter a password.

### 1. Generate an SSH key (skip if you already have one)

```bash
ssh-keygen -t ed25519 -C "your@email.com"
```

Accept the default path (`~/.ssh/id_ed25519`). Set a passphrase or leave it blank.

### 2. Copy the public key

```bash
cat ~/.ssh/id_ed25519.pub
```

Copy the entire output line.

### 3. Add the key to GitHub

1. Go to **GitHub → Settings → SSH and GPG keys → New SSH key**
2. Give it a title (e.g. `my-server`) and paste the public key
3. Click **Add SSH key**

### 4. Test the connection

```bash
ssh -T git@github.com
```

Expected response: `Hi <username>! You've successfully authenticated...`

### 5. Use the SSH remote URL

When cloning, use the SSH form:

```bash
git clone git@github.com:<username>/<repo>.git
```

If you already cloned via HTTPS, switch the remote:

```bash
git remote set-url origin git@github.com:<username>/<repo>.git
```

Verify with:

```bash
git remote -v
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `Permission denied (publickey)` | Check the key is added to GitHub and `ssh -T git@github.com` works |
| `ssh-agent` not running | Run `eval "$(ssh-agent -s)"` then `ssh-add ~/.ssh/id_ed25519` |
| Multiple GitHub accounts | Create `~/.ssh/config` with separate `Host` aliases per account |

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLite, Uvicorn
- **Frontend:** Next.js (static export), React, Tailwind CSS
- **AI:** OpenAI GPT-4o-mini (vision for receipts, text for categorization)

## Mobile use

The app is mobile-first. “Scan a receipt” uses a file input with `capture="environment"` so supported mobile browsers can open the camera. For a home-screen shortcut: **iOS Safari** → Share → Add to Home Screen; **Android Chrome** → Menu → Add to Home Screen.

## API endpoints

Base path: `/api/expenses`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses/` | List expenses (optional filters: `year` + `month`, `card` — combinable) |
| GET | `/api/expenses/summary/{year}/{month}` | Monthly totals (`by_category`, `by_card`) |
| GET | `/api/expenses/cards` | Payment methods |
| POST | `/api/expenses/` | Create expense (JSON) |
| POST | `/api/expenses/scan` | Scan receipt — `multipart/form-data`, field name `photo` |
| POST | `/api/expenses/categorize` | JSON `{"description":"..."}` |
| PUT | `/api/expenses/{id}` | Update expense |
| DELETE | `/api/expenses/{id}` | Delete expense |

## Project structure

```
expenses/
  backend/
    app.py                 # FastAPI + static mount of frontend/out
    database.py
    models.py
    routers/expenses.py
    services/ai.py
  frontend/
    app/page.tsx
    components/
    lib/api.ts
    lib/dates.ts
    next.config.ts         # static export → out/
  frontend/out/            # produced by `npm run build` (not always in git)
  data/
    snap.db                # SQLite database (created at runtime)
    receipts/              # uploaded receipt photos (created at runtime)
  .env.example
  .python-version          # 3.12.3 for pyenv
  requirements.txt
  run.sh
```
