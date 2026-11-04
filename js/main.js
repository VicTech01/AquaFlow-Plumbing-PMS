'use strict';
/* ================= bootstrap =================
   Shell concerns only: navigation, topbar, theme, global search (command
   palette) and keyboard shortcuts. No business logic lives here — data reads
   go through the same helpers the views use, and nothing here writes records. */
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

/* Grouped information architecture — 14 flat items is a scan-and-hunt list.
   Four decision-oriented sections put money and work first. */
const NAV_GROUPS = [
  {label:'Overview', items:['dashboard','reports']},
  {label:'Work',     items:['jobs','dispatch','maintenance']},
  {label:'Sales',    items:['leads','quotes','customers']},
  {label:'Money',    items:['invoices','expenses']},
  {label:'Stock & messages', items:['inventory','whatsapp']},
  {label:'System',   items:['sync','settings']}
];
const NAV_MAP = Object.fromEntries(NAV.map(([v,l,i]) => [v,{view:v,label:l,icon:i}]));

const CUSTOMER_NAV = [
  ['cust_dash','Overview','dashboard'],
  ['cust_quotes','My quotes','doc'],
  ['cust_invoices','My invoices','receipt'],
  ['cust_jobs','My jobs','calendar'],
  ['cust_help','Help & contact','chat']
];

/* ---------- navigation badges: "what needs me?" at a glance ---------- */
function navBadges(){
  const out = {};
  if(!db || isCustomerSession()) return out;
  try{
    const t = isoDate(today());
    out.leads = {n: db.leads.filter(l => l.status === 'New').length, tone:'info'};
    out.quotes = {n: db.quotes.filter(q => q.status === 'Sent').length, tone:'info'};
    out.invoices = {n: db.invoices.filter(i => i.status !== 'Draft' && invState(i).label === 'Overdue').length, tone:'bad'};
    out.inventory = {n: db.inventory.filter(i => i.qty <= i.reorder).length, tone:'warn'};
    out.jobs = {n: db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status)).length, tone:'info'};
    out.dispatch = {n: db.jobs.filter(j => j.status === 'Scheduled' && j.date >= t && !(j.technicianIds||[]).length).length, tone:'warn'};
    out.maintenance = {n: db.maintenance.filter(m => dayDiff(t, nextDueDate(m)) <= 14).length, tone:'warn'};
    out.whatsapp = {n: db.outbox.filter(o => !o.sent).length, tone:'info'};
  }catch(e){}
  return out;
}
function navBadgeHTML(b){
  if(!b || !b.n) return '';
  return `<span class="nav-badge ${b.tone||''}">${b.n > 99 ? '99+' : b.n}</span>`;
}
function refreshNavBadges(){
  if(!db || isCustomerSession()) return;
  const b = navBadges();
  $$('#nav a[data-view]').forEach(a => {
    const old = a.querySelector('.nav-badge');
    if(old) old.remove();
    const html = navBadgeHTML(b[a.dataset.view]);
    if(html) a.insertAdjacentHTML('beforeend', html);
  });
}

function buildNav(){
  if(isCustomerSession()){
    $('#nav').innerHTML = CUSTOMER_NAV.map(([v,label,ic]) =>
      `<a data-view="${v}" title="${esc(label)}" role="link">${icon(ic,17)}<span class="nav-lbl">${label}</span></a>`).join('') +
      `<a id="nav-signout" data-csignout title="Sign out">${icon('logout',17)}<span class="nav-lbl">Sign out</span></a>`;
    $$('#nav a[data-view]').forEach(a => a.onclick = () => go(a.dataset.view, {}));
    const so = $('#nav-signout');
    if(so) so.onclick = customerSignOut;
    return;
  }
  $('#nav').innerHTML = NAV_GROUPS.map(g => {
    const items = g.items.map(v => NAV_MAP[v]).filter(Boolean).map(m =>
      `<a data-view="${m.view}" title="${esc(m.label)}">${icon(m.icon,17)}<span class="nav-lbl">${m.label}</span></a>`).join('');
    return `<div class="nav-sec"><div class="nav-sec-l">${g.label}</div>${items}</div>`;
  }).join('');
  $$('#nav a').forEach(a => a.onclick = () => go(a.dataset.view, {}));
  refreshNavBadges();
}

