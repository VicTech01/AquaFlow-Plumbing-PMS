'use strict';
/* ================= state & storage ================= */
let db = null;
let ui = { view:'dashboard', params:{} };

const DB = {
  key: 'aquaflow_pms_v1',
  currentKey(){ return (typeof AUTH !== 'undefined') ? AUTH.dbKey(AUTH.session() || 'guest') : this.key; },
  load(){
    try{
      const raw = localStorage.getItem(this.currentKey());
      if(raw){ const d = JSON.parse(raw); if(d && d.v === 1) return d; }
    }catch(e){}
    return null;
  },
  save(){
    try{ localStorage.setItem(this.currentKey(), JSON.stringify(db)); }
    catch(e){ if(db) db.memoryMode = true; }
  },
  seed(){ const d = makeSeed(); db = d; this.save(); return d; },
  /* customer portal: load the business database this customer's account points to */
  scanMostRecentKey(){
    let best = null, bestAt = '';
    try {
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if(!k) continue;
        if(k === 'aquaflow_pms_v1' || k.indexOf('aquaflow_pms_v1:') === 0){
          try {
            const d = JSON.parse(localStorage.getItem(k));
            const at = (d && d.meta && d.meta.lastChangedAt) || (d && d.meta && d.meta.createdAt) || '';
            if(at >= bestAt){ bestAt = at; best = k; }
          } catch(e){}
        }
      }
    } catch(e){}
    return best;
  },
  loadFor(email){
    try {
      const acc = (typeof AUTH !== 'undefined') ? AUTH.byEmail(email) : null;
      const key = (acc && acc.bizKey) || this.scanMostRecentKey();
      if(key){
        const raw = localStorage.getItem(key);
        if(raw){ const d = JSON.parse(raw); if(d && d.v === 1){ db = d; return d; } }
      }
    } catch(e){}
    return null;
  },
  adoptIncoming(dbJson, {toastNote}={}){
    // remote push arrived (phone → desktop): merge into local state
    if(typeof SyncCore === 'undefined') return false;
    const remote = JSON.parse(dbJson);
    if(!SyncCore.isValidDb(remote)) return false;
    const merged = SyncCore.mergeDbs(db, remote, {direction:'pull'});
    db = merged;
    DB.save();
    prevDbJson = JSON.stringify(db);
    if(typeof reRender === 'function' && ui.view) reRender();
    if(toastNote) toast(toastNote);
    return true;
  }
};
function commit(){
  stampAndNotify();
  DB.save();
  maybeAutoBackup();
}

/* ---- automatic local backups (3 rolling snapshots, per profile) ---- */
function autoBakKey(){
  return 'aquaflow_autobak_' + (typeof AUTH !== 'undefined' ? AUTH.dbKey(AUTH.session() || 'guest') : DB.key);
}
function autoBakStore(){
  try { return JSON.parse(localStorage.getItem(autoBakKey()) || '[]'); } catch(e){ return []; }
}
function maybeAutoBackup(){
  if(!db || db.memoryMode) return;
  const store = autoBakStore();
  const last = store[0] ? store[0].at : 0;
  const now = Date.now();
  if(last && now - new Date(last).getTime() < 5*60*1000) return; // at most once / 5 min
  const json = JSON.stringify(db);
  if(json.length > 4.5 * 1024 * 1024) return; // too large to snapshot safely
  store.unshift({ at: new Date().toISOString(), size: json.length, json });
  try {
    localStorage.setItem(autoBakKey(), JSON.stringify(store.slice(0,3)));
  } catch(e){ /* quota — skip, never break a commit */ }
}
function listAutoBackups(){ return autoBakStore(); }
function restoreAutoBackup(idx){
  const store = autoBakStore();
  const b = store[idx];
  if(!b) return {ok:false, error:'Backup not found'};
  try {
    const d = JSON.parse(b.json);
    if(!d || d.v !== 1) return {ok:false, error:'Backup unreadable'};
    db = d;
    prevDbJson = JSON.stringify(db);
    DB.save();
    return {ok:true, at:b.at};
  } catch(e){ return {ok:false, error:'Restore failed: ' + e.message}; }
}
function clearAutoBackups(){ try { localStorage.removeItem(autoBakKey()); } catch(e){} }

/* ---- offline-first change tracking (feeds sync merge) ---- */
let prevDbJson = null;
function initChangeTracking(){
  prevDbJson = db ? JSON.stringify(db) : null;
}
function stampAndNotify(){
  if(!db) return;
  if(!prevDbJson){ prevDbJson = JSON.stringify(db); return; }
  if(typeof SyncCore !== 'undefined') SyncCore.stampChanges(db, prevDbJson);
  db.meta = db.meta || {};
  db.meta.lastChangedAt = new Date().toISOString();
  prevDbJson = JSON.stringify(db);
  if(window.__AQUAFLOW && window.__AQUAFLOW.sendDb) {
    try { window.__AQUAFLOW.sendDb(JSON.stringify(db)); } catch(e){}
  }
}

