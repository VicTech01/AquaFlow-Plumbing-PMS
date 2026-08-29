'use strict';
/* Interactive smoke test: simulates real user clicks through the UI. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const files = ['js/utils.js','js/seed.js','js/app.js',
  'js/views/dashboard.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/quotes.js','js/views/invoices.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/settings.js','js/main.js'];

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const doc = window.document;
const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
window.scrollTo = () => {}; // silence jsdom noise

const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
try { window.eval(code); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

const evt = (type, opts={}) => new window.Event(type, { bubbles: true, ...opts });
const mvt = (type, opts={}) => new window.MouseEvent(type, { bubbles: true, ...opts });

setTimeout(run, 150);
function run() {
  const A = window.API;
  const db = () => A.db;
  function check(name, fn) {
    try { fn(); console.log('  ✓', name); }
    catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
  }
  console.log('AquaFlow PMS — interactive UI tests');

  check('quote editor: create draft via UI clicks', () => {
    A.go('quote_edit', {});
    const cust = db().customers[0];
    doc.getElementById('qe-cust').value = cust.id;
    doc.getElementById('qe-cust').dispatchEvent(evt('change'));
    doc.getElementById('qe-title').value = 'Smoke test quote';
    doc.getElementById('qe-title').dispatchEvent(evt('input'));
    doc.getElementById('add-lab').click();
    const row = doc.querySelector('#items-body tr[data-i="0"]');
    row.querySelector('.isel').value = 'Labor — smoke';
    row.querySelector('.isel').dispatchEvent(evt('input'));
    doc.getElementById('qe-save').click();
    const q = db().quotes[0];
    if (q.title !== 'Smoke test quote') throw new Error('quote not saved: ' + q.title);
    if (!q.ref.startsWith('QUO-')) throw new Error('bad ref ' + q.ref);
    if (doc.getElementById('top-title').textContent !== 'Quotations') throw new Error('did not navigate to list');
  });

  check('job modal: schedule job via UI clicks', () => {
    A.jobModal({});
    doc.getElementById('jf-cust').value = db().customers[2].id;
    doc.getElementById('jf-title').value = 'Smoke scheduled job';
    doc.getElementById('jf-date').value = '2026-09-02';
    const tech = doc.querySelector('.jf-tech');
    tech.checked = true;
    doc.getElementById('jf-save').click();
    const j = db().jobs[db().jobs.length-1];
    if (j.title !== 'Smoke scheduled job') throw new Error('job not created');
    if (j.date !== '2026-09-02') throw new Error('bad date');
    if (j.technicianIds.length !== 1) throw new Error('tech not assigned');
    if (doc.getElementById('modal-root').innerHTML) throw new Error('modal did not close');
  });

  check('dispatch: dispatch button moves job + writes outbox', () => {
    A.go('dispatch', {});
    const btn = doc.querySelector('.dp-go');
    if (!btn) throw new Error('no dispatch button (no pending jobs?)');
    const jid = btn.dataset.j;
    const job = db().jobs.find(x => x.id === jid);
    const outBefore = db().outbox.length;
    btn.click();
    if (job.status !== 'Dispatched') throw new Error('job not dispatched');
    if (!job.technicianIds.length) throw new Error('no tech assigned on dispatch');
    if (db().outbox.length !== outBefore + 1) throw new Error('no outbox entry for dispatch');
  });

  check('calendar: clicking empty slot opens job modal prefilled', () => {
    A.go('jobs', {});
    const col = doc.querySelector('.daycol');
    if (!col) throw new Error('no calendar columns');
    col.dispatchEvent(mvt('click', { clientY: 100 }));
    if (!doc.getElementById('jf-date')) throw new Error('job modal did not open from calendar click');
    const date = doc.getElementById('jf-date').value;
    if (date !== col.dataset.date) throw new Error('date not prefilled: ' + date);
    A.closeModal();
  });

  check('job list: filters work', () => {
    A.go('jobs', {});
    // switch to list tab
    const tabs = doc.querySelectorAll('#content .tabs button');
    tabs[1].click();
    const rows0 = doc.querySelectorAll('#jl-body tr[data-job]').length;
    doc.getElementById('jl-status').value = 'Completed';
    doc.getElementById('jl-status').dispatchEvent(evt('change'));
    const rows1 = doc.querySelectorAll('#jl-body tr[data-job]').length;
    if (rows1 >= rows0) throw new Error(`filter did not reduce rows (${rows0} -> ${rows1})`);
    const st0 = db().jobs.filter(j => j.status === 'Completed').length;
    if (rows1 !== st0) throw new Error(`expected ${st0} completed rows, got ${rows1}`);
  });

  check('invoice: record full payment via payModal UI', () => {
    const inv = db().invoices.filter(i => i.status !== 'Draft' && A.invBalance(i) > 0)[0];
    A.payModal(inv);
    doc.getElementById('pay-go').click();
    if (A.invBalance(inv) !== 0) throw new Error('balance not zeroed');
    if (A.invState(inv).label !== 'Paid') throw new Error('not Paid');
    const hasPaymentWA = db().outbox.some(o => o.purpose === 'Payment received' && o.text.includes(inv.ref));
    if (!hasPaymentWA) throw new Error('no payment-received WA outbox entry');
  });

  check('inventory: adjust stock +5 via modal UI', () => {
    A.go('inventory', {});
    const btn = doc.querySelector('.iv-adj');
    const item = db().inventory.find(x => x.id === btn.dataset.i);
    const before = item.qty;
    btn.click();
    doc.getElementById('aj-qty').value = '5';
    doc.getElementById('aj-go').click();
    if (item.qty !== before + 5) throw new Error('qty not increased');
    if (!item.history.length || item.history[0].delta !== 5) throw new Error('history not logged');
  });

  check('maintenance: mark done via confirm dialog UI', () => {
    A.go('maintenance', {});
    const btn = doc.querySelector('.mt-done');
    if (!btn) throw new Error('no due maintenance to mark');
    const m = db().maintenance.find(x => x.id === btn.dataset.m);
    btn.click();
    if (!doc.getElementById('cf-yes')) throw new Error('confirm modal did not open');
    doc.getElementById('cf-yes').click();
    const t = new Date();
    const iso = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
    if (m.lastDone !== iso) throw new Error('lastDone not updated: ' + m.lastDone);
  });

  check('customers: add customer via modal UI', () => {
    A.go('customers', {});
    doc.getElementById('cu-new').click();
    doc.getElementById('cf-name').value = 'Smoke Customer Ltd';
    doc.getElementById('cf-phone').value = '0700 123 456';
    doc.getElementById('cf-save').click();
    const c = db().customers[db().customers.length-1];
    if (c.name !== 'Smoke Customer Ltd') throw new Error('customer not added');
    const link = doc.querySelectorAll('#content a[href^="https://wa.me/254700123456"]').length;
    if (!link) throw new Error('WA link for new customer missing/number not formatted');
  });

  check('whatsapp outbox: mark sent + copy buttons exist', () => {
    A.go('whatsapp', {});
    const mark = doc.querySelector('.wa-mark');
    if (mark) {
      const o = db().outbox.find(x => x.id === mark.dataset.o);
      mark.click();
      if (!o.sent) throw new Error('not marked sent');
    }
    if (!doc.querySelector('.wa-copy')) throw new Error('no copy buttons');
  });

  check('settings: save updates business rates', () => {
    A.go('settings', {});
    doc.getElementById('st-rate1').value = '1250';
    doc.getElementById('st-save').click();
    if (db().business.rates.standard !== 1250) throw new Error('rate not saved');
  });

  setTimeout(() => {
    if (errors.length) { console.error(`\n${errors.length} FAILURE(S):`); errors.forEach(e => console.error(' - ' + e)); process.exit(1); }
    console.log('\nALL INTERACTIVE TESTS PASSED ✅');
    process.exit(0);
  }, 200);
}