function buildTabbar(){
  let items;
  if(isCustomerSession()){
    items = [
      ['cust_dash','Home','dashboard'],
      ['cust_quotes','Quotes','doc'],
      ['cust_invoices','Invoices','receipt'],
      ['cust_jobs','Jobs','calendar'],
      ['cust_help','Help','chat']
    ];
  } else {
    items = [
      ['dashboard','Home','dashboard'],
      ['jobs','Jobs','calendar'],
      ['dispatch','Dispatch','truck'],
      ['customers','Customers','users'],
      ['more','More','spark']
    ];
  }
  $('#tabbar').innerHTML = items.map(([v,l,ic]) =>
    `<button type="button" data-tab="${v}" aria-label="${esc(l)}">${icon(ic,20)}<span>${l}</span></button>`).join('');
  $$('#tabbar button').forEach(b => b.onclick = () => {
    if(b.dataset.tab === 'more'){ openMoreSheet(); return; }
    go(b.dataset.tab, {});
  });
}

/* ---------- role-aware session switching ---------- */
function customerSignOut(){
  AUTH.signOut();
  document.body.classList.remove('app-customer');
  AUTH.renderAuth();
}
function switchToSession(email){
  AUTH.signIn(email);
  AUTH.hideAuth();
  const role = AUTH.role(email);
  if(role === 'customer'){
    db = DB.loadFor(email) || db || DB.load();
  } else {
    db = DB.load();
    if(!db){
      const a = AUTH.byEmail(email);
      db = emptyDb(a ? a.name : 'Boss');
      DB.save();
    }
  }
  window.__AF_SESSION = email;
  document.body.classList.toggle('app-customer', role === 'customer');
  buildNav();
  buildTabbar();
  initChangeTracking();
  updateProfileChip();
  go(role === 'customer' ? 'cust_dash' : 'dashboard', {});
  toast(`Signed in as ${AUTH.byEmail(email)?.name || email} (${role})`);
}

function badge(n, cls){ return n ? `<span class="chip c-${cls||'amber'}">${n}</span>` : ''; }

/* ---------- topbar contextual subtitle: what am I looking at? ---------- */
const VIEW_SUBS = {
  dashboard(){
    const t = isoDate(today());
    const n = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status)).length;
    const out = sum(db.invoices, invBalance);
    return `${n} job${n===1?'':'s'} today · ${money(out)} outstanding`;
  },
  jobs(){
    const t = isoDate(today());
    const act = db.jobs.filter(j => !['Cancelled','Completed'].includes(j.status) && j.date >= t).length;
    return `${db.jobs.length} total · ${act} upcoming`;
  },
  dispatch(){
    const t = isoDate(today());
    const out = db.technicians.filter(x=>x.active).length;
    const waiting = db.jobs.filter(j => j.status === 'Scheduled' && j.date >= t).length;
    return `${out} technician${out===1?'':'s'} · ${waiting} waiting to dispatch`;
  },
  leads(){
    const n = db.leads.filter(l => !['Won','Lost'].includes(l.status)).length;
    const v = sum(db.leads.filter(l => !['Lost'].includes(l.status)), l => Number(l.budget)||0);
    return `${n} open · ${money(v)} pipeline value`;
  },
  customers(){ return `${db.customers.length} on file`; },
  quotes(){
    const sent = db.quotes.filter(q => q.status === 'Sent');
    return `${db.quotes.length} total · ${sent.length} awaiting approval (${money(sum(sent, quoteTotal))})`;
  },
  invoices(){
    const out = sum(db.invoices.filter(i=>i.status!=='Draft'), invBalance);
    const od = db.invoices.filter(i => invState(i).label === 'Overdue').length;
    return `${money(out)} outstanding · ${od} overdue`;
  },
  expenses(){
    const mk = monthKey(today());
    return `${money(expMonthTotal(mk))} spent this month`;
  },
  reports(){ return 'Period performance across the whole business'; },
  inventory(){
    const val = sum(db.inventory, i => (i.qty||0) * (i.price||0));
    const low = db.inventory.filter(i => i.qty <= i.reorder).length;
    return `${db.inventory.length} items · ${money(val)} stock value · ${low} low`;
  },
  maintenance(){
    const t = isoDate(today());
    const due = db.maintenance.filter(m => dayDiff(t, nextDueDate(m)) <= 14).length;
    return `${db.maintenance.length} plans · ${due} due within 14 days`;
  },
  whatsapp(){
    const n = db.outbox.filter(o => !o.sent).length;
    return `${n} message${n===1?'':'s'} ready to send`;
  },
  sync(){ return 'Offline-first — your data lives on this device'; },
  settings(){ return 'Business profile, rates, templates & backups'; },
  customer(){ return 'Customer record'; },
  invoice(){ return 'Invoice detail'; },
  quote(){ return 'Quotation detail'; },
  quote_edit(){ return 'Quotation editor'; },
  invoice_new(){ return 'New invoice'; }
};
function updateTopSub(){
  const el = $('#top-sub');
  if(!el) return;
  let s = '';
  try{
    const f = VIEW_SUBS[ui.view];
    if(f && db && !isCustomerSession()) s = f() || '';
    else if(isCustomerSession()) s = 'Customer portal — your quotes, invoices & jobs';
    else if(db && db.business) s = esc(db.business.name);
  }catch(e){ s = ''; }
  el.textContent = s;
}

