# AquaFlow PMS — Plumbing Contractor Management (Business OS)

A complete, self-contained web app for running a plumbing contracting business — built as a
genuine **VicTech Plumbing operating system**: income tracking, expenses & net profit,
a full sales pipeline from lead to paid, and job-level material consumption.
Built for the Kenyan market (KES, M-Pesa payments, WhatsApp-first notifications, Nairobi areas).
No build step, no external CDNs — pure HTML/CSS/JS with localStorage persistence.

## Run it

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
| **Inventory** | Stock levels, reorder alerts, cost vs retail value, movement history (received / **used on JOB-x** / damaged / count). Stock auto-deducts when invoices are created from quotes **and** when you "Record materials used" on a job (which also bills the line to the linked invoice if one exists) |
| **Maintenance Reminders** | Recurring plans per customer & equipment, due-date engine, "schedule job" prefill, WhatsApp reminder, mark-done rolls the date forward |
| **WhatsApp Notifications** | Outbox of every composed message (dispatch, quote sent, invoice, payment received, reminder, maintenance). Pre-filled `wa.me` chats — no Business API needed. Copy / mark-sent / clear. All templates editable in Settings |
| **Settings** | Business profile (**owner name** — powers the dashboard greeting), labor rates, travel fees, VAT, ref prefixes, WhatsApp templates, JSON export/import backup, demo-data reset |

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

## Data & testing

- Demo data (12 Nairobi customers, 4 technicians, **18 jobs incl. solar installs**, 6 quotes, 11 invoices, **5 leads across the funnel**, **15 expenses across 3 months**, 30 stock items incl. a full solar line, 6 maintenance plans) is seeded on first run — relative to today, so the calendar is always alive.
- **`smoke.js`** — 14 runtime tests (rendering, math, AI engine, WA links, state machine).
- **`smoke2.js`** — 11 interactive UI tests simulating real clicks through every save flow.
- **`smoke3.js`** — 8 tests for round-3 features (solar scopes, type filter, mobile sheets, tab bar).
- **`smoke4.js`** — 15 business-OS tests: P&L math, pipeline stages + next actions, lead→customer/quote/job flows, expense totals, materials stock deduction + auto-billing, breakdown consistency, customer revenue history.
- Run all: `node smoke.js && node smoke2.js && node smoke3.js && node smoke4.js` (48 tests)

## Structure

```
index.html            single-page shell
css/styles.css        design system
js/utils.js           date / money / DOM helpers
js/seed.js            demo data + AI pricing catalog
js/app.js             state, storage, modals, charts, WA helpers, line-item editor, pipeline engine
js/views/*.js         one file per module
js/main.js            bootstrap + navigation
```
