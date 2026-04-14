# Family Expenses

AI-powered expense tracker with receipt scanning. Snap or upload a photo of your receipt and the AI extracts the merchant, items, total, and category automatically. Also supports manual entry, editing, analytics, personal expense tracking, and full-text search.

## Features

- **Receipt scanning** — On mobile: two buttons — **Scan** (opens camera) and **Upload** (opens photo library). On desktop: a single **Upload receipt** button. AI extracts line items, merchant, total, and category. Finnish/European receipts (DD.MM.YYYY dates, `kpl` quantity sub-lines, `ale`/`alennus` discounts) are handled correctly.
- **Receipt archive** — The image is saved to `data/receipts/archive/` with a descriptive filename when the expense is confirmed. Cancelled scans are not archived.
- **Multiple images per expense** — Each expense can have any number of receipt images. Images are managed in a grid in the edit form: tap × to remove, **+ Add** to pick from the scanned pool, or **📷 Scan** (mobile only) to capture and attach a new photo without running AI. Removing an image from an expense makes it orphaned (it is never deleted automatically).
- **Scanned page** — Full-screen panel (menu → **Scanned**) showing every receipt image in the archive. Images are grouped into **Attached** (linked to an expense) and **Orphaned** (not linked), each sorted by month. Actions on each card: **Attach** / **Reassign** (pick any expense), **Detach** (move back to orphaned), or **Delete** (orphaned only). All changes update the UI in real time without a page refresh.
- **Upload / Scan on Scanned page** — A sticky header bar lets you add images directly to the orphaned pool. On mobile both **Upload** (file picker) and **Scan** (rear camera) are shown side-by-side; on desktop only **Upload** is shown.
- **Manual entry** — Full form matching the scan review: date, merchant, category (dropdown), line items (name × qty × unit price), total, payment type, note.
- **Shared & personal expenses** — Expenses are shared by default (split equally among sharing users). Any expense can instead be attributed to a specific user as a personal expense. When viewing shared expenses, each row shows the per-person share alongside the full total.
- **Date presets** — The front page expense list and summary can be filtered by Month / 3 months / Year / All time.
- **Search** — Full-text search across merchant, category, date, card, note, and line items. Results open directly in the edit modal.
- **Personal page** — Per-user view with date presets (month / 3 months / year / all time). Filter by personal expenses (your own or other users') and shared expenses; the "Shared among" sub-filter shows only expenses shared among all selected users. Displays a "Your share" total that divides shared expense totals by the number of sharing users.
- **All Expenses** — Full expense history across all users, grouped by month, with the same user/shared filters and "Your share" summary. Defaults to all time.
- **Edit & delete** — Edit any field (including date and attribution); delete requires confirmation. Deleting an expense never removes its receipt images — they become orphaned and remain accessible on the Scanned page. Superuser only.
- **Charts / Analytics** — Date-range overview (month / 3 months / year / all time) with spend by category (bar chart), top merchants, by-month table, filterable category list with multi-select and combined totals, and a searchable item drill-down. Categories, merchants, and months are clickable and open a drill-down list of matching expenses (each editable).
- **User management** — Superusers can create, edit (username, password, email, superuser flag), and delete users from a dedicated panel.
- **Configurable** — Set your own payment methods and currency via `.env`.

## Tech Stack

- **Backend:** Python 3.12, FastAPI, SQLite, Uvicorn
- **Frontend:** Next.js (static export), React, Tailwind CSS
- **AI:** OpenAI GPT-4o-mini (vision for receipts, text for categorization)

---

## Local setup

### Prerequisites

- **Python 3.12.x** — This repo includes [`.python-version`](.python-version) for [pyenv](https://github.com/pyenv/pyenv). Install with `pyenv install 3.12.3`, then pyenv will activate it automatically in the project directory. Alternatively use any Python 3.12.x (e.g. Homebrew `python@3.12`).
- **Node.js and npm** — for building the frontend
- **Git**

### Step 1 — Clone the repo

```bash
git clone <your-repository-url>
cd snap-expenses
```

### Step 2 — Python virtualenv and dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

On **Windows** (PowerShell): `venv\Scripts\activate` instead of `source venv/bin/activate`.

### Step 3 — Build the frontend

The backend serves the UI from `frontend/out` (Next.js static export). Build it at least once before starting the server.

```bash
cd frontend
npm install
npm run build
cd ..
```

After changing frontend code, run `npm run build` again before expecting updates in the browser.

### Step 4 — Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in at minimum:

```bash
OPENAI_API_KEY=sk-...your-real-key...
SNAP_BOOTSTRAP_ADMIN_USER=yourname
SNAP_BOOTSTRAP_ADMIN_PASSWORD=your-strong-password
SNAP_BOOTSTRAP_ADMIN_EMAIL=your@email.com
```

**OpenAI API key:** [platform.openai.com](https://platform.openai.com) → API keys → create and paste into `.env`. Receipt scanning uses GPT-4o-mini (roughly $0.01–0.02 per scan). Restricted keys must have the `model.request` scope.

**First admin:** When the `users` table is empty, the app creates the first superuser from `SNAP_BOOTSTRAP_ADMIN_USER` / `SNAP_BOOTSTRAP_ADMIN_PASSWORD` on startup. Sign in with those credentials, then create other users under **Users** (superuser only).

**Important:** If `SNAP_CARDS` includes spaces, wrap the value in double quotes in `.env` (see `.env.example`), otherwise `run.sh` will fail with `command not found` errors.

**Optional — HEIC (iPhone) photos:** `pip install pillow-heif` in the same venv.

### Step 5 — Start the app

```bash
chmod +x run.sh
./run.sh
```

Open **[http://localhost:8090](http://localhost:8090)**.

- If the UI is missing but the API works, confirm `frontend/out` exists (step 3).
- API docs: **[http://localhost:8090/docs](http://localhost:8090/docs)**.
- If port 8090 is in use, change the port in `run.sh`.

---

## Production deployment (server + public URL)

These steps take the app from running locally to being publicly accessible over HTTPS at your own domain. Complete the local setup steps above first and confirm the app works on port 8090, then follow these steps on your server.

### Step 1 — Install Apache

```bash
sudo apt update
sudo apt install apache2
```

Verify it is running:

```bash
sudo systemctl status apache2
```

### Step 2 — Enable proxy modules

```bash
sudo a2enmod proxy proxy_http
```

### Step 3 — Create a virtual host config

```bash
sudo nano /etc/apache2/sites-available/myapp.conf
```

Paste the following, replacing `yourdomain.com` with your actual domain:

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ServerAlias www.yourdomain.com

    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8090/
    ProxyPassReverse / http://127.0.0.1:8090/
</VirtualHost>
```

### Step 4 — Enable the site and reload Apache

```bash
sudo a2ensite myapp.conf
sudo systemctl reload apache2
```

### Step 5 — Verify Apache is proxying correctly

```bash
curl -H "Host: yourdomain.com" http://127.0.0.1/
```

You should see the app's HTML. If so, Apache is forwarding requests to Uvicorn correctly.

### Step 6 — Point your domain to the server (Cloudflare DNS)

In the Cloudflare dashboard → your domain → **DNS → Records**, add two A records:

| Type | Name | IPv4 address | Proxy status |
|------|------|--------------|--------------|
| A | @ | your-server-ip | Proxied (orange cloud) |
| A | www | your-server-ip | Proxied (orange cloud) |

Replace `your-server-ip` with your server's public IP address. Make sure there are no other A records pointing to a different IP — remove any stale records.

### Step 7 — Enable SSL (Cloudflare)

In the Cloudflare dashboard → your domain → **SSL/TLS**, set the encryption mode to **Flexible**.

Cloudflare handles HTTPS for visitors; traffic between Cloudflare and your server travels over HTTP on port 80.

### Step 8 — Enable secure cookies

In `.env`, set:

```bash
SNAP_COOKIE_SECURE=1
```

Then restart the app:

```bash
./run.sh
```

### Step 9 — Confirm

Once DNS propagates (a few minutes to an hour), open `https://yourdomain.com` in your browser. You should see the app served over HTTPS.

---

## Keeping the app running (optional)

By default `run.sh` runs in the foreground. To keep it running after you close your SSH session, use a process manager.

### systemd (recommended on Ubuntu/Debian)

Create `/etc/systemd/system/family-expenses.service`:

```ini
[Unit]
Description=Family Expenses
After=network.target

[Service]
WorkingDirectory=/path/to/family-expenses
EnvironmentFile=/path/to/family-expenses/.env
ExecStart=/path/to/family-expenses/venv/bin/python -m uvicorn backend.app:app --host 0.0.0.0 --port 8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Replace `/path/to/family-expenses` with the actual path to the cloned repo. Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable family-expenses
sudo systemctl start family-expenses
sudo systemctl status family-expenses
```

The app will now start automatically on boot.

---

## Configuration

All settings live in `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (required) | OpenAI API key. Restricted keys must have `model.request` scope. |
| `SNAP_CURRENCY` | `EUR` | Currency symbol shown in the UI |
| `SNAP_CARDS` | `Credit Card,Debit Card,ePassi,Cash,Payment` | Payment methods (comma-separated); first item is the default. Quote the value in `.env` if any item contains spaces. |
| `SNAP_DB_PATH` | `./data/snap.db` | SQLite database file path |
| `SNAP_BOOTSTRAP_ADMIN_USER` | (unset) | Creates this superuser on startup when the `users` table is empty |
| `SNAP_BOOTSTRAP_ADMIN_PASSWORD` | (unset) | Password for the bootstrap admin |
| `SNAP_BOOTSTRAP_ADMIN_EMAIL` | (unset) | Email for the bootstrap admin; also backfills the existing admin if email not yet set |
| `SNAP_SESSION_MAX_AGE_SECONDS` | `1209600` (14 days) | Session cookie lifetime |
| `SNAP_COOKIE_SECURE` | `0` | Set to `1` when running behind HTTPS |
| `SNAP_SCAN_MODEL` | `gpt-4o-mini` | OpenAI model used for receipt scanning |

### Custom payment methods

```bash
SNAP_CARDS="My Visa,Joint Account,Cash,Revolut"
```

---

## Receipt archive

When an expense with a scanned receipt is saved, the image is moved from staging to `data/receipts/archive/` with a descriptive filename:

```
yyyymmdd_<category>_<merchant>_<username>.<ext>
```

Examples:
```
20260412_groceries_supermarket_alice.jpg
20260411_eating_out_restaurant_bob.jpg
20260408_coffee_cafe_alice.jpg
```

- **`yyyymmdd`** — purchase date from the receipt (not upload timestamp)
- **`<category>`** — AI-assigned category (e.g. `groceries`, `eating_out`, `coffee`)
- **`<merchant>`** — shop name extracted from the receipt
- **`<username>`** — user who saved the expense
- Filename collisions get a counter suffix (`_2`, `_3`, …)
- If the scan is cancelled, the temporary file in `data/receipts/tmp/` can be deleted explicitly via the Scanned page or left to age out — it is never promoted to the archive

The relative paths (`receipts/archive/<filename>`) are stored in the `receipt_paths` JSON array on the expense record. `receipt_photo_path` is kept for backwards compatibility and always mirrors the first element of `receipt_paths`. Images are shown as a grid in the edit modal and on the Scanned page.

---

## Mobile use

The app is mobile-first. On mobile, two buttons appear: **Scan** (uses `capture="environment"` to open the camera) and **Upload** (opens the photo library). On desktop a single **Upload receipt** button appears. For a home-screen shortcut: **iOS Safari** → Share → Add to Home Screen; **Android Chrome** → Menu → Add to Home Screen.

---

## API endpoints

Expense and user routes expect a **session cookie** from `POST /api/auth/login` (use `credentials: 'include'` in the browser).

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | JSON `username`, `password` — sets cookie |
| POST | `/api/auth/logout` | Clears session and cookie |
| GET | `/api/auth/me` | Current user or 401 |

### Users (superuser only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/` | List users |
| POST | `/api/users/` | Create user |
| PATCH | `/api/users/{id}` | Update password or superuser flag |
| DELETE | `/api/users/{id}` | Delete (only if no attributed expenses) |

### Expenses

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses/` | All expenses; optional filters: `year`+`month`, `date_from`, `date_to`, `card`, `category`, `merchant`, `is_shared`, `attributed_to`, `shared_with_user` |
| GET | `/api/expenses/summary/{year}/{month}` | Monthly totals by category |
| GET | `/api/expenses/analytics` | Aggregated analytics: by category/card/merchant/month + item drill-down (`date_from`, `date_to` optional) |
| GET | `/api/expenses/search?q=` | Full-text search across all fields |
| GET | `/api/expenses/cards` | Payment methods |
| GET | `/api/expenses/archive` | Archive file list with expense-link flags |
| GET | `/api/expenses/scanned` | All archive images with attached-expense info, grouped for the Scanned page |
| POST | `/api/expenses/` | Create; moves staged receipt to archive if present |
| POST | `/api/expenses/scan` | `multipart/form-data`, field `photo`; stages image, returns AI data + `receipt_path` |
| POST | `/api/expenses/scanned/upload` | `multipart/form-data`, field `photo`; saves to archive as an orphaned image (no AI) |
| POST | `/api/expenses/categorize` | Auto-categorize text |
| GET | `/api/config` | App config (e.g. `scan_model`) |
| PUT | `/api/expenses/{id}` | Update (`user_id` for superuser) |
| PUT | `/api/expenses/{id}/images` | Replace the full image list for an expense; JSON `{ "paths": [...] }` |
| POST | `/api/expenses/{id}/images/scan` | `multipart/form-data`, field `photo`; captures and attaches a new image to the expense (no AI) |
| DELETE | `/api/expenses/{id}` | Delete expense record; images are kept and become orphaned (`?delete_archive=true` removes them) |
| DELETE | `/api/expenses/tmp/{filename}` | Delete a temporary (staged) file |
| DELETE | `/api/expenses/archive/{filename}` | Delete archive file; `?delete_expense=true` also removes the expense record |
| DELETE | `/api/expenses/scanned/orphaned` | Delete all archive images not attached to any expense |

---

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
