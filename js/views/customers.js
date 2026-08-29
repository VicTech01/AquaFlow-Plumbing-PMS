'use strict';
/* ================= customers ================= */
let custQ = '';
let custType = '';

VIEWS.customers = {
  title: () => 'Customers',
  render(){
    const t = isoDate(today());
    const rows = db.customers
      .filter(c => (!custQ || (c.name+' '+(c.area||'')+' '+(c.phone||'')).toLowerCase().includes(custQ.toLowerCase())) &&
                   (!custType || c.type === custType))
      .map(c => {
        const jobs = db.jobs.filter(j=>j.customerId===c.id);
        const outstanding = sum(db.invoices.filter(i=>i.customerId===c.id), invBalance);
        const spent = sum(db.invoices.filter(i=>i.customerId===c.id).flatMap(i=>i.payments||[]), p=>p.amount);
        const last = jobs.filter(j=>j.status==='Completed').map(j=>j.date).sort().pop() || jobs.map(j=>j.date).sort().pop() || '';
        return {c, jobs:jobs.length, outstanding, spent, last};
      });
    return `
    <div class="page-head">
      <div class="row" style="flex-wrap:wrap">
        <input class="inp search-inp" id="cu-q" placeholder="Search name, area, phone…" value="${esc(custQ)}">
        <select class="inp" id="cu-type" style="max-width:160px">
          <option value="">All types</option><option ${custType==='Residential'?'selected':''}>Residential</option><option ${custType==='Commercial'?'selected':''}>Commercial</option>
        </select>
      </div>
      <button class="btn primary" id="cu-new">${icon('userPlus',15)} Add customer</button>
    </div>
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Customer</th><th class="resp-md">Type</th><th class="resp-md">Area</th><th>Phone</th><th class="num resp-md">Jobs</th><th class="num resp-sm">Lifetime paid</th><th class="num">Outstanding</th><th class="resp-sm">Last job</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(({c,jobs,outstanding,spent,last}) => `
            <tr class="click" data-c="${c.id}">
              <td><b>${esc(c.name)}</b><div class="subrow">${esc(c.address||'')}</div></td>
              <td class="resp-md">${chip(c.type)}</td>
              <td class="resp-md">${esc(c.area||'—')}</td>
              <td>${esc(c.phone||'—')}</td>
              <td class="num resp-md">${jobs}</td>
              <td class="num resp-sm">${money(spent)}</td>
              <td class="num ${outstanding>0?'bold':''}" style="${outstanding>0?'color:var(--red)':''}">${money(outstanding)}</td>
              <td class="resp-sm">${last?relDays(last):'—'}</td>
              <td class="row" style="gap:4px">
                ${c.phone?`<a class="btn icon wa" target="_blank" rel="noopener" title="WhatsApp" href="${waLink(c.phone,'Hi '+esc(c.name.split(' ')[0])+'!')}">${icon('wa',14)}</a>`:''}
                <button class="btn icon ghost" title="View">↗</button>
              </td>
            </tr>`).join('') : `<tr><td colspan="9" class="empty">No customers found</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $('#cu-new').onclick = () => customerModal({});
    $('#cu-q').oninput = e => { custQ = e.target.value; reRender(); setTimeout(()=>{const el=$('#cu-q'); el.focus(); el.setSelectionRange(el.value.length,el.value.length);},0); };
    $('#cu-type').onchange = e => { custType = e.target.value; reRender(); };
    $$('#content tr[data-c]').forEach(tr => tr.onclick = e => {
      if(e.target.closest('a')) return;
      go('customer', {id: tr.dataset.c});
    });
  }
};

