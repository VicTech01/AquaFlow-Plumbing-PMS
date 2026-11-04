# VicTech Design System — v2.0

> The visual and interaction language for VicTech PMS — Plumbing & Solar Solutions.
> One rule above all others: **the interface must never be the reason a plumber
> loses money, misses a job or distrusts a number.** Everything below exists to
> make the business state legible in under ten seconds, on a laptop in the
> office and on a phone in a trench.

**Files**

| File | Role |
|---|---|
| `css/tokens.css` | Design tokens — colour, type, space, radius, elevation, motion, layering. Themes live here. Draws nothing. |
| `css/styles.css` | Components — consumes tokens only. No hardcoded colours. |
| `js/app.js` → *charts* | Chart primitives (`areaChart`, `barChart`, `groupedBar`, `donut`, `sparkline`, `hbarList`) + the icon set. |
| `js/main.js` | Shell — grouped navigation, topbar, theme, global search (⌘K), keyboard shortcuts. |
| `smoke10.js` | Regression suite that guards this system (tokens resolve, nav complete, search works, charts theme-aware, dashboard IA intact). |

No frameworks, no build step, no CDN. The app is offline-first and stays that way:
every token is a CSS custom property, every chart is hand-drawn SVG, every icon is
an inline path.

---

## Brand

**VicTech Plumbing & Solar Solutions** — a plumbing business that installs and services
solar. The identity carries both trades:

| Element | Form | Where |
|---|---|---|
| Mark | Aqua-gradient rounded square, **white water droplet** (plumbing) + **amber sun** (solar), rays round-capped | app icons 192/512, favicon |
| Wordmark | `VicTech` — extrabold, tight tracking | sidebar logo, auth screen, profile chip |
| Descriptor | `PLUMBING & SOLAR` — 11 px uppercase, tracked, muted | sidebar under the wordmark |
| Full name | `VicTech Plumbing and Solar Solutions` | manifest `name`, documents, settings, new-account default |
| Product name | `VicTech PMS` | window title, installer, npm/LAN identifiers, print footer |

Rules:

* The **droplet alone** is the in-app glyph (favicons, `.logo-mark`, empty states) — at 16–24 px
  the sun would vanish, so solar lives in the wordmark at those sizes. The droplet + sun
  lockup only appears at ≥ 48 px.
* Wordmark is **title-case `VicTech`** in running UI; uppercase `VICTECH` is reserved for
  printed/legal contexts.
* The amber sun (`#f59e0b` / `#fbbf24`) is the *only* warm accent the brand may use outside
  status colours, and never as a data colour.
* The stored business name spells out **"and"** (`VicTech Plumbing and Solar Solutions`) because it
  is a legal name that gets HTML-escaped onto every quotation and invoice; the ampersand form is
  reserved for compact descriptors (sidebar, page titles) where space is tight.
* Identifiers that users never see — storage keys, the desktop bridge, install ids — keep
  their original values so upgrades never orphan data (documented in the README).

---

## 1. Principles

1. **Decisions before data.** Every screen answers a question before it shows a
   table. The dashboard leads with money, then what needs attention, then work,
   sales and stock.
2. **Numbers are the interface.** Currency, counts and dates get tabular
   numerals, consistent alignment and a fixed scale. A number that shifts width
   while you read it is a number you misread.
3. **One accent, earned semantics.** Aqua is the brand and the only "interactive"
   colour. Green / amber / red / violet are reserved for meaning — never decoration.
4. **Density with rhythm.** This is a business tool: 14 px body, 4 px space grid,
   38 px controls — but never cramped. Whitespace is structural, not decorative.
5. **Phone-first honesty.** The same components must survive 360 px, a thumb, and
   direct sunlight. Touch targets ≥ 44 px, tables keep their first column, modals
   become sheets.
6. **Never lose data to the UI.** Destructive actions confirm, financial changes
   are visible in the timeline, and the printed document is identical in both themes.

---

## 2. Colour

### 2.1 Primitives (fixed — never themed)

**Aqua** (brand: water, trust, precision)

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#f0f9ff` | `#e0f2fe` | `#bae6fd` | `#7dd3fc` | `#38bdf8` | `#0ea5e9` | `#0284c7` | `#0369a1` | `#075985` | `#0c4a6e` | `#082f49` |

**Abyss** (brand-carrying dark surfaces: sidebar, auth, documents)
`#1d4260 · #16324a · #10263a · #0b1b2b · #071320 · #040d17`

**Neutral** (cool slate, tuned for data-dense UI)

