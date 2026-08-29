'use strict';
/* ================= customer portal =================
   Read-only, scoped view of the business records belonging to the signed-in
   customer (matched by linked customer id or email). Works on the business's
   device and on any device that has the business data via sync. */

function custGate(){
  const c = myCustomer();
  if(c) return `<div class="card cust-banner-ok">${icon('check',15)} You're linked to <b>${esc(c.name)}</b> — showing your quotes, invoices, jobs and payments.</div>`;
  return `<div class="card cust-banner">${icon('alert',15)}
    <div>
      <b>Your account isn't linked to a customer profile yet.</b>
      <div class="muted small" style="margin-top:4px">${esc(db.business.name)} can link it from your customer record (or by matching your email ${esc(AUTH.session())}). Meanwhile you can sign out and continue as guest.</div>
    </div></div>`;
}
const myInvoices = () => {
  const c = myCustomer();
  return db.invoices.filter(i => c && i.customerId === c.id).sort((a,b) => b.issued.localeCompare(a.issued));
};
const myQuotes = () => {
  const c = myCustomer();
  return db.quotes.filter(q => c && q.customerId === c.id).sort((a,b) => b.ref.localeCompare(a.ref));
};
const myJobs = () => {
  const c = myCustomer();
  return db.jobs.filter(j => c && j.customerId === c.id).sort((a,b) => (b.date+b.start).localeCompare(a.date+a.start));
};

VIEWS.cust_dash = {
  title: () => 'My overview',
  render(){
    const c = myCustomer();
    const invs = myInvoices();
    const qs = myQuotes();
    const jobs = myJobs();
    const outstanding = sum(invs.filter(i => i.status !== 'Draft'), invBalance);
    const paid = sum(invs.flatMap(i => i.payments||[]), p => p.amount);
    const activeJobs = jobs.filter(j => ['Scheduled','Dispatched','In Progress'].includes(j.status));
    const pendingQuotes = qs.filter(q => ['Sent','Approved'].includes(q.status));
    const g = greeting();
    const firstName = c ? c.name.split(' ')[0] : (AUTH.byEmail(AUTH.session())||{}).name || 'there';
    const kpi = (lab, val, sub, cls) => `<div class="kpi"><div class="ic ${cls||'blue'}">${icon(cls==='green'?'cash':cls==='red'?'receipt':cls==='amber'?'calendar':'doc',17)}</div><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub||''}</div></div>`;
    const latest = (arr) => arr[0];
    const li = latest(invs), lq = latest(qs), lj = latest(jobs);
    return `
    ${custGate()}
    <div class="greet card">
      <div>
        <h1 class="greet-h">Hello, ${esc(firstName)} 👋</h1>
        <div class="muted small">${fmtDateFull(isoDate(today()))} · ${esc(db.business.name)} · customer portal</div>
      </div>
      <div class="greet-mini">
        <div class="r"><span>Outstanding</span><b style="color:${outstanding>0?'var(--red)':'var(--green)'}">${money(outstanding)}</b></div>
        <div class="r"><span>Total paid</span><b>${money(paid)}</b></div>
        <div class="r"><span>Active jobs</span><b>${activeJobs.length}</b></div>
      </div>
    </div>

    <div class="kpis">
      ${kpi('Amount owed', money(outstanding), outstanding>0 ? 'balance across your invoices' : 'all settled', outstanding>0?'red':'green')}
      ${kpi('Total paid', money(paid), `${invs.reduce((t,i)=>t+(i.payments||[]).length,0)} payments made`, 'green')}
      ${kpi('Quotes', `${pendingQuotes.length} open`, `${qs.length} total`, 'violet')}
      ${kpi('Jobs', `${activeJobs.length} active`, `${jobs.length} total`, 'amber')}
    </div>

    <div class="grid2">
      <div class="stack">
        ${li ? `<div class="card">
          <div class="row mb8"><h3 style="margin:0">${icon('receipt',15)} Latest invoice</h3><span class="muted small" style="margin-left:auto">${li.ref}</span></div>
          <div class="spread"><div><b>${money(invTotal(li))}</b><div class="muted small">due ${fmtDate(li.due)}</div></div>${chip(invState(li).label)}</div>
          <div class="row mt12">
            ${invState(li).balance > 0 ? `<span class="small">Balance <b style="color:var(--red)">${money(invState(li).balance)}</b></span>` : '<span class="small ok">Fully paid ✓</span>'}
            <button class="btn ghost sm" style="margin-left:auto" data-cinv="${li.id}">${icon('print',14)} View / PDF</button>
          </div>
        </div>` : '<div class="card muted small">No invoices yet — your invoices will appear here.</div>'}
        ${lj ? `<div class="card">
          <div class="row mb8"><h3 style="margin:0">${icon('calendar',15)} Latest job</h3><span class="muted small" style="margin-left:auto">${lj.ref}</span></div>
          <div class="spread"><div><b>${esc(lj.title)}</b><div class="muted small">${fmtDateShort(lj.date)} · ${lj.start}</div></div>${chip(lj.status)}</div>
        </div>` : '<div class="card muted small">No jobs yet.</div>'}
      </div>
      <div class="stack">
        ${lq ? `<div class="card">
          <div class="row mb8"><h3 style="margin:0">${icon('doc',15)} Latest quotation</h3><span class="muted small" style="margin-left:auto">${lq.ref}</span></div>
          <div class="spread"><div><b>${esc(lq.title||'Quotation')}</b><div class="muted small">valid until ${fmtDate(lq.validUntil)}</div></div>${chip(lq.status)}</div>
          <div class="spread mt12"><b>${money(quoteTotal(lq))}</b><button class="btn ghost sm" data-cpdfq="${lq.id}">${icon('print',14)} View / PDF</button></div>
        </div>` : '<div class="card muted small">No quotations yet.</div>'}
        <div class="card">
          <h3>${icon('wa',15)} Need something?</h3>
          <p class="muted small">Contact ${esc(db.business.name)} directly — we'll pick it up fast.</p>
          <div class="row" style="flex-wrap:wrap">
            ${db.business.whatsapp || db.business.phone ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(db.business.whatsapp || db.business.phone, 'Hi, this is ' + esc(firstName) + '. ')}">${icon('wa',14)} WhatsApp us</a>` : ''}
            <button class="btn ghost sm" data-goto="cust_help">${icon('phone',14)} Contact details</button>
          </div>
        </div>
      </div>
    </div>`;
  },
  mount(){
    $$('#content [data-cinv]').forEach(b => b.onclick = () => go('cust_invoice', {id: b.dataset.cinv}));
    $$('#content [data-cpdfq]').forEach(b => b.onclick = () => openDoc('quote', b.dataset.cpdfq));
    $$('#content [data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto, {}));
  }
};

VIEWS.cust_quotes = {
  title: () => 'My quotations',
  render(){
    const qs = myQuotes();
    return `
    ${custGate()}
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Ref</th><th>Quotation</th><th class="resp-sm">Date</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${qs.length ? qs.map(q => `<tr class="click" data-cq="${q.id}">
            <td class="bold">${q.ref}</td>
            <td>${esc(q.title||'Quotation')}</td>
            <td class="resp-sm">${fmtDate(q.createdAt)}</td>
            <td class="num bold">${money(quoteTotal(q))}</td>
            <td>${chip(q.status)}</td>
            <td><button class="btn icon ghost" title="View / PDF">${icon('print',14)}</button></td>
          </tr>`).join('') : '<tr><td colspan="6" class="empty">No quotations yet — your quotes will appear here.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $$('#content [data-cq]').forEach(tr => tr.onclick = () => openDoc('quote', tr.dataset.cq));
  }
};