/* ================= reminders / notification center ================= */
function reminders(){
  if(!db) return [];
  const t = isoDate(today());
  const tm = isoDate(addDays(today(), 1));
  const out = [];
  db.invoices.forEach(i => {
    const st = invState(i);
    if(i.status === 'Draft') return;
    if(st.label === 'Overdue') out.push({group:'Payments overdue', label:`${i.ref} — ${money(st.balance)} overdue`, sub:fmtDate(i.due), view:'invoice', params:{id:i.id}, tone:'red'});
    else if(st.label === 'Open' && i.due && dayDiff(t, i.due) <= 3 && st.balance > 0) out.push({group:'Due soon', label:`${i.ref} — ${money(st.balance)} due`, sub:relDays(i.due), view:'invoice', params:{id:i.id}, tone:'amber'});
  });
  db.jobs.forEach(j => {
    if(['Cancelled','Completed'].includes(j.status)) return;
    if(j.date === t) out.push({group:"Today's jobs", label:`${j.ref} — ${j.title}`, sub:`${j.start} · ${fmtDateShort(j.date)}`, view:'jobs', params:{}, tone:'sky'});
    else if(j.date === tm && j.status === 'Scheduled') out.push({group:'Scheduled tomorrow', label:`${j.ref} — ${j.title}`, sub:`${j.start} · ${fmtDateShort(j.date)}`, view:'jobs', params:{}, tone:'indigo'});
  });
  db.quotes.forEach(q => {
    if(q.status === 'Sent' && dayDiff(isoDate(new Date(q.createdAt||t)), t) >= 3){
      out.push({group:'Awaiting approval', label:`${q.ref} — ${money(quoteTotal(q))} pending`, sub:'follow up with customer', view:'quotes', params:{}, tone:'violet'});
    }
  });
  db.maintenance.forEach(m => {
    const d = dayDiff(t, nextDueDate(m));
    if(d <= 7) out.push({group:'Maintenance due', label:`${m.title||'Plan'} — ${m.equipment||'equipment'}`, sub: d<=0 ? 'overdue' : `in ${d} day${d===1?'':'s'}`, view:'maintenance', params:{}, tone:'amber'});
  });
  const order = {red:0, amber:1, violet:2, sky:3, indigo:4};
  return out.sort((a,b) => (order[a.tone]??9) - (order[b.tone]??9));
}
function reminderSheet(){
  const r = reminders();
  const groups = {};
  r.forEach(x => (groups[x.group] = groups[x.group] || []).push(x));
  const body = r.length
    ? Object.entries(groups).map(([g, items]) =>
        `<div class="muted small mt8" style="text-transform:uppercase;letter-spacing:.4px">${esc(g)}</div>` +
        items.map(x => `<button class="rem-item tone-${x.tone}" data-view="${x.view}" data-params="${JSON.stringify(x.params).replace(/"/g,'&quot;')}">
          <span class="rem-lbl">${esc(x.label)}</span><span class="muted small">${esc(x.sub||'')}</span>
        </button>`).join('')).join('')
    : `<div class="empty">All clear — nothing needs your attention. 🎉</div>`;
  sheetOpen(`
    <div class="sheet-grab"></div>
    <div class="sheet-head"><h3>${icon('bell',17)} Reminders</h3><button class="x" data-close>✕</button></div>
    <div style="padding:4px 18px 22px">${body}</div>
    <div class="sheet-note">Unpaid invoices · today's &amp; tomorrow's jobs · quotes awaiting approval · maintenance due</div>`);
  $('#sheet [data-close]').onclick = sheetClose;
  $$('#sheet .rem-item').forEach(b => b.onclick = () => go(b.dataset.view, JSON.parse(b.dataset.params || '{}')));
}

/* ================= lookups ================= */
const customerById = id => db.customers.find(c=>c.id===id);
const techById = id => db.technicians.find(t=>t.id===id);
const jobById = id => db.jobs.find(j=>j.id===id);
const quoteById = id => db.quotes.find(q=>q.id===id);
const invoiceById = id => db.invoices.find(i=>i.id===id);
const invItemById = id => db.inventory.find(i=>i.id===id);

/* ================= refs & money ================= */
function nextRef(kind){
  const c = db.counters;
  c[kind] = (c[kind]||0) + 1;
  const y = new Date().getFullYear();
  return `${(db.business.prefixes && db.business.prefixes[kind]) || kind.toUpperCase()}-${y}-${pad4(c[kind])}`;
}
function quoteSubtotal(q){ return sum(q.items, i=>(i.qty||0)*(i.price||0)); }
function quoteTotal(q){
  const sub = quoteSubtotal(q) - (q.discount||0);
  return Math.round(sub * (1 + (q.vatRate||0)/100));
}
function invSubtotal(inv){ return sum(inv.items, i=>(i.qty||0)*(i.price||0)); }
function invPaid(inv){ return sum(inv.payments||[], p=>p.amount); }
function invTotal(inv){ return Math.round((invSubtotal(inv) - (inv.discount||0)) * (1 + (inv.vatRate||0)/100)); }
function invBalance(inv){ return invTotal(inv) - invPaid(inv); }
function invState(inv){
  if((inv.status||'') === 'Draft') return {label:'Draft', cls:'gray', balance:invBalance(inv)};
  const b = invBalance(inv);
  if(b <= 0) return {label:'Paid', cls:'green', balance:0};
  if(inv.due && dayDiff(isoDate(today()), inv.due) > 0) return {label:'Overdue', cls:'red', balance:b};
  if(invPaid(inv) > 0) return {label:'Partial', cls:'amber', balance:b};
  return {label:'Open', cls:'sky', balance:b};
}
const nextDueDate = m => isoDate(addMonths(parseISO(m.lastDone), m.frequencyMonths||3));

