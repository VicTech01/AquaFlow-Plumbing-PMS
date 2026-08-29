'use strict';
/* ================= invoices list ================= */
VIEWS.invoices = {
  title: () => 'Invoices & Payments',
  render(){
    const t = isoDate(today());
    const open = db.invoices.filter(i => i.status !== 'Draft');
    const outstanding = sum(open, invBalance);
    const overdue = sum(open.filter(i=>invState(i).label==='Overdue'), invBalance);
    const collected30 = sum(db.invoices.flatMap(i=>i.payments||[]), p => p.date && dayDiff(p.date, t) <= 30 ? p.amount : 0);

    const buckets = [0,0,0]; // 0-30 / 31-60 / 60+
    open.forEach(i => {
      const st = invState(i);
      if(st.balance <= 0) return;
      const past = dayDiff(i.due, t); // >0 when overdue
      if(past > 60) buckets[2] += st.balance;
      else if(past > 30) buckets[1] += st.balance;
      else buckets[0] += st.balance;
    });
    const bmax = Math.max(1, ...buckets);
    const aging = buckets.map((v,i) => {
      const w = v/bmax*100;
      const colors = ['#f59e0b','#ea580c','#dc2626'];
      return `<i style="width:${Math.max(v>0?8:0,w)}%;background:${colors[i]}" title="${money(v)}"></i>`;
    }).join('');

    const rows = db.invoices.slice().sort((a,b)=>b.ref.localeCompare(a.ref)).map(inv => {
      const st = invState(inv);
      const c = customerById(inv.customerId);
      return `<tr class="click" data-inv="${inv.id}">
        <td class="bold">${inv.ref}</td>
        <td>${esc(c?c.name:'—')}</td>
        <td class="resp-md">${fmtDate(inv.issued)}</td>
        <td>${fmtDate(inv.due)}<div class="subrow">${relDays(inv.due)}</div></td>
        <td class="num">${money(invTotal(inv))}</td>
        <td class="num resp-sm">${money(invPaid(inv))}</td>
        <td class="num bold" style="${st.balance>0?'color:var(--red)':''}">${st.balance>0?money(st.balance):'—'}</td>
        <td>${chip(st.label)}</td>
        <td>
          <a class="btn icon wa inv-wa" data-inv="${inv.id}" target="_blank" rel="noopener" title="Send invoice via WhatsApp">${icon('wa',14)}</a>
          <button class="btn icon ghost inv-rem" data-inv="${inv.id}" title="Payment reminder (WhatsApp)" ${st.balance<=0?'disabled':''}>🔔</button>
        </td>
      </tr>`;
    }).join('');

    return `
    <div class="page-head">
      <div class="kpis" style="margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;width:100%">
        <div class="kpi"><div class="lab">Outstanding</div><div class="val" style="font-size:18px">${money(outstanding)}</div></div>
        <div class="kpi"><div class="lab">Overdue</div><div class="val" style="font-size:18px;color:var(--red)">${money(overdue)}</div></div>
        <div class="kpi"><div class="lab">Collected (30d)</div><div class="val" style="font-size:18px;color:var(--green)">${money(collected30)}</div></div>
        <div class="kpi"><div class="lab">Invoices</div><div class="val" style="font-size:18px">${db.invoices.length}</div></div>
      </div>
      <button class="btn primary" id="inv-new">${icon('plus',15)} New invoice</button>
    </div>
    <div class="card mb16">
      <h3>${icon('clock',15)} Aging of outstanding (by days past due)</h3>
      <div class="aging">${aging}</div>
      <div class="legend">
        <span><span class="dotc" style="background:#f59e0b"></span> Current / 0–30d: <b>${money(buckets[0])}</b></span>
        <span><span class="dotc" style="background:#ea580c"></span> 31–60d: <b>${money(buckets[1])}</b></span>
        <span><span class="dotc" style="background:#dc2626"></span> 60d+: <b>${money(buckets[2])}</b></span>
      </div>
    </div>
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Ref</th><th>Customer</th><th class="resp-md">Issued</th><th>Due</th><th class="num">Total</th><th class="num resp-sm">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="9" class="empty">No invoices yet</td></tr>'}</tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $('#inv-new').onclick = () => go('invoice_new', {});
    $$('#content tr[data-inv]').forEach(tr => tr.onclick = e => {
      if(e.target.closest('a,button')) return;
      go('invoice', {id: tr.dataset.inv});
    });
    $$('.inv-wa').forEach(a => {
      a.addEventListener('click', e => {
        e.stopPropagation();
        const inv = invoiceById(a.dataset.inv);
        const c = customerById(inv.customerId);
        const text = waTemplateMsg('invoice_sent', {customer:c?c.name.split(' ')[0]:'there', ref:inv.ref, total:money(invTotal(inv)), due:fmtDate(inv.due), business:db.business.name});
        if(c){ a.href = waLink(c.phone, text); pushOutbox(c, 'Invoice sent', text); toast(`WhatsApp draft added to outbox for ${c.name}`); }
      });
    });
    $$('.inv-rem').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const inv = invoiceById(b.dataset.inv);
      const c = customerById(inv.customerId);
      if(!c || !c.phone) return;
      const text = waTemplateMsg('payment_reminder', {customer:c.name.split(' ')[0], ref:inv.ref, balance:money(invBalance(inv)), due:fmtDate(inv.due), business:db.business.name});
      pushOutbox(c, 'Payment reminder', text);
      toast(`Reminder queued for ${c.name}`);
    });
  }
};

/* ================= invoice detail ================= */
VIEWS.invoice = {
  title: p => { const i = invoiceById(p.id); return i ? i.ref : 'Invoice'; },
  render(p){
    const inv = invoiceById(p.id);
    if(!inv) return `<div class="empty">Invoice not found. <button class="btn ghost sm" onclick="go('invoices',{})">Back</button></div>`;
    const st = invState(inv);
    const c = customerById(inv.customerId);
    const job = inv.jobId ? jobById(inv.jobId) : null;
    const pct = clamp(invTotal(inv) ? invPaid(inv)/invTotal(inv)*100 : 0, 0, 100);
    return `
    <div class="print-head">
      <div><b style="font-size:16px">${esc(db.business.name)}</b><br>${esc(db.business.address)}<br>${esc(db.business.phone)} · ${esc(db.business.email)}</div>
      <div style="text-align:right"><b style="font-size:15px">INVOICE</b><br>${inv.ref}<br>Issued ${fmtDate(inv.issued)}<br>Due ${fmtDate(inv.due)}</div>
    </div>
    <div class="page-head no-print">
      <button class="linklike" id="inv-back">${icon('back',14)} All invoices</button>
      <div class="row" style="flex-wrap:wrap">
        ${st.balance > 0
          ? `<button class="btn primary" id="inv-pay">${icon('cash',15)} Record payment</button>
             ${c && c.phone ? `<a class="btn wa" target="_blank" rel="noopener" id="inv-wa" href="${waLink(c.phone, waTemplateMsg('payment_reminder',{customer:c.name.split(' ')[0],ref:inv.ref,balance:money(st.balance),due:fmtDate(inv.due),business:db.business.name}))}">${icon('wa',14)} WhatsApp reminder</a>` : ''}`
          : `<button class="btn ghost" disabled>${icon('check',15)} Fully paid</button>`}
        <button class="btn ghost" id="inv-print">🖨 Print</button>
        <button class="btn danger sm" id="inv-del">${icon('trash',14)} Delete</button>
      </div>
    </div>
    <div class="card mb16">
      <div class="spread">
        <div>
          <div class="row" style="flex-wrap:wrap">${chip(st.label)} ${inv.quoteRef?`<span class="chip c-teal">from ${esc(inv.quoteRef)}</span>`:''} <span class="muted small">${fmtDateFull(inv.issued)}</span></div>
          <div class="mt12"><b style="font-size:16px">${esc(c?c.name:'—')}</b>
            <div class="muted small">${esc(c?(c.area||''):'')} ${c&&c.phone?'· '+esc(c.phone):''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div class="muted small">Total</div><div class="bold" style="font-size:22px">${money(invTotal(inv))}</div>
          <div class="small muted mt8">Paid ${money(invPaid(inv))} · <span style="color:${st.balance>0?'var(--red)':'var(--green)'};font-weight:700">${st.balance>0?'Balance '+money(st.balance):'Settled'}</span></div>
          <div class="small muted">Due ${fmtDate(inv.due)} (${relDays(inv.due)})</div>
        </div>
      </div>
      <div class="progress mt12"><i style="width:${pct}%;background:${st.balance>0?'var(--accent)':'var(--green)'}"></i></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>${icon('doc',15)} Line items</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Description</th><th>Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${inv.items.map(i=>`<tr><td>${i.kind==='Material'?'🔩':i.kind==='Transport'?'🚚':'🛠'} ${esc(i.desc)}</td><td class="num">${i.qty}</td><td class="num">${money(i.price)} ${esc(i.unit||'')}</td><td class="num">${money(i.qty*i.price)}</td></tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="3" class="muted">Subtotal</td><td class="num">${money(invSubtotal(inv))}</td></tr>
            ${inv.discount?`<tr><td colspan="3" class="muted">Discount</td><td class="num">− ${money(inv.discount)}</td></tr>`:''}
            <tr><td colspan="3" class="muted">VAT (${inv.vatRate}%)</td><td class="num">${money(invTotal(inv) - Math.round((invSubtotal(inv)-inv.discount)*(1+inv.vatRate/100)))}</td></tr>
            <tr><td colspan="3" class="bold">Total</td><td class="num bold">${money(invTotal(inv))}</td></tr>
          </tfoot>
        </table></div>
        ${job ? `<div class="mt12"><a class="btn ghost sm inv-job" href="#">${icon('calendar',14)} Job: ${job.ref} — ${esc(job.title)} (${job.status})</a></div>` : ''}
      </div>
      <div class="stack">
        <div class="card">
          <h3>${icon('cash',15)} Payments (${(inv.payments||[]).length})</h3>
          ${inv.payments && inv.payments.length ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Date</th><th>Method</th><th class="num">Amount</th></tr></thead>
            <tbody>${inv.payments.slice().reverse().map(p=>`
              <tr><td>${fmtDate(p.date)}<div class="subrow">${esc(p.note||'')}</div></td><td>${esc(p.method)}</td><td class="num">${money(p.amount)}</td></tr>`).join('')}
            </tbody></table></div>` : '<div class="empty small">No payments recorded yet.</div>'}
          ${st.balance > 0 ? `<button class="btn primary sm mt12" id="inv-pay2">${icon('cash',14)} Record payment</button>` : ''}
        </div>
        <div class="card">
          <h3>${icon('cash',15)} Income breakdown</h3>
          ${breakdownHTML(inv.items)}
        </div>
        ${job ? `<div class="card" style="background:#f8fafc">
          <h3>${icon('calendar',15)} Linked job</h3>
          <b class="small">${job.ref} — ${esc(job.title)}</b>
          <div class="row mt8">${chip(job.status)}<span class="muted small">${fmtDateShort(job.date)} ${job.start}</span></div>
        </div>` : ''}
      </div>
    </div>`;
  },
  mount(p){
    const inv = invoiceById(p.id);
    if(!inv) return;
    $('#inv-back').onclick = () => go('invoices', {});
    const pr = $('#inv-print'); if(pr) pr.onclick = () => window.print();
    const pay = () => payModal(inv);
    const b1 = $('#inv-pay'); if(b1) b1.onclick = pay;
    const b2 = $('#inv-pay2'); if(b2) b2.onclick = pay;
    const jb = $('.inv-job'); if(jb) jb.onclick = e => { e.preventDefault(); openJobModal(inv.jobId); };
    $('#inv-del').onclick = () => askConfirm(`Delete invoice <b>${inv.ref}</b>? Recorded payments will be lost.`, () => {
      db.invoices = db.invoices.filter(x=>x.id!==inv.id); commit(); go('invoices',{}); toast('Invoice deleted');
    });
  }
};

function payModal(inv){
  const bal = invBalance(inv);
  openModal(`Record payment — ${inv.ref}`, `
    <div class="form-grid">
      <div class="field"><label>Date</label><input type="date" class="inp" id="pay-date" value="${isoDate(today())}"></div>
      <div class="field"><label>Amount (KES)</label><input type="number" class="inp" id="pay-amt" min="0" value="${bal}"></div>
      <div class="field"><label>Method</label>
        <select class="inp" id="pay-method"><option>M-Pesa</option><option>Cash</option><option>Bank transfer</option><option>Cheque</option></select></div>
      <div class="field"><label>Reference / note</label><input class="inp" id="pay-note" placeholder="e.g. M-Pesa ref QKJ…"></div>
    </div>
    <p class="muted small" style="margin:0">Outstanding balance: <b>${money(bal)}</b></p>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="pay-x">Cancel</button><button class="btn primary" id="pay-go">${icon('cash',14)} Record payment</button>`,
    onMount(){
      $('#pay-x').onclick = closeModal;
      $('#pay-go').onclick = () => {
        const amt = parseFloat($('#pay-amt').value) || 0;
        if(amt <= 0){ toast('Enter a valid amount','warn'); return; }
        if(amt > bal + 0.5){ toast(`Amount exceeds balance (${money(bal)})`,'warn'); return; }
        inv.payments = inv.payments || [];
        inv.payments.push({date:$('#pay-date').value || isoDate(today()), amount:amt, method:$('#pay-method').value, note:$('#pay-note').value.trim()});
        if(inv.status === 'Draft') inv.status = 'Open';
        const cust = customerById(inv.customerId);
        commit(); closeModal();
        if(cust && cust.phone) pushOutbox(cust, 'Payment received', waTemplateMsg('payment_received', {customer:cust.name.split(' ')[0], amount:money(amt), ref:inv.ref, business:db.business.name}));
        const nb = invBalance(inv);
        toast(nb <= 0 ? `${inv.ref} fully paid — thank you!` : `Recorded ${money(amt)} · balance ${money(nb)}`);
        go('invoice', {id:inv.id});
      };
    }
  });
}

/* ================= new invoice ================= */
let ie = null;
VIEWS.invoice_new = {
  title: () => 'New invoice',
  render(p){
    const job = p.jobId ? jobById(p.jobId) : null;
    let items = [];
    if(job){
      const q = job && (db.quotes.find(x=>x.jobId===job.id && x.status!=='Declined') || null);
      if(q) items = q.items.map(i=>({...i}));
      else items = [{kind:'Labor', desc:`Labor — ${job.title}`, qty:job.hours, unit:'hr', price:(techById(job.technicianIds[0])||{}).rate || db.business.rates.standard}];
    }
    return `
    <div class="page-head">
      <div><button class="linklike" id="in-back">${icon('back',14)} All invoices</button>
      <h2 class="page mt8">New invoice ${job?`<span class="chip c-gray">${job.ref}</span>`:''}</h2></div>
      <div class="row"><button class="btn ghost" id="in-save">Save invoice</button>
      <button class="btn primary" id="in-save2">${icon('send',14)} Save &amp; send (WhatsApp)</button></div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="card"><div class="form-grid">
          <div class="field"><label>Customer *</label>
            <select class="inp" id="in-cust"><option value="">Select customer…</option>
            ${db.customers.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.area)}</option>`).join('')}</select></div>
          <div class="field"><label>Linked job</label>
            <select class="inp" id="in-job"><option value="">— none —</option>
            ${db.jobs.map(j=>`<option value="${j.id}">${j.ref} · ${esc(j.title)}</option>`).join('')}</select></div>
          <div class="field"><label>Issued</label><input type="date" class="inp" id="in-issued" value="${isoDate(today())}"></div>
          <div class="field"><label>Due in (days)</label><input type="number" class="inp" id="in-due" min="0" value="${db.business.dueDays||14}"></div>
          <div class="field"><label>Discount (KES)</label><input type="number" class="inp" id="in-disc" min="0" value="0"></div>
          <div class="field"><label>VAT %</label><input type="number" class="inp" id="in-vat" value="${db.business.vatRate}"></div>
        </div></div>
        <div class="card">
          <h3>${icon('doc',15)} Line items</h3>
          ${itemsTableHTML()}
          <div class="totp mt16" style="max-width:340px;margin-left:auto" id="in-totals"></div>
        </div>
      </div>
      <div class="stack">
        <div class="card" style="background:#f8fafc">
          <h3>${icon('doc',15)} Tip</h3>
          <p class="muted small" style="margin:0">Linking a job pre-fills labor from its duration and the assigned technician's rate. If the job has an approved/sent quotation, all its line items are copied over. Materials that exist in inventory are deducted from stock on save.</p>
        </div>
      </div>
    </div>`;
  },
  mount(p){
    ie = {
      customerId: p.customerId || (p.jobId && jobById(p.jobId) ? jobById(p.jobId).customerId : ''),
      jobId: p.jobId || null,
      issued: isoDate(today()),
      dueDays: db.business.dueDays || 14,
      discount: 0,
      vatRate: db.business.vatRate || 16,
      items: []
    };
    if(p.jobId){
      const job = jobById(p.jobId);
      const q = db.quotes.find(x=>x.jobId===job.id && x.status!=='Declined');
      if(q) ie.items = q.items.map(i=>({...i}));
      else ie.items = [{kind:'Labor', desc:`Labor — ${job.title}`, qty:job.hours, unit:'hr', price:(techById(job.technicianIds[0])||{}).rate || db.business.rates.standard}];
    }
    $('#in-back').onclick = () => go('invoices', {});
    $('#in-cust').value = ie.customerId;
    $('#in-job').value = ie.jobId || '';
    $('#in-vat').value = ie.vatRate;
    const refresh = () => {
      const sub = sum(ie.items, i=>i.qty*i.price);
      const total = Math.round((sub - (parseFloat($('#in-disc').value)||0)) * (1 + (parseFloat($('#in-vat').value)||0)/100));
      $('#in-totals').innerHTML = totalsHTML(sub, parseFloat($('#in-disc').value)||0, parseFloat($('#in-vat').value)||0, total);
    };
    $('#in-job').onchange = e => {
      const j = jobById(e.target.value);
      if(j){
        ie.jobId = j.id; ie.customerId = j.customerId; $('#in-cust').value = j.customerId;
        const q = db.quotes.find(x=>x.jobId===j.id && x.status!=='Declined');
        ie.items = q ? q.items.map(i=>({...i})) : [{kind:'Labor', desc:`Labor — ${j.title}`, qty:j.hours, unit:'hr', price:(techById(j.technicianIds[0])||{}).rate || db.business.rates.standard}];
        reRenderEditorInvoice();
      }
    };
    $('#in-cust').onchange = e => ie.customerId = e.target.value;
    $('#in-issued').onchange = e => ie.issued = e.target.value;
    $('#in-due').onchange = e => ie.dueDays = parseInt(e.target.value)||0;
    bindItemsEditor({getItems:()=>ie.items, onRefresh:refresh});
    refresh();
    const doSave = (send) => {
      if(!ie.customerId){ toast('Select a customer','warn'); return; }
      if(!ie.items.length){ toast('Add at least one line item','warn'); return; }
      const inv = {
        id:uid('inv'), ref:nextRef('invoice'), customerId:ie.customerId, jobId:ie.jobId, quoteRef:null,
        items:ie.items, discount:parseFloat($('#in-disc').value)||0, vatRate:parseFloat($('#in-vat').value)||16,
        issued:ie.issued, due:isoDate(addDays(parseISO(ie.issued)||today(), ie.dueDays)),
        payments:[], status:'Open', createdAt:isoDate(today())
      };
      db.invoices.unshift(inv);
      const warns = consumeStock(inv, inv.items);
      const cust = customerById(inv.customerId);
      if(send && cust) pushOutbox(cust, 'Invoice sent', waTemplateMsg('invoice_sent', {customer:cust.name.split(' ')[0], ref:inv.ref, total:money(invTotal(inv)), due:fmtDate(inv.due), business:db.business.name}));
      commit();
      toast(`Invoice ${inv.ref} created${send?' — WhatsApp draft in outbox':''}`);
      warns.forEach(w=>toast(w,'warn'));
      go('invoice', {id:inv.id});
    };
    $('#in-save').onclick = () => doSave(false);
    $('#in-save2').onclick = () => doSave(true);
  }
};
function reRenderEditorInvoice(){ if(ui.view==='invoice_new') go('invoice_new', ui.params); }
