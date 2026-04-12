# Receipts

AI-powered expense tracker with receipt scanning. Snap or upload a photo of your receipt and the AI extracts the merchant, items, total, and category automatically. Also supports manual entry, editing, history, monthly summaries, and full-text search.

## Features

- **Receipt scanning** — On mobile: two buttons — **Scan** (opens camera) and **Upload** (opens photo library). On desktop: a single **Upload receipt** button. AI extracts line items, merchant, total, and category.
- **Receipt archive** — The image is saved to `data/receipts/archive/` with a descriptive filename when the expense is confirmed. Cancelled scans are not archived.
- **Manual entry** — Full form matching the scan review: date, merchant, category (dropdown), line items (name × qty × unit price), total, card, note.
- **Search** — Full-text search across merchant, category, date, card, note, and line items. Results open directly in the edit modal.
- **Monthly summary** — Spending breakdown by category for the current month.
- **History** — Browse all past expenses grouped by month; click any row to edit.
- **Edit & delete** — Edit any field; delete with optional archive image removal. Delete requires confirmation and (if a receipt image exists) asks whether to remove the image too. Superuser only.
- **Configurable** — Set your own payment methods and currency via `.env`.

## Receipt archive

When an expense with a scanned receipt is saved, the image is moved from staging to `data/receipts/archive/` with a descriptive filename:

```
yyyymmdd_<category>_<merchant>_<username>.<ext>
```

Examples:
```
20260412_groceries_albert_heijn_craig.jpg
20260411_eating_out_mcdonalds_sara.jpg
20260408_coffee_starbucks_craig.jpg
```

- **`yyyymmdd`** — purchase date from the receipt (not upload timestamp)
- **`<category>`** — AI-assigned category (e.g. `groceries`, `eating_out`, `coffee`)
- **`<merchant>`** — shop name extracted from the receipt
- **`<username>`** — user who saved the expense
- Filename collisions get a counter suffix (`_2`, `_3`, …)
- If the scan is cancelled, the temporary file in `data/receipts/tmp/` is left to age out — it is never promoted to the archive

The relative path (`receipts/archive/<filename>`) is stored in `receipt_photo_path` on the expense record and shown as a clickable link in the edit modal.

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

**Login — first superuser:** The API uses cookie sessions (`/api/auth/*`). When the **`users` table is empty**, the app creates the first admin from environment variables on startup (then restart after setting them):

```bash
SNAP_BOOTSTRAP_ADMIN_USER=yourname
SNAP_BOOTSTRAP_ADMIN_PASSWORD=your-strong-password
```

Uncomment or add these in `.env`, restart `./run.sh`, then sign in on the web UI with that username and password. After that, you can create other users under **Users** (superuser only). Existing databases upgraded from older versions get a `user_id` column on expenses; unattributed rows are assigned to the first user in the table.

**Production:** Set `SNAP_COOKIE_SECURE=1` when serving over HTTPS so session cookies are not sent on plain HTTP.

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
- If you see **"Address already in use"** on 8090, stop the other process using that port or pick another port by changing `run.sh` and the URL accordingly.

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
| `OPENAI_API_KEY` | (required) | Your OpenAI API key. **Restricted keys** must include permission to call models (e.g. scope `model.request`); otherwise scans return 401. Prefer a normal secret key or edit the key's permissions in the OpenAI dashboard. |
| `SNAP_CURRENCY` | `EUR` | Default currency |
| `SNAP_CARDS` | `Credit Card,Debit Card,ePassi,Cash` (use quotes in `.env` if values contain spaces) | Payment methods (comma-separated); first item is the default in the UI |
| `SNAP_DB_PATH` | `./data/snap.db` | SQLite database file |
| `SNAP_BOOTSTRAP_ADMIN_USER` | (unset) | If `users` is empty, create this superuser on startup |
| `SNAP_BOOTSTRAP_ADMIN_PASSWORD` | (unset) | Password for bootstrap admin |
| `SNAP_SESSION_MAX_AGE_SECONDS` | `1209600` (14d) | Session cookie lifetime |
| `SNAP_COOKIE_SECURE` | `0` | Set `1` with HTTPS |

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

The app is mobile-first. On mobile, two buttons appear: **Scan** (uses `capture="environment"` to open the camera) and **Upload** (opens the photo library). On desktop a single **Upload receipt** button appears. For a home-screen shortcut: **iOS Safari** → Share → Add to Home Screen; **Android Chrome** → Menu → Add to Home Screen.

## API endpoints

Expense and user routes expect a **session cookie** from `POST /api/auth/login` (use `credentials: 'include'` in the browser).

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | JSON `username`, `password` — sets cookie |
| POST | `/api/auth/logout` | Clears session and cookie |
| GET | `/api/auth/me` | Current user or 401 |

### Users (superuser)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/` | List users |
| POST | `/api/users/` | Create user |
| PATCH | `/api/users/{id}` | Password / superuser flag |
| DELETE | `/api/users/{id}` | Delete (if no attributed expenses) |

### Expenses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses/` | All expenses (optional `year`+`month`, `card`) |
| GET | `/api/expenses/summary/{year}/{month}` | Monthly totals |
| GET | `/api/expenses/search?q=` | Full-text search across all fields |
| GET | `/api/expenses/cards` | Payment methods |
| GET | `/api/expenses/archive` | Archive file list with expense-link flags |
| POST | `/api/expenses/` | Create; moves staged receipt to archive if present |
| POST | `/api/expenses/scan` | `multipart/form-data`, field `photo`; stages image, returns AI data + `receipt_path` |
| POST | `/api/expenses/categorize` | Auto-categorize text |
| PUT | `/api/expenses/{id}` | Update (`user_id` for superuser) |
| DELETE | `/api/expenses/{id}` | Delete; `?delete_archive=true` also removes the image |
| DELETE | `/api/expenses/archive/{filename}` | Delete archive file; `?delete_expense=true` also removes the expense record |

## Project structure

```
snap-expenses/
  backend/
    app.py
    database.py
    deps.py
    models.py
    routers/auth.py
    routers/users.py
    routers/expenses.py
    services/ai.py
    services/passwords.py
  frontend/
    app/page.tsx
    app/icon.svg              # favicon
    components/PhotoCapture.tsx
    lib/api.ts
    lib/dates.ts
    next.config.ts            # static export → out/
  frontend/out/               # produced by `npm run build` (not always in git)
  data/
    snap.db                   # SQLite database (created at runtime)
    receipts/
      tmp/                    # staging area for scanned images (pre-confirmation)
      archive/                # confirmed receipt images (created at runtime)
  .env.example
  .python-version             # 3.12.3 for pyenv
  requirements.txt
  run.sh
```
