'use strict';
/* Round-9: role-based dashboards (admin + customer portal) + password eye toggle. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const errors = [];
function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — dashboards & password-visibility tests');

const files = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js','js/app.js','js/pdf.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/customer.js','js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/reports.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:9100/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
const doc = win.document;
win.localStorage.setItem('aquaflow_session_v1','guest');
win.scrollTo = () => {};
win.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });
win.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
try { win.eval(files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n')); }
catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

setTimeout(() => {
  const A = win.API;
  if (!A) { console.error('API not exposed'); process.exit(1); }
  const db = () => A.db;

  /* ---------- password eye toggle ---------- */
  check('pw-eye: sign-in password field has an eye toggle', () => {
    A.customerSignOut();
    const toggle = doc.querySelector('#au-pass + .pw-toggle, .pw-field .pw-toggle');
    if (!toggle) throw new Error('no pw-toggle next to sign-in password');
    const input = doc.getElementById('au-pass');
    if (input.type !== 'password') throw new Error('not a password input');
  });
  check('pw-eye: click shows the password, click again hides it', () => {
    const input = doc.getElementById('au-pass');
    const toggle = input.parentElement.querySelector('.pw-toggle');
    toggle.click();
    if (input.type !== 'text') throw new Error('did not switch to text');
    if (!toggle.classList.contains('on')) throw new Error('toggle state not set');
    toggle.click();
    if (input.type !== 'password') throw new Error('did not switch back to password');
  });
  const accountsJson = () => JSON.parse(win.localStorage.getItem('aquaflow_accounts_v1') || '[]');

  check('pw-eye: create-account + reset-password fields also toggled', () => {
    doc.getElementById('au-tab-up').click();
    const up = doc.getElementById('au-upass');
    if (!up) throw new Error('au-upass missing');
    if (!up.parentElement.querySelector('.pw-toggle')) throw new Error('no toggle on au-upass');
    doc.getElementById('au-tab-in').click();
    doc.getElementById('au-forgot').click();
    const fn = doc.getElementById('au-fnew');
    if (!fn) throw new Error('au-fnew missing in forgot view');
    if (!fn.parentElement.querySelector('.pw-toggle')) throw new Error('no toggle on au-fnew');
  });

  /* ---------- role picker on sign-up ---------- */
  check('roles: sign-up shows owner/customer picker, defaults to owner', () => {
    doc.getElementById('au-tab-up').click();
    const btns = doc.querySelectorAll('#au-rolepick .role-btn');
    if (btns.length !== 2) throw new Error('role picker missing');
    const active = doc.querySelector('#au-rolepick .role-btn.active');
    if (!active || active.dataset.role !== 'admin') throw new Error('default role not admin');
  });

  /* ---------- customer account created by admin ---------- */
  const CUST_A = { name: 'Amos Anyango', email: 'amos@test.co.ke', phone: '0722 000 001', area: 'Kilimani' };
  const CUST_B = { name: 'Brenda Wambui', email: 'brenda@test.co.ke', phone: '0733 111 112', area: 'Karen' };
  check('admin: customer card exposes "Customer account" action', () => {
    const ca = db().customers.find(c => c.name.includes('A'));
    A.go('customer', { id: ca.id });
    if (!doc.getElementById('cu-acc')) throw new Error('cu-acc button missing');
  });
  check('admin: create customer account (linked, role=customer)', () => {
    const ca = db().customers.find(c => c.name.includes('A'));
    A.go('customer', { id: ca.id });
    doc.getElementById('cu-acc').click();
    doc.getElementById('cacc-email').value = CUST_A.email;
    doc.getElementById('cacc-pass').value = 'amos-pass-1';
    doc.getElementById('cacc-sqa').value = 'kisumu';
    doc.getElementById('cacc-go').click();
    const acc = accountsJson().find(a => a.email === CUST_A.email);
    if (!acc) throw new Error('account not created');
    if (acc.role !== 'customer') throw new Error('role not customer');
    if (acc.custId !== ca.id) throw new Error('not linked to customer profile');
  });
  check('customer: sign-in lands in the customer portal (scoped shell)', () => {
    A.customerSignOut();
    doc.getElementById('au-email').value = CUST_A.email;
    doc.getElementById('au-pass').value = 'amos-pass-1';
    doc.getElementById('au-signin').click();
    if (doc.body.classList.contains('preauth')) throw new Error('not signed in: ' + doc.getElementById('au-msg').textContent);
    if (!doc.body.classList.contains('app-customer')) throw new Error('customer class missing');
    if (A.ui.view !== 'cust_dash') throw new Error('not on cust_dash, got ' + A.ui.view);
    const nav = doc.getElementById('nav').innerHTML;
    if (nav.includes('Expenses') || nav.includes('Inventory')) throw new Error('admin modules visible to customer');
    if (!nav.includes('My invoices')) throw new Error('customer nav missing');
  });
  check('customer: portal shows only their records (scoped data)', () => {
    const ca = db().customers.find(c => c.name.includes('A'));
    const cb = db().customers.find(c => c.id !== ca.id);
    if (!cb) throw new Error('no second customer in seed');
    // give A and B distinct, uniquely-reffed records (seed may already hold others)
    db().quotes.push({id:'q-cas', ref:'QUO-CASA', customerId:ca.id, jobId:null, title:'A works', items:[{kind:'Labor',desc:'Work',qty:2,unit:'hr',price:1000}], discount:0, vatRate:16, status:'Sent', validUntil:'2026-09-30', notes:'', ai:null, createdAt:'2026-08-01'});
    db().invoices.push({id:'inv-cas', ref:'INV-CASA', customerId:ca.id, jobId:null, quoteRef:'QUO-CASA', items:[{kind:'Labor',desc:'Work',qty:2,unit:'hr',price:1000}], discount:0, vatRate:16, issued:'2026-08-05', due:'2026-08-19', payments:[{date:'2026-08-06',amount:1000,method:'M-Pesa',note:''}], status:'Open', createdAt:'2026-08-05'});
    db().invoices.push({id:'inv-cbs', ref:'INV-CBSB', customerId:cb.id, jobId:null, quoteRef:null, items:[{kind:'Material',desc:'Pipe',qty:1,unit:'m',price:5000}], discount:0, vatRate:16, issued:'2026-08-07', due:'2026-08-21', payments:[], status:'Open', createdAt:'2026-08-07'});
    A.commit();
    A.go('cust_invoices', {});
    const h = doc.getElementById('content').innerHTML;
    if (!h.includes('INV-CASA')) throw new Error('own invoice missing');
    if (h.includes('INV-CBSB')) throw new Error('OTHER customer invoice leaked into portal');
    A.go('cust_quotes', {});
    const hq = doc.getElementById('content').innerHTML;
    if (!hq.includes('QUO-CASA')) throw new Error('own quote missing');
    if (hq.includes('INV-CBSB')) throw new Error('other data leaked into quotes');
  });
  check('customer: navigation to admin views is blocked (redirects to overview)', () => {
    A.go('invoices', {});
    if (A.ui.view !== 'cust_dash') throw new Error('customer reached admin invoices, got ' + A.ui.view);
    A.go('settings', {});
    if (A.ui.view !== 'cust_dash') throw new Error('customer reached settings');
  });
  check('customer: invoice detail is read-only (no record-payment / delete)', () => {
    const inv = db().invoices.find(i => i.ref === 'INV-CASA');
    A.go('cust_invoice', { id: inv.id });
    const h = doc.getElementById('content').innerHTML;
    if (!h.includes('INV-CASA')) throw new Error('detail not rendered');
    if (h.includes('Record payment')) throw new Error('payment action exposed to customer');
    if (h.includes('Delete')) throw new Error('delete exposed to customer');
    if (!h.includes('Download / print PDF')) throw new Error('PDF action missing');
  });
  check('customer: PDF of their own quote renders with business header', () => {
    const q = db().quotes.find(x => x.ref === 'QUO-CASA');
    A.openDoc('quote', q.id);
    if (!doc.getElementById('print-root').innerHTML.includes('QUO-CASA')) throw new Error('doc missing');
    A.closeDoc();
  });
  check('customer: help view has business contact + sign out', () => {
    A.go('cust_help', {});
    const h = doc.getElementById('content').innerHTML;
    if (!h.includes('Sign out')) throw new Error('sign out missing');
    if (!h.includes(db().business.name)) throw new Error('business name missing');
  });
  check('admin: switching to the customer session from their card works', () => {
    A.customerSignOut();
    // back to admin (guest) session
    A.switchToSession('guest');
    if (A.ui.view !== 'dashboard') throw new Error('admin shell not restored, got ' + A.ui.view);
    if (doc.body.classList.contains('app-customer')) throw new Error('customer class still set');
    const ca = db().customers.find(c => c.name.includes('A'));
    A.go('customer', { id: ca.id });
    doc.getElementById('cu-acc').click();
    doc.getElementById('cacc-open').click();
    if (A.ui.view !== 'cust_dash') throw new Error('did not switch into portal');
    if (!doc.body.classList.contains('app-customer')) throw new Error('customer class missing after switch');
  });
  check('customer: self sign-up without link shows the "not linked" state', () => {
    A.customerSignOut(); // -> auth screen (amos session cleared)
    doc.getElementById('au-tab-up').click();
    const custBtn = doc.querySelector('#au-rolepick .role-btn[data-role="customer"]');
    custBtn.click();
    doc.getElementById('au-name').value = 'Solo Signs';
    doc.getElementById('au-uemail').value = 'solo@test.co.ke';
    doc.getElementById('au-upass').value = 'solo-pass-1';
    doc.getElementById('au-sqa').value = 'nairobi';
    doc.getElementById('au-create').click();
    if (A.ui.view !== 'cust_dash') throw new Error('self customer did not land in portal, got ' + A.ui.view);
    const h = doc.getElementById('content').innerHTML;
    if (!/isn't linked to a customer profile/i.test(h)) throw new Error('not-linked banner missing');
    // cleanup: delete the temp account, back to the guest (admin) workspace
    const list = accountsJson().filter(a => a.email !== 'solo@test.co.ke');
    win.localStorage.setItem('aquaflow_accounts_v1', JSON.stringify(list));
    win.localStorage.removeItem('aquaflow_pms_v1:solo@test.co.ke');
    A.customerSignOut();
    A.switchToSession('guest');
    if (A.ui.view !== 'dashboard') throw new Error('did not return to admin dashboard, got ' + A.ui.view);
  });

  /* ---------- admin dashboard upgrades ---------- */
  check('admin dashboard: role chip + reminders + pipeline strip + recent activity', () => {
    A.go('dashboard', {});
    const h = doc.getElementById('content').innerHTML;
    if (!h.includes('Admin')) throw new Error('admin role chip missing');
    if (!h.includes('Reminders')) throw new Error('reminders button missing');
    if (!h.includes('Pipeline at a glance')) throw new Error('pipeline strip missing');
    if (!h.includes('Recent activity')) throw new Error('recent activity missing');
    // legacy KPIs intact
    if (!h.includes('Revenue (this month)')) throw new Error('revenue KPI regressed');
    if (!h.includes('Quotations pending')) throw new Error('quotes KPI regressed');
    if (!h.includes('Net profit')) throw new Error('profit KPI regressed');
  });

  check('pw-eye: change-password modal fields are toggled too', () => {
    // needs an account session (admin) — amos is a customer; use a temp admin account
    if (!accountsJson().some(a => a.email === 'boss@test.co.ke')) {
      // create one through the auth screen (role: owner)
      A.customerSignOut();
      doc.getElementById('au-tab-up').click();
      doc.querySelector('#au-rolepick .role-btn[data-role="admin"]').click();
      doc.getElementById('au-name').value = 'Boss Test';
      doc.getElementById('au-uemail').value = 'boss@test.co.ke';
      doc.getElementById('au-upass').value = 'boss-pass-1';
      doc.getElementById('au-sqa').value = 'nairobi';
      doc.getElementById('au-create').click();
    }
    A.switchToSession('boss@test.co.ke');
    if (doc.body.classList.contains('app-customer')) throw new Error('owner account treated as customer');
    A.go('settings', {});
    doc.getElementById('st-pw').click();
    const old = doc.getElementById('pw-old');
    const t = old.parentElement.querySelector('.pw-toggle');
    if (!t) throw new Error('no toggle in change-password modal');
    t.click();
    if (old.type !== 'text') throw new Error('toggle did not reveal password');
    A.closeModal();
  });

  setTimeout(() => finish(), 200);
  let done = false;
  function finish(){
    if (done) return; done = true;
    if (errors.length) {
      console.error(`\n${errors.length} FAILURE(S):`);
      errors.forEach(e => console.error(' - ' + e));
      process.exit(1);
    }
    console.log('\nALL DASHBOARD & PASSWORD-VISIBILITY TESTS PASSED ✅');
    process.exit(0);
  }
  setTimeout(finish, 4000); // safety
}, 400);