function customerModal(prefill = {}, afterSave){
  openModal(prefill.id ? 'Edit customer' : 'Add customer', `
    <div class="form-grid">
      <div class="field"><label>Name *</label><input class="inp" id="cf-name" value="${esc(prefill.name||'')}" placeholder="e.g. Wanjiku Kamau"></div>
      <div class="field"><label>Type</label><select class="inp" id="cf-type">
        <option ${prefill.type==='Residential'?'selected':''}>Residential</option>
        <option ${prefill.type==='Commercial'?'selected':''}>Commercial</option></select></div>
      <div class="field"><label>Phone (WhatsApp) *</label><input class="inp" id="cf-phone" value="${esc(prefill.phone||'')}" placeholder="07XX XXX XXX"></div>
      <div class="field"><label>Email</label><input class="inp" id="cf-email" value="${esc(prefill.email||'')}"></div>
      <div class="field"><label>Area / estate</label><input class="inp" id="cf-area" value="${esc(prefill.area||'')}" placeholder="e.g. Kilimani"></div>
      <div class="field"><label>Full address</label><input class="inp" id="cf-addr" value="${esc(prefill.address||'')}"></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="cf-x">Cancel</button><button class="btn primary" id="cf-save">${prefill.id?'Save changes':'Add customer'}</button>`,
    onMount(){
      $('#cf-x').onclick = closeModal;
      $('#cf-save').onclick = () => {
        const name = $('#cf-name').value.trim(), phone = $('#cf-phone').value.trim();
        if(!name){ toast('Name is required','warn'); return; }
        const data = {name, type:$('#cf-type').value, phone, email:$('#cf-email').value.trim(), area:$('#cf-area').value.trim(), address:$('#cf-addr').value.trim()};
        let c;
        if(prefill.id){ c = customerById(prefill.id); Object.assign(c, data); toast('Customer updated'); }
        else { c = {id:uid('c'), notes:[], createdAt:isoDate(today()), ...data}; db.customers.push(c); toast(`${name} added`); }
        commit(); closeModal();
        if(afterSave) afterSave(c); else reRender();
      };
    }
  });
}

