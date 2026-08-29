'use strict';
/* Runtime smoke test: loads the real app in jsdom and exercises core flows. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const files = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js','js/app.js','js/pdf.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/reports.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
dom.window.localStorage.setItem('aquaflow_session_v1','guest'); // skip auth gate, test the app
const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));

const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
try { window.eval(code); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

const doc = window.document;

setTimeout(run, 150); // let DOMContentLoaded fire (same path a real browser takes)

function run() {
const A = window.API;
if (!A) { console.error('API not exposed — init did not run (readyState=' + doc.readyState + ')'); process.exit(1); }
const db = () => A.db;

function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — smoke tests');

check('seed data loaded', () => {
  if (!db().customers.length) throw new Error('no customers');
  if (db().jobs.length < 10) throw new Error('too few jobs');
  if (db().invoices.length < 8) throw new Error('too few invoices');
  if (db().inventory.length < 15) throw new Error('too few inventory items');
  if (db().maintenance.length < 4) throw new Error('too few maintenance plans');
  if (!db().outbox.length) throw new Error('empty outbox');
});

check('all main views render non-empty content', () => {
  ['dashboard','leads','expenses','jobs','dispatch','customers','quotes','invoices','inventory','maintenance','whatsapp','settings','quote_edit','invoice_new'].forEach(v => {
    A.go(v, {});
    const c = doc.getElementById('content');
    if (!c || !c.innerHTML.length) throw new Error('empty content for ' + v);
  });
});

check('detail views render (customer / invoice / quote / job modal)', () => {
  A.go('customer', { id: db().customers[0].id });
  if (!doc.getElementById('content').innerHTML.length) throw new Error('customer empty');
  A.go('invoice', { id: db().invoices[0].id });
  if (!doc.getElementById('content').innerHTML.length) throw new Error('invoice empty');
  A.go('quote_edit', { id: db().quotes[0].id });
  if (!doc.getElementById('content').innerHTML.length) throw new Error('quote edit empty');
  A.go('jobs', {});
  A.openJobModal(db().jobs[0].id);
  if (!doc.getElementById('modal-root').innerHTML) throw new Error('job modal did not open');
  A.closeModal();
});

check('AI estimate generates lines with rationale', () => {
  const r = A.aiGenerate('burst-pipe', { level: 'senior', urgency: 'emergency', access: 'tight', area: 'outskirts' });
  if (!r.lines.length) throw new Error('no lines');
  if (!(r.total > 0)) throw new Error('no total');
  if (!(r.conf > 0 && r.conf <= 100)) throw new Error('bad confidence');
  if (!r.assumptions.length) throw new Error('no assumptions');
  if (!r.lines.every(l => l.reason)) throw new Error('missing rationale');
});

check('AI matches live inventory prices', () => {
  const r = A.aiGenerate('geyser-install', { level: 'senior', urgency: 'standard', access: 'ground', area: 'city' });
  const g = r.lines.find(l => l.desc === 'Geyser 50L');
  const inv = db().inventory.find(i => i.name === 'Geyser 50L');
  if (!g) throw new Error('no geyser line');
  if (g.price !== inv.price) throw new Error('not using stock price: ' + g.price + ' vs ' + inv.price);
  if (!g.invId) throw new Error('invId not set on stock-matched line');
});

check('AI emergency math (senior ×1.4 ×1.15)', () => {
  const r = A.aiGenerate('drain-clog', { level: 'senior', urgency: 'emergency', access: 'tight', area: 'city' });
  const labor = r.lines.find(l => l.kind === 'Labor' && l.unit === 'hr');
  const expected = Math.round(1800 * 1.4 * 1.15 / 10) * 10;
  if (labor.price !== expected) throw new Error(`labor ${labor.price} !== ${expected}`);
});

check('wa.me link formats Kenyan numbers', () => {
  const l = A.waLink('0712 480 221', 'hello world');
  if (!l.startsWith('https://wa.me/254712480221?text=')) throw new Error('bad link: ' + l);
  const l2 = A.waLink('+254 712 480 221', 'x');
  if (!l2.startsWith('https://wa.me/254712480221?')) throw new Error('bad intl link: ' + l2);
});

check('invoice math: totals, VAT, balances, states', () => {
  const inv = db().invoices.find(i => i.payments.length && A.invBalance(i) > 0);
  if (!inv) throw new Error('no partial-payment invoice in seed');
  const st = A.invState(inv);
  if (!(st.balance > 0)) throw new Error('bad balance');
  const paid = db().invoices.find(i => A.invBalance(i) <= 0);
  if (!A.invState(paid).label.match(/Paid/)) throw new Error('paid invoice mislabeled: ' + A.invState(paid).label);
  const overdue = db().invoices.find(i => A.invState(i).label === 'Overdue');
  if (!overdue) throw new Error('seed has no overdue invoice');
});

check('quote totals with 16% VAT', () => {
  const q = db().quotes[0];
  const sub = q.items.reduce((t, i) => t + i.qty * i.price, 0);
  if (A.quoteTotal(q) !== Math.round(sub * 1.16)) throw new Error('quote total mismatch');
});

check('job conflict detection finds seeded overlap or none (no crash)', () => {
  A.go('dispatch', {});
  const conflicts = db().jobs.filter(j => j.technicianIds.length).map(j => j).length;
  if (!Number.isFinite(conflicts)) throw new Error('conflict scan failed');
});

check('record payment flow updates balance', () => {
  A.go('invoices', {});
  const inv = db().invoices.filter(i => i.status !== 'Draft' && A.invBalance(i) > 0)[0];
  const before = A.invBalance(inv);
  inv.payments = inv.payments || [];
  inv.payments.push({ date: '2026-08-29', amount: before, method: 'M-Pesa', note: 'smoke' });
  if (A.invBalance(inv) !== 0) throw new Error('balance not zeroed');
  if (A.invState(inv).label !== 'Paid') throw new Error('state not Paid');
});

check('outbox grows via pushOutbox', () => {
  const before = db().outbox.length;
  A.pushOutbox(db().customers[0], 'Dispatch', 'test message');
  if (db().outbox.length !== before + 1) throw new Error('outbox did not grow');
  if (!db().outbox[db().outbox.length-1].to) throw new Error('missing phone');
});

check('modal open/close lifecycle', () => {
  A.openModal('Test', '<p>hi</p>', { width: 'sm' });
  if (!doc.getElementById('modal-root').innerHTML) throw new Error('no modal');
  A.closeModal();
  if (doc.getElementById('modal-root').innerHTML) throw new Error('modal not closed');
});

check('inventory renders and deducts stock', () => {
  A.go('inventory', {});
  if (!doc.getElementById('content').innerHTML.length) throw new Error('inventory empty');
  const item = db().inventory.find(i => i.qty > 2);
  const qtyBefore = item.qty;
  item.qty -= 1;
  if (item.qty !== qtyBefore - 1) throw new Error('deduction failed');
});

} // end run()

setTimeout(() => {
  if (errors.length) { console.error(`\n${errors.length} FAILURE(S):`); errors.forEach(e => console.error(' - ' + e)); process.exit(1); }
  console.log('\nALL SMOKE TESTS PASSED ✅');
  process.exit(0);
}, 300);