/* ================= status chips ================= */
const CHIP = {
  'Scheduled':'indigo','Dispatched':'sky','In Progress':'amber','Completed':'green','On Hold':'gray','Cancelled':'gray',
  'Draft':'gray','Sent':'sky','Approved':'green','Declined':'red','Converted':'teal',
  'Paid':'green','Partial':'amber','Overdue':'red','Open':'sky',
  'Low':'amber','Out of stock':'red','In stock':'green',
  'Residential':'sky','Commercial':'violet',
  'Job confirmation':'indigo','Dispatch':'sky','Quote sent':'violet','Invoice sent':'teal',
  'Payment reminder':'red','Payment received':'green','Maintenance reminder':'amber','Job complete':'green'
};
/* Optional second argument overrides the mapped tone (used for computed labels
   like "Overdue 3d" that have no CHIP entry). */
function chip(label, tone){ return `<span class="chip c-${tone||CHIP[label]||'gray'}">${esc(label)}</span>`; }
const JB_CLASS = {'Scheduled':'jb-sched','Dispatched':'jb-disp','In Progress':'jb-prog','Completed':'jb-done','On Hold':'jb-hold','Cancelled':'jb-cancel'};

/* ================= scheduling helpers ================= */
const timeOverlap = (s1,h1,s2,h2) => {
  const a1 = hmToMin(s1), a2 = a1 + Math.round(h1*60), b1 = hmToMin(s2), b2 = b1 + Math.round(h2*60);
  return a1 < b2 && b1 < a2;
};
function jobConflicts(j){
  return db.jobs.filter(o => o.id !== j.id &&
    !['Cancelled','Completed'].includes(o.status) &&
    o.date === j.date &&
    (o.technicianIds||[]).length > 0 &&
    o.technicianIds.some(t => (j.technicianIds||[]).includes(t)) &&
    timeOverlap(j.start, j.hours, o.start, o.hours));
}

/* ================= WhatsApp ================= */
function fillTemplate(tpl, vars){
  return String(tpl||'').replace(/\{(\w+)\}/g, (m,k) => (vars[k] != null ? vars[k] : m));
}
function waDigits(phone){
  let d = String(phone||'').replace(/\D/g,'');
  if(d.startsWith('0')) d = '254' + d.slice(1);
  else if(d.length === 9 && d.startsWith('7')) d = '254' + d;
  return d;
}
function waLink(phone, text){ return `https://wa.me/${waDigits(phone)}?text=${encodeURIComponent(text||'')}`; }
function pushOutbox(customer, purpose, text){
  if(!customer) return;
  db.outbox.push({id:uid('o'), to:customer.phone, contact:customer.name, purpose, text, createdAt:new Date().toISOString(), sent:false});
  commit();
}
function waTemplateMsg(tplKey, vars){
  return fillTemplate((db.business.templates||{})[tplKey] || DEFAULT_TEMPLATES[tplKey] || '', vars);
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); toast('Message copied to clipboard'); }
  catch(e){
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('Message copied to clipboard'); }catch(e2){ toast('Copy failed — select the text manually','warn'); }
    ta.remove();
  }
}

/* ================= modal / confirm / toast ================= */
function openModal(title, bodyHtml, {width='md', footerHtml=null, onMount=null} = {}){
  const root = $('#modal-root');
  root.innerHTML = `<div class="overlay"><div class="modal w-${width}" role="dialog">
    <div class="m-head"><h3>${title}</h3><button class="x" title="Close" id="m-x">✕</button></div>
    <div class="m-body">${bodyHtml}</div>
    ${footerHtml ? `<div class="m-foot">${footerHtml}</div>` : ''}
  </div></div>`;
  const close = closeModal;
  $('#m-x').onclick = close;
  root.firstElementChild.addEventListener('mousedown', e => { if(e.target.classList.contains('overlay')) close(); });
  const onKey = e => { if(e.key === 'Escape'){ document.removeEventListener('keydown', onKey); close(); } };
  document.addEventListener('keydown', onKey);
  if(onMount) onMount(root);
}
function closeModal(){ $('#modal-root').innerHTML = ''; }
function askConfirm(msg, onYes, {danger=true, label='Confirm'} = {}){
  openModal('Please confirm', `<p class="confirm-msg">${msg}</p>`, {
    width:'sm',
    footerHtml:`<button class="btn ghost" id="cf-no">Cancel</button><button class="btn ${danger?'danger':'primary'}" id="cf-yes">${label}</button>`,
    onMount(){
      $('#cf-no').onclick = closeModal;
      $('#cf-yes').onclick = () => { closeModal(); onYes(); };
    }
  });
}
function toast(msg, kind='ok'){
  const icons = {ok:'check', warn:'alert', err:'alert'};
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = `<span class="tic">${icon(icons[kind]||'check',15)}</span><span>${esc(msg)}</span>`;
  $('#toast-root').appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 4200);
}

