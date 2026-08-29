# AquaFlow PMS — Plumbing Contractor Management

A complete, self-contained web app for managing a plumbing contracting business.
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
| **Dashboard** | KPIs (monthly revenue, outstanding, overdue, jobs today, low stock, maintenance due), 7-day job list, 6-month revenue chart, invoice-status donut |
| **Jobs & Scheduling** | Drag-free week calendar (07:00–19:00), click empty slot to schedule, job list with search + status/**type**/technician/date filters, job detail with status workflow (Scheduled → Dispatched → In Progress → Completed), overlap/conflict detection. **10 job categories**: Repair, Installation, Maintenance, Service, Inspection, Emergency, **Solar** ☀️, Drainage, Gas, Water supply — each with an emoji tag on the calendar, lists and dashboard |
| **Technician Dispatch** | Per-technician daily load bars vs capacity, skills, one-click dispatch with crew assignment, start/complete/cancel actions, auto WhatsApp dispatch message |
| **Customers** | CRM with search, residential/commercial, outstanding balance & lifetime value per customer, job/quote/invoice/maintenance history, site notes, WhatsApp shortcut |
| **Quotations** | Line-item editor with **inventory price picker**, discounts + VAT, validity dates, status flow (Draft → Sent → Approved → Converted / Declined), quote → invoice conversion (auto-deducts stock), editable WhatsApp templates |
| **AI Estimate Assistant** | Local rules-pricing model (14 job scopes: leak repair, burst pipe, geyser install, **solar water heater 300L**, **2–3kW solar PV backup**, bathroom refit, pump install, septic jet, backflow test…). Picks labor level, urgency (×1.15/×1.4), access (×1.1/×1.15), travel zone; drafts fully explained line items at **live stock prices**, flags low/out-of-stock parts, shows confidence + assumptions. One click applies it to the quote |
| **Invoices & Payments** | Totals with VAT, payment ledger (M-Pesa / cash / bank / cheque), partial payments, auto status (Open / Partial / Paid / Overdue), aging buckets (0–30 / 31–60 / 60+ days), 30-day collections, one-click WhatsApp invoice + payment reminder |
| **Inventory** | Stock levels, reorder alerts, cost vs retail value, movement history (received / used / damaged / count), linked to jobs & invoice creation (auto stock deduction) |
| **Maintenance Reminders** | Recurring plans per customer & equipment (geyser, boiler, pump, backflow, septic, gutters…), due-date engine, "schedule job" prefill, WhatsApp reminder, mark-done rolls the date forward |
| **WhatsApp Notifications** | Outbox of every composed message (dispatch, quote sent, invoice, payment received, reminder, maintenance). Opens pre-filled `wa.me` chats — no Business API needed. Copy / mark-sent / clear. All templates editable in Settings |
| **Settings** | Business profile, labor rates, travel fees, VAT, ref prefixes, all WhatsApp templates, JSON export/import backup, demo-data reset |

## Responsive UI/UX

**Desktop (≥901px)** — fixed sidebar navigation, 2/3-column layouts, hover states, soft card shadows, full-width tables, print-ready invoices (🖨 Print on any invoice → clean A4 layout with business header).

**Mobile (≤900px)** — purpose-built, not just scaled:
- **Bottom tab bar**: Home · Jobs · Dispatch · Customers · More (safe-area aware, frosted glass)
- **More sheet**: slide-up panel with live badges (sent quotes, overdue invoices, low stock, maintenance due, unsent WA) + quick actions (New job / Quote / Invoice / Collect)
- **Top "+"** opens a create sheet (Schedule job / AI quotation / Invoice / Collect payment)
- **Full-screen bottom-sheet modals** with 44px+ tap targets and full-width footer buttons
- **Responsive tables**: secondary columns collapse at 820px/560px (customer area, invoice issued date, stock cost/value, etc.)
- **Calendar**: defaults to the list view on phones (calendar stays available with horizontal scroll), compact blocks
- 2-up KPI grid, stacked forms, larger touch targets for checkboxes

## Data & testing

- Demo data (10 Nairobi customers, 4 technicians, **15 jobs incl. a solar install**, 6 quotes, 9 invoices, 30 stock items incl. a full solar line, 6 maintenance plans) is seeded on first run — relative to today, so the calendar is always alive.
- **`smoke.js`** — 14 runtime tests (rendering, math, AI engine, WA links, state machine).
- **`smoke2.js`** — 11 interactive UI tests simulating real clicks through every save flow.
- **`smoke3.js`** — 8 tests for round-3 features (solar scopes, type filter, mobile sheets, tab bar).
- Run all: `node smoke.js && node smoke2.js && node smoke3.js`

## Data & testing

- Demo data (10 Nairobi customers, 4 technicians, 14 jobs, 5 quotes, 9 invoices, 22 stock items, 5 maintenance plans) is seeded on first run — relative to today, so the calendar is always alive.
- **`smoke.js`** — 14 runtime tests (rendering, math, AI engine, WA links, state machine).
- **`smoke2.js`** — 11 interactive UI tests simulating real clicks through every save flow.
- Run both: `node smoke.js && node smoke2.js`

## Structure

```
index.html            single-page shell
css/styles.css        design system
js/utils.js           date / money / DOM helpers
js/seed.js            demo data + AI pricing catalog
js/app.js             state, storage, modals, charts, WA helpers, line-item editor
js/views/*.js         one file per module
js/main.js            bootstrap + navigation
```
