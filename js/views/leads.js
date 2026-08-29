'use strict';
/* ================= leads: sales pipeline board (Lead → Quote → Schedule → Won) ================= */
const LEAD_STATUSES = ['New','Contacted','Quoted','Won','Lost'];
const LEAD_SOURCES = ['Walk-in','WhatsApp','Referral','Repeat','Online ad'];

function guessJobType(s){
  s = (s||'').toLowerCase();
  if(s.includes('solar')) return 'Solar';
  if(s.includes('drain')||s.includes('clog')||s.includes('block')||s.includes('septic')) return 'Drainage';
  if(s.includes('gas')) return 'Gas';
  if(s.includes('pump')||s.includes('tank')||s.includes('water supply')) return 'Water supply';
  if(s.includes('install')||s.includes('fit')||s.includes('refit')||s.includes('geyser')||s.includes('heater')) return 'Installation';
  if(s.includes('maint')||s.includes('service')||s.includes('gutter')) return 'Maintenance';
  if(s.includes('inspect')||s.includes('test')||s.includes('audit')) return 'Inspection';
  if(s.includes('emergency')||s.includes('burst')||s.includes('urgent')) return 'Emergency';
  return 'Repair';
}

VIEWS.leads = {
  title: () => 'Leads & Pipeline',
  render(){
    const open = db.leads.filter(l => !['Won','Lost'].includes(l.status));
    const mk = monthKey(today());
    const won = db.leads.filter(l => l.status === 'Won');
    const wonM = won.filter(l => (l.wonAt||'').startsWith(mk));
    const lostM = db.leads.filter(l => l.status === 'Lost' && (l.lostAt||'').startsWith(mk));
    const newWk = db.leads.filter(l => l.status === 'New' && dayDiff(l.createdAt, isoDate(today())) <= 7);
    const openValue = sum(open, l => l.budget||0);
    const card = l => {
      const c = l.customerId ? customerById(l.customerId) : null;
      const wa = l.phone ? `<a class="btn icon wa" title="WhatsApp ${esc(l.name)}" target="_blank" rel="noopener" data-act="wa" data-l="${l.id}">${icon('wa',14)}</a>` : '';
      const acts = [];
      if(l.status==='New') acts.push(['contacted','→ Contacted'], ['quote','✦ Quote'], ['schedule','📅 Schedule']);
      if(l.status==='Contacted') acts.push(['quoted','→ Quoted'], ['quote','✦ Quote'], ['schedule','📅 Schedule'], ['lost','✕ Lost']);
      if(l.status==='Quoted') acts.push(['won','✓ Won'], ['schedule','📅 Schedule'], ['lost','✕ Lost']);
      if(l.status==='Won' && !l.jobRef) acts.push(['schedule','📅 Schedule job']);
      if(l.status==='Lost') acts.push(['new','↺ Reopen']);
      return `<div class="kcard" data-l="${l.id}">
        <div class="spread"><b>${esc(l.name)}</b>${wa}</div>
        <div class="k-svc">${TYPE_EMOJI[guessJobType(l.service)]||'📋'} ${esc(l.service)}</div>
        <div class="muted small">${esc(l.location||'Nairobi')} · ${esc(l.source||'Walk-in')}</div>
        ${l.budget ? `<div class="small">Budget: <b>${money(l.budget)}</b> <span class="muted">· ${relDays(l.createdAt)}</span></div>` : `<div class="muted small">· ${relDays(l.createdAt)}</div>`}
        ${l.notes ? `<div class="k-notes">${esc(l.notes)}</div>` : ''}
        <div class="row mt8" style="flex-wrap:wrap">
          ${acts.map(([a,t])=>`<button class="btn ghost sm" data-act="${a}" data-l="${l.id}">${t}</button>`).join('')}
          ${c ? `<button class="btn ghost sm" data-act="cust" data-l="${l.id}">👤 Customer</button>` : ''}
          <button class="btn icon ghost" data-act="edit" data-l="${l.id}" title="Edit">✎</button>
          <button class="btn icon ghost" data-act="del" data-l="${l.id}" title="Delete">🗑</button>
        </div>
      </div>`;
    };
    return `
    <div class="page-head">
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <span class="k-stat"><b>${open.length}</b> open</span>
        <span class="k-stat"><b>${newWk.length}</b> new this week</span>
        <span class="k-stat ok"><b>${wonM.length}</b> won this month</span>
        <span class="k-stat">${money(openValue)} open value</span>
        ${lostM.length ? `<span class="k-stat bad"><b>${lostM.length}</b> lost this month</span>` : ''}
      </div>
      <button class="btn primary" id="lead-new">${icon('plus',15)} New lead</button>
    </div>
    <div class="kanban">
      ${LEAD_STATUSES.map(s => {
        const list = db.leads.filter(l => l.status === s).sort((a,b)=>b.ref.localeCompare(a.ref));
        return `<div class="kcol kcol-${s.toLowerCase()}">
          <div class="kcol-h"><b>${s}</b><span class="kcount">${list.length}</span></div>
          ${list.length ? list.map(card).join('') : '<div class="kempty">—</div>'}
        </div>`;
      }).join('')}
    </div>`;
  },
  mount(){
    $('#lead-new').onclick = () => leadModal(null);
    $$('#content [data-act]').forEach(btn => btn.onclick = e => {
      e.stopPropagation();
      const l = db.leads.find(x => x.id === btn.dataset.l);
      if(!l) return;
      const a = btn.dataset.act;
      if(a==='contacted' || a==='quoted' || a==='new' || a==='lost' || a==='won') leadMove(l, a==='new'?'New':a==='lost'?'Lost':a[0].toUpperCase()+a.slice(1));
      else if(a==='quote') leadMakeQuote(l);
      else if(a==='schedule') leadScheduleJob(l);
      else if(a==='cust') { go('customer', {id: l.customerId}); }
      else if(a==='edit') leadModal(l);
      else if(a==='del') askConfirm(`Delete lead <b>${esc(l.name)}</b>?`, () => {
        db.leads = db.leads.filter(x => x.id !== l.id); commit(); reRender(); toast('Lead deleted');
      });
    });
  }
};

