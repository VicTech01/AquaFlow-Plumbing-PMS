'use strict';
/* ================= jobs: week calendar + list ================= */
let jtab = (typeof window.matchMedia === 'function' ? window.matchMedia('(max-width:760px)').matches : (window.innerWidth||1024) < 760) ? 'list' : 'cal';
let jw = 0; // week offset
let jtype = '';

VIEWS.jobs = {
  title: () => 'Jobs & Scheduling',
  render(){
    return `
    <div class="page-head">
      <div class="row">
        <div class="tabs">
          <button data-tab="cal" class="${jtab==='cal'?'active':''}">Calendar</button>
          <button data-tab="list" class="${jtab==='list'?'active':''}">List</button>
          <button data-tab="pipe" class="${jtab==='pipe'?'active':''}">Pipeline</button>
        </div>
      </div>
      <button class="btn primary" id="j-new">${icon('plus',15)} New job</button>
    </div>
    ${jtab === 'cal' ? jobsCalendarHTML() : jtab === 'list' ? jobsListHTML() : jobsPipelineHTML()}`;
  },
  mount(){
    $$('#content .tabs button').forEach(b => b.onclick = () => { jtab = b.dataset.tab; reRender(); });
    $('#j-new').onclick = () => jobModal({});
    if(jtab === 'cal') jobsCalMount(); else if(jtab==='list') jobsListMount(); else jobsPipelineMount();
  }
};

function startOfWeek(d){ const x = new Date(d); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; }

function jobsCalendarHTML(){
  const ws = addDays(startOfWeek(today()), jw*7);
  const t = isoDate(today());
  const H0 = 7, ROW = 52, COLH = 12*ROW;
  const days = [...Array(7)].map((_,i) => addDays(ws, i));
  const head = days.map(d => {
    const di = isoDate(d);
    return `<div class="cal-cellh ${di===t?'today':''}">${d.toLocaleDateString('en-KE',{weekday:'short'})}<br><span class="d">${d.getDate()}</span></div>`;
  }).join('');
  const hours = [...Array(12)].map((_,i) => `<span style="top:${i*ROW}px">${pad2(H0+i)}:00</span>`).join('');
  const cols = days.map(d => {
    const di = isoDate(d);
    const dow = d.getDay();
    const jobs = db.jobs.filter(j => j.date === di);
    const blocks = jobs.map(j => {
      const top = clamp(((hmToMin(j.start) - H0*60)/60)*ROW, 0, COLH-30);
      const h = clamp(j.hours*ROW, 30, COLH-top);
      const c = customerById(j.customerId);
      const techs = (j.technicianIds||[]).map(techById).filter(Boolean).map(x=>initials(x.name)).join(' ');
      const conflict = jobConflicts(j).length > 0;
      const cls = JB_CLASS[j.status]||'jb-hold';
      const dim = j.status==='Cancelled' ? ' dim' : '';
      return `<div class="jobblock ${cls}${conflict?' conflict':''}${dim}" data-job="${j.id}" title="${esc(j.title)} — ${esc(c?c.name:'')}">
        <b>${TYPE_EMOJI[j.type]||''} ${esc(j.title)}</b><span class="t">${j.start} · ${esc(c?c.name.split(' ')[0]:'')}</span><span class="t">${techs}</span>
      </div>`;
    }).join('');
    return `<div class="daycol ${dow===0||dow===6?'weekend':''} ${di===t?'today':''}" data-date="${di}">${blocks}</div>`;
  }).join('');
  return `
  <div class="row mb12">
    <button class="btn ghost sm" id="cal-prev">${icon('chevL',15)}</button>
    <button class="btn ghost sm" id="cal-today">Today</button>
    <button class="btn ghost sm" id="cal-next">${icon('chevR',15)}</button>
    <b class="small muted">${fmtDateShort(isoDate(ws))} – ${fmtDateShort(isoDate(addDays(ws,6)))}</b>
    <span class="small muted" style="margin-left:auto">Click an empty slot to schedule a job · click a block to open it</span>
  </div>
  <div class="cal">
    <div class="cal-head"><div class="cal-cellh"></div>${head}</div>
    <div class="cal-body">
      <div class="cal-hours">${hours}</div>
      ${cols}
    </div>
  </div>`;
}

