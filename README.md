# AquaFlow — Plumbing Business Management System

**Manage jobs. Track materials. Get paid. Know your profit.**

A complete, **offline-first** plumbing business OS — genuine VicTech Plumbing operating system:
income tracking, expenses & net profit, a full sales pipeline from lead to paid,
job-level material consumption, and **multi-device sync that never touches the cloud**.

Built for the Kenyan market (KES, M-Pesa payments, WhatsApp-first notifications, Nairobi areas).
No external CDNs, no build step, no backend.

## How the offline architecture works

```
            ┌─────────────────┐
            │   AquaFlow PMS  │
            │   Database      │   (local on every device — works with no internet)
            └────────┬────────┘
                     │  sync = merge (per-record, newest edit wins, deletions tracked)
        ┌────────────┴────────────┐
        │                         │
  Windows .EXE                  Phone
  (desktop app + LAN            (PWA installed from the PC's
   sync server on port 8484)     Wi-Fi address, cached for offline)
```

- **Every device owns a complete local database** — record payments on the PC with no internet,
  schedule jobs from the phone at a customer's house with no signal. Data never leaves the device
  until you sync.
- **Wi-Fi sync (primary):** the desktop app runs a built-in server (`Sync & Devices` page →
  "Share this PC on your Wi-Fi"). Phones on the same network open that address, install the
  app to the home screen, and hit **Sync** — a merge that unions both sides, lets the newest
  edit of each record win, tracks deletions, and never resets reference numbers.
- **Offline transfer (fallback):** export a single `.json` sync file, move it over WhatsApp /
  USB / SD card, import on the other device. Importing merges — it never wipes.
- **The Vercel website is only a mirror** for convenience — it is not where your data lives.
- Desktop database file: `%APPDATA%/aquaflow-pms/db.json` (shown on the Sync page → "Show data file").

### Building the Windows app

```bash
npm install
npm run build:win        # → dist/AquaFlow PMS Setup x.y.z.exe (NSIS installer)
```

(On Windows this works natively. Cross-building from Linux needs wine for the uninstaller step.)

## Run the web version

```bash
cd plumbpro
python3 -m http.server 8080
# open http://localhost:8080
```

Or open `index.html` directly in a browser (data persists via localStorage).

## Modules

