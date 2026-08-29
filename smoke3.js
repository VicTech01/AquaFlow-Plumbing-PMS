'use strict';
/* Round-3 features: solar categories + mobile sheets + type filter. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const files = ['js/utils.js','js/seed.js','js/sync.js','js/app.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/settings.js','js/main.js'];

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
window.scrollTo = () => {};
window.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });

const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
try { window.eval(code); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

const evt = (type, opts={}) => new window.Event(type, { bubbles: true, ...opts });

setTimeout(run, 150);
function run() {
  const A = window.API;
  const db = () => A.db;
  function check(name, fn) {
    try { fn(); console.log('  ✓', name); }
    catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
  }
  console.log('AquaFlow PMS — round 3 feature tests');

  check('job categories include Solar + Drainage + Gas + Water supply', () => {
    A.go('jobs', {});
    A.jobModal({});
    const types = [...doc.querySelectorAll('#jf-type option')].map(o => o.value);
    ['Repair','Installation','Maintenance','Service','Inspection','Emergency','Solar','Drainage','Gas','Water supply']
      .forEach(t => { if(!types.includes(t)) throw new Error('missing type: ' + t); });
    A.closeModal();
  });

  check('solar AI scope: 300L water heater', () => {
    const r = A.aiGenerate('solar-gw', { level:'senior', urgency:'standard', access:'ground', area:'outskirts' });
    const gw = r.lines.find(l => l.desc === 'Solar water heater 300L (kit)');
    if (!gw) throw new Error('no GW line');
    const inv = db().inventory.find(i => i.name === 'Solar water heater 300L (kit)');
    if (gw.price !== inv.price) throw new Error('GW price not from stock');
    if (!r.lines.some(l => l.desc === 'EV200 controller')) throw new Error('no EV200 line');
    if (r.lines.length < 4) throw new Error('too few lines');
  });

  check('solar AI scope: 2-3kW PV system', () => {
    const r = A.aiGenerate('solar-pv', { level:'senior', urgency:'standard', access:'ground', area:'county' });
    if (!r.lines.some(l => l.desc === '3kW hybrid inverter')) throw new Error('no inverter');
    const panels = r.lines.find(l => l.desc === 'Solar PV 250W panel');
    if (!panels || panels.qty !== 10) throw new Error('bad panel qty');
    if (r.subtotal < 200000) throw new Error('PV estimate unrealistically low: ' + r.subtotal);
  });

  check('seeded solar job + quote exist', () => {
    const job = db().jobs.find(j => j.type === 'Solar');
    if (!job) throw new Error('no solar job in seed');
    const q = db().quotes.find(x => x.jobId === job.id);
    if (!q) throw new Error('no linked solar quote');
    if (A.quoteTotal(q) < 80000) throw new Error('solar quote too low: ' + A.quoteTotal(q));
  });

  check('type filter narrows job list to Solar only', () => {
    A.go('jobs', {});
    doc.querySelectorAll('#content .tabs button')[1].click();
    doc.getElementById('jl-type').value = 'Solar';
    doc.getElementById('jl-type').dispatchEvent(evt('change'));
    const rows = [...doc.querySelectorAll('#jl-body tr[data-job]')];
    if (!rows.length) throw new Error('no solar rows shown');
    if (rows.length > 1) throw new Error('filter leaked non-solar rows: ' + rows.length);
  });

  check('mobile more-sheet: content + badges + navigation', () => {
    A.openMoreSheet();
    const sheet = doc.getElementById('sheet');
    if (!sheet.innerHTML.includes('sheet-grid')) throw new Error('sheet not populated');
    if (!sheet.innerHTML.includes('data-goto="quotes"')) throw new Error('missing nav items');
    const before = db().quotes.filter(q => q.status === 'Sent').length;
    if (!sheet.innerHTML.includes('chip')) throw new Error('no badges rendered');
    sheet.querySelector('[data-goto="quotes"]').click();
    if (doc.getElementById('top-title').textContent !== 'Quotations') throw new Error('did not navigate');
  });

  check('action sheet: opens job modal after close', () => {
    A.openActionsSheet();
    const sheet = doc.getElementById('sheet');
    const btn = sheet.querySelector('[data-act="job"]');
    if (!btn) throw new Error('missing job action');
    btn.click();
    if (!doc.getElementById('jf-cust')) throw new Error('job modal did not open from sheet');
    A.closeModal();
  });

  check('tabbar exists with 5 tabs', () => {
    const tabs = doc.querySelectorAll('#tabbar button');
    if (tabs.length !== 5) throw new Error('expected 5 tabs, got ' + tabs.length);
  });

  setTimeout(() => {
    if (errors.length) { console.error(`\n${errors.length} FAILURE(S):`); errors.forEach(e => console.error(' - ' + e)); process.exit(1); }
    console.log('\nALL ROUND-3 TESTS PASSED ✅');
    process.exit(0);
  }, 250);
}