/* ================= customer detail ================= */
VIEWS.customer = {
  title: p => (customerById(p.id)||{name:'Customer'}).name,
  render(p){
    const c = customerById(p.id);
    if(!c) return `<div class="empty">Customer not found. <button class="btn ghost sm" onclick="go('customers',{})">Back</button></div>`;
    const jobs = db.jobs.filter(j=>j.customerId===c.id).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start));
    const quotes = db.quotes.filter(q=>q.customerId===c.id).sort((a,b)=>b.ref.localeCompare(a.ref));
    const invoices = db.invoices.filter(i=>i.customerId===c.id).sort((a,b)=>b.ref.localeCompare(a.ref));
    const maints = db.maintenance.filter(m=>m.customerId===c.id);
    const outstanding = sum(invoices, invBalance);
    const spent = sum(invoices.flatMap(i=>i.payments||[]), x=>x.amount);
    return `
    <button class="linklike mb12" id="cu-back">${icon('back',14)} All customers</button>
    <div class="card mb16">
      <div class="spread">
        <div class="row">
          <div class="avatar" style="width:46px;height:46px;font-size:16px">${initials(c.name)}</div>
          <div>
            <h2 class="page" style="margin:0">${esc(c.name)}</h2>
            <div class="row mt8 small" style="flex-wrap:wrap">
              ${chip(c.type)}
              <span class="muted">${icon('pin',13)} ${esc(c.area||'—')}</span>
              <span class="muted">${icon('phone',13)} ${esc(c.phone||'—')}</span>
              ${c.email?`<span class="muted">${icon('mail',13)} ${esc(c.email)}</span>`:''}
            </div>
            <div class="subrow mt8">${esc(c.address||'')}</div>
          </div>
        </div>
        <div class="row" style="flex-wrap:wrap">
          ${c.phone?`<a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(c.phone,'Hi '+esc(c.name.split(' ')[0])+'!')}">${icon('wa',14)} WhatsApp</a>`:''}
          <button class="btn ghost sm" id="cu-edit">${icon('edit',14)} Edit</button>
          <button class="btn ghost sm" id="cu-job">${icon('plus',14)} New job</button>
          <button class="btn ghost sm" id="cu-quote">${icon('spark',14)} New quote</button>
        </div>
      </div>
      <div class="row mt16" style="gap:26px;flex-wrap:wrap;font-size:13px">
        <div><span class="muted small">Jobs</span><div class="bold" style="font-size:17px">${jobs.length}</div></div>
        <div><span class="muted small">Lifetime paid</span><div class="bold" style="font-size:17px">${money(spent)}</div></div>
        <div><span class="muted small">Outstanding</span><div class="bold" style="font-size:17px;color:${outstanding>0?'var(--red)':'var(--green)'}">${money(outstanding)}</div></div>
      </div>
    </div>

    <div class="grid2">
      <div class="stack">
        <div class="card">
          <h3>${icon('calendar',15)} Jobs</h3>
          <div class="tbl-wrap"><table class="tbl"><tbody>
            ${jobs.length ? jobs.slice(0,8).map(j=>`
              <tr class="click" data-job="${j.id}">
                <td style="width:110px"><b>${fmtDateShort(j.date)}</b><div class="subrow">${j.start}</div></td>
                <td>${esc(j.title)}<div class="subrow">${j.ref}</div></td>
                <td style="width:110px">${chip(j.status)}</td>
              </tr>`).join('') : '<tr><td class="empty">No jobs yet</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card">
          <h3>${icon('wrench',15)} Maintenance plans</h3>
          ${maints.length ? maints.map(m=>{
            const next = nextDueDate(m); const n = dayDiff(isoDate(today()), next);
            return `<div class="spread" style="padding:6px 0;border-bottom:1px dashed #eef2f7">
              <div><b class="small">${esc(m.equipment)}</b><div class="subrow">every ${m.frequencyMonths} mo · last ${fmtDate(m.lastDone)}</div></div>
              ${chip(n<0?`Overdue ${-n}d`: n===0?'Due today':`In ${n}d`, n<0?'red':n<=14?'amber':'green')}
            </div>`;
          }).join('') : '<div class="empty">No maintenance plans — add one from the Maintenance page.</div>'}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <h3>${icon('doc',15)} Quotations</h3>
          <div class="tbl-wrap"><table class="tbl"><tbody>
            ${quotes.length ? quotes.map(q=>`
              <tr class="click" data-quote="${q.id}">
                <td>${esc(q.title)}<div class="subrow">${q.ref}</div></td>
                <td class="num">${money(quoteTotal(q))}</td>
                <td style="width:90px">${chip(q.status)}</td>
              </tr>`).join('') : '<tr><td class="empty">No quotations yet</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card">
          <h3>${icon('receipt',15)} Invoices</h3>
          <div class="tbl-wrap"><table class="tbl"><tbody>
            ${invoices.length ? invoices.map(i=>{
              const st = invState(i);
              return `<tr class="click" data-inv="${i.id}">
                <td>${i.ref}<div class="subrow">due ${fmtDate(i.due)}</div></td>
                <td class="num">${money(invTotal(i))}</td>
                <td style="width:90px">${chip(st.label)}${st.balance>0?`<div class="subrow num">${money(st.balance)} due</div>`:''}</td>
              </tr>`;
            }).join('') : '<tr><td class="empty">No invoices yet</td></tr>'}
          </tbody></table></div>
        </div>
        <div class="card">
          <h3>${icon('doc',15)} Notes</h3>
          ${c.notes && c.notes.length ? c.notes.map(n=>`
            <div style="padding:7px 0;border-bottom:1px dashed #eef2f7;font-size:13px">${esc(n.text)}<div class="subrow">${fmtDate(n.at)}</div></div>`).join('') : '<div class="muted small">No notes yet.</div>'}
          <div class="mt12">
            <textarea class="inp" id="cu-note" rows="2" placeholder="e.g. Gate code 4482, dog in yard, meter is behind kitchen…"></textarea>
            <button class="btn ghost sm mt8" id="cu-notego">Add note</button>
          </div>
        </div>
      </div>
    </div>`;
  },
  mount(p){
    const c = customerById(p.id);
    if(!c) return;
    $('#cu-back').onclick = () => go('customers', {});
    $('#cu-edit').onclick = () => customerModal(c);
    $('#cu-job').onclick = () => jobModal({customerId:c.id, address:c.address});
    $('#cu-quote').onclick = () => go('quote_edit', {customerId:c.id});
    $('#cu-notego').onclick = () => {
      const txt = $('#cu-note').value.trim();
      if(!txt) return;
      c.notes = c.notes||[];
      c.notes.unshift({text:txt, at:isoDate(today())});
      commit(); toast('Note added'); reRender();
    };
    $$('#content tr[data-job]').forEach(tr => tr.onclick = () => openJobModal(tr.dataset.job));
    $$('#content tr[data-inv]').forEach(tr => tr.onclick = () => go('invoice', {id: tr.dataset.inv}));
    $$('#content tr[data-quote]').forEach(tr => tr.onclick = () => go('quote_edit', {id: tr.dataset.quote}));
  }
};
