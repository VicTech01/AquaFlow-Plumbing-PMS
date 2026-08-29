'use strict';
/* ================= bootstrap ================= */
const NAV = [
  ['dashboard','Dashboard','dashboard'],
  ['leads','Leads & Pipeline','userPlus'],
  ['jobs','Jobs & Scheduling','calendar'],
  ['dispatch','Dispatch','truck'],
  ['customers','Customers','users'],
  ['quotes','Quotations','doc'],
  ['invoices','Invoices & Payments','receipt'],
  ['expenses','Expenses','cash'],
  ['reports','Reports','chart'],
  ['inventory','Inventory','box'],
  ['maintenance','Maintenance','wrench'],
  ['whatsapp','WhatsApp','wa'],
  ['sync','Sync & Devices','sync'],
  ['settings','Settings','gear']
];

function buildNav(){
  $('#nav').innerHTML = NAV.map(([v,label,ic]) =>
    `<a data-view="${v}">${icon(ic,17)}<span>${label}</span></a>`).join('');
  $$('#nav a').forEach(a => a.onclick = () => go(a.dataset.view, {}));
}

function buildTabbar(){
  const items = [
    ['dashboard','Home','dashboard'],
    ['jobs','Jobs','calendar'],
    ['dispatch','Dispatch','truck'],
    ['customers','Customers','users'],
    ['more','More','spark']
  ];
  $('#tabbar').innerHTML = items.map(([v,l,ic]) =>
    `<button data-tab="${v}">${icon(ic,20)}<span>${l}</span></button>`).join('');
  $$('#tabbar button').forEach(b => b.onclick = () => {
    if(b.dataset.tab === 'more'){ openMoreSheet(); return; }
    go(b.dataset.tab, {});
  });
}

function badge(n, cls){ return n ? `<span class="chip c-${cls||'amber'}">${n}</span>` : ''; }

function openMoreSheet(){
  const t = isoDate(today());
  const nSentQ = db.quotes.filter(q => q.status === 'Sent').length;
  const nOverdue = db.invoices.filter(i => invState(i).label === 'Overdue').length;
  const nLow = db.inventory.filter(i => i.qty <= i.reorder).length;
  const nDue = db.maintenance.filter(m => dayDiff(t, nextDueDate(m)) <= 14).length;
  const nWa = db.outbox.filter(o => !o.sent).length;
  const nLead = db.leads.filter(l => l.status === 'New').length;
  const jobsToday = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status)).length;
  sheetOpen(`
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>More</h3><button class="x" data-close>✕</button></div>
    <div class="sheet-quick">
      <button class="btn primary sm" data-act="job">${icon('plus',14)} Job</button>
      <button class="btn ghost sm" data-act="quote">${icon('spark',14)} Quote</button>
      <button class="btn ghost sm" data-act="invoice">${icon('receipt',14)} Invoice</button>
      <button class="btn ghost sm" data-act="pay">${icon('cash',14)} Collect</button>
    </div>
    <div class="sheet-grid">
      <button class="sheet-item" data-goto="leads"><span class="ic">${icon('userPlus',17)}</span>Leads &amp; Pipeline${badge(nLead,'sky')}</button>
      <button class="sheet-item" data-goto="expenses"><span class="ic">${icon('cash',17)}</span>Expenses</button>
      <button class="sheet-item" data-goto="quotes"><span class="ic">${icon('doc',17)}</span>Quotations${badge(nSentQ,'violet')}</button>
      <button class="sheet-item" data-goto="invoices"><span class="ic">${icon('receipt',17)}</span>Invoices${badge(nOverdue,'red')}</button>
      <button class="sheet-item" data-goto="inventory"><span class="ic">${icon('box',17)}</span>Inventory${badge(nLow)}</button>
      <button class="sheet-item" data-goto="maintenance"><span class="ic">${icon('wrench',17)}</span>Maintenance${badge(nDue)}</button>
      <button class="sheet-item" data-goto="whatsapp"><span class="ic">${icon('wa',17)}</span>WhatsApp${badge(nWa)}</button>
      <button class="sheet-item" data-goto="sync"><span class="ic">${icon('sync',17)}</span>Sync &amp; Devices</button>
      <button class="sheet-item" data-goto="settings"><span class="ic">${icon('gear',17)}</span>Settings</button>
    </div>
    <div class="sheet-note">${jobsToday} job${jobsToday===1?'':'s'} on today's schedule · data stored on this device</div>`);
  $('#sheet [data-close]').onclick = sheetClose;
  $$('#sheet [data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto, {}));
  $$('#sheet [data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    sheetClose();
    if(a === 'job') jobModal({});
    else if(a === 'quote') go('quote_edit', {});
    else if(a === 'invoice') go('invoice_new', {});
    else if(a === 'pay') quickRecordPayment();
  });
}