| 0 | 25 | 50 | 75 | 100 | 150 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `#ffffff` | `#fcfdff` | `#f7f9fc` | `#f3f6fb` | `#eef2f7` | `#e7edf5` | `#dde5ef` | `#c8d3e1` | `#9fadbf` | `#75859c` | `#55657f` | `#3d4c63` | `#26344a` | `#16233a` | `#0d1829` |

**Semantic hues** — green `#059669`, amber `#d97706`, red `#dc2626`,
violet `#7c3aed` (AI), indigo `#4f46e5` (scheduled), teal `#0d9488` (materials),
WhatsApp `#25d366`. Each ships with 50/100/200 tints and a 700/800 ink.

### 2.2 Semantic layer (the only names components may use)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f3f6fb` | `#071320` | app canvas (+ a faint aqua radial tint) |
| `--surface` | `#ffffff` | `#0d1e2e` | cards, tables, modals |
| `--surface-2` | `#f7f9fc` | `#112639` | soft/inset panels (`.card.soft`) |
| `--surface-3` | `#eef2f7` | `#16304a` | control fills, tabs track, bars |
| `--border` | `#dde5ef` | `#1d3550` | default 1 px edge |
| `--border-soft` | `#eef2f7` | `#16293d` | row separators, dashed rules |
| `--text` / `--text-2` / `--text-3` | `#0d1829` / `#55657f` / `#75859c` | `#e8eef7` / `#a2b4c9` / `#7b8ea6` | primary / secondary / faint |
| `--accent` | `#0369a1` | `#38bdf8` | links, active nav, primary buttons |
| `--ok` `--warn` `--bad` `--ai` | green · amber · red · violet | lightened one step | status only |
| `--ring` | `rgba(3,105,161,.30)` | `rgba(56,189,248,.40)` | focus |
| `--chart-1…6` | aqua, red, teal, violet, amber, indigo | same, brightened | series colours |

Every status colour also has `-soft` (chip fill), `-softer` (panel fill),
`-strong` (ink) and `-border` variants, so a chip never needs an inline hex.

> **Legacy aliases.** `--ink`, `--muted`, `--line`, `--panel`, `--red`, `--green`,
> `--amber`, `--violet`, `--accent-d` are kept as aliases of the semantic layer
> because inline styles in `js/` reference them. Do not remove them; do not add
> new usages — use the semantic name.

### 2.3 Theming

* `html[data-theme="light" | "dark"]` swaps the semantic layer only.
* No attribute → the OS preference wins (`prefers-color-scheme`).
* The user's explicit choice persists in `localStorage['aquaflow_theme_v1']` (the key name
  is retained from the original build so saved preferences survive upgrades) and
  is applied by an inline script in `<head>` **before first paint** (no flash).
* Entry points: sidebar moon/sun button, profile menu segmented control, the More
  sheet on mobile, and `Ctrl+D`.
* **Printed documents never follow the theme.** `.doc-sheet` keeps literal white
  paper / navy ink so a quote printed from dark mode is identical to one printed
  from light mode.

Contrast targets: body text ≥ 7:1, secondary ≥ 4.5:1, chips ≥ 4.5:1 on their tint.

---

## 3. Typography

System stack only (offline-first — no webfont download):

```
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI",
             Inter, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif
--font-mono: ui-monospace, SFMono-Regular, "SF Mono", "Cascadia Mono", Menlo, Consolas
```

| Token | px | Weight | Use |
|---|---|---|---|
| `--fs-2xs` | 11 | 700 | uppercase micro labels (`.eyebrow`, table headers, KPI labels) |
| `--fs-xs` | 12 | 400–600 | secondary text, chips, hints, table subrows |
| `--fs-sm` | 13 | 400–600 | dense table body, form controls |
| `--fs-base` | 14 | 400 | **app default** (`body`) |
| `--fs-md` | 15 | 700 | card titles (`h3`), modal titles |
| `--fs-lg` | 17 | 800 | topbar page title, stat values |
| `--fs-xl` | 20 | 800 | `h2.page`, hero greeting |
| `--fs-2xl` | 24 | 800 | KPI value |
| `--fs-3xl` | 30 | 800 | hero number (rare) |

Rules:

* **No fractional font sizes.** v1.6 used 10.5 / 11.5 / 12.5 / 13.5 / 15.5 px;
  every one of them now maps to a scale step.
* Line heights: `1.2` display · `1.35` snug · `1.5` body · `1.65` relaxed.
* Tracking: `-0.015em` on display/numbers, `+0.07em` on uppercase micro labels.
* **All money, counts, refs and dates use `font-variant-numeric: tabular-nums
  lining-nums`** (`.num`, `.tnum`, `.kpi .val`, `.stat-v`, table `.num` cells).
  Document refs may use `.mono`.
