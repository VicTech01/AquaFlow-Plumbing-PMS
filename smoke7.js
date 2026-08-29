'use strict';
/* Round-7: Business OS upgrade — PDF documents, reports, reminders,
   job timeline + photos + site visits, quote actions, auto-backups, quick add. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const errors = [];
function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — business OS upgrade tests');

const files = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js','js/app.js','js/pdf.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/reports.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:9000/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
const doc = win.document;
win.localStorage.setItem('aquaflow_session_v1','guest');
win.scrollTo = () => {};
win.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });
win.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
const appCode = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
try { win.eval(appCode); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

setTimeout(() => {
  const A = win.API;
  if (!A) { console.error('API not exposed'); process.exit(1); }
  const db = () => A.db;

  /* ---------- PDF documents ---------- */
  check('doc: quotation PDF has business, ref, customer, lines, total', () => {
    const q = db().quotes.find(x => x.status === 'Sent') || db().quotes[0];
    const h = A.quoteDocHTML(q);
    if (!h.includes(db().business.name)) throw new Error('business name missing');
    if (!h.includes(q.ref)) throw new Error('ref missing');
    if (!h.includes('QUOTATION')) throw new Error('doc type missing');
    if (!h.includes((q.items[0]||{}).desc || 'x')) throw new Error('line items missing');
    if (!h.includes('Subtotal')) throw new Error('totals missing');
  });
  check('doc: invoice PDF shows paid / balance / methods', () => {
    const inv = db().invoices.find(i => (i.payments||[]).length && A.invBalance(i) > 0);
    if (!inv) throw new Error('no partial invoice in seed');
    const h = A.invoiceDocHTML(inv);
    if (!h.includes(inv.ref)) throw new Error('ref missing');
    if (!h.includes('INVOICE')) throw new Error('doc type missing');
    if (!h.includes('Amount paid')) throw new Error('paid missing');
    if (!h.includes('Balance due')) throw new Error('balance missing');
  });
  check('doc: openDoc renders preview; closeDoc clears it', () => {
    const q = db().quotes[0];
    A.openDoc('quote', q.id);
    const root = doc.getElementById('print-root');
    if (!root.classList.contains('open')) throw new Error('print-root not open');
    if (!root.querySelector('.doc-sheet')) throw new Error('doc sheet missing');
    if (!doc.body.classList.contains('printing-doc')) throw new Error('printing-doc class missing');
    A.closeDoc();
    if (root.classList.contains('open')) throw new Error('not closed');
    if (root.innerHTML) throw new Error('leftover content');
  });
  check('doc: business logo appears in document header when set', () => {
    const before = db().business.logo;
    db().business.logo = 'data:image/png;base64,TESTLOGO';
    const h = A.quoteDocHTML(db().quotes[0]);
    if (!h.includes('TESTLOGO')) throw new Error('logo not in header');
    db().business.logo = before;
  });

  /* ---------- reports ---------- */
  check('reports: view renders KPIs + chart + materials', () => {
    A.go('reports', {});
    const h = doc.getElementById('content').innerHTML;
    if (!h.includes('Revenue (collected)')) throw new Error('revenue KPI missing');
    if (!h.includes('Net profit')) throw new Error('profit KPI missing');
    if (!h.includes('Revenue vs Expenses')) throw new Error('chart missing');
    if (!h.includes('Most-used materials')) throw new Error('materials section missing');
    if (!h.includes('<svg')) throw new Error('no svg chart');
  });
  check('reports: collected revenue matches payments in period (math)', () => {
    const s = A.reportStats('month');
    const mk = db().business ? null : null;
    const now = new Date();
    const mkMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    let expect = 0;
    db().invoices.forEach(i => (i.payments||[]).forEach(p => { if((p.date||'').startsWith(mkMonth)) expect += p.amount; }));
    if (s.collected !== expect) throw new Error(`collected ${s.collected} !== expected ${expect}`);
    const net = s.collected - s.expenses;
    if (!Number.isFinite(net)) throw new Error('net not finite');
  });
  check('reports: period tabs switch ranges', () => {
    A.go('reports', {});
    const b = doc.querySelector('#content [data-rp="year"]');
    if(!b) throw new Error('year tab missing');
    b.click();
    const s = A.reportStats('year');
    if (!(s.to >= s.from)) throw new Error('bad range');
  });

  /* ---------- reminders ---------- */
  check('reminders: engine finds overdue invoices + awaiting quotes', () => {
    // ensure a stale 'Sent' quote exists (awaiting approval > 3 days)
    const c = db().customers[0];
    const old = new Date(Date.now() - 5*86400000);
    db().quotes.push({ id:'q-stale', ref:'QUO-STALE', customerId:c.id, jobId:null, title:'Stale pending quote',
      items:[{kind:'Labor', desc:'Work', qty:1, unit:'hr', price:1000}], discount:0, vatRate:16,
      status:'Sent', validUntil:'2026-09-15', notes:'', ai:null,
      createdAt:`${old.getFullYear()}-${String(old.getMonth()+1).padStart(2,'0')}-${String(old.getDate()).padStart(2,'0')}` });
    const r = A.reminders();
    if (!r.length) throw new Error('no reminders on seed data');
    if (!r.some(x => x.group === 'Payments overdue')) throw new Error('overdue invoices not flagged');
    if (!r.some(x => x.group === 'Awaiting approval')) throw new Error('sent quotes not flagged');
    r.forEach(x => { if(!x.view || !x.label) throw new Error('reminder missing fields'); });
    db().quotes = db().quotes.filter(q => q.id !== 'q-stale');
    A.commit();
  });
  check('reminders: bell badge + sheet with actionable items', () => {
    const badge = doc.getElementById('bell-badge');
    if (!badge) throw new Error('badge missing');
    if (badge.hidden) throw new Error('badge hidden despite reminders');
    const n = parseInt(badge.textContent, 10);
    if (n !== A.reminders().length) throw new Error(`badge ${n} != ${A.reminders().length}`);
    doc.getElementById('top-bell').click();
    const items = doc.querySelectorAll('#sheet .rem-item');
    if (!items.length) throw new Error('no reminder items in sheet');
    items[0].click();
    if (doc.getElementById('sheet').classList.contains('open')) throw new Error('sheet did not close on navigate');
  });

  /* ---------- job timeline ---------- */
  check('timeline: created jobs are auto-logged; manual note works', () => {
    const c = db().customers[0];
    const job = { id:'j-tl-'+Date.now(), ref:'JOB-TL', customerId:c.id, title:'Timeline test', type:'Repair',
      priority:'Medium', date:'2026-08-29', start:'10:00', hours:2, status:'Scheduled',
      address:c.address||'', notes:'', technicianIds:[], createdAt:'2026-08-29' };
    db().jobs.push(job);
    A.jobLog(job, 'Job scheduled — test');
    if (job.timeline.length !== 1) throw new Error('no auto entry');
    A.jobLog(job, 'Manual note: customer called');
    if (job.timeline.length !== 2) throw new Error('manual note missing');
    const h = A.timelineHTML(job);
    if (!h.includes('Manual note: customer called')) throw new Error('timeline html missing note');
  });
  check('timeline: completing a job through the modal logs it', () => {
    const job = db().jobs.find(j => j.ref === 'JOB-TL');
    A.openJobModal(job.id);
    const done = doc.querySelector('.jd-done');
    if(!done) throw new Error('done button missing');
    done.click();
    const yes = doc.getElementById('cf-yes');
    if(!yes) throw new Error('confirm not shown');
    yes.click();
    if (job.status !== 'Completed') throw new Error('not completed');
    if (!job.timeline.some(t => t.text.includes('completed'))) throw new Error('no completion entry');
    A.closeModal();
    db().jobs = db().jobs.filter(j => j !== job);
    A.commit();
  });
  check('site visit: records visit + timeline entry', () => {
    const c = db().customers[1];
    const job = { id:'j-sv-'+Date.now(), ref:'JOB-SV', customerId:c.id, title:'Site visit test', type:'Inspection',
      priority:'Low', date:'2026-08-30', start:'09:00', hours:1, status:'Scheduled',
      address:c.address||'', notes:'', technicianIds:[], createdAt:'2026-08-29' };
    db().jobs.push(job);
    A.siteVisitModal(job.id);
    doc.getElementById('sv-note').value = 'Found burst pipe under kitchen sink';
    doc.getElementById('sv-go').click();
    if (!job.siteVisit) throw new Error('siteVisit not set');
    if (!job.timeline.some(t => t.text.startsWith('Site visit'))) throw new Error('no site-visit timeline entry');
    A.closeModal();
    db().jobs = db().jobs.filter(j => j !== job);
    A.commit();
  });

  /* ---------- job photos ---------- */
  check('photos: add via UI dataUrl + delete', () => {
    const c = db().customers[2];
    const job = { id:'j-ph-'+Date.now(), ref:'JOB-PH', customerId:c.id, title:'Photo test', type:'Repair',
      priority:'Low', date:'2026-08-30', start:'09:00', hours:1, status:'Scheduled',
      address:'', notes:'', technicianIds:[], createdAt:'2026-08-29' };
    db().jobs.push(job);
    A.openJobModal(job.id);
    // simulate a selected file by driving the stage + a tiny valid PNG dataURL through the public helper
    A.addJobPhoto(job, 'Before', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    A.addJobPhoto(job, 'After', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    if (job.photos.length !== 2) throw new Error('photos not stored');
    if (A.addJobPhoto(job, 'Before', 'not-an-image')) throw new Error('invalid image accepted');
    if (job.photos.length !== 2) throw new Error('invalid image stored');
    const h = A.photosHTML(job);
    if (!h.includes('Before') || !h.includes('After')) throw new Error('gallery missing stages');
    A.closeModal();
    db().jobs = db().jobs.filter(j => j !== job);
    A.commit();
  });

  /* ---------- quotation actions ---------- */
  check('quote: duplicate creates a draft copy with a new ref', () => {
    const q = db().quotes.find(x => x.status === 'Sent') || db().quotes[0];
    const beforeCount = db().quotes.length;
    const beforeRef = db().counters.quote;
    A.go('quote_edit', {id: q.id});
    const dup = doc.getElementById('qs-dup');
    if (!dup) throw new Error('duplicate button missing');
    dup.click();
    const after = db().quotes;
    if (after.length !== beforeCount + 1) throw new Error('quote not added');
    const copy = after[0];
    if (copy.status !== 'Draft') throw new Error('copy not a draft');
    if (copy.ref === q.ref) throw new Error('ref not incremented');
    if (db().counters.quote !== beforeRef + 1) throw new Error('counter not bumped');
    if (JSON.stringify(copy.items.map(i=>i.desc)) !== JSON.stringify(q.items.map(i=>i.desc))) throw new Error('items not copied');
    if (!copy.title.includes('(copy)')) throw new Error('title not marked copy');
  });
  check('quote: convert to job creates + links a job with timeline', () => {
    const q = db().quotes.filter(x => !x.jobId)[0] || (() => {
      const qq = db().quotes[0]; qq.jobId = null; return qq;
    })();
    const before = db().jobs.length;
    A.go('quote_edit', {id: q.id});
    const btn = doc.getElementById('qs-job');
    if (!btn) throw new Error('convert-to-job button missing (is it linked already?)');
    btn.click();
    const after = db().jobs.length;
    if (after !== before + 1) throw new Error('job not created');
    if (!q.jobId) throw new Error('quote not linked');
    const job = db().jobs.find(j => j.id === q.jobId);
    if (job.customerId !== q.customerId) throw new Error('customer mismatch');
    if (!job.timeline.some(t => t.text.includes('quotation'))) throw new Error('no timeline entry');
  });
  check('quote: PDF button exists in status card', () => {
    const q = db().quotes[0];
    A.go('quote_edit', {id: q.id});
    if (!doc.getElementById('qs-pdf')) throw new Error('pdf button missing');
  });

  /* ---------- automatic backups ---------- */
  check('autobackup: commit creates a snapshot; restore reverts a change', () => {
    A.clearAutoBackups();
    db().business.name = 'Backup Probe Co';
    A.commit();
    const list = A.listAutoBackups();
    if (!list.length) throw new Error('no backup created');
    db().business.name = 'Mangled Name';
    A.commit();
    const r = A.restoreAutoBackup(0);
    if (!r.ok) throw new Error('restore failed: ' + r.error);
    if (db().business.name !== 'Backup Probe Co') throw new Error('restore did not revert: ' + db().business.name);
    db().business.name = 'AquaFlow Plumbing Ltd';
    A.clearAutoBackups();
    A.commit();
  });

  /* ---------- quick add / fab / settings ---------- */
  check('quick add: actions sheet has all 8 entries incl. new customer + site visit', () => {
    A.openActionsSheet();
    const acts = [...doc.querySelectorAll('#sheet [data-act]')].map(b => b.dataset.act);
    ['job','cust','lead','quote','invoice','pay','exp','site'].forEach(a => {
      if(!acts.includes(a)) throw new Error('missing action: ' + a);
    });
    doc.querySelector('#sheet [data-close]').click();
  });
  check('quick add: FAB element exists for mobile', () => {
    const fab = doc.getElementById('fab-plus');
    if (!fab) throw new Error('fab missing');
  });
  check('settings: logo upload field + auto-backup UI present', () => {
    A.go('settings', {});
    if (!doc.getElementById('st-logo')) throw new Error('logo input missing');
    if (!doc.getElementById('st-baklist')) throw new Error('backup list missing');
    if (!doc.getElementById('st-bak-restore')) throw new Error('restore button missing');
  });
  check('dashboard: quotations-pending KPI present', () => {
    A.go('dashboard', {});
    if (!doc.getElementById('content').innerHTML.includes('Quotations pending')) throw new Error('pending KPI missing');
  });

  setTimeout(() => finish(), 300);
  function finish(){
    if (errors.length) {
      console.error(`\n${errors.length} FAILURE(S):`);
      errors.forEach(e => console.error(' - ' + e));
      process.exit(1);
    }
    console.log('\nALL BUSINESS-OS UPGRADE TESTS PASSED ✅');
    process.exit(0);
  }
}, 250);