function leadMove(l, status){
  l.status = status;
  if(status === 'Won') l.wonAt = isoDate(today());
  if(status === 'Lost') l.lostAt = isoDate(today());
  if(status === 'New') { delete l.lostAt; delete l.wonAt; }
  commit();
  toast(`${l.name} → ${status}`);
  reRender();
}

function leadEnsureCustomer(l){
  const phone = waDigits(l.phone);
  let c = db.customers.find(x => x.phone && waDigits(x.phone) === phone);
  if(!c) c = db.customers.find(x => x.name.toLowerCase() === l.name.toLowerCase());
  if(!c){
    c = {id:uid('c'), name:l.name, type:'Residential', phone:l.phone||'', email:'', area:l.location||'Nairobi', address:'', notes:[], createdAt:isoDate(today())};
    db.customers.push(c);
    commit();
    toast(`Customer “${l.name}” created`);
  }
  l.customerId = c.id;
  commit();
  return c;
}

function leadMakeQuote(l){
  const c = leadEnsureCustomer(l);
  go('quote_edit', {customerId: c.id, title: l.service});
}

function leadScheduleJob(l){
  const c = leadEnsureCustomer(l);
  jobModal({customerId: c.id, title: l.service, type: guessJobType(l.service)}, job => {
    l.jobRef = job.ref;
    l.status = 'Won';
    l.wonAt = isoDate(today());
    commit();
    toast(`${l.name} won — job ${job.ref} scheduled`);
    reRender();
  });
}

function leadModal(lead){
  const isE = !!lead;
  openModal(isE ? `Edit lead — ${esc(lead.name)}` : 'New lead', `
    <div class="form-grid">
      <div class="field"><label>Name *</label><input class="inp" id="lf-name" value="${esc(lead?lead.name:'')}" placeholder="e.g. John Mwangi"></div>
      <div class="field"><label>Phone</label><input class="inp" id="lf-phone" value="${esc(lead?lead.phone:'')}" placeholder="07xx xxx xxx"></div>
      <div class="field span2"><label>Service requested</label><input class="inp" id="lf-svc" list="lf-svc-list" value="${esc(lead?lead.service:'')}" placeholder="e.g. Bathroom pipe repair">
        <datalist id="lf-svc-list">${JOB_TYPES.map(t=>`<option value="${t}">`).join('')}</datalist></div>
      <div class="field"><label>Location</label><input class="inp" id="lf-loc" value="${esc(lead?lead.location||'':'')}" placeholder="e.g. Kilimani"></div>
      <div class="field"><label>Budget (KES)</label><input class="inp" id="lf-budget" type="number" min="0" step="100" value="${lead&&lead.budget?lead.budget:''}"></div>
      <div class="field"><label>Source</label>
        <select class="inp" id="lf-source">${LEAD_SOURCES.map(s=>`<option ${lead&&lead.source===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field" ${isE?'':'hidden'}><label>Status</label>
        <select class="inp" id="lf-status">${LEAD_STATUSES.map(s=>`<option ${lead&&lead.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field span2"><label>Notes</label><textarea class="inp" id="lf-notes" rows="2" placeholder="Access, urgency, follow-up time…">${esc(lead?lead.notes||'':'')}</textarea></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="lf-x">Cancel</button><button class="btn primary" id="lf-save">${isE?'Save changes':'Add lead'}</button>`,
    onMount(){
      $('#lf-x').onclick = closeModal;
      $('#lf-save').onclick = () => {
        const name = $('#lf-name').value.trim();
        if(!name){ toast('Name is required','warn'); return; }
        const data = {
          name, phone: $('#lf-phone').value.trim(), service: $('#lf-svc').value.trim() || 'General plumbing',
          location: $('#lf-loc').value.trim(), budget: parseFloat($('#lf-budget').value)||0,
          source: $('#lf-source').value, notes: $('#lf-notes').value.trim()
        };
        if(isE){
          Object.assign(lead, data);
          if($('#lf-status').value !== lead.status) leadMove(lead, $('#lf-status').value); else { commit(); reRender(); toast('Lead updated'); }
        } else {
          db.leads.unshift(Object.assign({
            id:uid('l'), ref:nextRef('lead'), status:'New', customerId:null, quoteRef:null, jobRef:null,
            createdAt:isoDate(today())
          }, data));
          commit(); reRender(); toast(`Lead added: ${name}`);
        }
      };
    }
  });
}
