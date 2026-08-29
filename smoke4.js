'use strict';
/* Round-4 features: business OS — leads, expenses, net profit, pipeline, materials. */
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
const doc = window.document;
const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
window.scrollTo = () => {};
window.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });

const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
try { window.eval(code); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

setTimeout(run, 150);

function run() {
const A = window.API;
if (!A) { console.error('API not exposed'); process.exit(1); }
const db = () => A.db;

function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — business OS tests');
const norm = str => String(str).replace(/&nbsp;/g, '\u00a0').replace(/\u00a0/g, ' ');
const ksh = n => new Intl.NumberFormat('en-KE', {style:'currency', currency:'KES', maximumFractionDigits:0}).format(n);

check('seed: leads, expenses, owner name present', () => {
  if (!db().leads || db().leads.length < 4) throw new Error('no leads seeded');
  if (!db().expenses || db().expenses.length < 10) throw new Error('no expenses seeded');
  if (db().business.ownerName !== 'Victor') throw new Error('ownerName missing');
  if (db().jobs.length !== 18) throw new Error('expected 18 jobs, got ' + db().jobs.length);
  if (db().invoices.length !== 11) throw new Error('expected 11 invoices');
});

check('dashboard: greeting + P&L KPIs + 4 charts', () => {
  A.go('dashboard', {});
  const html = doc.getElementById('content').innerHTML;
  if (!html.includes('VICTOR')) throw new Error('greeting missing owner name');
  if (!html.includes('Net profit')) throw new Error('no net profit KPI');
  if (!html.includes('Revenue vs Expenses')) throw new Error('no revenue vs expenses chart');
  if (!html.includes('Jobs completed')) throw new Error('no jobs completed chart');
  if (!html.includes('Most profitable job types')) throw new Error('no job type chart');
  if (!html.includes('top debtors')) throw new Error('no debtors card');
  if (!html.includes('This week')) throw new Error('no weekly income row');
  // net profit math: revenue (payments this month) - expenses (this month)
  const t = new Date().toISOString().slice(0,10);
  const mk = t.slice(0,7);
  const rev = db().invoices.flatMap(i => i.payments||[]).filter(p => (p.date||'').slice(0,7) === mk)
    .reduce((s,p) => s + p.amount, 0);
  const exp = db().expenses.filter(e => (e.date||'').slice(0,7) === mk).reduce((s,e) => s + e.amount, 0);
  const net = rev - exp;
  const kpis = [...doc.querySelectorAll('#content .kpi')].map(k => k.textContent);
  if (!kpis.some(k => k.includes('Net profit') && norm(k).includes(norm(ksh(net)))))
    throw new Error('net profit value mismatch (expected ' + net + ')');
});

check('pipeline: jobStage / jobNextAction / stepper', () => {
  A.go('jobs', {});
  // find an In Progress job
  const j = db().jobs.find(x => x.status === 'In Progress');
  if (!j) throw new Error('no in-progress job');
  const st = A.jobStage(j);
  if (st < 2) throw new Error('In Progress job stage should be >= 2, got ' + st);
  if (st !== 2 && !A.jobInvoice(j)) throw new Error('stage ' + st + ' without invoice is inconsistent');
  if (A.jobNextAction(j).label !== 'Complete job') throw new Error('next action should be Complete job');
  // job with invoice fully paid → stage 5
  const paidInv = db().invoices.find(i => i.payments && i.payments.length && A.invBalance(i) <= 0 && i.jobId);
  if (!paidInv) throw new Error('no paid linked invoice');
  if (A.jobStage(A.jobById(paidInv.jobId)) !== 5) throw new Error('paid job stage should be 5');
  // render pipeline tab
  const tabs = [...doc.querySelectorAll('#content .tabs button')];
  tabs.find(b => b.dataset.tab === 'pipe').click();
  A.reRender();
  const html = doc.getElementById('content').innerHTML;
  if (!html.includes('Full pipeline') && !html.includes('Pipeline')) throw new Error('pipeline tab not rendered');
  if (!html.includes('Next action')) throw new Error('no next-action column');
  if (doc.querySelectorAll('#content .stepper').length < 3) throw new Error('steppers missing');
});

check('pipeline next action: complete an In Progress job', () => {
  A.go('jobs', {});
  [...doc.querySelectorAll('#content .tabs button')].find(b => b.dataset.tab === 'pipe').click();
  const j = db().jobs.find(x => x.status === 'In Progress');
  const before = j.status;
  // click its next-action button
  const btns = [...doc.querySelectorAll('#content [data-na]')];
  if (!btns.length) throw new Error('no next-action buttons rendered (list tab active)');
  const b = btns.find(x => x.dataset.job === j.id);
  if (b && b.dataset.na === 'complete') b.click();
  if (j.status !== 'Completed') throw new Error('status not updated (' + before + ' → ' + j.status + ')');
});

check('leads: board renders with 5 columns + 5 seeds', () => {
  A.go('leads', {});
  const cols = doc.querySelectorAll('#content .kcol');
  if (cols.length !== 5) throw new Error('expected 5 columns, got ' + cols.length);
  const cards = doc.querySelectorAll('#content .kcard');
  if (cards.length !== db().leads.length) throw new Error('card count mismatch');
  if (!doc.getElementById('content').innerHTML.includes('John Mwangi')) throw new Error('seed lead missing');
});

check('leads: create lead via modal', () => {
  const n = db().leads.length;
  doc.getElementById('lead-new').click();
  doc.getElementById('lf-name').value = 'Test Buyer';
  doc.getElementById('lf-phone').value = '0799 111 222';
  doc.getElementById('lf-svc').value = 'Solar backup quote';
  doc.getElementById('lf-budget').value = '50000';
  doc.getElementById('lf-save').click();
  if (db().leads.length !== n + 1) throw new Error('lead not added');
  if (db().leads[0].name !== 'Test Buyer') throw new Error('wrong lead created');
  if (!db().leads[0].ref.startsWith('LEAD-')) throw new Error('no lead ref');
});

check('leads: schedule job from lead → lead Won + job created', () => {
  const nJobs = db().jobs.length;
  const lead = db().leads.find(l => l.name === 'Test Buyer');
  const btn = [...doc.querySelectorAll('#content [data-act="schedule"]')].find(b => b.dataset.l === lead.id);
  if (!btn) throw new Error('no schedule button');
  btn.click();
  // job modal now open — fill and save
  doc.getElementById('jf-title').value = 'Solar backup install';
  doc.getElementById('jf-save').click();
  if (db().jobs.length !== nJobs + 1) throw new Error('job not created from lead');
  if (lead.status !== 'Won') throw new Error('lead not marked Won');
  if (!lead.jobRef) throw new Error('lead.jobRef not set');
  const job = db().jobs.find(x => x.ref === lead.jobRef);
  if (!job || job.title !== 'Solar backup install') throw new Error('linked job mismatch');
  if (A.guessJobType('Solar backup quote') !== 'Solar') throw new Error('type guess failed');
});

check('leads: quote from lead creates customer + prefills quote editor', () => {
  A.go('leads', {});
  const lead = db().leads.find(l => l.name === 'Faith Otieno');
  if (!lead) throw new Error('seed lead Faith Otieno missing');
  const cName = lead.name;
  const btn = [...doc.querySelectorAll('#content [data-act="quote"]')].find(b => b.dataset.l === lead.id);
  if (!btn) throw new Error('no quote button');
  btn.click();
  if (A.ui.view !== 'quote_edit') throw new Error('did not navigate to quote_edit');
  const c = db().customers.find(x => x.name === cName);
  if (!c) throw new Error('customer not created from lead');
  if (lead.customerId !== c.id) throw new Error('lead.customerId not linked');
  if (doc.getElementById('qe-cust').value !== c.id) throw new Error('quote customer not prefilled');
  if (doc.getElementById('qe-title').value !== lead.service) throw new Error('quote title not prefilled');
});

check('expenses: render + KPIs + add expense updates month total', () => {
  A.go('expenses', {});
  const mk = new Date().toISOString().slice(0,7);
  const before = db().expenses.filter(e => (e.date||'').slice(0,7) === mk).reduce((s,e) => s + e.amount, 0);
  doc.getElementById('ex-new').click();
  doc.getElementById('ef-desc').value = 'Test expense — diesel';
  doc.getElementById('ef-amt').value = '1000';
  doc.getElementById('ef-save').click();
  const after = db().expenses.filter(e => (e.date||'').slice(0,7) === mk).reduce((s,e) => s + e.amount, 0);
  if (after !== before + 1000) throw new Error('expense month total not updated');
  if (!doc.getElementById('content').innerHTML.includes('Margin this month')) throw new Error('margin KPI missing');
});

check('materials: job income card renders for invoiced job', () => {
  const job = db().jobs.find(j => j.title.includes('Water heater repair'));
  if (!job) throw new Error('seed job missing');
  A.go('jobs', {});
  A.reRender();
  A.openJobModal(job.id);
  const html = doc.getElementById('modal-root').innerHTML;
  if (!html.includes('Job income —')) throw new Error('income card missing');
  if (!html.includes('Labour') || !html.includes('Materials') || !html.includes('Transport')) throw new Error('breakdown rows missing');
  if (!html.includes('Balance due')) throw new Error('balance row missing');
});

check('materials: record usage deducts stock + bills linked invoice', () => {
  const job = db().jobs.find(j => j.title.includes('Water heater repair'));
  const inv = A.jobInvoice(job);
  if (!inv) throw new Error('no linked invoice');
  const item = db().inventory.find(i => i.name === 'Silicone sealant tube');
  const q0 = item.qty, nItems = inv.items.length, t0 = A.invTotal(inv);
  A.openJobModal(job.id);
  doc.querySelector('#modal-root .jd-mats').click();
  doc.querySelector('#mm-body .mm-item').value = item.id;
  doc.querySelector('#mm-body .mm-qty').value = '2';
  doc.getElementById('mm-save').click();
  if (item.qty !== q0 - 2) throw new Error('stock not deducted (' + q0 + ' → ' + item.qty + ')');
  if (inv.items.length !== nItems + 1) throw new Error('invoice line not added');
  const added = inv.items[inv.items.length - 1];
  if (added.kind !== 'Material' || added.qty !== 2) throw new Error('bad invoice line');
  if (A.invTotal(inv) !== t0 + Math.round(2 * item.price * 1.16)) throw new Error('invoice total not recomputed');
  if (!item.history[0].reason.includes(job.ref)) throw new Error('history not logged');
});

check('invoice detail: income breakdown panel sums to subtotal', () => {
  const job = db().jobs.find(j => j.title.includes('Water heater repair'));
  const inv = A.jobInvoice(job);
  A.go('invoice', { id: inv.id });
  const html = doc.getElementById('content').innerHTML;
  if (!html.includes('Income breakdown')) throw new Error('breakdown panel missing');
  const b = A.breakdown(inv.items);
  const sub = A.invSubtotal(inv);
  if (b.labour + b.materials + b.transport !== sub) throw new Error('breakdown does not equal subtotal');
});

check('customer history: revenue + last job stats', () => {
  const john = db().customers.find(c => c.name === 'John Mwangi');
  A.go('customer', { id: john.id });
  const html = doc.getElementById('content').innerHTML;
  if (!html.includes('Total revenue')) throw new Error('total revenue stat missing');
  if (!html.includes('Last job')) throw new Error('last job stat missing');
  const rev = db().invoices.filter(i => i.customerId === john.id).reduce((s,i) => s + A.invTotal(i), 0);
  if (!norm(html).includes(norm(ksh(rev)))) throw new Error('revenue value missing (expected ' + rev + ')');
});

check('AI engine: travel line is Transport kind', () => {
  const res = window.__ai.generate('burst-pipe', {area:'city'});
  const travel = res.lines.find(l => l.desc.startsWith('Travel fee'));
  if (!travel) throw new Error('no travel line');
  if (travel.kind !== 'Transport') throw new Error('travel line kind = ' + travel.kind);
});

check('settings: owner name field present + round-trips', () => {
  A.go('settings', {});
  const f = doc.getElementById('st-owner');
  if (!f) throw new Error('owner field missing');
  if (f.value !== 'Victor') throw new Error('owner field not seeded');
  f.value = 'VicTech';
  doc.getElementById('st-save').click();
  if (db().business.ownerName !== 'VicTech') throw new Error('owner name not saved');
});

} // end run()

setTimeout(() => {
  if (errors.length) { console.error(`\n${errors.length} FAILURE(S):`); errors.forEach(e => console.error(' - ' + e)); process.exit(1); }
  console.log('\nALL BUSINESS-OS TESTS PASSED ✅');
  process.exit(0);
}, 600);