/* ---------- theme (light / dark, persisted, honours the OS by default) ---------- */
const THEME_KEY = 'aquaflow_theme_v1';
function currentTheme(){
  const t = document.documentElement.getAttribute('data-theme');
  if(t === 'dark' || t === 'light') return t;
  try{
    if(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  }catch(e){}
  return 'light';
}
function setTheme(t, {quiet=false} = {}){
  if(t !== 'dark' && t !== 'light') t = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', t === 'dark' ? '#071320' : '#0b1b2b');
  syncThemeUI();
  if(!quiet) toast(t === 'dark' ? 'Dark mode on' : 'Light mode on');
}
function toggleTheme(){ setTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
function syncThemeUI(){
  const dark = currentTheme() === 'dark';
  const st = $('#side-theme');
  if(st){
    st.innerHTML = icon(dark ? 'sun' : 'moon', 16);
    st.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    st.setAttribute('aria-label', st.title);
  }
  $$('[data-theme-btn]').forEach(b => {
    const on = b.dataset.themeBtn === (dark ? 'dark' : 'light');
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/* ---------- account chip in the topbar ---------- */
function updateProfileChip(){
  const av = $('#top-avatar'), nm = $('#top-pname'), rl = $('#top-prole'), btn = $('#top-profile');
  if(!btn) return;
  const sess = (typeof AUTH !== 'undefined') ? AUTH.session() : '';
  const acc = (sess && sess !== 'guest' && typeof AUTH !== 'undefined') ? AUTH.byEmail(sess) : null;
  const cust = isCustomerSession();
  const name = acc ? acc.name : (db && db.business && db.business.ownerName) ? db.business.ownerName : 'Guest';
  if(av) av.textContent = initials(name);
  if(nm) nm.textContent = name;
  if(rl) rl.textContent = cust ? 'Customer' : (sess && sess !== 'guest' ? 'Admin' : 'Guest');
  btn.setAttribute('aria-label', `Account — ${name}`);
}
function closeMenu(){
  const r = $('#menu-root');
  if(r) r.innerHTML = '';
  const b = $('#top-profile');
  if(b) b.setAttribute('aria-expanded','false');
}
function openProfileMenu(){
  const r = $('#menu-root');
  if(!r) return;
  if(r.innerHTML){ closeMenu(); return; }
  const sess = (typeof AUTH !== 'undefined') ? AUTH.session() : '';
  const acc = (sess && sess !== 'guest' && typeof AUTH !== 'undefined') ? AUTH.byEmail(sess) : null;
  const name = acc ? acc.name : (db && db.business && db.business.ownerName) || 'Guest';
  const dark = currentTheme() === 'dark';
  r.innerHTML = `<div class="menu" role="menu" id="profile-menu">
    <div class="menu-head"><b>${esc(name)}</b><span>${esc(acc ? acc.email : (sess === 'guest' ? 'Local guest workspace' : 'VicTech account'))}</span></div>
    <div class="menu-row"><span>${dark ? 'Dark' : 'Light'} appearance</span>
      <div class="theme-seg" role="group" aria-label="Appearance">
        <button type="button" data-theme-btn="light" title="Light">${icon('sun',14)}</button>
        <button type="button" data-theme-btn="dark" title="Dark">${icon('moon',14)}</button>
      </div></div>
    <div class="menu-sep"></div>
    <button class="menu-item" type="button" data-mi="search" role="menuitem">${icon('search',16)} Search everything <span class="kbd">Ctrl K</span></button>
    <button class="menu-item" type="button" data-mi="settings" role="menuitem">${icon('gear',16)} Business settings</button>
    <button class="menu-item" type="button" data-mi="sync" role="menuitem">${icon('sync',16)} Sync &amp; backups</button>
    <button class="menu-item" type="button" data-mi="keys" role="menuitem">${icon('sliders',16)} Keyboard shortcuts</button>
    <div class="menu-sep"></div>
    <button class="menu-item danger" type="button" data-mi="out" role="menuitem">${icon('logout',16)} Sign out</button>
  </div>`;
  const b = $('#top-profile');
  if(b) b.setAttribute('aria-expanded','true');
  syncThemeUI();
  $$('#profile-menu [data-theme-btn]').forEach(x => x.onclick = () => { setTheme(x.dataset.themeBtn); });
  $$('#profile-menu [data-mi]').forEach(x => x.onclick = () => {
    const a = x.dataset.mi;
    closeMenu();
    if(a === 'search') cmdkOpen();
    else if(a === 'settings') go('settings', {});
    else if(a === 'sync') go('sync', {});
    else if(a === 'keys') shortcutsModal();
    else if(a === 'out'){
      if(typeof AUTH !== 'undefined'){ AUTH.signOut(); document.body.classList.remove('app-customer'); AUTH.renderAuth(); }
    }
  });
}
function shortcutsModal(){
  const row = (k, d) => `<div class="spread" style="padding:7px 0;border-bottom:1px dashed var(--border-soft)">
    <span class="small">${d}</span><span class="kbd">${k}</span></div>`;
  openModal('Keyboard shortcuts', `
    <p class="muted small mb12">Built for the desktop app — everything is reachable without the mouse.</p>
    ${row('Ctrl + K','Search customers, jobs, quotes, invoices, stock…')}
    ${row('Ctrl + J','New job')}
    ${row('Ctrl + Q','New quotation')}
    ${row('Ctrl + I','New invoice')}
    ${row('Ctrl + P','Record a payment')}
    ${row('Ctrl + B','Collapse / expand the sidebar')}
    ${row('Ctrl + D','Toggle dark mode')}
    ${row('Esc','Close dialog, sheet or search')}
    ${row('?','This list')}
  `, {width:'sm', footerHtml:`<button class="btn primary" id="sc-ok">Got it</button>`,
      onMount(){ $('#sc-ok').onclick = closeModal; }});
}

/* ---------- sidebar rail (desktop density preference) ---------- */
const RAIL_KEY = 'aquaflow_nav_rail_v1';
function initNavRail(){
  const l = $('#layout');
  if(!l) return;
  let on = false;
  try{ on = localStorage.getItem(RAIL_KEY) === '1'; }catch(e){}
  l.classList.toggle('nav-rail', on);
  const b = $('#top-nav-toggle');
  if(b){
    b.setAttribute('aria-expanded', on ? 'false' : 'true');
    b.title = on ? 'Expand sidebar' : 'Collapse sidebar';
    b.onclick = () => {
      const next = !l.classList.contains('nav-rail');
      l.classList.toggle('nav-rail', next);
      try{ next ? localStorage.setItem(RAIL_KEY,'1') : localStorage.removeItem(RAIL_KEY); }catch(e){}
      b.setAttribute('aria-expanded', next ? 'false' : 'true');
      b.title = next ? 'Expand sidebar' : 'Collapse sidebar';
    };
  }
}

function openMoreSheet(){
  const t = isoDate(today());
  const nSentQ = db.quotes.filter(q => q.status === 'Sent').length;
  const nOverdue = db.invoices.filter(i => invState(i).label === 'Overdue').length;
  const nLow = db.inventory.filter(i => i.qty <= i.reorder).length;
  const nDue = db.maintenance.filter(m => dayDiff(t, nextDueDate(m)) <= 14).length;
  const nWa = db.outbox.filter(o => !o.sent).length;
  const nLead = db.leads.filter(l => l.status === 'New').length;
  const jobsToday = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status)).length;
  const dark = currentTheme() === 'dark';
  sheetOpen(`
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>More</h3><button class="x" data-close aria-label="Close">✕</button></div>
    <div class="sheet-quick">
      <button class="btn primary sm" data-act="job">${icon('plus',14)} Job</button>
      <button class="btn ghost sm" data-act="quote">${icon('spark',14)} Quote</button>
      <button class="btn ghost sm" data-act="invoice">${icon('receipt',14)} Invoice</button>
      <button class="btn ghost sm" data-act="pay">${icon('cash',14)} Collect</button>
      <button class="btn ghost sm" data-act="search">${icon('search',14)} Search</button>
    </div>
    <div class="sheet-sec eyebrow">Sales &amp; money</div>
    <div class="sheet-grid" style="padding-top:0">
      <button class="sheet-item" data-goto="leads"><span class="ic">${icon('userPlus',17)}</span>Leads &amp; Pipeline${badge(nLead,'sky')}</button>
      <button class="sheet-item" data-goto="quotes"><span class="ic">${icon('doc',17)}</span>Quotations${badge(nSentQ,'violet')}</button>
      <button class="sheet-item" data-goto="invoices"><span class="ic">${icon('receipt',17)}</span>Invoices${badge(nOverdue,'red')}</button>
      <button class="sheet-item" data-goto="expenses"><span class="ic">${icon('cash',17)}</span>Expenses</button>
      <button class="sheet-item" data-goto="reports"><span class="ic">${icon('chart',17)}</span>Reports</button>
      <button class="sheet-item" data-goto="customers"><span class="ic">${icon('users',17)}</span>Customers</button>
    </div>
    <div class="sheet-sec eyebrow">Stock, service &amp; system</div>
    <div class="sheet-grid" style="padding-top:0">
      <button class="sheet-item" data-goto="inventory"><span class="ic">${icon('box',17)}</span>Inventory${badge(nLow)}</button>
      <button class="sheet-item" data-goto="maintenance"><span class="ic">${icon('wrench',17)}</span>Maintenance${badge(nDue)}</button>
      <button class="sheet-item" data-goto="whatsapp"><span class="ic">${icon('wa',17)}</span>WhatsApp${badge(nWa)}</button>
      <button class="sheet-item" data-goto="sync"><span class="ic">${icon('sync',17)}</span>Sync &amp; Devices</button>
      <button class="sheet-item" data-goto="settings"><span class="ic">${icon('gear',17)}</span>Settings</button>
      <button class="sheet-item" data-act="theme"><span class="ic">${icon(dark?'sun':'moon',17)}</span>${dark?'Light mode':'Dark mode'}</button>
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
    else if(a === 'search') cmdkOpen();
    else if(a === 'theme') toggleTheme();
  });
}

function openActionsSheet(){
  sheetOpen(`
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>Quick add</h3><button class="x" data-close aria-label="Close">✕</button></div>
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
  const qj = $('#top-quick-job'); if(qj) qj.onclick = () => jobModal({});
  const qq = $('#top-quick-quote'); if(qq) qq.onclick = () => go('quote_edit', {});
  const tp = $('#top-plus'); if(tp) tp.onclick = () => openActionsSheet();
  const bell = $('#top-bell');
  if(bell){
    bell.style.display = isCustomerSession() ? 'none' : 'grid';
    bell.onclick = reminderSheet;
  }
  const fab = $('#fab-plus');
  if(fab) fab.onclick = () => openActionsSheet();
  const scrim = $('#scrim');
  if(scrim) scrim.onclick = () => sheetClose();
  const dt = $('#top-date');
  if(dt) dt.textContent = fmtDateFull(isoDate(today()));

  /* global search */
  const ts = $('#top-search'); if(ts) ts.onclick = () => cmdkOpen();
  const ss = $('#side-search'); if(ss) ss.onclick = () => cmdkOpen();
  const st = $('#side-theme'); if(st) st.onclick = () => toggleTheme();
  const pb = $('#top-profile'); if(pb) pb.onclick = e => { e.stopPropagation(); openProfileMenu(); };
  document.addEventListener('click', e => {
    const m = $('#menu-root');
    if(m && m.innerHTML && !e.target.closest('#menu-root') && !e.target.closest('#top-profile')) closeMenu();
  });

  refreshBell();
  refreshNavBadges();
  syncThemeUI();
  updateProfileChip();
}
function refreshBell(){
  if(isCustomerSession()) return;
  const n = reminders().length;
  const badge = $('#bell-badge');
  if(badge){ badge.hidden = n === 0; badge.textContent = n > 99 ? '99+' : String(n); }
}

/* ==========================================================================
   GLOBAL SEARCH — command palette
   One box over every record type + navigation + actions. Read-only: opening a
   result routes to the existing view or the existing modal.
   ========================================================================== */
let cmdkState = {open:false, q:'', sel:0, rows:[]};

function cmdkActions(){
  const cust = isCustomerSession();
  const dark = currentTheme() === 'dark';
  if(cust) return [
    {g:'Actions', icon:'receipt', t:'My invoices', s:'Open the customer portal', run:()=>go('cust_invoices',{})},
    {g:'Actions', icon:'doc', t:'My quotes', s:'Open the customer portal', run:()=>go('cust_quotes',{})},
    {g:'Actions', icon:'chat', t:'Help & contact', s:'Reach the business', run:()=>go('cust_help',{})}
  ];
  return [
    {g:'Quick actions', icon:'calendar', t:'New job', s:'Schedule work for a customer', k:'Ctrl J', run:()=>jobModal({})},
    {g:'Quick actions', icon:'spark', t:'New quotation', s:'AI-assisted estimate', k:'Ctrl Q', run:()=>go('quote_edit',{})},
    {g:'Quick actions', icon:'receipt', t:'New invoice', s:'Bill a completed job', k:'Ctrl I', run:()=>go('invoice_new',{})},
    {g:'Quick actions', icon:'cash', t:'Record payment', s:'Collect on the oldest open invoice', k:'Ctrl P', run:()=>quickRecordPayment()},
    {g:'Quick actions', icon:'users', t:'New customer', s:'Add to the customer list', run:()=>{ go('customers',{}); setTimeout(()=>{ const b=document.getElementById('cu-new'); if(b) b.click(); },80); }},
    {g:'Quick actions', icon:'userPlus', t:'New lead', s:'Capture an enquiry', run:()=>{ go('leads',{}); setTimeout(()=>{ const b=document.getElementById('lead-new'); if(b) b.click(); },80); }},
    {g:'Quick actions', icon:'cash', t:'Add expense', s:'Log business spending', run:()=>{ go('expenses',{}); setTimeout(()=>{ const b=document.getElementById('ex-new'); if(b) b.click(); },80); }},
    {g:'Quick actions', icon:dark?'sun':'moon', t:dark?'Switch to light mode':'Switch to dark mode', s:'Appearance', k:'Ctrl D', run:()=>toggleTheme()},
    {g:'Quick actions', icon:'bell', t:'Reminders', s:'Overdue invoices, jobs, quotes, maintenance', run:()=>reminderSheet()},
    {g:'Quick actions', icon:'sliders', t:'Keyboard shortcuts', s:'See every shortcut', run:()=>shortcutsModal()}
  ];
}
function cmdkNav(){
  const list = isCustomerSession() ? CUSTOMER_NAV.map(([v,l,i])=>[v,l,i]) : NAV.map(([v,l,i])=>[v,l,i]);
  return list.map(([v,l,i]) => ({g:'Go to', icon:i, t:l, s:'Module', run:()=>go(v,{})}));
}
function cmdkRecords(){
  if(!db || isCustomerSession()) return [];
  const out = [];
  const cName = id => { const c = customerById(id); return c ? c.name : '—'; };
  (db.customers||[]).forEach(c => out.push({g:'Customers', icon:'users', t:c.name, s:`${c.phone||''}${c.area?' · '+c.area:''}`, run:()=>go('customer',{id:c.id})}));
  (db.jobs||[]).forEach(j => out.push({g:'Jobs', icon:'calendar', t:`${j.ref} — ${j.title}`, s:`${fmtDateShort(j.date)} ${j.start} · ${cName(j.customerId)} · ${j.status}`, run:()=>openJobModal(j.id)}));
  (db.quotes||[]).forEach(q => out.push({g:'Quotations', icon:'doc', t:`${q.ref} — ${q.title}`, s:`${cName(q.customerId)} · ${q.status}`, r:money(quoteTotal(q)), run:()=>go('quote_edit',{id:q.id})}));
  (db.invoices||[]).forEach(i => {
    const st = invState(i);
    out.push({g:'Invoices', icon:'receipt', t:`${i.ref}`, s:`${cName(i.customerId)} · ${st.label} · due ${fmtDate(i.due)}`, r:money(invTotal(i)), run:()=>go('invoice',{id:i.id})});
    (i.payments||[]).forEach(p => out.push({g:'Payments', icon:'cash', t:`${money(p.amount)} — ${p.method||'payment'}`, s:`${i.ref} · ${fmtDate(p.date)} · ${cName(i.customerId)}`, r:money(p.amount), run:()=>go('invoice',{id:i.id})}));
  });
  (db.leads||[]).forEach(l => out.push({g:'Leads', icon:'userPlus', t:l.name, s:`${l.service||''} · ${l.status}${l.budget?' · '+money(l.budget):''}`, run:()=>go('leads',{})}));
  (db.inventory||[]).forEach(m => out.push({g:'Materials', icon:'box', t:m.name, s:`${m.qty} ${m.unit||''} ${m.location?'· '+m.location:''} · ${m.qty<=m.reorder?'low stock':'in stock'}`, r:money(m.price), run:()=>go('inventory',{})}));
  (db.technicians||[]).forEach(t => out.push({g:'Technicians', icon:'wrench', t:t.name, s:`${t.role} · ${money(t.rate)}/h${t.active?'':' · inactive'}`, run:()=>go('dispatch',{})}));
  (db.expenses||[]).forEach(e => out.push({g:'Expenses', icon:'cash', t:e.desc, s:`${e.category||''} · ${fmtDate(e.date)}`, r:money(e.amount), run:()=>go('expenses',{})}));
  (db.maintenance||[]).forEach(m => out.push({g:'Maintenance', icon:'wrench', t:m.equipment || m.title || 'Plan', s:`${cName(m.customerId)} · every ${m.frequencyMonths||3} mo`, run:()=>go('maintenance',{})}));
  return out;
}
function cmdkScore(row, q){
  const t = (row.t||'').toLowerCase(), s = (row.s||'').toLowerCase();
  if(t === q) return 0;
  if(t.startsWith(q)) return 1;
  const w = t.indexOf(' ' + q);
  if(w >= 0) return 2;
  if(t.includes(q)) return 3;
  if(s.includes(q)) return 4;
  return -1;
}
function cmdkRows(q){
  q = String(q||'').trim().toLowerCase();
  const pool = [].concat(cmdkActions(), cmdkNav(), cmdkRecords());
  if(!q){
    /* no query: a useful starting screen, not an empty box */
    const acts = cmdkActions().slice(0,5);
    const navs = cmdkNav().slice(0, isCustomerSession() ? 5 : 6);
    const recent = (db && !isCustomerSession())
      ? (db.jobs||[]).slice().sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start)).slice(0,4)
          .map(j => ({g:'Recent jobs', icon:'calendar', t:`${j.ref} — ${j.title}`, s:`${fmtDateShort(j.date)} · ${j.status}`, run:()=>openJobModal(j.id)}))
      : [];
    return [].concat(acts, navs, recent);
  }
  const hit = pool.map(r => ({r, s:cmdkScore(r, q)})).filter(x => x.s >= 0);
  const order = {'Quick actions':0,'Go to':1,'Customers':2,'Jobs':3,'Invoices':4,'Quotations':5,'Payments':6,'Leads':7,'Materials':8,'Technicians':9,'Expenses':10,'Maintenance':11};
  hit.sort((a,b) => a.s - b.s || (order[a.r.g]??9) - (order[b.r.g]??9));
  return hit.slice(0, 40).map(x => x.r);
}
function cmdkHighlight(text, q){
  const t = String(text||'');
  if(!q) return esc(t);
  const i = t.toLowerCase().indexOf(q);
  if(i < 0) return esc(t);
  return esc(t.slice(0,i)) + '<mark>' + esc(t.slice(i, i+q.length)) + '</mark>' + esc(t.slice(i+q.length));
}
function cmdkRender(){
  const q = cmdkState.q.trim().toLowerCase();
  cmdkState.rows = cmdkRows(q);
  cmdkState.sel = Math.min(cmdkState.sel, Math.max(0, cmdkState.rows.length - 1));
  const body = $('#cmdk-body');
  if(!body) return;
  if(!cmdkState.rows.length){
    body.innerHTML = `<div class="cmdk-empty">${icon('search',22)}<div class="mt8">Nothing matches “${esc(cmdkState.q)}”.</div>
      <div class="muted small mt4">Try a name, phone number, job ref (JOB-…), invoice ref or material.</div></div>`;
    return;
  }
  let lastG = null, html = '', i = 0;
  cmdkState.rows.forEach(r => {
    if(r.g !== lastG){ html += `<div class="cmdk-group">${esc(r.g)}</div>`; lastG = r.g; }
    html += `<button type="button" class="cmdk-item ${i===cmdkState.sel?'sel':''}" data-ci="${i}">
      <span class="ci">${icon(r.icon,16)}</span>
      <span class="ct"><b>${cmdkHighlight(r.t, q)}</b>${r.s?`<span>${cmdkHighlight(r.s, q)}</span>`:''}</span>
      ${r.r?`<span class="cr">${esc(r.r)}</span>`:''}${r.k?`<span class="kbd">${esc(r.k)}</span>`:''}</button>`;
    i++;
  });
  body.innerHTML = html;
  $$('#cmdk-body .cmdk-item').forEach(b => {
    b.onclick = () => cmdkRun(+b.dataset.ci);
    b.onmousemove = () => { const n = +b.dataset.ci; if(n !== cmdkState.sel){ cmdkState.sel = n; $$('#cmdk-body .cmdk-item').forEach(x => x.classList.toggle('sel', +x.dataset.ci === n)); } };
  });
  const sel = $('#cmdk-body .cmdk-item.sel');
  if(sel && sel.scrollIntoView) sel.scrollIntoView({block:'nearest'});
}
function cmdkRun(i){
  const r = cmdkState.rows[i];
  if(!r) return;
  cmdkClose();
  try{ r.run(); }catch(e){ toast('Could not open that result','warn'); }
}
function cmdkOpen(prefill){
  const root = $('#cmdk-root');
  if(!root) return;
  cmdkState = {open:true, q:prefill||'', sel:0, rows:[]};
  root.innerHTML = `<div class="cmdk" id="cmdk" role="dialog" aria-modal="true" aria-label="Search VicTech">
    <div class="cmdk-panel">
      <div class="cmdk-in">
        ${icon('search',18)}
        <input id="cmdk-q" type="text" autocomplete="off" autocapitalize="off" spellcheck="false"
               placeholder="Search customers, jobs, quotes, invoices, materials…" aria-label="Search" value="${esc(cmdkState.q)}">
        <button class="x" id="cmdk-x" type="button" aria-label="Close search">✕</button>
      </div>
      <div class="cmdk-body" id="cmdk-body"></div>
      <div class="cmdk-foot">
        <span class="r"><span class="kbd">↑</span><span class="kbd">↓</span> navigate</span>
        <span class="r"><span class="kbd">Enter</span> open</span>
        <span class="r"><span class="kbd">Esc</span> close</span>
        <span class="r" style="margin-left:auto">${isCustomerSession()?'Portal search':'Everything on this device'}</span>
      </div>
    </div></div>`;
  cmdkRender();
  const inp = $('#cmdk-q');
  if(inp){
    inp.focus();
    if(inp.setSelectionRange) try{ inp.setSelectionRange(inp.value.length, inp.value.length); }catch(e){}
    inp.oninput = () => { cmdkState.q = inp.value; cmdkState.sel = 0; cmdkRender(); };
    inp.onkeydown = e => {
      if(e.key === 'ArrowDown'){ e.preventDefault(); cmdkState.sel = Math.min(cmdkState.sel+1, cmdkState.rows.length-1); cmdkRender(); }
      else if(e.key === 'ArrowUp'){ e.preventDefault(); cmdkState.sel = Math.max(cmdkState.sel-1, 0); cmdkRender(); }
      else if(e.key === 'Enter'){ e.preventDefault(); cmdkRun(cmdkState.sel); }
      else if(e.key === 'Escape'){ e.preventDefault(); cmdkClose(); }
    };
  }
  const x = $('#cmdk-x'); if(x) x.onclick = () => cmdkClose();
  const ov = $('#cmdk');
  if(ov) ov.addEventListener('mousedown', e => { if(e.target === ov) cmdkClose(); });
}
function cmdkClose(){
  const root = $('#cmdk-root');
  if(root) root.innerHTML = '';
  cmdkState.open = false;
}

/* ---------- keyboard shortcuts (desktop-first) ---------- */
const SHORTCUTS = [
  {k:'k', d:'Global search', run:()=>cmdkOpen(), anywhere:true},
  {k:'j', d:'New job', run:()=>{ if(isCustomerSession()) return; jobModal({}); }},
  {k:'q', d:'New quotation', run:()=>{ if(isCustomerSession()) return; go('quote_edit',{}); }},
  {k:'i', d:'New invoice', run:()=>{ if(isCustomerSession()) return; go('invoice_new',{}); }},
  {k:'p', d:'Record payment', run:()=>{ if(isCustomerSession()) return; quickRecordPayment(); },
   skip:()=>{ const pr = $('#print-root'); return !!(pr && pr.classList.contains('open')); }}, // let the browser print a document
  {k:'b', d:'Toggle sidebar', run:()=>{ const b = $('#top-nav-toggle'); if(b) b.click(); }},
  {k:'d', d:'Toggle dark mode', run:()=>toggleTheme()}
];
function typingInForm(el){
  if(!el) return false;
  const tag = (el.tagName||'').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}
function bindShortcuts(){
  if(window.__afKeys) return;
  window.__afKeys = true;
  document.addEventListener('keydown', e => {
    /* Esc closes the top-most layer */
    if(e.key === 'Escape'){
      if(cmdkState.open){ cmdkClose(); return; }
      closeMenu();
      return;
    }
    /* "?" opens the shortcut list when not typing */
    if(e.key === '?' && !typingInForm(e.target)){ e.preventDefault(); shortcutsModal(); return; }
    const mod = e.ctrlKey || e.metaKey;
    if(!mod || e.altKey) return;
    const key = String(e.key||'').toLowerCase();
    const hit = SHORTCUTS.find(s => s.k === key && (s.anywhere || !typingInForm(e.target)));
    if(!hit) return;
    if(hit.skip && hit.skip()) return;
    if(document.body.classList.contains('preauth') && key !== 'k') return;
    e.preventDefault();
    try{ hit.run(); }catch(err){}
  });
}

function initApp(){
  if(db) return;
  db = DB.load();
  // customer portal: read the shared business database this device holds
  if(!db && typeof AUTH !== 'undefined' && AUTH.role() === 'customer'){
    db = DB.loadFor(AUTH.session());
  }
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
  document.body.classList.toggle('app-customer', isCustomerSession());
  syncThemeUI();
  initNavRail();
  buildNav();
  buildTabbar();
  bindTop();
  bindShortcuts();
  $('#side-foot').innerHTML = sideFootHTML();
  go(isCustomerSession() ? 'cust_dash' : 'dashboard', {});
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
    invoiceDocHTML: (typeof invoiceDocHTML !== 'undefined') ? invoiceDocHTML : null,
    bindPwToggles, isCustomerSession, myCustomer, switchToSession, customerSignOut,
    scanMostRecentKey: DB.scanMostRecentKey, loadFor: DB.loadFor,
    /* design-system shell (v2.0) */
    setTheme, toggleTheme, currentTheme, syncThemeUI,
    cmdkOpen, cmdkClose, cmdkRows, cmdkRun, shortcutsModal,
    navBadges, refreshNavBadges, updateProfileChip, updateTopSub, openProfileMenu, closeMenu,
    /* chart primitives (design-system tokens, theme aware) */
    areaChart, barChart, groupedBar, donut, sparkline, hbarList, niceMax, axisFmt
  };
}

/* boot is handled by js/auth.js (account gate) → initApp() */