function openActionsSheet(){
  sheetOpen(`
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>Quick add</h3><button class="x" data-close>✕</button></div>
    <div class="sheet-grid" style="grid-template-columns:1fr 1fr;padding-top:6px">
      <button class="sheet-item" data-act="job"><span class="ic">${icon('calendar',17)}</span>New job</button>
      <button class="sheet-item" data-act="cust"><span class="ic">${icon('users',17)}</span>New customer</button>
      <button class="sheet-item" data-act="lead"><span class="ic">${icon('userPlus',17)}</span>New lead</button>
      <button class="sheet-item" data-act="quote"><span class="ic">${icon('spark',17)}</span>New quotation</button>
      <button class="sheet-item" data-act="invoice"><span class="ic">${icon('receipt',17)}</span>New invoice</button>
      <button class="sheet-item" data-act="pay"><span class="ic">${icon('cash',17)}</span>Record payment</button>
      <button class="sheet-item" data-act="exp"><span class="ic">${icon('cash',17)}</span>Add expense</button>
      <button class="sheet-item" data-act="site"><span class="ic">${icon('pin',17)}</span>Site visit note</button>
    </div>`);
  $('#sheet [data-close]').onclick = sheetClose;
  $$('#sheet [data-act]').forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    sheetClose();
    if(a === 'job') jobModal({});
    else if(a === 'cust') { go('customers', {}); setTimeout(()=>{ const b2 = document.getElementById('cu-new'); if(b2) b2.click(); }, 60); }
    else if(a === 'lead') go('leads', {});
    else if(a === 'quote') go('quote_edit', {});
    else if(a === 'invoice') go('invoice_new', {});
    else if(a === 'pay') quickRecordPayment();
    else if(a === 'exp') go('expenses', {});
    else if(a === 'site') siteVisitModal();
  });
}

function bindTop(){
  $('#top-quick-job').onclick = () => jobModal({});
  $('#top-quick-quote').onclick = () => go('quote_edit', {});
  $('#top-plus').onclick = () => openActionsSheet();
  const bell = $('#top-bell');
  if(bell) bell.onclick = reminderSheet;
  const fab = $('#fab-plus');
  if(fab) fab.onclick = () => openActionsSheet();
  $('#scrim').onclick = () => sheetClose();
  $('#top-date').textContent = fmtDateFull(isoDate(today()));
  refreshBell();
}
function refreshBell(){
  const n = reminders().length;
  const badge = $('#bell-badge');
  if(badge){ badge.hidden = n === 0; badge.textContent = n > 99 ? '99+' : String(n); }
}

function initApp(){
  if(db) return;
  db = DB.load();
  // desktop: restore from the on-disk database file if browser storage is empty
  if(!db && window.__AQUAFLOW && window.__AQUAFLOW.loadPersisted && typeof SyncCore !== 'undefined'){
    try {
      const p = window.__AQUAFLOW.loadPersisted();
      if(p && SyncCore.isValidDb(JSON.parse(p))){ db = JSON.parse(p); DB.save(); }
    } catch(e){}
  }
  if(!db){
    db = DB.seed();
    toast('Loaded demo data — reset anytime in Settings');
  }
  initChangeTracking();
  // desktop: live-merge pushes arriving from the phone
  if(window.__AQUAFLOW && window.__AQUAFLOW.onDbChanged){
    window.__AQUAFLOW.onDbChanged(j => DB.adoptIncoming(j, {toastNote:'Synced new changes from another device'}));
  }
  buildNav();
  buildTabbar();
  bindTop();
  $('#side-foot').innerHTML = sideFootHTML();
  go('dashboard', {});
  window.API = {
    get db(){ return db; },
    get ui(){ return ui; },
    go, openModal, closeModal, toast, commit, waLink, chip, invState, invBalance, invTotal,
    invSubtotal, invPaid, jobStage, jobNextAction, jobInvoice, jobById, reRender,
    pushOutbox, aiGenerate, quoteTotal, openJobModal, jobModal, payModal,
    guessJobType, breakdown, greeting, monthKey,
    openMoreSheet, openActionsSheet, sheetClose,
    reminders, reminderSheet, refreshBell, jobLog, timelineHTML,
    openDoc, closeDoc, listAutoBackups, restoreAutoBackup, clearAutoBackups,
    addJobPhoto, photosHTML, compressImageFile, siteVisitModal,
    duplicateQuote, convertQuoteToJob, reportStats, reportPeriodRange,
    quoteDocHTML: (typeof quoteDocHTML !== 'undefined') ? quoteDocHTML : null,
    invoiceDocHTML: (typeof invoiceDocHTML !== 'undefined') ? invoiceDocHTML : null
  };
}

/* boot is handled by js/auth.js (account gate) → initApp() */