* Type utilities: `.t-2xs … .t-3xl`, `.eyebrow`, `.h-page`, `.h-section`,
  `.truncate`, `.clamp-2`, `.clamp-3`, `.tnum`, `.mono`.

---

## 4. Space, radius, elevation, motion

**Space — 4 px base grid.** `--sp-1` 4 · `--sp-15` 6 · `--sp-2` 8 · `--sp-25` 10 ·
`--sp-3` 12 · `--sp-35` 14 · `--sp-4` 16 · `--sp-5` 20 · `--sp-6` 24 · `--sp-8` 32 ·
`--sp-10` 40 · `--sp-12` 48.

Applied consistently:

| Surface | Padding | Gap |
|---|---|---|
| Page content | `--sp-6` (desktop) / `--sp-35` (mobile) | — |
| Card | `--sp-5` / `--sp-35` compact / `--sp-35` mobile | `--sp-4` between cards |
| Card head → body | `--sp-3` padding-bottom + hairline | `--sp-4` |
| KPI | `--sp-4` | — |
| Modal head / body / foot | `--sp-4` / `--sp-5` / `--sp-35` | `--sp-25` between buttons |
| Form field | — | `--sp-35` vertical rhythm, `--sp-15` label gap |
| Table cell | `--sp-25` × `--sp-3` (desktop), `--sp-25` × `--sp-2` (mobile) | — |

**Radius.** `--r-xs` 6 (chip inset, tiny controls) · `--r-sm` 8 (buttons sm, inputs
inside tables) · `--r-md` 10 (**default**: buttons, inputs, kanban cards) ·
`--r-lg` 14 (**cards**, KPIs, action items) · `--r-xl` 18 (modals, palette) ·
`--r-2xl` 24 (sheets, auth card) · `--r-full` (pills, avatars in the topbar).
Inner radius = outer radius − padding, so nested surfaces stay concentric.

**Elevation.** Four steps only, plus an accent glow for primary buttons:
`--sh-1` resting card · `--sh-2` hover/lift · `--sh-3` popover · `--sh-4` modal/sheet.
Elevation communicates *layer*, never importance — a KPI does not float above a card.

**Motion.** `--dur-1` .12 s (control state) · `--dur-2` .18 s (hover, chip) ·
`--dur-3` .26 s (modal, sheet, palette) · `--dur-4` .4 s (chart bars growing).
Easing: `--ease-out` for entrances, `--ease-spring` for the FAB/toggle knob.
Everything is disabled under `prefers-reduced-motion: reduce`. Hover-only motion is
suppressed on `@media (hover:none)`.

---

## 5. Layout

```
┌────────────┬──────────────────────────────────────────────┐
│  sidebar   │  topbar  (title · subtitle · search · actions)│
│  248 px    ├──────────────────────────────────────────────┤
│  grouped   │  .content — scroll container, 24 px padding,  │
│  nav       │  blocks capped at 1560 px and centred         │
│  ──────    │                                               │
│  tools     │                                               │
│  business  │                                               │
└────────────┴──────────────────────────────────────────────┘
```

* `.layout` is a CSS grid: `--nav-w 248px` + fluid. `100dvh` (with `100vh` fallback)
  so mobile browser chrome never eats the tabbar.
* `.main` is a flex column; `.content` is the **only** scroller. The topbar is
  therefore always visible, and table headers can stick to it.
* **Sidebar rail:** `Ctrl+B` (or the hamburger) collapses to `--nav-w-rail 70px` —
  icons + badges only, labels as tooltips, persisted in `localStorage`.
* Grids: `.grid2` 2fr/1fr · `.grid3` 3 equal · `.grid-eq` 2 equal (charts) ·
  `.stack` vertical · `.kpis` auto-fit ≥ 184 px with `.kpis-4` / `.kpis-3` overrides.

---

## 6. Components

**Buttons** — heights 30 (`sm`) / 38 (default) / 44 (`lg`), radius `--r-md`,
weight 600. Variants: `primary` (accent fill + glow), `ghost` (surface + border),
`soft` (accent tint), `green`/`danger` (semantic tint + border), `wa` (WhatsApp),
`quiet`, `icon` (32 px square), `block`. Primary = one per view region; everything
else is `ghost`. Active state presses 1 px; on touch it scales 0.98.