/* ================= icons ================= */
const ICONS = {
  dashboard:'<path d="M3 3h8v8H3zM13 3h8v5h-8zM13 12h8v9h-8zM3 15h8v6H3z"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  truck:'<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7z"/><circle cx="6.5" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17.5" cy="9.5" r="2.5"/><path d="M16.5 15.4c2.4.4 4.2 1.9 5 4.6"/>',
  doc:'<path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4M9 12h6M9 16h6"/>',
  receipt:'<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21z"/><path d="M9 8h6M9 12h6"/>',
  box:'<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.8 2.8-2.7-.6-.6-2.7z"/>',
  chat:'<path d="M4 4h16v12H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  spark:'<path d="M12 2l1.8 5.6L19 9.4l-5.2 1.8L12 16.8l-1.8-5.6L5 9.4l5.2-1.8z"/><path d="M19 14l.9 2.6L22.5 17.5l-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/>',
  check:'<path d="M4 12.5l5 5L20 6.5"/>',
  alert:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18.2v.1"/>',
  x:'<path d="M5 5l14 14M19 5L5 19"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  phone:'<path d="M5 3h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/>',
  cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M5.5 9.5v.1M18.5 14.4v.1"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6.5 7l1 14h9l1-14"/>',
  edit:'<path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3"/>',
  download:'<path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/>',
  upload:'<path d="M12 15V3m0 0L8 7m4-4l4 4M4 21h16"/>',
  bell:'<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  pin:'<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  chevL:'<path d="M14 6l-6 6 6 6"/>',
  chevR:'<path d="M10 6l6 6-6 6"/>',
  chart:'<path d="M4 20V9M10 20V4M16 20v-6M3 20h18"/>',
  camera:'<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>',
  print:'<path d="M7 8V3h10v5M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3M7 14h10v7H7z"/>',
  eye:'<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff:'<path d="M4 4l16 16M10 5.3a10.6 10.6 0 0 1 2-.3c6.5 0 10 7 10 7a17.9 17.9 0 0 1-3.3 4M6.2 6.2A17.4 17.4 0 0 0 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  userPlus:'<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><path d="M19 6v6M16 9h6"/>',
  send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  sync:'<path d="M21 12a9 9 0 0 1-15.5 6.2M3 12a9 9 0 0 1 15.5-6.2" transform="translate(0,0)"/><path d="M21 3v6h-6M3 21v-6h6"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
  sun:'<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>',
  moon:'<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  trendUp:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown:'<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  wallet:'<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a2 2 0 0 1 2 2v1.5"/><rect x="3" y="7.5" width="18" height="12" rx="2.4"/><circle cx="16.6" cy="13.6" r="1.3"/>',
  target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1"/>',
  layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5"/>',
  logout:'<path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  chevD:'<path d="M6 9l6 6 6-6"/>',
  sliders:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  star:'<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1.1 5.9L12 17l-5.3 2.8 1.1-5.9L3.5 9.8l5.9-.8z"/>',
  activity:'<path d="M3 12h4l2.5-6 4 12L16 12h5"/>',
  shield:'<path d="M12 3l7.5 3v6c0 4.4-3.1 7.9-7.5 9.4C7.6 19.9 4.5 16.4 4.5 12V6z"/><path d="M9.2 12.2l2 2 3.6-3.9"/>',
  clipboard:'<rect x="5" y="4.5" width="14" height="16.5" rx="2.2"/><path d="M9 4.5V3.6A1.6 1.6 0 0 1 10.6 2h2.8A1.6 1.6 0 0 1 15 3.6v.9z"/><path d="M9 11h6M9 15h4"/>',
  database:'<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/>',
  arrowR:'<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  wifi:'<path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0"/><path d="M12 19h.01"/>',
  wa:'<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8M9 8.2c-.2 0-.4.1-.6.2-.2.1-.5.2-.7.4-.2.2-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 3 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.2-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.5-.6c.1-.2.2-.3.1-.5l-.7-1.7c-.2-.4-.3-.4-.5-.4z"/>'
};
function icon(n, size=18){
  if(n === 'wa') return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8M9 8.2c-.2 0-.4.1-.6.2-.2.1-.5.2-.7.4-.2.2-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 3 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.2-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.5-.6c.1-.2.2-.3.1-.5l-.7-1.7c-.2-.4-.3-.4-.5-.4z"/></svg>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||''}</svg>`;
}

/* ================= charts (hand-rolled SVG, no CDN) =================
   Design-system charts: nice axis ticks, labelled gridlines, rounded bars,
   smooth area fills, native tooltips and an HTML legend. All neutrals come
   from CSS tokens so the charts follow the light/dark theme. */
let __uidSeq = 0;
const cuid = p => `${p}${(++__uidSeq).toString(36)}${Math.random().toString(36).slice(2,5)}`;

/* Round an axis maximum up to a readable 1 / 2 / 2.5 / 5 x 10^n step so the
   gridlines land on numbers a human can read at a glance. */
function niceMax(v, ticks){
  ticks = ticks || 4;
  v = Number(v) || 0;
  if(v <= 0) return ticks;
  const raw = v / ticks;
  const mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return step * ticks;
}
/* compact axis labels: 1250000 -> 1.25M, 120000 -> 120k */
function axisFmt(n){
  const a = Math.abs(Number(n) || 0);
  if(a >= 1e6){ const x = n / 1e6; return (a >= 1e7 ? x.toFixed(0) : String(+x.toFixed(2))) + 'M'; }
  if(a >= 1e3){ const x = n / 1e3; return (a >= 1e4 ? x.toFixed(0) : String(+x.toFixed(1))) + 'k'; }
  return String(+n.toFixed(a < 10 ? 1 : 0));
}
const moneyAxis = n => 'KSh ' + axisFmt(n);