VIEWS.cust_invoices = {
  title: () => 'My invoices',
  render(){
    const invs = myInvoices();
    return `
    ${custGate()}
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Ref</th><th>Issued</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${invs.length ? invs.map(i => {
            const st = invState(i);
            return `<tr class="click" data-ci="${i.id}">
              <td class="bold">${i.ref}</td>
              <td>${fmtDate(i.issued)}</td>
              <td class="num">${money(invTotal(i))}</td>
              <td class="num ok">${money(invPaid(i))}</td>
              <td class="num ${st.balance>0?'bold':''}" style="${st.balance>0?'color:var(--red)':''}">${money(st.balance)}</td>
              <td>${chip(st.label)}</td>
              <td><button class="btn icon ghost" title="View / PDF">${icon('print',14)}</button></td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" class="empty">No invoices yet.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $$('#content [data-ci]').forEach(tr => tr.onclick = () => go('cust_invoice', {id: tr.dataset.ci}));
  }
};

VIEWS.cust_invoice = {
  title: p => { const i = invoiceById(p.id); return i ? i.ref : 'Invoice'; },
  render(p){
    const inv = invoiceById(p.id);
    const mine = inv && myCustomer() && inv.customerId === myCustomer().id;
    if(!inv || !mine) return `<div class="empty">Invoice not found in your records. <button class="btn ghost sm" data-back>Invoices</button></div>`;
    const st = invState(inv);
    return `
    <button class="linklike mb12" data-back>${icon('back',14)} My invoices</button>
    <div class="card mb16">
      <div class="spread">
        <div>
          <div class="row" style="flex-wrap:wrap">${chip(st.label)} <span class="muted small">${fmtDateFull(inv.issued)}</span></div>
          <div class="muted small mt8">${esc(inv.jobId && jobById(inv.jobId) ? `For job: ${jobById(inv.jobId).ref} — ${esc(jobById(inv.jobId).title)}` : esc(db.business.name))}</div>
        </div>
        <div style="text-align:right">
          <div class="muted small">Total</div><div class="bold" style="font-size:22px">${money(invTotal(inv))}</div>
          <div class="small muted mt8">Paid ${money(invPaid(inv))} · <span style="color:${st.balance>0?'var(--red)':'var(--green)'};font-weight:700">${st.balance>0?'Balance '+money(st.balance):'Settled'}</span></div>
        </div>
      </div>
    </div>
    <div class="card">
      <h3>${icon('doc',15)} Line items</h3>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${inv.items.map(i=>`<tr><td>${i.kind==='Material'?'🔩':i.kind==='Transport'?'🚚':'🛠'} ${esc(i.desc)}</td><td class="num">${i.qty}</td><td class="num">${money(i.qty*i.price)}</td></tr>`).join('')}
        </tbody>
        <tfoot>
          <tr><td colspan="2" class="muted">Subtotal</td><td class="num">${money(invSubtotal(inv))}</td></tr>
          ${inv.discount?`<tr><td colspan="2" class="muted">Discount</td><td class="num">− ${money(inv.discount)}</td></tr>`:''}
          <tr><td colspan="2" class="muted">VAT (${inv.vatRate}%)</td><td class="num">${money(invTotal(inv) - Math.round((invSubtotal(inv)-inv.discount)*(1+inv.vatRate/100)))}</td></tr>
          <tr><td colspan="2" class="bold">Total</td><td class="num bold">${money(invTotal(inv))}</td></tr>
        </tfoot>
      </table></div>
    </div>
    ${(inv.payments||[]).length ? `<div class="card mt12">
      <h3>${icon('cash',15)} Your payments</h3>
      ${(inv.payments||[]).slice().reverse().map(p=>`
        <div class="spread" style="padding:6px 0;border-bottom:1px dashed #eef2f7">
          <span>${fmtDate(p.date)} · ${esc(p.method)}${p.note?` <span class="muted small">(${esc(p.note)})</span>`:''}</span>
          <b class="ok">${money(p.amount)}</b>
        </div>`).join('')}
    </div>` : ''}
    <div class="row mt12" style="flex-wrap:wrap">
      <button class="btn primary" data-cpdf="${inv.id}">${icon('print',15)} Download / print PDF</button>
      ${db.business.whatsapp || db.business.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(db.business.whatsapp || db.business.phone, 'Hi, I have a question about invoice '+inv.ref+'. ')}">${icon('wa',14)} Ask about this invoice</a>` : ''}
    </div>`;
  },
  mount(){
    const b = $$('#content [data-back]');
    b.forEach(x => x.onclick = () => go('cust_invoices', {}));
    const p = $('#content [data-cpdf]');
    if(p) p.onclick = () => openDoc('invoice', p.dataset.cpdf);
  }
};

VIEWS.cust_jobs = {
  title: () => 'My jobs',
  render(){
    const jobs = myJobs();
    return `
    ${custGate()}
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Ref</th><th>Job</th><th class="resp-md">When</th><th class="resp-md">Where</th><th>Status</th></tr></thead>
        <tbody>
          ${jobs.length ? jobs.map(j => `<tr>
            <td class="bold">${j.ref}</td>
            <td><b>${TYPE_EMOJI[j.type]||''} ${esc(j.title)}</b><div class="subrow">${j.type}</div></td>
            <td class="resp-md">${fmtDateShort(j.date)} · ${j.start}</td>
            <td class="resp-md">${esc(j.address||'—')}</td>
            <td>${chip(j.status)}</td>
          </tr>`).join('') : '<tr><td colspan="5" class="empty">No jobs yet — your scheduled work will appear here.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){}
};

VIEWS.cust_help = {
  title: () => 'Help & contact',
  render(){
    const b = db.business;
    return `
    <div class="card">
      <h3>${icon('phone',15)} ${esc(b.name)}</h3>
      <div class="mt8" style="display:flex;flex-direction:column;gap:8px;font-size:14px">
        ${b.phone?`<div class="muted">${icon('phone',14)} ${esc(b.phone)}</div>`:''}
        ${b.whatsapp?`<div class="muted">${icon('wa',14)} WhatsApp: ${esc(b.whatsapp)}</div>`:''}
        ${b.email?`<div class="muted">${icon('mail',14)} ${esc(b.email)}</div>`:''}
        ${b.address?`<div class="muted">${icon('pin',14)} ${esc(b.address)}</div>`:''}
      </div>
      <div class="row mt16" style="flex-wrap:wrap">
        ${b.whatsapp || b.phone ? `<a class="btn wa" target="_blank" rel="noopener" href="${waLink(b.whatsapp || b.phone, 'Hi, ')}">${icon('wa',14)} Chat on WhatsApp</a>` : ''}
        ${b.email ? `<a class="btn ghost" href="mailto:${esc(b.email)}">${icon('mail',14)} Send email</a>` : ''}
      </div>
    </div>
    <div class="card mt12" style="background:#f8fafc">
      <h3>${icon('doc',15)} About your portal</h3>
      <p class="muted small" style="margin:0">This portal shows <b>only your records</b> — your quotations, invoices, jobs and payments with ${esc(b.name)}. Nothing here can be edited; contact us for changes. All data stays between you and the business.</p>
    </div>
    <div class="row mt12">
      <button class="btn danger" data-cso>${icon('back',14)} Sign out of customer portal</button>
    </div>`;
  },
  mount(){
    const b = $('#content [data-cso]');
    if(b) b.onclick = customerSignOut;
  }
};
