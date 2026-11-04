'use strict';
/* Round-10: the v2.0 design system — tokens, app shell, theme, global search,
   charts and dashboard information architecture.
   Rounds 1–9 guard the business logic; this one guards the visual layer so a
   future restyle cannot silently break navigation, search or the dashboard. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const errors = [];
function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — design-system & shell tests');

const files = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js','js/app.js','js/pdf.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/customer.js','js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/reports.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:9200/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
const doc = win.document;
win.localStorage.setItem('aquaflow_session_v1','guest');
win.scrollTo = () => {};
win.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });
win.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
try { win.eval(files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n')); }
catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

const readCss = f => fs.readFileSync(path.join(__dirname, f), 'utf8');

/* ================= static design-system integrity ================= */
check('tokens: every var() used in CSS resolves to a defined token', () => {
  const css = readCss('css/tokens.css') + '\n' + readCss('css/styles.css');
  const defined = new Set((css.match(/(--[a-z0-9-]+)\s*:/g) || []).map(s => s.replace(/\s*:$/, '')));
  const used = new Set((css.match(/var\((--[a-z0-9-]+)/g) || []).map(s => s.replace('var(', '')));
  const missing = [...used].filter(v => !defined.has(v));
  if (missing.length) throw new Error('undefined tokens: ' + missing.join(', '));
  if (defined.size < 120) throw new Error('token layer looks too small: ' + defined.size);
});

check('tokens: light + dark + auto themes all define the semantic layer', () => {
  const t = readCss('css/tokens.css');
  if (!t.includes('html[data-theme="dark"]')) throw new Error('no dark theme block');
  if (!t.includes('prefers-color-scheme:dark')) throw new Error('no OS-preference fallback');
  ['--bg','--surface','--text','--accent','--ok','--warn','--bad','--chart-grid','--nav-bg']
    .forEach(k => { if (!t.includes(k + ':')) throw new Error('missing semantic token ' + k); });
});

check('tokens: legacy variable aliases kept (inline styles in js/ rely on them)', () => {
  const t = readCss('css/tokens.css');
  ['--ink','--muted','--line','--panel','--red','--green','--amber'].forEach(k => {
    if (!new RegExp(k.replace('--','\\-\\-') + '\\s*:').test(t)) throw new Error('legacy alias removed: ' + k);
  });
});

check('shell: tokens.css is linked before styles.css (cascade order)', () => {
  const a = html.indexOf('css/tokens.css'), b = html.indexOf('css/styles.css');
  if (a < 0 || b < 0) throw new Error('a stylesheet link is missing');
  if (a > b) throw new Error('tokens.css must be linked before styles.css');
});

check('shell: search, palette root, profile menu, skip link and theme hook exist', () => {
  ['#top-search','#cmdk-root','#top-profile','#menu-root','#top-sub','#side-theme','#top-nav-toggle']
    .forEach(id => { if (!doc.querySelector(id)) throw new Error('missing ' + id); });
  if (!doc.querySelector('a.skip-link[href="#content"]')) throw new Error('no skip link');
  if (!doc.querySelector('meta[name="theme-color"]')) throw new Error('no theme-color meta');
});

check('sw: service worker precaches the new stylesheet and bumped its cache', () => {
  const sw = readCss('sw.js');
  if (!sw.includes('./css/tokens.css')) throw new Error('tokens.css not precached');
  if (sw.includes('aquaflow-shell-v16')) throw new Error('cache version not bumped — stale installs');
});

setTimeout(() => {
  const A = win.API;
  if (!A) { console.error('API not exposed'); process.exit(1); }
  const db = () => A.db;

  /* ================= navigation ================= */
  check('nav: 14 modules grouped into labelled sections, no module lost', () => {
    A.go('dashboard', {});
    const secs = doc.querySelectorAll('#nav .nav-sec');
    if (secs.length < 4) throw new Error('expected grouped sections, got ' + secs.length);
    if (!doc.querySelector('#nav .nav-sec-l')) throw new Error('sections have no labels');
    const views = [...doc.querySelectorAll('#nav a[data-view]')].map(a => a.dataset.view);
    ['dashboard','leads','jobs','dispatch','customers','quotes','invoices','expenses','reports',
     'inventory','maintenance','whatsapp','sync','settings'].forEach(v => {
      if (!views.includes(v)) throw new Error('module missing from the nav: ' + v);
    });
    if (views.length !== 14) throw new Error('expected 14 modules, got ' + views.length);
  });

  check('nav: badges reflect real counts and stay in sync', () => {
    A.refreshNavBadges();
    const b = A.navBadges();
    if (typeof b.invoices.n !== 'number') throw new Error('invoice badge count missing');
    const overdue = db().invoices.filter(i => A.invState(i).label === 'Overdue').length;
    if (b.invoices.n !== overdue) throw new Error(`badge ${b.invoices.n} != overdue ${overdue}`);
    const link = doc.querySelector('#nav a[data-view="invoices"]');
    const badgeEl = link && link.querySelector('.nav-badge');
    if (overdue > 0 && !badgeEl) throw new Error('overdue invoices but no badge rendered');
    if (overdue === 0 && badgeEl) throw new Error('badge rendered with nothing to show');
    if (badgeEl && badgeEl.textContent !== String(overdue)) throw new Error('badge text mismatch');
  });

  check('nav: tabbar still exposes exactly 5 mobile tabs', () => {
    const tabs = doc.querySelectorAll('#tabbar button');
    if (tabs.length !== 5) throw new Error('expected 5 tabs, got ' + tabs.length);
    if (![...tabs].some(t => t.dataset.tab === 'more')) throw new Error('no More tab');
  });

  check('topbar: contextual subtitle updates per view', () => {
    A.go('dashboard', {});
    const d = doc.getElementById('top-sub').textContent;
    if (!d || !d.length) throw new Error('dashboard has no subtitle');
    A.go('invoices', {});
    const i = doc.getElementById('top-sub').textContent;
    if (!i.includes('outstanding')) throw new Error('invoice subtitle should mention outstanding: ' + i);
    if (doc.getElementById('top-title').textContent !== 'Invoices & Payments')
      throw new Error('top-title regressed: ' + doc.getElementById('top-title').textContent);
  });

  /* ================= theme ================= */
  check('theme: setTheme writes the attribute + persists, toggle flips back', () => {
    A.setTheme('dark', { quiet: true });
    if (doc.documentElement.getAttribute('data-theme') !== 'dark') throw new Error('data-theme not set');
    if (win.localStorage.getItem('aquaflow_theme_v1') !== 'dark') throw new Error('theme not persisted');
    if (doc.querySelector('meta[name="theme-color"]').getAttribute('content') === '#0b1b2b')
      throw new Error('theme-color meta not updated for dark');
    A.toggleTheme();
    if (doc.documentElement.getAttribute('data-theme') !== 'light') throw new Error('toggle did not flip');
    A.setTheme('light', { quiet: true });
    if (A.currentTheme() !== 'light') throw new Error('currentTheme wrong');
  });

  check('theme: charts and components carry no hardcoded neutral hex', () => {
    const css = readCss('css/styles.css');
    const appjs = fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8');
    const chartBlock = appjs.slice(appjs.indexOf('function axisGrid'), appjs.indexOf('/* ================= business pipeline'));
    ['#eef2f7','#f8fafc','#5b6b85','#e2e8f0'].forEach(h => {
      if (chartBlock.toLowerCase().includes(h)) throw new Error('chart still hardcodes ' + h);
    });
    if (!css.includes('.chart-grid')) throw new Error('chart grid is not token-driven');
  });

  /* ================= global search / command palette ================= */
  check('search: palette opens, filters every record type, closes', () => {
    A.go('dashboard', {});
    A.cmdkOpen();
    if (!doc.getElementById('cmdk')) throw new Error('palette did not open');
    if (!doc.getElementById('cmdk-q')) throw new Error('no search input');
    const all = A.cmdkRows('');
    if (!all.length) throw new Error('empty starting screen');
    ['John','JOB-','INV-'].forEach(probe => {
      const rows = A.cmdkRows(probe.toLowerCase());
      if (!rows.length) throw new Error('no results for "' + probe + '"');
    });
    const groups = new Set(A.cmdkRows('a').map(r => r.g));
    if (groups.size < 3) throw new Error('search should span several record types, got ' + [...groups]);
    A.cmdkClose();
    if (doc.getElementById('cmdk')) throw new Error('palette did not close');
  });

  check('search: a customer result routes to the customer record', () => {
    A.cmdkOpen('john mwangi');
    const inp = doc.getElementById('cmdk-q');
    inp.value = 'john mwangi';
    inp.dispatchEvent(new win.Event('input', { bubbles: true }));
    const items = doc.querySelectorAll('#cmdk-body .cmdk-item');
    if (!items.length) throw new Error('no results rendered');
    if (!doc.querySelector('#cmdk-body mark')) throw new Error('matched text is not highlighted');
    items[0].click();
    if (A.ui.view !== 'customer') throw new Error('did not open the customer, view=' + A.ui.view);
    if (doc.getElementById('cmdk')) throw new Error('palette stayed open after a pick');
    if (!doc.getElementById('content').innerHTML.includes('John Mwangi')) throw new Error('wrong customer opened');
  });

  check('search: invoice and material results route correctly', () => {
    const inv = db().invoices[0];
    A.cmdkOpen(inv.ref);
    let items = [...doc.querySelectorAll('#cmdk-body .cmdk-item')];
    const hit = items.find(i => i.textContent.includes(inv.ref));
    if (!hit) throw new Error('invoice ref not searchable: ' + inv.ref);
    hit.click();
    if (A.ui.view !== 'invoice') throw new Error('did not open the invoice, view=' + A.ui.view);

    const mat = db().inventory[0];
    A.cmdkOpen(mat.name);
    items = [...doc.querySelectorAll('#cmdk-body .cmdk-item')];
    if (!items.some(i => i.textContent.includes(mat.name))) throw new Error('material not searchable: ' + mat.name);
    A.cmdkClose();
  });

  check('search: quick actions run (new job opens the existing modal)', () => {
    A.cmdkOpen('new job');
    const items = [...doc.querySelectorAll('#cmdk-body .cmdk-item')];
    const act = items.find(i => i.textContent.includes('New job'));
    if (!act) throw new Error('no New job action in the palette');
    act.click();
    if (!doc.getElementById('modal-root').innerHTML) throw new Error('job modal did not open');
    if (!doc.getElementById('jf-save')) throw new Error('job modal is not the real form');
    A.closeModal();
  });

  check('shortcuts: Ctrl+K search, Ctrl+J job, Esc closes', () => {
    const key = (k, extra) => doc.dispatchEvent(new win.KeyboardEvent('keydown',
      Object.assign({ key: k, ctrlKey: true, bubbles: true, cancelable: true }, extra || {})));
    key('k');
    if (!doc.getElementById('cmdk')) throw new Error('Ctrl+K did not open search');
    doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    if (doc.getElementById('cmdk')) throw new Error('Esc did not close search');
    key('j');
    if (!doc.getElementById('modal-root').innerHTML) throw new Error('Ctrl+J did not open the job modal');
    A.closeModal();
    key('d');
    if (doc.documentElement.getAttribute('data-theme') !== 'dark') throw new Error('Ctrl+D did not toggle theme');
    key('d');
    if (doc.documentElement.getAttribute('data-theme') !== 'light') throw new Error('Ctrl+D did not toggle back');
  });

  check('shortcuts: ignored while typing in a form field', () => {
    A.go('jobs', {});
    const tabs = doc.querySelectorAll('#content .tabs button');
    tabs[1].click(); // list view has a search input
    const q = doc.getElementById('jl-q');
    if (!q) throw new Error('job search input missing');
    q.focus();
    q.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true, cancelable: true }));
    if (doc.getElementById('modal-root').innerHTML) throw new Error('shortcut fired while typing in a field');
  });

  /* ================= charts ================= */
  check('charts: axes, gridlines, legend and tooltips on every chart type', () => {
    const g = A.groupedBar([1000,2000,3000],[400,500,600],['Jan','Feb','Mar']);
    ['chart-grid','chart-lab','chart-legend','<title>'].forEach(t => {
      if (!g.includes(t)) throw new Error('groupedBar missing ' + t);
    });
    const b = A.barChart([1,5,3],['a','b','c']);
    if (!b.includes('chart-bar') || !b.includes('chart-grid')) throw new Error('barChart missing bars/grid');
    const a = A.areaChart([10,20,15,40],['a','b','c','d']);
    if (!a.includes('linearGradient') || !a.includes('chart-grid')) throw new Error('areaChart missing gradient/grid');
    const d = A.donut([{label:'Labour',value:60,color:'#0284c7'},{label:'Materials',value:40,color:'#0d9488'}],
      {centerTop:'100k', centerSub:'invoiced'});
    if (!d.includes('100k') || !d.includes('invoiced')) throw new Error('donut centre read-out missing');
    const s = A.sparkline([1,4,2,8,6]);
    if (!s.includes('class="chart spark"')) throw new Error('sparkline missing');
  });

  check('charts: axis maxima are human-readable round numbers', () => {
    if (A.niceMax(1234567, 4) % 4 !== 0) throw new Error('niceMax not divisible by the tick count');
    if (A.niceMax(0, 4) <= 0) throw new Error('niceMax(0) should still give a usable axis');
    if (A.axisFmt(1250000) !== '1.25M') throw new Error('axisFmt(1.25M) → ' + A.axisFmt(1250000));
    if (A.axisFmt(120000) !== '120k') throw new Error('axisFmt(120k) → ' + A.axisFmt(120000));
    if (A.niceMax(97000, 4) < 97000) throw new Error('axis max below the data max — bars would overflow');
  });

  check('charts: empty data degrades to an empty state, not a broken SVG', () => {
    if (!A.barChart([], []).includes('empty')) throw new Error('barChart([]) should render an empty state');
    if (!A.hbarList([]).includes('empty')) throw new Error('hbarList([]) should render an empty state');
  });

  /* ================= dashboard information architecture ================= */
  check('dashboard: decision-first bands (money → action → work → sales → stock)', () => {
    A.go('dashboard', {});
    const h = doc.getElementById('content').innerHTML;
    ['>Money<','Action required','>Work<','>Sales<','Stock &amp; service'].forEach(b => {
      if (!h.includes(b)) throw new Error('missing band: ' + b);
    });
    const bands = [...doc.querySelectorAll('#content .band-l')].map(x => x.textContent.trim());
    if (bands.indexOf('Money') > bands.indexOf('Work')) throw new Error('money must come before work');
    if (bands.indexOf('Work') > bands.indexOf('Sales')) throw new Error('work must come before sales');
  });

  check('dashboard: action-required items are real and deep-link somewhere', () => {
    const items = [...doc.querySelectorAll('#content .action-item')];
    const b = A.navBadges();
    const expected = (b.invoices.n ? 1 : 0) + (b.quotes.n ? 1 : 0) + (b.inventory.n ? 1 : 0);
    if (expected > 0 && !items.length) throw new Error('badges show work to do but no action items rendered');
    items.forEach(it => {
      if (!it.dataset.goto) throw new Error('action item without a destination');
      if (!it.querySelector('.an')) throw new Error('action item without a count');
      if (/\bNaN\b|undefined/.test(it.textContent)) throw new Error('broken action item: ' + it.textContent);
    });
    if (items.length) {
      const before = A.ui.view;
      items[0].click();
      if (A.ui.view === before && before !== 'dashboard') throw new Error('action item did not navigate');
      A.go('dashboard', {});
    }
  });

  check('dashboard: stat tiles are buttons that route to their module', () => {
    const stats = [...doc.querySelectorAll('#content .stat')];
    if (stats.length < 8) throw new Error('expected work+sales+stock tiles, got ' + stats.length);
    stats.forEach(s => {
      if (s.tagName !== 'BUTTON') throw new Error('stat tile is not clickable');
      if (!s.dataset.goto) throw new Error('stat tile without a destination');
      if (!s.querySelector('.stat-v')) throw new Error('stat tile without a value');
    });
  });

  check('dashboard: money KPIs carry a trend delta and sparkline', () => {
    const kpis = [...doc.querySelectorAll('#content .kpis-4 .kpi')];
    if (kpis.length !== 4) throw new Error('expected 4 money KPIs, got ' + kpis.length);
    if (!doc.querySelector('#content .kpi .spark')) throw new Error('no sparkline in the money band');
    const labels = kpis.map(k => k.querySelector('.lab').textContent);
    ['Revenue (this month)','Expenses (this month)','Net profit','Outstanding'].forEach(l => {
      if (!labels.includes(l)) throw new Error('money KPI missing: ' + l);
    });
  });

  check('dashboard: v1.6 content all still present (no regression)', () => {
    const h = doc.getElementById('content').innerHTML;
    ['Pipeline at a glance','Recent activity','Revenue vs Expenses','Jobs completed',
     'Most profitable job types','top debtors','Quotations pending','This week','Reminders','Admin']
      .forEach(s => { if (!h.includes(s)) throw new Error('lost from the dashboard: ' + s); });
    if (!doc.getElementById('da-job') || !doc.getElementById('da-bell')) throw new Error('dashboard action buttons missing');
    doc.getElementById('da-job').click();
    if (!doc.getElementById('modal-root').innerHTML) throw new Error('New job button stopped working');
    A.closeModal();
  });

  /* ================= every view renders clean ================= */
  check('views: all render, and none leak undefined / NaN / [object Object]', () => {
    const bad = [];
    const single = ['dashboard','leads','jobs','dispatch','customers','quotes','invoices','expenses',
      'reports','inventory','maintenance','whatsapp','sync','settings','quote_edit','invoice_new'];
    single.forEach(v => {
      A.go(v, {});
      const h = doc.getElementById('content').innerHTML;
      if (!h.length) bad.push(v + ': empty');
      if (/\[object Object\]/.test(h)) bad.push(v + ': [object Object]');
      if (/>undefined</.test(h) || /NaN/.test(h)) bad.push(v + ': undefined/NaN');
    });
    [['customer',{id:db().customers[0].id}],['invoice',{id:db().invoices[0].id}],
     ['quote_edit',{id:db().quotes[0].id}]].forEach(([v,p]) => {
      A.go(v, p);
      const h = doc.getElementById('content').innerHTML;
      if (!h.length) bad.push(v + ': empty');
      if (/\[object Object\]/.test(h) || /NaN/.test(h)) bad.push(v + ': [object Object]/NaN');
    });
    if (bad.length) throw new Error(bad.join(' | '));
  });

  check('views: every icon name used in the shell resolves to a real glyph', () => {
    A.go('dashboard', {});
    const empty = [...doc.querySelectorAll('#content svg')].filter(s => !s.innerHTML.trim());
    if (empty.length) throw new Error(empty.length + ' icon(s) rendered empty — unknown icon name');
    const navEmpty = [...doc.querySelectorAll('#nav svg')].filter(s => !s.innerHTML.trim());
    if (navEmpty.length) throw new Error(navEmpty.length + ' nav icon(s) rendered empty');
  });

  /* ================= documents stay print-ready in both themes ================= */
  check('documents: invoice PDF preview renders and ignores the dark theme', () => {
    A.setTheme('dark', { quiet: true });
    A.go('invoices', {});
    A.openDoc('invoice', db().invoices[0].id);
    const sheet = doc.querySelector('#print-root .doc-sheet');
    if (!sheet) throw new Error('document preview did not render');
    const css = readCss('css/styles.css');
    if (!/html\[data-theme="dark"\][\s\S]*?doc-sheet|@media print/.test(css)) throw new Error('print block missing');
    if (!css.includes('body.printing-doc')) throw new Error('print isolation rules missing');
    if (sheet.getAttribute('style') && sheet.getAttribute('style').includes('var(--'))
      throw new Error('document sheet must not depend on theme tokens');
    A.closeDoc();
    A.setTheme('light', { quiet: true });
  });

  check('mobile shell: More sheet still grouped, badged and wired', () => {
    A.go('dashboard', {});
    A.openMoreSheet();
    const sheet = doc.getElementById('sheet');
    if (!sheet.innerHTML.includes('sheet-grid')) throw new Error('sheet not populated');
    if (!sheet.innerHTML.includes('data-goto="quotes"')) throw new Error('missing nav items');
    if (!sheet.innerHTML.includes('chip')) throw new Error('no badges rendered');
    if (!sheet.querySelector('[data-act="theme"]')) throw new Error('no appearance control on mobile');
    if (!sheet.querySelector('[data-act="search"]')) throw new Error('no search shortcut on mobile');
    sheet.querySelector('[data-act="theme"]').click();
    if (doc.documentElement.getAttribute('data-theme') !== 'dark') throw new Error('sheet theme toggle did not work');
    sheet.querySelector('[data-act="theme"]') || A.toggleTheme();
    A.setTheme('light', { quiet: true });
    A.sheetClose();
  });

  check('customer portal: scoped shell keeps its own nav and hides admin modules', () => {
    const cust = db().customers[0];
    if (!cust) throw new Error('no seeded customers');
    cust.email = 'portal@test.co.ke'; // link a portal login to an existing profile
    win.localStorage.setItem('aquaflow_accounts_v1', JSON.stringify(
      [{ email: cust.email, name: cust.name, role: 'customer', custId: cust.id,
         salt: '00', hash: '00', sq: 'q', sqHash: 'h', createdAt: new Date().toISOString() }]));
    A.switchToSession(cust.email);
    const nav = doc.getElementById('nav').innerHTML;
    if (nav.includes('Expenses') || nav.includes('Inventory')) throw new Error('admin modules leaked into the portal');
    if (!nav.includes('My invoices')) throw new Error('portal nav missing');
    if (doc.getElementById('top-search')) {
      A.cmdkOpen();
      const rows = A.cmdkRows('zzzz');
      if (rows.length) throw new Error('portal search should not surface unrelated records');
      A.cmdkClose();
    }
    A.customerSignOut();
    win.localStorage.setItem('aquaflow_session_v1','guest');
    A.switchToSession('guest');
  });

  setTimeout(finish, 250);
}, 200);

function finish(){
  if (errors.length) {
    console.error(`\n${errors.length} FAILURE(S):`);
    errors.forEach(e => console.error(' - ' + e));
    process.exit(1);
  }
  console.log('\nALL DESIGN-SYSTEM TESTS PASSED ✅');
  process.exit(0);
}