function jobsCalMount(){
  $('#cal-prev').onclick = () => { jw--; reRender(); };
  $('#cal-next').onclick = () => { jw++; reRender(); };
  $('#cal-today').onclick = () => { jw = 0; reRender(); };
  $$('#content .daycol').forEach(col => {
    col.addEventListener('click', e => {
      if(e.target.closest('.jobblock')) return;
      const y = e.clientY - col.getBoundingClientRect().top;
      const mins = 7*60 + Math.round(y/52*60 / 30) * 30;
      jobModal({date: col.dataset.date, start: minToHM(clamp(mins, 7*60, 20*60))});
    });
  });
  $$('#content .jobblock').forEach(b => b.onclick = () => openJobModal(b.dataset.job));
}

function jobsListHTML(){
  return `
  <div class="card">
    <div class="row mb12" style="flex-wrap:wrap">
      <input class="inp search-inp" id="jl-q" placeholder="Search title, customer, ref…">
      <select class="inp" id="jl-status" style="max-width:150px">
        <option value="">All statuses</option>
        ${['Scheduled','Dispatched','In Progress','Completed','On Hold','Cancelled'].map(s=>`<option>${s}</option>`).join('')}
      </select>
      <select class="inp" id="jl-type" style="max-width:150px">
        <option value="">All types</option>
        ${JOB_TYPES.map(t=>`<option ${jtype===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <select class="inp" id="jl-tech" style="max-width:170px">
        <option value="">All technicians</option>
        ${db.technicians.filter(x=>x.active).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}
      </select>
      <input type="date" class="inp" id="jl-from" style="max-width:160px" title="From date">
      <input type="date" class="inp" id="jl-to" style="max-width:160px" title="To date">
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Ref</th><th>When</th><th>Job</th><th>Customer</th><th>Technician(s)</th><th class="num">Hrs</th><th>Status</th><th>Priority</th><th></th></tr></thead>
      <tbody id="jl-body">${jobsListRows(db.jobs.slice().sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start)))}</tbody>
    </table></div>
  </div>`;
}

function jobsListRows(jobs){
  if(!jobs.length) return `<tr><td colspan="9" class="empty">No jobs match the filters</td></tr>`;
  return jobs.map(j => {
    const c = customerById(j.customerId);
    const techs = (j.technicianIds||[]).map(techById).filter(Boolean);
    const conflict = jobConflicts(j).length > 0;
    return `<tr class="click" data-job="${j.id}">
      <td class="bold">${j.ref}</td>
      <td class="resp-md">${fmtDateShort(j.date)}<div class="subrow">${j.start} · ${j.hours}h</div></td>
      <td><b>${TYPE_EMOJI[j.type]||''} ${esc(j.title)}</b>${conflict?' <span class="chip c-red" title="Overlapping technician">⚠ overlap</span>':''}<div class="subrow">${j.type} · ${j.start} · ${esc(j.address||'')}</div></td>
      <td>${esc(c?c.name:'—')}</td>
      <td class="resp-md">${techs.length?techs.map(t=>`<span class="chip c-gray">${esc(t.name.split(' ')[0])}</span>`).join(' '):'<span class="muted small">unassigned</span>'}</td>
      <td class="num resp-sm">${j.hours}</td>
      <td>${chip(j.status)}</td>
      <td><span class="chip c-${j.priority==='Urgent'?'red':j.priority==='High'?'amber':j.priority==='Medium'?'sky':'gray'}">${j.priority}</span></td>
      <td><button class="btn icon ghost" title="Open">↗</button></td>
    </tr>`;
  }).join('');
}

function jobsListMount(){
  const apply = () => {
    const q = ($('#jl-q').value||'').toLowerCase();
    const st = $('#jl-status').value, tech = $('#jl-tech').value, type = $('#jl-type').value;
    const from = $('#jl-from').value, to = $('#jl-to').value;
    const list = db.jobs.slice().sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start)).filter(j => {
      const c = customerById(j.customerId);
      if(q && !(j.title+' '+(c?c.name:'')+' '+j.ref).toLowerCase().includes(q)) return false;
      if(st && j.status !== st) return false;
      if(type && j.type !== type) return false;
      if(tech && !(j.technicianIds||[]).includes(tech)) return false;
      if(from && j.date < from) return false;
      if(to && j.date > to) return false;
      return true;
    });
    $('#jl-body').innerHTML = jobsListRows(list);
    $$('#jl-body tr[data-job]').forEach(tr => tr.onclick = () => openJobModal(tr.dataset.job));
  };
  ['jl-q','jl-status','jl-type','jl-tech','jl-from','jl-to'].forEach(id => {
    $('#'+id).addEventListener('input', apply);
    $('#'+id).addEventListener('change', apply);
  });
  apply();
}

/* ================= pipeline view (Quote→Scheduled→In Progress→Completed→Invoiced→Paid) ================= */
function jobsPipelineHTML(){
  const active = db.jobs.filter(j => j.status !== 'Cancelled' && jobStage(j) < 5)
    .sort((a,b) => jobStage(a)-jobStage(b) || (a.date+a.start).localeCompare(b.date+b.start));
  const closed = db.jobs.filter(j => jobStage(j) === 5)
    .sort((a,b) => (b.date+b.start).localeCompare(a.date+a.start));
  const row = j => {
    const c = customerById(j.customerId);
    const na = jobNextAction(j);
    const actBtn = na.act==='done'
      ? `<button class="btn ghost sm" data-na="done" data-job="${j.id}">${na.label}</button>`
      : `<button class="btn ${na.act==='collect'?'green':'primary'} sm" data-na="${na.act}" data-job="${j.id}">${na.label}</button>`;
    return `<tr class="pp-row">
      <td><b>${TYPE_EMOJI[j.type]||''} ${esc(j.title)}</b><div class="subrow">${j.ref} · ${fmtDateShort(j.date)} ${j.start}</div></td>
      <td class="resp-sm">${esc(c?c.name:'—')}</td>
      <td class="pp-stepper-cell">${stepperHTML(j)}</td>
      <td class="num resp-sm">${j.hours}h</td>
      <td style="min-width:130px">${actBtn}</td>
    </tr>`;
  };
  return `
  <div class="card">
    <div class="row mb12" style="flex-wrap:wrap;gap:8px">
      <b class="small">${PIPELINE.length===6?'Full pipeline':'Pipeline'}</b>
      <span class="muted small">Lead → Quotation → Scheduled → In Progress → Completed → Invoiced → Paid</span>
      <span class="muted small" style="margin-left:auto">${active.length} in flight · ${closed.length} paid off</span>
    </div>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Job</th><th class="resp-sm">Customer</th><th class="resp-md">Pipeline</th><th class="num resp-sm">Hrs</th><th>Next action</th></tr></thead>
      <tbody>
        ${active.length ? active.map(row).join('') : '<tr><td colspan="5" class="empty">Nothing in flight 🎉</td></tr>'}
        ${closed.length ? `<tr class="pp-sep"><td colspan="5">✓ Recently paid off</td></tr>` + closed.slice(0,6).map(row).join('') : ''}
      </tbody>
    </table></div>
  </div>`;
}
function jobsPipelineMount(){
  $$('#content [data-na]').forEach(btn => btn.onclick = () => {
    const j = jobById(btn.dataset.job);
    if(!j) return;
    const na = btn.dataset.na;
    const inv = jobInvoice(j);
    if(na==='quote'){ go('quote_edit', {jobId: j.id}); }
    else if(na==='dispatch'){ go('dispatch'); }
    else if(na==='start'){ j.status='In Progress'; commit(); toast(`${j.ref} started`); reRender(); }
    else if(na==='complete'){ j.status='Completed'; commit(); toast(`Job ${j.ref} completed`); reRender(); }
    else if(na==='invoice'){ go('invoice_new', {jobId: j.id}); }
    else if(na==='collect'){ payModal(inv); }
    else if(na==='resume'){ j.status='Scheduled'; commit(); toast(`${j.ref} resumed`); reRender(); }
    else if(na==='done'){ openJobModal(j.id); }
  });
}

/* ================= job create/edit modal ================= */
const JOB_TYPES = ['Repair','Installation','Maintenance','Service','Inspection','Emergency','Solar','Drainage','Gas','Water supply'];
const JOB_STATUSES = ['Scheduled','Dispatched','In Progress','Completed','On Hold','Cancelled'];
const JOB_PRIORITIES = ['Low','Medium','High','Urgent'];
const TYPE_EMOJI = {Repair:'🔧',Installation:'🛠',Maintenance:'🔁',Service:'🛎',Inspection:'🔍',Emergency:'🚨',Solar:'☀️',Drainage:'🚰',Gas:'🔥','Water supply':'🚱'};
const typeTag = t => `<span class="chip c-gray" title="${esc(t)}">${TYPE_EMOJI[t]||'📋'} ${esc(t)}</span>`;

function jobModal(prefill = {}, afterSave){
  const techs = db.technicians.filter(t=>t.active);
  openModal(prefill.id ? 'Edit job' : 'Schedule new job', `
    <div class="form-grid">
      <div class="field"><label>Customer *</label>
        <select class="inp" id="jf-cust">
          <option value="">Select customer…</option>
          ${db.customers.map(c=>`<option value="${c.id}" ${prefill.customerId===c.id?'selected':''}>${esc(c.name)} — ${esc(c.area)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Job title *</label>
        <input class="inp" id="jf-title" value="${esc(prefill.title||'')}" placeholder="e.g. Replace leaking basin tap"></div>
      <div class="field"><label>Type</label>
        <select class="inp" id="jf-type">${JOB_TYPES.map(t=>`<option ${prefill.type===t?'selected':''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Priority</label>
        <select class="inp" id="jf-prio">${JOB_PRIORITIES.map(p=>`<option ${prefill.priority===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="field"><label>Date *</label><input type="date" class="inp" id="jf-date" value="${prefill.date || isoDate(today())}"></div>
      <div class="field"><label>Start time</label><input type="time" class="inp" id="jf-start" value="${prefill.start || '09:00'}"></div>
      <div class="field"><label>Duration (hours)</label><input type="number" class="inp" id="jf-hours" min="0.5" step="0.5" value="${prefill.hours || 2}"></div>
      <div class="field"><label>Status</label>
        <select class="inp" id="jf-status">${JOB_STATUSES.map(s=>`<option ${prefill.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
      <div class="field span2"><label>Work address</label>
        <input class="inp" id="jf-addr" value="${esc(prefill.address||'')}" placeholder="Site address (auto-fills from customer)"></div>
      <div class="field span2"><label>Technicians</label>
        <div class="checks">
          ${techs.map(t=>`<label><input type="checkbox" value="${t.id}" class="jf-tech" ${prefill.technicianIds && prefill.technicianIds.includes(t.id)?'checked':''}> ${esc(t.name)} <span class="chip c-gray" style="margin-left:auto">${t.role}</span></label>`).join('')}
        </div></div>
      <div class="field span2"><label>Notes</label><textarea class="inp" id="jf-notes" rows="2" placeholder="Access instructions, meter, parking…">${esc(prefill.notes||'')}</textarea></div>
    </div>`,
  { width:'lg',
    footerHtml:`<button class="btn ghost" id="jf-x">Cancel</button><button class="btn primary" id="jf-save">${prefill.id?'Save changes':'Schedule job'}</button>`,
    onMount(){
      $('#jf-x').onclick = closeModal;
      $('#jf-cust').onchange = () => {
        const c = customerById($('#jf-cust').value);
        if(c && !$('#jf-addr').value) $('#jf-addr').value = c.address;
      };
      if(!prefill.address){ const c = customerById(prefill.customerId); if(c) $('#jf-addr').value = c.address; }
      $('#jf-save').onclick = () => {
        const custId = $('#jf-cust').value;
        const title = $('#jf-title').value.trim();
        const date = $('#jf-date').value;
        if(!custId || !title || !date){ toast('Customer, title and date are required','warn'); return; }
        const data = {
          customerId: custId, title,
          type: $('#jf-type').value, priority: $('#jf-prio').value,
          date, start: $('#jf-start').value || '09:00',
          hours: parseFloat($('#jf-hours').value) || 2,
          status: $('#jf-status').value,
          address: $('#jf-addr').value.trim(),
          notes: $('#jf-notes').value.trim(),
          technicianIds: $$('.jf-tech:checked').map(c=>c.value)
        };
        let job;
        if(prefill.id){
          job = jobById(prefill.id);
          Object.assign(job, data);
          toast(`Job ${job.ref} updated`);
        } else {
          job = Object.assign({id:uid('j'), ref:nextRef('job'), createdAt:isoDate(today())}, data);
          db.jobs.push(job);
          toast(`Job ${job.ref} scheduled for ${fmtDateShort(date)}`);
        }
        commit(); closeModal();
        const conflicts = jobConflicts(job);
        if(conflicts.length) toast(`${conflicts.length} schedule overlap for a shared technician — check Dispatch`,'warn');
        if(afterSave) afterSave(job); else reRender();
      };
    }
  });
}

/* ================= job income breakdown ================= */
function jobIncomeCardHTML(j){
  const inv = jobInvoice(j);
  const q = inv ? null : jobQuote(j);
  if(!inv && !q) return '';
  const items = inv ? inv.items : q.items;
  const b = breakdown(items);
  return `
  <div class="card mt12">
    <div class="row mb8"><h3 style="margin:0">${icon('cash',15)} ${inv ? `Job income — ${inv.ref}` : 'Quoted estimate (no invoice yet)'}</h3>
      <span class="muted small" style="margin-left:auto">${inv?chip(invState(inv).label):chip(q.status)}</span></div>
    <div class="bd-grid">
      <div class="bd-col">
        <div class="bd-row"><span>Labour</span><b>${money(b.labour)}</b></div>
        <div class="bd-row"><span>Materials</span><b>${money(b.materials)}</b></div>
        <div class="bd-row"><span>Transport</span><b>${money(b.transport)}</b></div>
        <div class="bd-row tot"><span>Total (excl. VAT)</span><b>${money(b.labour+b.materials+b.transport)}</b></div>
      </div>
      ${inv ? `<div class="bd-col">
        <div class="bd-row"><span>VAT ${inv.vatRate||0}%</span><b>${money(invTotal(inv)-invSubtotal(inv))}</b></div>
        <div class="bd-row"><span>Grand total</span><b>${money(invTotal(inv))}</b></div>
        <div class="bd-row"><span>Amount paid</span><b class="ok">${money(invPaid(inv))}</b></div>
        <div class="bd-row bal"><span>Balance due</span><b>${money(invBalance(inv))}</b></div>
      </div>` : `<div class="bd-col">
        <div class="bd-row"><span>VAT ${q.vatRate||0}%</span><b>${money(quoteTotal(q)-quoteSubtotal(q))}</b></div>
        <div class="bd-row tot"><span>Quoted total</span><b>${money(quoteTotal(q))}</b></div>
        <div class="bd-row muted small"><span>Valid until</span><b>${fmtDate(q.validUntil)}</b></div>
      </div>`}
    </div>
  </div>`;
}

/* ================= materials used on job (auto stock deduction) ================= */
function matRowHTML(){
  const opts = `<option value="">Select item…</option>` +
    db.inventory.map(x=>`<option value="${x.id}">${esc(x.name)} — ${x.qty} ${esc(x.unit)} @ ${money(x.price)}</option>`).join('');
  return `<tr>
    <td><select class="inp mm-item">${opts}</select></td>
    <td class="num" style="width:86px"><input class="inp mm-qty num" type="number" min="0.25" step="0.25" value="1"></td>
    <td class="num mm-price muted small" style="width:90px">—</td>
    <td style="width:34px"><button class="btn icon ghost mm-rm" title="Remove">✕</button></td>
  </tr>`;
}
function materialsModal(job){
  const inv = jobInvoice(job);
  openModal(`Materials used — ${job.ref}`, `
    <p class="muted small">Select what was consumed on this job. Stock is deducted immediately and logged to item history${inv?`, and each line is added to <b>${inv.ref}</b> so the customer is billed`:' (no invoice yet — stock deducted, invoice the job to bill it)'}. Low-stock alerts apply.</p>
    <div class="tbl-wrap"><table class="tbl">
      <thead><tr><th>Item (from inventory)</th><th class="num">Qty</th><th class="num">Unit price</th><th></th></tr></thead>
      <tbody id="mm-body">${matRowHTML()}</tbody>
    </table></div>
    <button class="btn ghost sm mt8" id="mm-add">${icon('plus',14)} Add line</button>
  `, {
    width:'md',
    footerHtml:`<button class="btn ghost" id="mm-x">Cancel</button><button class="btn primary" id="mm-save">${icon('box',15)} Record & deduct stock</button>`,
    onMount(){
      const body = $('#mm-body');
      const bind = () => {
        $$('#mm-body tr').forEach(tr => {
          tr.querySelector('.mm-item').onchange = e => {
            const it = invItemById(e.target.value);
            tr.querySelector('.mm-price').textContent = it ? money(it.price) : '—';
          };
          tr.querySelector('.mm-rm').onclick = () => {
            if($$('#mm-body tr').length > 1) tr.remove();
            else { body.innerHTML = matRowHTML(); bind(); }
          };
        });
      };
      bind();
      $('#mm-x').onclick = closeModal;
      $('#mm-add').onclick = () => { body.insertAdjacentHTML('beforeend', matRowHTML()); bind(); };
      $('#mm-save').onclick = () => {
        const rows = $$('#mm-body tr').map(tr => ({
          item: invItemById(tr.querySelector('.mm-item').value),
          qty: parseFloat(tr.querySelector('.mm-qty').value) || 0
        })).filter(r => r.item && r.qty > 0);
        if(!rows.length){ toast('Pick at least one item and quantity','warn'); return; }
        const warns = [];
        rows.forEach(r => {
          const it = r.item;
          if(it.qty < r.qty) warns.push(`${it.name}: only ${it.qty} in stock — deducted all of it`);
          const take = Math.min(it.qty, r.qty);
          it.qty -= take;
          it.history = it.history || [];
          it.history.unshift({at:isoDate(today()), delta:-r.qty, reason:`Used on ${job.ref}`});
          if(inv) inv.items.push({kind:'Material', desc:it.name, qty:r.qty, unit:it.unit, price:it.price, invId:it.id});
        });
        commit(); closeModal();
        toast(`Recorded ${rows.length} material line(s) on ${job.ref}${inv?` — billed to ${inv.ref}`:''}`);
        warns.forEach(w => toast(w,'warn'));
        reRender(); openJobModal(job.id);
      };
    }
  });
}

/* ================= job detail modal ================= */
function openJobModal(id){
  const j = jobById(id);
  if(!j) return;
  const c = customerById(j.customerId);
  const conflicts = jobConflicts(j);
  const techs = (j.technicianIds||[]).map(techById).filter(Boolean);
  const b = db.business;
  openModal(`${j.ref} — ${esc(j.title)}`, `
    <div class="row mb12" style="flex-wrap:wrap">${chip(j.status)} ${typeTag(j.type)} ${chip(j.priority+' priority')}
      <span class="muted small">${fmtDateFull(j.date)} · ${j.start} · ${j.hours}h</span>
    </div>
    ${conflicts.length ? `<div class="badge-warn">${icon('alert',15)} Overlap: technician double-booked with ${conflicts.map(o=>o.ref).join(', ')}. Reassign or reschedule in Dispatch.</div>` : ''}
    <div class="card pipe-card">${stepperHTML(j)}</div>
    <div class="grid2" style="grid-template-columns:1fr 1fr">
      <div class="card" style="background:#f8fafc">
        <h3>Customer</h3>
        <b>${esc(c?c.name:'—')}</b>
        <div class="muted small mt8">${icon('phone',13)} ${esc(c?c.phone:'—')}</div>
        <div class="muted small mt8">${icon('pin',13)} ${esc(j.address || (c?c.address:'—'))}</div>
        ${c && c.phone ? `<a class="btn wa sm mt12" target="_blank" rel="noopener" href="${waLink(c.phone, waTemplateMsg('job_confirm', {customer:c.name.split(' ')[0], job:j.title, type:j.type, date:fmtDateShort(j.date), time:j.start, tech: techs.length?techs[0].name:'our team', business:b.name}))}">${icon('wa',14)} Confirm on WhatsApp</a>` : ''}
      </div>
      <div class="card" style="background:#f8fafc">
        <h3>Technicians</h3>
        ${techs.length ? techs.map(t=>`
          <div class="spread" style="padding:4px 0">
            <span>${esc(t.name)} <span class="chip c-gray">${t.role}</span></span>
            <button class="btn icon ghost jf-rmtech" data-t="${t.id}" title="Remove">✕</button>
          </div>`).join('') : '<div class="muted small">No technician assigned</div>'}
        <div class="row mt8">
          <select class="inp" id="jd-addtech" style="max-width:200px">
            <option value="">+ Assign technician…</option>
            ${db.technicians.filter(t=>t.active && !techs.some(x=>x.id===t.id)).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>
    ${j.notes ? `<div class="badge-info">${icon('doc',14)} ${esc(j.notes)}</div>` : ''}
    ${jobIncomeCardHTML(j)}
    <div class="row mt12" style="flex-wrap:wrap">
      <button class="btn ghost sm jd-quote">${icon('spark',14)} Create quotation</button>
      <button class="btn ghost sm jd-inv">${icon('receipt',14)} Create invoice</button>
      <button class="btn ghost sm jd-mats" ${j.status==='Cancelled'?'disabled':''}>${icon('box',14)} Record materials used</button>
      <button class="btn green sm jd-done" ${j.status==='Completed'?'disabled':''}>✓ Mark completed</button>
      <button class="btn ghost sm jd-hold" ${j.status==='On Hold'?'disabled':''}>⏸ Put on hold</button>
      <button class="btn danger sm jd-cancel" ${j.status==='Cancelled'?'disabled':''}>Cancel job</button>
      <button class="btn danger sm jd-del">Delete</button>
    </div>`,
  { width:'lg',
    onMount(){
      const done = () => { reRender(); openJobModal(id); };
      $('#jd-addtech').onchange = e => {
        if(!e.target.value) return;
        j.technicianIds = j.technicianIds||[];
        j.technicianIds.push(e.target.value);
        commit(); done();
      };
      $$('.jf-rmtech').forEach(btn => btn.onclick = () => {
        j.technicianIds = (j.technicianIds||[]).filter(t => t !== btn.dataset.t);
        commit(); done();
      });
      $('.jd-quote').onclick = () => { closeModal(); go('quote_edit', {jobId: j.id}); };
      $('.jd-inv').onclick = () => { closeModal(); go('invoice_new', {jobId: j.id}); };
      $('.jd-mats').onclick = () => materialsModal(j);
      $('.jd-done').onclick = () => askConfirm(`Mark <b>${esc(j.title)}</b> as completed?`, () => { j.status='Completed'; commit(); toast(`Job ${j.ref} completed`); done(); }, {danger:false, label:'Complete job'});
      $('.jd-hold').onclick = () => { j.status='On Hold'; commit(); done(); };
      $('.jd-cancel').onclick = () => askConfirm(`Cancel <b>${esc(j.title)}</b>?`, () => { j.status='Cancelled'; commit(); done(); });
      $('.jd-del').onclick = () => askConfirm(`Permanently delete <b>${j.ref}</b>? This cannot be undone.`, () => {
        db.jobs = db.jobs.filter(x=>x.id!==j.id); commit(); closeModal(); reRender(); toast('Job deleted');
      });
    }
  });
}
