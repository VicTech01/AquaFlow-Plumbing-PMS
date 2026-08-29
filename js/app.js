'use strict';
/* ================= state & storage ================= */
let db = null;
let ui = { view:'dashboard', params:{} };

const DB = {
  key: 'aquaflow_pms_v1',
  load(){
    try{
      const raw = localStorage.getItem(this.key);
      if(raw){ const d = JSON.parse(raw); if(d && d.v === 1) return d; }
    }catch(e){}
    return null;
  },
  save(){
    try{ localStorage.setItem(this.key, JSON.stringify(db)); }
    catch(e){ if(db) db.memoryMode = true; }
  },
  seed(){ const d = makeSeed(); db = d; this.save(); return d; }
};
function commit(){ DB.save(); }

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
function chip(label){ return `<span class="chip c-${CHIP[label]||'gray'}">${esc(label)}</span>`; }
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
  userPlus:'<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5"/><path d="M19 6v6M16 9h6"/>',
  send:'<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  wa:'<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8M9 8.2c-.2 0-.4.1-.6.2-.2.1-.5.2-.7.4-.2.2-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 3 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.2-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.5-.6c.1-.2.2-.3.1-.5l-.7-1.7c-.2-.4-.3-.4-.5-.4z"/>'
};
function icon(n, size=18){
  if(n === 'wa') return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 1 1-4.2 15.3l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8M9 8.2c-.2 0-.4.1-.6.2-.2.1-.5.2-.7.4-.2.2-.9.9-.9 2.1 0 1.3.9 2.5 1 2.7.1.2 1.8 3 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.4-.2-1.5-.7c-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.6 6.6 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.5-.6c.1-.2.2-.3.1-.5l-.7-1.7c-.2-.4-.3-.4-.5-.4z"/></svg>`;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||''}</svg>`;
}

/* ================= charts (hand-rolled SVG, no CDN) ================= */
function areaChart(vals, labels, {w=640, h=170, color='#0369a1'} = {}){
  const max = Math.max(1, ...vals);
  const padL = 10, padR = 10, padT = 16, padB = 24;
  const iw = w - padL - padR, ih = h - padT - padB;
  const step = iw / Math.max(1, vals.length - 1);
  const pts = vals.map((v,i) => [padL + i*step, padT + ih - (v/max)*ih]);
  const line = pts.map((p,i) => (i?'L':'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L ${pts[pts.length-1][0].toFixed(1)} ${(padT+ih).toFixed(1)} L ${pts[0][0].toFixed(1)} ${(padT+ih).toFixed(1)} Z`;
  const grid = [0.25,0.5,0.75,1].map(f =>
    `<line x1="${padL}" x2="${w-padR}" y1="${(padT+ih - f*ih).toFixed(1)}" y2="${(padT+ih - f*ih).toFixed(1)}" stroke="#eef2f7" stroke-width="1"/>`).join('');
  const dots = pts.map((p,i) =>
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===pts.length-1?4:3}" fill="${i===pts.length-1?color:'#fff'}" stroke="${color}" stroke-width="1.6"/>`).join('');
  const xl = labels.map((l,i) =>
    `<text x="${pts[i][0].toFixed(1)}" y="${h-6}" font-size="10.5" fill="#5b6b85" text-anchor="middle">${esc(l)}</text>`).join('');
  const last = `<text x="${pts[pts.length-1][0].toFixed(1)}" y="${(pts[pts.length-1][1]-8).toFixed(1)}" font-size="11" font-weight="700" fill="${color}" text-anchor="end">${money(vals[vals.length-1])}</text>`;
  return `<svg viewBox="0 0 ${w} ${h}" class="chart" preserveAspectRatio="xMidYMid meet">${grid}<path d="${area}" fill="${color}" opacity="0.08"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>${dots}${xl}${last}</svg>`;
}
function donut(segs, {size=150, thick=20} = {}){
  const total = segs.reduce((t,s)=>t+s.value,0);
  const r = (size - thick)/2, c = size/2, circ = 2*Math.PI*r;
  let acc = 0;
  const arcs = total > 0
    ? segs.filter(s=>s.value>0).map(s => {
        const len = s.value/total*circ;
        const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${thick}" stroke-dasharray="${len.toFixed(2)} ${(circ-len).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
        acc += len; return el;
      }).join('')
    : `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="${thick}"/>`;
  return `<svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px">${arcs}</svg>`;
}

/* ================= shared line-item editor (quotes & invoices) ================= */
function itemRowHTML(it, i){
  const stockOpts = `<option value="">Priced manually…</option>` +
    db.inventory.map(x => `<option value="${x.id}" ${it.invId===x.id?'selected':''}>${esc(x.name)} — ${money(x.price)}</option>`).join('');
  return `<tr data-i="${i}">
    <td style="width:96px"><select class="inp ksel" title="Line type">
      <option ${it.kind==='Labor'?'selected':''}>Labor</option>
      <option ${it.kind==='Material'?'selected':''}>Material</option></select></td>
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
}
function reRender(){ go(ui.view, ui.params); }

function quickRecordPayment(){
  const open = db.invoices.filter(i => i.status !== 'Draft' && invBalance(i) > 0)
    .sort((a,b) => a.due.localeCompare(b.due))[0];
  if(!open){ toast('No open invoices to collect on','warn'); return; }
  payModal(open);
}