| Module | What it does |
|---|---|
| **Dashboard (Business OS)** | Personalized greeting ("Good morning, VICTOR" — owner name set in Settings), today/this week/this month income, **P&L KPIs: Revenue, Expenses, Net profit, Outstanding, Jobs this month**, 4 charts — Revenue vs Expenses (6 months, grouped bars), Jobs completed, **Most profitable job types**, Outstanding top-debtors with one-tap WhatsApp nudge. Plus quick actions, 7-day job list, low stock, maintenance due |
| **Leads & Pipeline** | Kanban board of the sales funnel: **New → Contacted → Quoted → Won / Lost**. Each lead: service, location, budget, source, notes. One-click actions: **create customer** (dedupes by phone), **create quotation** (prefilled), **schedule job** (lead auto-marks Won + jobRef), mark Won/Lost, WhatsApp link. Open-value stats |
| **Jobs & Scheduling** | Week calendar (07:00–19:00), click empty slot to schedule, list with search + status/**type**/technician/date filters, **Pipeline tab** with a 6-stage stepper per job (Quote → Scheduled → In Progress → Completed → Invoiced → Paid) and a **Next action** button (Create quote / Assign crew / Dispatch / Start / Complete / Create invoice / Collect / ✓ Paid). Job detail shows the pipeline stepper, a **Job income card** (Labour / Materials / Transport + VAT, paid, balance) and **"Record materials used"** (see Inventory) |
| **Technician Dispatch** | Per-technician daily load bars vs capacity, skills, one-click dispatch with crew assignment, start/complete/cancel actions, auto WhatsApp dispatch message |
| **Customers** | CRM with search, residential/commercial, per-customer **Total jobs, Total revenue, Lifetime paid, Outstanding, Last job**, full job/quote/invoice/maintenance history, site notes, WhatsApp shortcut |
| **Quotations** | Line-item editor (Labor / Material / **Transport**) with inventory price picker, discounts + VAT, validity dates, status flow (Draft → Sent → Approved → Converted / Declined), quote → invoice conversion (auto-deducts stock), editable WhatsApp templates |
| **AI Estimate Assistant** | Local rules-pricing model (14 job scopes incl. **solar water heater 300L** and **2–3kW solar PV backup**). Labor level, urgency (×1.15/×1.4), access (×1.1/×1.15), travel zone; drafts fully explained line items at **live stock prices**, flags low/out-of-stock parts, confidence + assumptions. One click applies to the quote |
| **Invoices & Payments** | Totals with VAT, **Income breakdown** (Labour / Materials / Transport), payment ledger (M-Pesa / cash / bank), partial payments, auto status (Open / Partial / Paid / Overdue), aging buckets, one-click WhatsApp invoice + payment reminder |
| **Expenses** | The P&L side: record expenses by category (Materials purchase, Fuel, Vehicle, Tools, Subcontractor, Shop rent, Utilities, Other), month KPIs (this month, last month, all-time, **margin %** vs revenue collected), category breakdown, full history |
| **Reports** | Period-based performance (today / week / month / year / all time): revenue collected, expenses, **net profit**, outstanding, quotations pending, jobs completed/active, **new vs returning customers**, revenue-vs-expenses 6-month chart, **most-used materials** (from stock-billed lines), top outstanding debtors |
| **Reminders** | Notification centre (bell in the header, live count): payments overdue, invoices due within 3 days, jobs today & tomorrow, **quotations awaiting approval > 3 days**, maintenance due — each item jumps straight to the record |
| **Job workspace** | Per-job pipeline stepper, income breakdown, **activity timeline** (auto-logged status changes + manual notes), **site visit** recording, **job photos** (Before / Progress / After, compressed & stored on the job), materials used with auto stock deduction + billing, linked quote/invoice, WhatsApp confirm |
| **Documents (PDF)** | Professional **quotation & invoice documents** with business header + logo, line items, VAT totals, paid/balance, signatures — on-screen preview and **Print / Save as PDF**, fully offline (no external PDF library) |
| **Inventory** | Stock levels, reorder alerts, cost vs retail value, movement history (received / **used on JOB-x** / damaged / count). Stock auto-deducts when invoices are created from quotes **and** when you "Record materials used" on a job (which also bills the line to the linked invoice if one exists) |
| **Maintenance Reminders** | Recurring plans per customer & equipment, due-date engine, "schedule job" prefill, WhatsApp reminder, mark-done rolls the date forward |
| **WhatsApp Notifications** | Outbox of every composed message (dispatch, quote sent, invoice, payment received, reminder, maintenance). Pre-filled `wa.me` chats — no Business API needed. Copy / mark-sent / clear. All templates editable in Settings |
| **Sync & Devices** | Offline-first multi-device sync: Wi-Fi sync with any other AquaFlow device (pull / full-pull / full-push / merge), the desktop's built-in LAN sharing server (phones install from it), offline file export/import (merge, never wipe), per-device record counts, last-change/last-sync status |
| **Settings** | Business profile (**owner name** — powers the dashboard greeting), **logo** (appears on PDF documents), labor rates, travel fees, VAT, ref prefixes, payment terms, WhatsApp templates, JSON export/import backup, **automatic backups** (3 rolling snapshots, restore), demo-data reset, **Team** (add/edit/enable/disable/delete technicians), **Account & security** (change password / security question, sign out, switch or delete local accounts) |
| **Sign in / Sign up** | Local (offline) accounts with per-account data isolation, PBKDF2-hashed passwords, guest mode, and forgot-password via security question — see [Accounts & security](#accounts--security-offline) |

### The full pipeline

```
Lead → Quotation → Scheduled → In Progress → Completed → Invoiced → Paid
```

- **Leads** are worked on the Leads board (New/Contacted/Quoted/Won/Lost)
- **Jobs** then flow through the 6-stage stepper — the Pipeline tab always shows the *next action* for every job
- Invoiced jobs pull their **Labour / Materials / Transport** breakdown from line-item kinds
- Payments close the loop: balance ≤ 0 → **Paid**

## Responsive UI/UX

**Desktop (≥901px)** — fixed sidebar navigation, 2/3-column layouts, hover states, soft card shadows, full-width tables, print-ready invoices (🖨 Print on any invoice → clean A4 layout with business header).

**Mobile (≤900px)** — purpose-built, not just scaled:
- **Bottom tab bar**: Home · Jobs · Dispatch · Customers · More (safe-area aware, frosted glass)
- **More sheet**: slide-up panel with live badges (new leads, sent quotes, overdue invoices, low stock, maintenance due, unsent WA) + quick actions
- **Top "+"** opens a create sheet (Schedule job / New lead / AI quotation / Record expense / Invoice / Collect payment)
- **Full-screen bottom-sheet modals** with 44px+ tap targets and full-width footer buttons
- **Responsive tables & kanban**: columns collapse at 820px/560px; pipeline stepper hides stage labels except the current one
- 2-up KPI grid, stacked forms, larger touch targets for checkboxes

## Accounts & security (offline)

The app is 100% offline, so accounts are **local to the device** — no email is ever sent, nothing leaves the device.

- **Sign up / sign in** — create an account with name + email + password, or continue as **guest** (the original local demo workspace, unchanged).
- **Per-account data isolation** — each account owns its own database (`aquaflow_pms_v1:<email>` in localStorage). Guest keeps the legacy `aquaflow_pms_v1` key. Accounts never see each other's data. New accounts start with a clean business workspace (zeroed counters, default templates & KES rates, no demo data) — plus a Team section in Settings so you can add your technicians before dispatching.
- **Password storage** — PBKDF2-SHA256 (40,000 iterations, per-account random salt), implemented in pure JS (`js/auth.js`) and cross-verified against `node:crypto` in tests. Only salt + hash are stored; the password is never saved.
- **Forgot password** — answer the **security question** you chose at sign-up to set a new password, entirely on-device. (A real emailed reset link would require a backend, which breaks the fully-offline design — the security-question flow is the offline-correct equivalent.)
- **Session** — remembered per device until you sign out (Settings → Account & security, where you can also change your password, change your security question, or delete a local account and its data).

## Data & testing

- Demo data (12 Nairobi customers, 4 technicians, **18 jobs incl. solar installs**, 6 quotes, 11 invoices, **5 leads across the funnel**, **15 expenses across 3 months**, 30 stock items incl. a full solar line, 6 maintenance plans) is seeded on first run — relative to today, so the calendar is always alive. New accounts get a clean workspace instead.
- **`smoke.js`** — 14 runtime tests (rendering, math, AI engine, WA links, state machine).
- **`smoke2.js`** — 11 interactive UI tests simulating real clicks through every save flow.
- **`smoke3.js`** — 8 tests for round-3 features (solar scopes, type filter, mobile sheets, tab bar).
- **`smoke4.js`** — 15 business-OS tests: P&L math, pipeline stages + next actions, lead→customer/quote/job flows, expense totals, materials stock deduction + auto-billing, breakdown consistency, customer revenue history.
- **`smoke5.js`** — 19 sync/offline tests: merge engine (union, last-write-wins, tombstones, counters), live LAN server (health, sync round-trip, static + PWA serving, state persistence), in-app stamping.
- **`smoke6.js`** — 17 accounts tests: SHA-256/PBKDF2 vs `node:crypto` (FIPS vectors + random salts), sign-up, wrong-password, forgot-password via security question, password change, per-account data isolation, delete account, guest key, and full jsdom UI flows (auth screen → create → app → sign out → forgot → reset → sign in).
- **`smoke7.js`** — 22 business-OS tests: PDF document content (quotation + invoice + logo), reports KPI math + period switching, reminders engine + bell, job timeline (auto + manual + site visit), job photos, quotation duplicate / convert-to-job / PDF, automatic backups + restore, quick-add sheet, FAB, settings additions.
- Run all: `NODE_PATH=/usr/local/node_modules node smoke.js && … && node smoke7.js` (103 tests)

## Structure

```
index.html            single-page shell (+ PWA manifest link, SW registration)
manifest.json         PWA manifest (phone "Add to Home screen")
sw.js                 service worker — offline app shell for the phone
icons/                app icons (192/512)
css/styles.css        design system
js/utils.js           date / money / DOM helpers
js/seed.js            demo data + AI pricing catalog
js/sync.js            sync core: merge engine (UMD — browser + Node)
js/auth.js            accounts: pure-JS SHA-256/HMAC/PBKDF2, local account store, per-profile storage, auth screen
js/app.js             state, storage, modals, charts, WA helpers, line-item editor, pipeline engine, reminders, job timeline, auto-backups, change-stamping
js/pdf.js             professional quotation/invoice documents (screen preview + Print/Save-as-PDF, offline)
js/lan-server.cjs     LAN sync server (pure Node — used by the desktop app, tested directly)
js/views/*.js         one file per module (incl. sync.js = Sync & Devices)
js/main.js            bootstrap + navigation + desktop bridge
electron/main.cjs     Electron main process (window, IPC, LAN server lifecycle, db.json backup)
electron/preload.cjs  context-isolated bridge to the app
package.json          app + electron-builder config (npm run build:win)
```