/* horizontal gridlines + left-hand value axis */
function axisGrid(max, o){
  const {padL, padR, padT, ih, w, ticks, fmt} = o;
  let g = '';
  for(let i = 0; i <= ticks; i++){
    const f = i / ticks;
    const y = (padT + ih - f * ih).toFixed(1);
    g += `<line class="chart-grid" x1="${padL}" x2="${(w - padR).toFixed(1)}" y1="${y}" y2="${y}"${i === 0 ? ' stroke-width="1.4"' : ''}/>`;
    g += `<text class="chart-lab" x="${padL - 8}" y="${(+y + 3.5).toFixed(1)}" text-anchor="end">${esc(fmt(max * f))}</text>`;
  }
  return g;
}
/* Catmull-Rom -> cubic bezier, for a smooth but honest trend line */
function smoothPath(pts, tension){
  if(pts.length < 2) return pts.length ? `M ${pts[0][0]} ${pts[0][1]}` : '';
  const t = tension == null ? 0.32 : tension;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for(let i = 0; i < pts.length - 1; i++){
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) * t / 2, c1y = p1[1] + (p2[1] - p0[1]) * t / 2;
    const c2x = p2[0] - (p3[0] - p1[0]) * t / 2, c2y = p2[1] - (p3[1] - p1[1]) * t / 2;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}
function legendHTML(rows){
  if(!rows || !rows.length) return '';
  return `<div class="chart-legend">` + rows.map(r =>
    `<span class="r"><i class="dotc" style="background:${r.color}"></i>${esc(r.label)}</span>`).join('') + `</div>`;
}

function areaChart(vals, labels, {w=640, h=190, color='#0369a1', fmt=money, ticks=4, smooth=true} = {}){
  vals = (vals || []).map(v => Number(v) || 0);
  labels = labels || [];
  if(!vals.length) return '<div class="empty mini">No data yet</div>';
  const max = niceMax(Math.max(1, ...vals), ticks);
  const padL = 52, padR = 14, padT = 16, padB = 26;
  const iw = w - padL - padR, ih = h - padT - padB;
  const step = vals.length > 1 ? iw / (vals.length - 1) : 0;
  const pts = vals.map((v, i) => [padL + i * step, padT + ih - (v / max) * ih]);
  const gid = cuid('ag');
  const line = smooth ? smoothPath(pts) : pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const base = (padT + ih).toFixed(1);
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${base} L ${pts[0][0].toFixed(1)} ${base} Z`;
  const dots = pts.map((p, i) =>
    `<g><circle class="chart-surface" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === pts.length - 1 ? 4.6 : 3.4}" stroke="${color}" stroke-width="2"/>` +
    `<title>${esc(labels[i] || '')}${labels[i] ? ' — ' : ''}${fmt(vals[i])}</title></g>`).join('');
  const hits = pts.map((p, i) =>
    `<rect class="chart-hit" x="${(p[0] - step / 2).toFixed(1)}" y="${padT}" width="${Math.max(step, 12).toFixed(1)}" height="${ih}" rx="4"><title>${esc(labels[i] || '')}${labels[i] ? ' — ' : ''}${fmt(vals[i])}</title></rect>`).join('');
  const xl = labels.map((l, i) => pts[i] ?
    `<text class="chart-lab" x="${pts[i][0].toFixed(1)}" y="${h - 7}" text-anchor="middle">${esc(l)}</text>` : '').join('');
  const lastP = pts[pts.length - 1];
  const last = `<text x="${(lastP[0] - 8).toFixed(1)}" y="${(lastP[1] - 10).toFixed(1)}" font-size="11" font-weight="700" fill="${color}" text-anchor="end" style="font-family:var(--font-sans)">${esc(fmt(vals[vals.length - 1]))}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="xMidYMid meet" role="img">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${axisGrid(max, {padL, padR, padT, ih, w, ticks, fmt: moneyAxis})}
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${hits}${xl}${last}</svg>`;
}

/* Donut with an optional centre read-out. */
function donut(segs, {size=168, thick=22, centerTop='', centerSub='', gap=1.5} = {}){
  segs = (segs || []).filter(s => s && s.value > 0);
  const total = segs.reduce((t, s) => t + s.value, 0);
  const r = (size - thick) / 2, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  const arcs = total > 0
    ? segs.map(s => {
        const len = Math.max(0, s.value / total * circ - (segs.length > 1 ? gap : 0));
        const pct = Math.round(s.value / total * 100);
        const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-linecap="round" stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${c} ${c})"><title>${esc(s.label || '')} — ${pct}%</title></circle>`;
        acc += s.value / total * circ; return el;
      }).join('')
    : `<circle class="chart-empty" cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thick}"/>`;
  const mid = (centerTop || centerSub)
    ? `<g text-anchor="middle" style="font-family:var(--font-sans)">
         <text x="${c}" y="${c - (centerSub ? 2 : -5)}" font-size="17" font-weight="800" style="fill:var(--text)">${esc(centerTop)}</text>
         ${centerSub ? `<text x="${c}" y="${c + 16}" font-size="10.5" font-weight="600" style="fill:var(--text-3)">${esc(centerSub)}</text>` : ''}
       </g>`
    : '';
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;max-width:100%" role="img">${arcs}${mid}</svg>`;
}