**Forms** — control height 38 px desktop / **44 px at ≤ 640 px**. Labels sit above
(`--fs-xs`, 600, `--text-2`), helper text below (`.hint`). Focus = accent border +
3 px `--ring-soft` halo. `select` gets a token-coloured chevron (no native arrow).
Checkboxes/radios use `accent-color: var(--accent)`. `.form-grid` is 2 columns,
1 column below 640 px; `.span2` spans both.

**Cards** — `--surface`, 1 px `--border`, `--r-lg`, `--sh-1`. A card whose first
child is an `h3` gets a hairline under the title automatically. Modifiers:
`.soft` (inset), `.pad-sm`, `.flush`, `.card-hover` (lifts).

**KPI** — label (`.eyebrow` style) → value (`--fs-2xl`, tabular) → sub (delta chip +
context) → optional `sparkline`. A 3 px brand gradient runs across the top;
`.k-money / .k-cost / .k-profit / .k-due` retint it. `.kpi.mini` is the compact
variant used inside a page head.

**Stat tile** (`.stat`) — icon chip + label + value + subline, and it is a
`<button>`: every tile routes to the module it summarises. `.stat.static` for
read-only strips (customer header).

**Action item** (`.action-item`) — the "what needs me" row: 3 px tone bar, icon
chip, title + one-line context, big count, chevron. Tones: `bad · warn · info ·
ai · ok`. Whole row is the hit area and it deep-links.

**Tables** — `border-collapse: separate` (so the mobile sticky column works),
uppercase 11 px headers, hairline row separators, hover surface, no zebra striping
(hover + separators are enough). Numeric cells are right-aligned tabular.
`.resp-md` / `.resp-sm` hide columns at 820 px / 560 px. At ≤ 760 px `.tbl.stick`
pins the first column with a soft scroll shadow.

**Chips** — pill, 11 px, weight 700, tint + matching ink + 1 px tone border, with a
5 px status dot (`::before`). `.plain` drops the dot; a chip containing an `input`
or an icon drops it automatically. Colour comes from the `CHIP` map in `app.js`
(`chip(label, toneOverride)`).

**Modal** — centred, `--r-xl`, `--sh-4`, scrim + 4 px backdrop blur. Sticky head and
foot; the body scrolls. Below 760 px it becomes a bottom sheet: full width,
`--r-2xl` top corners, slide-up, flex column so the footer stays pinned above the
home indicator.

**Sheets** (`#sheet`) — mobile-only surface for More / Reminders / Quick add:
grab handle, head, optional quick-action row, grouped `.sheet-grid` (3 → 2 → 1
columns), closing note.

**Toasts** — bottom-right, dark surface in both themes, semantic icon, 4.2 s,
`aria-live="polite"` on the container.

**Navigation** — six labelled sections (*Overview · Work · Sales · Money ·
Stock & messages · System*), 13 px semibold links, hover wash, and an active state
of tinted gradient + a glowing 3 px aqua bar bleeding into the gutter. Counts ride
on the right as `.nav-badge` (neutral / `info` / `warn` / `bad`).

**Command palette** — `Ctrl+K` or the topbar search field. Groups: *Quick actions ·
Go to · Customers · Jobs · Invoices · Quotations · Payments · Leads · Materials ·
Technicians · Expenses · Maintenance*. With no query it shows actions, modules and
recent jobs; with a query it ranks exact → prefix → word → substring and highlights
the match with `<mark>`. `↑ ↓` move, `Enter` opens, `Esc` closes, mouse hover
tracks selection. **Read-only:** results only route to existing views/modals.

**Charts** — hand-drawn SVG, token-driven neutrals:
`niceMax()` rounds the axis to 1/2/2.5/5 × 10ⁿ so gridlines land on readable
numbers; `axisFmt()` prints `120k` / `1.25M`; gridlines and labels use
`.chart-grid` / `.chart-lab` (so they invert with the theme); series colours are
saturated literals that hold up on both backgrounds; every mark carries a native
`<title>` tooltip; bar tops are rounded; area charts use a Catmull-Rom smoothed
line over a vertical gradient; donuts can carry a centre read-out; KPI sparklines
use `preserveAspectRatio="none"` to fill the card width. Empty data renders an
`.empty` state, never a broken axis.

**Documents** — the printed quote/invoice is its own mini design system (`.doc-*`):
A4-ish 794 px sheet, navy 3 px rule, uppercase table head, totals block, signature
lines. Deliberately literal colours so print output is theme-independent.

---

## 7. Responsive & mobile