/* Tiny trend line for KPI cards. */
function sparkline(vals, {w=180, h=34, color='#0369a1', fill=true} = {}){
  vals = (vals || []).map(v => Number(v) || 0);
  if(vals.length < 2) return '';
  const max = Math.max(1, ...vals), min = Math.min(0, ...vals);
  const span = (max - min) || 1;
  const pad = 3;
  const step = (w - pad * 2) / (vals.length - 1);
  const pts = vals.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)]);
  const gid = cuid('sg');
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  const dot = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${w} ${h}" class="chart spark" preserveAspectRatio="none" aria-hidden="true">
    ${fill ? `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".30"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs><path d="${area}" fill="url(#${gid})"/>` : ''}
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${dot[0].toFixed(1)}" cy="${dot[1].toFixed(1)}" r="2.8" fill="${color}"/>
  </svg>`;
}

/* ================= business pipeline (Lead→Quote→Scheduled→In Progress→Completed→Invoiced→Paid) ================= */
const PIPELINE = ['Quote','Scheduled','In Progress','Completed','Invoiced','Paid'];

/* ---- job activity timeline (CRM-style audit trail) ---- */
function jobLog(job, text){
  if(!job || !text) return;
  job.timeline = job.timeline || [];
  job.timeline.push({ at: new Date().toISOString(), text: String(text).slice(0,500) });
  if(job.timeline.length > 100) job.timeline = job.timeline.slice(-100);
}
function timelineHTML(job){
  const list = (job.timeline||[]).slice().reverse();
  if(!list.length) return '<div class="muted small">No activity yet — status changes are logged here automatically.</div>';
  return `<div class="timeline">` + list.map(t => {
    const d = new Date(t.at);
    return `<div class="tl-item"><span class="tl-dot"></span>
      <div><div class="tl-text">${esc(t.text)}</div>
      <div class="muted small">${d.toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'})} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}</div></div>
    </div>`;
  }).join('') + `</div>`;
}

function jobInvoice(job){ return db.invoices.find(i=>i.jobId===job.id) || null; }
function jobQuote(job){ return db.quotes.find(q=>q.jobId===job.id) || null; }
function jobHasQuote(job){ return db.quotes.some(q=>q.jobId===job.id && q.status!=='Declined'); }
function jobStage(job){
  let s = 0;
  if(jobHasQuote(job)) s = Math.max(s, 1);
  if(job.status==='Scheduled') s = Math.max(s, 1);
  if(job.status==='Dispatched' || job.status==='In Progress') s = Math.max(s, 2);
  if(job.status==='Completed') s = Math.max(s, 3);
  const inv = jobInvoice(job);
  if(inv) s = Math.max(s, 4);
  if(inv && invBalance(inv) <= 0) s = 5;
  return s;
}
function jobNextAction(job){
  if(job.status==='Cancelled') return {label:'—', act:'none'};
  const inv = jobInvoice(job);
  if(job.status==='On Hold') return {label:'Resume', act:'resume'};
  if(job.status==='Scheduled'){
    if(!jobHasQuote(job)) return {label:'Create quote', act:'quote'};
    return {label: (job.technicianIds||[]).length ? 'Dispatch' : 'Assign crew', act:'dispatch'};
  }
  if(job.status==='Dispatched') return {label:'Start work', act:'start'};
  if(job.status==='In Progress') return {label:'Complete job', act:'complete'};
  if(!inv) return {label:'Create invoice', act:'invoice'};
  if(invBalance(inv) > 0) return {label:'Collect payment', act:'collect'};
  return {label:'✓ Paid', act:'done'};
}
function stepperHTML(job){
  const stage = jobStage(job);
  return `<div class="stepper">${PIPELINE.map((s,i)=>`<span class="st ${i<stage?'done':i===stage?'cur':'todo'}" title="${s}"><i></i><span>${s}</span></span>`).join('')}</div>`;
}

/* ================= income breakdown (Labour / Materials / Transport) ================= */
function breakdown(items){
  const b = {labour:0, materials:0, transport:0};
  (items||[]).forEach(i=>{
    const amt = (i.qty||0) * (i.price||0);
    if(i.kind==='Material') b.materials += amt;
    else if(i.kind==='Transport') b.transport += amt;
    else b.labour += amt;
  });
  return b;
}
function breakdownHTML(items){
  const b = breakdown(items);
  const row = (lbl, val) => `<div class="bd-row"><span>${lbl}</span><b>${money(val)}</b></div>`;
  return row('Labour', b.labour) + row('Materials', b.materials) + row('Transport', b.transport)
    + `<div class="bd-row tot"><span>Total</span><b>${money(b.labour+b.materials+b.transport)}</b></div>`;
}
function greeting(){
  const h = new Date().getHours();
  const part = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const name = (db.business?.ownerName || 'Boss').trim().toUpperCase() || 'BOSS';
  return { part, text: `Good ${part}, ${name}` };
}
function expMonthTotal(mk){
  return sum(db.expenses.filter(e=>e.date.startsWith(mk)), e=>e.amount);
}

/* ================= additional charts ================= */
function groupedBar(valsA, valsB, labels, {w=640, h=214, colorA='#0284c7', colorB='#ef4444', legendA='Revenue', legendB='Expenses', fmt=money, ticks=4}={}){
  valsA = (valsA || []).map(v => Number(v) || 0);
  valsB = (valsB || []).map(v => Number(v) || 0);
  labels = labels || [];
  if(!valsA.length) return '<div class="empty mini">No data yet</div>';
  const max = niceMax(Math.max(1, ...valsA, ...valsB), ticks);
  const padL=52, padR=14, padT=14, padB=28;
  const iw = w-padL-padR, ih = h-padT-padB;
  const groupW = iw/valsA.length;
  const barW = Math.max(6, Math.min(22, groupW/3.1));
  const bar = (x, v, color, lbl) => {
    const bh = Math.max(v>0?2.5:0, (v/max)*ih);
    const y = padT+ih-bh;
    return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(5, barW/2).toFixed(1)}" fill="${color}" opacity="${v>0?1:.22}"><title>${esc(lbl)} — ${esc(fmt(v))}</title></rect>`;
  };
  const bars = labels.map((lb,i)=>{
    const cx = padL + i*groupW + groupW/2;
    return bar(cx-barW-2, valsA[i], colorA, `${lb||''} ${legendA}`) + bar(cx+2, valsB[i], colorB, `${lb||''} ${legendB}`);
  }).join('');
  const lbs = labels.map((lb,i)=>`<text class="chart-lab" x="${(padL+i*groupW+groupW/2).toFixed(1)}" y="${h-8}" text-anchor="middle">${esc(lb||'')}</text>`).join('');
  const svg = `<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="xMidYMid meet" role="img">
    ${axisGrid(max, {padL, padR, padT, ih, w, ticks, fmt: moneyAxis})}${bars}${lbs}</svg>`;
  return svg + legendHTML([{label:legendA, color:colorA}, {label:legendB, color:colorB}]);
}
function barChart(vals, labels, {w=640, h=214, color='#0d9488', fmt=fmtInt, ticks=4, valueLabels=true}={}){
  vals = (vals || []).map(v => Number(v) || 0);
  labels = labels || [];
  if(!vals.length) return '<div class="empty mini">No data yet</div>';
  const max = niceMax(Math.max(1, ...vals), ticks);
  const padL=42, padR=14, padT=20, padB=28;
  const iw = w-padL-padR, ih = h-padT-padB;
  const groupW = iw/vals.length;
  const barW = Math.max(8, Math.min(38, groupW*0.56));
  const bars = vals.map((v,i)=>{
    const bh = Math.max(v>0?2.5:0, (v/max)*ih);
    const x = padL + i*groupW + (groupW-barW)/2;
    const y = padT+ih-bh;
    return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(6, barW/2).toFixed(1)}" fill="${color}" opacity="${v?1:.22}"><title>${esc(labels[i]||'')} — ${esc(fmt(v))}</title></rect>`
      + (v && valueLabels ? `<text class="chart-val" x="${(x+barW/2).toFixed(1)}" y="${(y-6).toFixed(1)}" text-anchor="middle">${esc(fmt(v))}</text>` : '');
  }).join('');
  const lbs = labels.map((lb,i)=>`<text class="chart-lab" x="${(padL+i*groupW+groupW/2).toFixed(1)}" y="${h-8}" text-anchor="middle">${esc(lb||'')}</text>`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="xMidYMid meet" role="img">
    ${axisGrid(max, {padL, padR, padT, ih, w, ticks, fmt: axisFmt})}${bars}${lbs}</svg>`;
}
function hbarList(rows, {fmt=money, color='#0284c7'}={}){
  const max = Math.max(1, ...rows.map(r=>r.value));
  if(!rows.length) return '<div class="empty mini">No data yet</div>';
  return `<div class="hbars">` + rows.map(r=>`
    <div class="hbar-row">
      <span class="hbar-lbl" title="${esc(r.label)}">${esc(r.label)}</span>
      <div class="hbar"><i style="width:${Math.max(2, r.value/max*100).toFixed(1)}%;background:${r.color||color}"></i></div>
      <b class="hbar-val" title="${esc(fmt(r.value))}">${esc(fmt(r.value))}</b>
    </div>`).join('') + `</div>`;
}

/* ================= shared line-item editor (quotes & invoices) ================= */
function itemRowHTML(it, i){
  const stockOpts = `<option value="">Priced manually…</option>` +
    db.inventory.map(x => `<option value="${x.id}" ${it.invId===x.id?'selected':''}>${esc(x.name)} — ${money(x.price)}</option>`).join('');
  return `<tr data-i="${i}">
    <td style="width:96px"><select class="inp ksel" title="Line type">
      <option ${it.kind==='Labor'?'selected':''}>Labor</option>
      <option ${it.kind==='Material'?'selected':''}>Material</option>
      <option ${it.kind==='Transport'?'selected':''}>Transport</option></select></td>
    <td><input class="inp isel" value="${esc(it.desc)}" placeholder="Description"></td>
    <td style="width:72px"><input class="inp qsel num" type="number" min="0" step="0.25" value="${it.qty}"></td>
    <td style="width:56px" class="muted small unitcell">${esc(it.unit||'')}</td>
    <td style="width:158px" class="${it.kind==='Material'?'':'hide'}"><select class="inp spick">${stockOpts}</select></td>
    <td style="width:110px"><input class="inp ptsel num" type="number" min="0" step="50" value="${it.price}"></td>
    <td style="width:34px"><button class="btn icon ghost rm" title="Remove line">✕</button></td>
  </tr>`;
}
function itemsTableHTML(){
  return `<div class="row mb12">
      <button class="btn ghost sm" id="add-lab">${icon('plus',14)} Labor line</button>
      <button class="btn ghost sm" id="add-mat">${icon('box',14)} Material line</button>
    </div>
    <div class="tbl-wrap"><table class="tbl items-tbl">
      <thead><tr><th>Type</th><th>Description</th><th>Qty</th><th>Unit</th><th>From inventory</th><th class="num">Unit price</th><th></th></tr></thead>
      <tbody id="items-body"></tbody>
    </table></div>`;
}
function bindItemsEditor({getItems, onRefresh}){
  const body = $('#items-body');
  function rerender(){
    const items = getItems();
    body.innerHTML = items.length
      ? items.map((it,i) => itemRowHTML(it,i)).join('')
      : `<tr><td colspan="7" class="empty small" style="padding:18px">No lines yet — add a labor or material line, or use the AI assistant.</td></tr>`;
    $$('#items-body tr').forEach(tr => { tr.querySelector('.unitcell') && (tr.querySelector('.unitcell').textContent = (getItems()[+tr.dataset.i]||{}).unit || ''); });
    bindRows();
    if(onRefresh) onRefresh();
  }
  function bindRows(){
    $$('#items-body tr').forEach(tr => {
      const i = +tr.dataset.i, items = getItems(), it = items[i];
      if(!it) return;
      tr.querySelector('.ksel').onchange = e => { it.kind = e.target.value; rerender(); };
      tr.querySelector('.isel').oninput = e => { it.desc = e.target.value; onRefresh && onRefresh(); };
      tr.querySelector('.qsel').oninput = e => { it.qty = parseFloat(e.target.value)||0; onRefresh && onRefresh(); };
      tr.querySelector('.ptsel').oninput = e => { it.price = parseFloat(e.target.value)||0; onRefresh && onRefresh(); };
      tr.querySelector('.spick').onchange = e => {
        const inv = invItemById(e.target.value);
        if(inv){ it.invId = inv.id; it.desc = inv.name; it.unit = inv.unit; it.price = inv.price; it.kind = 'Material'; }
        else it.invId = null;
        rerender();
      };
      tr.querySelector('.rm').onclick = () => { items.splice(i,1); rerender(); };
    });
  }
  $('#add-lab').onclick = () => { getItems().push({kind:'Labor', desc:'', qty:1, unit:'hr', price: db.business.rates.standard||1200}); rerender(); };
  $('#add-mat').onclick = () => { getItems().push({kind:'Material', desc:'', qty:1, unit:'pcs', price:0}); rerender(); };
  bindRows();
}
function consumeStock(inv, items){
  const warns = [];
  (items||[]).forEach(it => {
    if(it.kind !== 'Material' || !it.invId) return;
    const invItem = invItemById(it.invId);
    if(!invItem) return;
    const take = Math.min(invItem.qty, it.qty||0);
    invItem.qty -= take;
    invItem.history = invItem.history || [];
    invItem.history.unshift({at:isoDate(today()), delta:-it.qty, reason:`Used on ${inv.ref}`});
    if(take < (it.qty||0)) warns.push(`${invItem.name}: only ${invItem.qty} left after issue`);
  });
  return warns;
}

/* ================= password visibility toggle (eye) ================= */
function bindPwToggles(root){
  const scope = root || document;
  scope.querySelectorAll('input[type="password"]').forEach(inp => {
    if(inp.dataset.pwBound) return;
    inp.dataset.pwBound = '1';
    const wrap = document.createElement('div');
    wrap.className = 'pw-field';
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.title = 'Show password';
    btn.setAttribute('aria-label', 'Show or hide password');
    btn.innerHTML = icon('eye', 17);
    wrap.appendChild(btn);
    btn.onclick = () => {
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eyeOff' : 'eye', 17);
      btn.classList.toggle('on', show);
      btn.title = show ? 'Hide password' : 'Show password';
      inp.focus();
    };
  });
}

/* ================= role-aware session (admin / customer portal) ================= */
function isCustomerSession(){
  if(typeof AUTH === 'undefined') return false;
  const s = AUTH.session();
  return !!s && s !== 'guest' && AUTH.role(s) === 'customer';
}
function myCustomer(){
  if(!isCustomerSession() || !db) return null;
  const acc = AUTH.byEmail(AUTH.session());
  if(!acc) return null;
  if(acc.custId) return customerById(acc.custId) || null;
  return db.customers.find(c => c.email && c.email.toLowerCase() === AUTH.session()) || null;
}
const CUSTOMER_VIEWS = ['cust_dash','cust_quotes','cust_invoices','cust_invoice','cust_jobs','cust_help'];

/* ================= navigation ================= */
const VIEWS = {};
const MAIN_TABS = ['dashboard','jobs','dispatch','customers'];
function sheetOpen(html){
  const s = $('#sheet'); if(!s) return;
  s.innerHTML = html;
  requestAnimationFrame(()=>{ s.classList.add('open'); const sc = $('#scrim'); if(sc) sc.classList.add('open'); });
}
function sheetClose(){
  const s = $('#sheet'); if(!s) return;
  s.classList.remove('open');
  const sc = $('#scrim'); if(sc) sc.classList.remove('open');
}
function go(view, params = {}){
  if(isCustomerSession() && !CUSTOMER_VIEWS.includes(view)) view = 'cust_dash';
  const v = VIEWS[view];
  if(!v) return;
  ui = {view, params};
  $('#top-title').textContent = typeof v.title === 'function' ? v.title(params) : v.title;
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === view || (b.dataset.tab === 'more' && !MAIN_TABS.includes(view))));
  sheetClose();
  const c = $('#content');
  c.innerHTML = v.render(params);
  c.scrollTop = 0;
  window.scrollTo(0,0);
  if(v.mount) v.mount(params);
  if(typeof refreshBell === 'function') refreshBell();
  if(typeof refreshNavBadges === 'function') refreshNavBadges();
  if(typeof updateTopSub === 'function') updateTopSub();
  if(typeof closeMenu === 'function') closeMenu();
}
function reRender(){ go(ui.view, ui.params); }

function quickRecordPayment(){
  const open = db.invoices.filter(i => i.status !== 'Draft' && invBalance(i) > 0)
    .sort((a,b) => a.due.localeCompare(b.due))[0];
  if(!open){ toast('No open invoices to collect on','warn'); return; }
  payModal(open);
}