| Breakpoint | Behaviour |
|---|---|
| ≥ 1400 px | Full 4-up money band, 2fr/1fr grids |
| 1150–1400 | Money band → 2×2, `.grid2` → single column |
| 1000–1150 | Search field collapses to an icon, profile name hides |
| ≤ 900 px | **Shell switch:** sidebar → hidden, tabbar → visible (5 tabs), FAB on, content padding drops, KPIs 2-up, pipeline strip 3-up |
| ≤ 760 px | Modals become bottom sheets, calendar columns narrow, sticky first table column, palette docks to the bottom |
| ≤ 640 px | Controls grow to 44 px, form grids go single column, page heads stack, sheet grid 2-up |
| ≤ 560 px | `.resp-sm` columns hide, stepper shows only the current step, kanban 2-up |
| ≤ 380 px | Everything single column |

Mobile rules that are not negotiable:

* Touch targets ≥ 44 px (`--control-h-touch`), tabbar buttons ≥ 54 px tall.
* `env(safe-area-inset-*)` on the tabbar, FAB, sheet and modal footer.
* No hover-dependent affordances (`@media (hover:none)` strips lifts).
* The full module list is always ≤ 2 taps away (tabbar → More sheet, grouped,
  badged, with quick actions and the theme switch).
* Wide tables scroll horizontally with the identity column pinned, never reflow
  into unreadable stacks.

---

## 8. Accessibility

* Skip link (`Skip to content`) as the first focusable element.
* `:focus-visible` ring everywhere: 2 px accent, 2 px offset.
* Landmarks: `<nav aria-label>`, `<main>`, `role="dialog" aria-modal` on modals,
  sheets and the palette; `aria-live="polite"` on toasts; `aria-expanded` on the
  profile button and the sidebar toggle; `aria-pressed` on theme switches.
* Charts carry `role="img"` and per-mark `<title>` text.
* `.sr-only` for text that must be read but not seen.
* Motion respects `prefers-reduced-motion`; colour is never the only signal
  (status chips carry words, deltas carry arrows, tone bars carry icons).

---

## 9. Extending the system

**Adding a colour?** Add the primitive ramp to `tokens.css` §1.1, expose a semantic
alias in *both* theme blocks (§2 and §3), then use the semantic name. Never put a
hex in `styles.css` or in a view.

**Adding a component?** Use tokens only. Reuse `.card`, `.btn`, `.chip`, `.field`
before inventing. New classes go in `styles.css` with the section they belong to.

**Adding a view?** Register it in `VIEWS`, add it to `NAV` **and** to a
`NAV_GROUPS` section, add an optional one-line subtitle in `VIEW_SUBS`, and give it
a `.page-head`. It becomes searchable automatically (`cmdkNav()` reads `NAV`).

**Adding a chart?** Extend the primitives in `app.js`; take `{w,h,color,fmt,ticks}`
and use `niceMax` + `axisGrid` so the axes match everything else.

**Before you ship:** `npm run test:all`. `smoke10.js` fails if a token is undefined,
a module disappears from the nav, the palette stops routing, a chart hardcodes a
neutral hex, or the dashboard loses a band.

---

## 10. What changed from v1.6

| Area | v1.6 | v2.0 |
|---|---|---|
| Tokens | 11 ad-hoc variables | 3-layer system: primitives → semantics → components, light + dark + auto |
| Type | fractional sizes (10.5–16.5 px), no scale | 9-step scale, weights, tracking; tabular numerals on every number |
| Space | arbitrary px | 4 px grid applied to every surface |
| Radius / shadow | 9 different radii, 1 shadow | 7 radii, 4 elevation steps + accent glow |
| Nav | 14 flat links | 6 labelled groups, live count badges, collapsible rail, tooltips |
| Topbar | title + date + buttons | title + **contextual subtitle** + global search + theme + profile menu |
| Search | none | ⌘K command palette across 10 record types + actions, keyboard-navigable |
| Shortcuts | none | ⌘K ⌘J ⌘Q ⌘I ⌘P ⌘B ⌘D, `?` for help |
| Charts | no axes, no legend, fixed neutrals | nice-number axes, gridlines, legends, tooltips, smoothed areas, donut read-out, KPI sparklines |
| Dashboard | information-first KPI dump | decision-first: Money → Action required → Work → Sales → Stock → Trends, every tile clickable |
| Dark mode | none | full theme, persisted, OS-aware, print-safe |
| Mobile | hidden columns, sheets | + 44 px targets, sticky table column, safe areas, grouped More sheet, hover-free states |
| A11y | focus ring, some titles | skip link, landmarks, aria state, reduced motion, contrast-checked semantic pairs |
