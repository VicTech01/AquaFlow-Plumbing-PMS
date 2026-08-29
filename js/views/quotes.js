'use strict';
/* ================= quotations list ================= */
let quoteFilter = '';

VIEWS.quotes = {
  title: () => 'Quotations',
  render(){
    const list = db.quotes.filter(q => !quoteFilter || q.status === quoteFilter)
      .sort((a,b) => b.ref.localeCompare(a.ref));
    const sent = sum(db.quotes.filter(q=>['Sent','Approved'].includes(q.status)), quoteTotal);
    return `
    <div class="page-head">
      <div class="row" style="flex-wrap:wrap">
        <select class="inp" id="qf" style="max-width:170px">
          <option value="">All statuses</option>
          ${['Draft','Sent','Approved','Converted','Declined'].map(s=>`<option ${quoteFilter===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <span class="small muted">${list.length} quotation${list.length===1?'':'s'} · ${money(sent)} pending approval</span>
      </div>
      <div class="row">
        <button class="btn ghost" id="q-new">${icon('plus',15)} Blank quotation</button>
        <button class="btn primary" id="q-ai">${icon('spark',15)} AI-assisted quote</button>
      </div>
    </div>
    <div class="card">
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Ref</th><th>Customer</th><th>Title</th><th class="resp-sm">Created</th><th class="resp-md">Valid until</th><th class="num">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.length ? list.map(q => {
            const c = customerById(q.customerId);
            return `<tr class="click" data-q="${q.id}">
              <td class="bold">${q.ref}</td>
              <td>${esc(c?c.name:'—')}</td>
              <td>${esc(q.title)}${q.ai?` <span class="chip c-violet" title="Built with AI estimate assistant">✦ AI</span>`:''}</td>
              <td class="resp-sm">${fmtDate(q.createdAt)}</td>
              <td class="resp-md">${fmtDate(q.validUntil)}<div class="subrow">${relDays(q.validUntil)}</div></td>
              <td class="num bold">${money(quoteTotal(q))}</td>
              <td>${chip(q.status)}</td>
              <td>
                <button class="btn icon ghost q-view" data-q="${q.id}" title="Open">↗</button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="8" class="empty">No quotations yet — try the AI assistant</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $('#qf').onchange = e => { quoteFilter = e.target.value; reRender(); };
    $('#q-new').onclick = () => go('quote_edit', {});
    $('#q-ai').onclick = () => go('quote_edit', {});
    $$('#content tr[data-q]').forEach(tr => tr.onclick = () => go('quote_edit', {id: tr.dataset.q}));
  }
};

/* ================= AI estimate engine (rules model) ================= */
function aiGenerate(typeId, o = {}){
  const cat = AI_CATALOG.find(c => c.id === typeId) || AI_CATALOG[0];
  const b = db.business;
  const level = o.level === 'senior' ? 'senior' : 'standard';
  const rate = b.rates[level] || 1200;
  const urgency = ['sameday','emergency'].includes(o.urgency) ? o.urgency : 'standard';
  const access = ['upper','tight'].includes(o.access) ? o.access : 'ground';
  const area = ['outskirts','county'].includes(o.area) ? o.area : 'city';
  const urgMult = {standard:1, sameday:1.15, emergency:1.4}[urgency];
  const accMult = {ground:1, upper:1.1, tight:1.15}[access];

  const lines = [];
  const assumptions = [];
  const hours = cat.hours;
  const laborPrice = Math.round(rate * urgMult * accMult / 10) * 10;
  lines.push({kind:'Labor', desc:`${cat.label} — labor`, qty:hours, unit:'hr', price:laborPrice,
    reason:`${hours}h at ${money(rate)}/h (${level})` +
      (urgency!=='standard' ? ` × ${urgMult} (${urgency} call)` : '') +
      (access!=='ground' ? ` × ${accMult} (${access} access)` : '')});

  let missingStock = 0;
  (cat.materials||[]).forEach(m => {
    const match = db.inventory.find(x => x.name.toLowerCase() === m.n.toLowerCase());
    let price = m.p, reason = m.r || 'Standard part for this job';
    if(match){
      price = match.price;
      reason += ` — priced live from your stock`;
      if(match.qty <= 0){ assumptions.push(`⚠ ${match.name} is OUT of stock — order from supplier before starting.`); }
      else if(match.qty <= match.reorder){ assumptions.push(`${match.name} is low in stock (${match.qty} ${match.unit} left) — may need reordering.`); }
    } else {
      missingStock++;
      assumptions.push(`${m.n} is not tracked in your inventory yet — price is a standard market estimate.`);
    }
    lines.push({kind:'Material', desc:m.n, qty:m.q, unit:m.u||'pcs', price, invId: match?match.id:null, reason});
  });

  const travelPrice = (b.travel && b.travel[area]) || 400;
  lines.push({kind:'Transport', desc:`Travel fee — ${area==='city'?'within-city (Westlands/CBD/Kilimani etc.)':area}`, qty:1, unit:'trip', price:travelPrice,
    reason:'Standard travel allowance for this zone'});

  (cat.incl||[]).forEach(x => assumptions.push(`Includes: ${x}`));
  if(cat.risk) assumptions.push(cat.risk);
  if(urgency === 'emergency') assumptions.push('Emergency rate: after-hours callout with priority crew (labor ×1.4).');
  if(urgency === 'sameday') assumptions.push('Same-day call: labor ×1.15.');
  assumptions.push(`${b.vatRate||16}% VAT applied at totals. Payment terms: ${b.dueDays||14} days from invoice.`);

  let conf = 96;
  if(urgency === 'emergency' && access !== 'ground') conf -= 6;
  if(missingStock) conf -= 4;
  conf = clamp(conf, 72, 97);

  return {
    cat, lines, assumptions, conf, hours, rate, level, urgency, access, area,
    subtotal: sum(lines, l => l.qty*l.price),
    total: Math.round(sum(lines, l=>l.qty*l.price) * (1 + (b.vatRate||16)/100))
  };
}
window.__ai = {catalog: AI_CATALOG, generate: aiGenerate};

/* ================= quotation editor ================= */
let qe = null;

VIEWS.quote_edit = {
  title: p => p.id ? 'Edit quotation' : 'New quotation',
  render(p){
    const isExisting = !!p.id;
    return `
    <div class="page-head">
      <div>
        <button class="linklike" id="qe-back">${icon('back',14)} All quotations</button>
        <h2 class="page mt8">${isExisting ? 'Edit quotation' : 'New quotation'} <span class="muted small" id="qe-ref"></span></h2>
      </div>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn ghost" id="qe-save">Save draft</button>
        <button class="btn primary" id="qe-send">Save &amp; send (WhatsApp)</button>
      </div>
    </div>
    <div class="grid2">
      <div class="stack">
        <div class="card">
          <div class="form-grid">
            <div class="field"><label>Customer *</label>
              <select class="inp" id="qe-cust">
                <option value="">Select customer…</option>
                ${db.customers.map(c=>`<option value="${c.id}">${esc(c.name)} — ${esc(c.area)}</option>`).join('')}
              </select></div>
            <div class="field"><label>Linked job (optional)</label>
              <select class="inp" id="qe-job">
                <option value="">— none —</option>
                ${db.jobs.map(j=>`<option value="${j.id}">${j.ref} · ${esc(j.title)} (${fmtDateShort(j.date)})</option>`).join('')}
              </select></div>
            <div class="field span2"><label>Title</label><input class="inp" id="qe-title" placeholder="e.g. Bathroom refit — plumbing (1 WC)"></div>
            <div class="field"><label>Valid until</label><input type="date" class="inp" id="qe-valid"></div>
            <div class="field"><label>Discount (KES)</label><input type="number" class="inp" id="qe-disc" min="0" value="0"></div>
            <div class="field"><label>VAT %</label><input type="number" class="inp" id="qe-vat" min="0" max="30" value="${db.business.vatRate}"></div>
            <div class="field"><label>Notes / terms</label><input class="inp" id="qe-notes" placeholder="e.g. 30% deposit to start"></div>
          </div>
        </div>
        <div class="card">
          <h3>${icon('doc',15)} Line items</h3>
          ${itemsTableHTML()}
          <div class="totp mt16" style="max-width:340px;margin-left:auto" id="qe-totals"></div>
        </div>
      </div>
      <div class="stack">
        <div class="card ai-card">
          <div class="ai-head">${icon('spark',17)} AI Estimate Assistant <span class="chip c-violet">rules model v1</span></div>
          <p class="muted small" style="margin-top:0">Pick the job type and scope. The assistant drafts line items from your labor rates, live stock prices and standard practice — review before sending.</p>
          <div class="form-grid">
            <div class="field span2"><label>Job type</label>
              <select class="inp" id="ai-type">${AI_CATALOG.map(c=>`<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select></div>
            <div class="field"><label>Labor level</label>
              <select class="inp" id="ai-level"><option value="standard">Standard</option><option value="senior">Senior</option></select></div>
            <div class="field"><label>Urgency</label>
              <select class="inp" id="ai-urg"><option value="standard">Standard booking</option><option value="sameday">Same-day (×1.15)</option><option value="emergency">Emergency (×1.4)</option></select></div>
            <div class="field"><label>Site access</label>
              <select class="inp" id="ai-acc"><option value="ground">Ground floor</option><option value="upper">Upper floor / carry-up (×1.1)</option><option value="tight">Tight space (×1.15)</option></select></div>
            <div class="field"><label>Area / travel</label>
              <select class="inp" id="ai-area"><option value="city">Within-city</option><option value="outskirts">Outskirts (Thika, Ngong…)</option><option value="county">Outside county</option></select></div>
          </div>
          <button class="btn primary" id="ai-go" style="width:100%;justify-content:center">${icon('spark',15)} Generate estimate</button>
          <div id="ai-result"></div>
        </div>
        <div class="card" id="qe-status-card"></div>
      </div>
    </div>`;
  },
  mount(p){
    qe = quoteStateFrom(p);
    $('#qe-back').onclick = () => go('quotes', {});
    $('#qe-ref').textContent = qe.ref || '';
    $('#qe-cust').value = qe.customerId || '';
    $('#qe-job').value = qe.jobId || '';
    $('#qe-title').value = qe.title;
    $('#qe-valid').value = qe.validUntil;
    $('#qe-disc').value = qe.discount;
    $('#qe-vat').value = qe.vatRate;
    $('#qe-notes').value = qe.notes;

    const refresh = () => {
      $('#qe-totals').innerHTML = totalsHTML(quoteSubtotal(qe), qe.discount, qe.vatRate, quoteTotal(qe));
    };
    $('#qe-cust').onchange = e => {
      qe.customerId = e.target.value;
      const c = customerById(e.target.value);
      if(c && !qe.title){
        const j = jobById(qe.jobId);
        if(j) qe.title = j.title;
      }
      renderStatusCard();
    };
    $('#qe-job').onchange = e => {
      qe.jobId = e.target.value || null;
      const j = jobById(qe.jobId);
      if(j){
        qe.customerId = j.customerId; $('#qe-cust').value = j.customerId;
        if(!qe.title){ qe.title = j.title; $('#qe-title').value = j.title; }
      }
      renderStatusCard();
    };
    $('#qe-title').oninput = e => qe.title = e.target.value;
    $('#qe-valid').onchange = e => qe.validUntil = e.target.value;
    $('#qe-disc').oninput = e => { qe.discount = parseFloat(e.target.value)||0; refresh(); };
    $('#qe-vat').oninput = e => { qe.vatRate = parseFloat(e.target.value)||0; refresh(); };
    $('#qe-notes').oninput = e => qe.notes = e.target.value;

    bindItemsEditor({getItems: () => qe.items, onRefresh: refresh});
    refresh();
    renderStatusCard();

    /* AI panel */
    $('#ai-go').onclick = () => {
      const res = aiGenerate($('#ai-type').value, {
        level: $('#ai-level').value, urgency: $('#ai-urg').value,
        access: $('#ai-acc').value, area: $('#ai-area').value
      });
      const confLabel = res.conf >= 88 ? 'High' : res.conf >= 80 ? 'Medium' : 'Fair';
      $('#ai-result').innerHTML = `
        <div class="mt12">
          <div class="spread small"><span class="bold">Confidence: ${confLabel} (${res.conf}%)</span><span class="muted">${res.hours}h · ${money(res.rate)}/h</span></div>
          <div class="confbar"><i style="width:${res.conf}%"></i></div>
          <div class="ai-lines mt12">
            ${res.lines.map(l=>`
              <div class="ai-line">
                <div class="top"><span>${l.kind==='Material'?'🔩':'🛠'} ${esc(l.desc)}${l.unit?` <span class="muted small">×${l.qty} ${esc(l.unit)}</span>`:''}</span><span>${money(l.qty*l.price)}</span></div>
                <div class="r">${esc(l.reason||'')}</div>
              </div>`).join('')}
          </div>
          <ul class="assume">${res.assumptions.map(a=>`<li>${esc(a)}</li>`).join('')}</ul>
          <div class="spread">
            <div><span class="muted small">Est. total incl. VAT</span><div class="bold" style="font-size:17px">${money(res.total)}</div></div>
            <button class="btn primary sm" id="ai-apply">${icon('check',14)} Apply to quotation</button>
          </div>
        </div>`;
      $('#ai-apply').onclick = () => {
        qe.items = res.lines.map(l => ({kind:l.kind, desc:l.desc, qty:l.qty, unit:l.unit, price:l.price, invId:l.invId||null}));
        if(!qe.title){ qe.title = res.cat.label; $('#qe-title').value = qe.title; }
        qe.ai = {model:'aquaflow-rules-v1', type:res.cat.id, conf:res.conf, at:new Date().toISOString()};
        toast(`Estimate applied (${confLabel} confidence) — review before sending`);
        reRenderEditor();
      };
    };

    /* save */
    const save = (status) => {
      if(!qe.customerId){ toast('Select a customer first','warn'); return; }
      if(!qe.items.length){ toast('Add at least one line item (or run the AI assistant)','warn'); return; }
      if(status === 'Sent' && qe.status !== 'Sent'){
        const c = customerById(qe.customerId);
        pushOutbox(c, 'Quote sent', waTemplateMsg('quote_sent', {
          customer: c.name.split(' ')[0], ref: qe.ref || '(new)', total: money(quoteTotal(qe)),
          title: qe.title || 'plumbing works', valid: fmtDate(qe.validUntil), business: db.business.name
        }));
      }
      qe.status = status || qe.status;
      if(!qe.id){
        qe.id = uid('q'); qe.ref = nextRef('quote'); qe.createdAt = isoDate(today());
        db.quotes.unshift(qe);
      } else {
        Object.assign(quoteById(qe.id), qe);
      }
      commit();
      toast(qe.status==='Sent' ? `${qe.ref} sent — WhatsApp draft added to outbox` : `${qe.ref} saved`);
      go('quotes', {});
    };
    $('#qe-save').onclick = () => save('Draft');
    $('#qe-send').onclick = () => save('Sent');
  }
};

function quoteStateFrom(p){
  if(p.id){
    const q = quoteById(p.id);
    if(q) return JSON.parse(JSON.stringify(q));
  }
  const job = p.jobId ? jobById(p.jobId) : null;
  return {
    id:null, ref:null,
    customerId: job ? job.customerId : (p.customerId || ''),
    jobId: p.jobId || null,
    title: job ? job.title : (p.title || ''),
    items: [],
    discount:0, vatRate: db.business.vatRate || 16,
    status:'Draft',
    validUntil: isoDate(addDays(today(), 14)),
    notes:'', ai:null, createdAt:isoDate(today())
  };
}
function reRenderEditor(){
  if(ui.view === 'quote_edit') go('quote_edit', ui.params);
}

function totalsHTML(sub, disc, vat, total){
  const vatAmt = total - Math.round((sub - disc) * (1 + vat/100));
  return `
    <div class="r"><span>Subtotal</span><span>${money(sub)}</span></div>
    <div class="r"><span>Discount</span><span>− ${money(disc)}</span></div>
    <div class="r"><span>VAT (${vat}%)</span><span>${money(vatAmt)}</span></div>
    <div class="r"><span>Total</span><span>${money(total)}</span></div>`;
}

function renderStatusCard(){
  const el = $('#qe-status-card');
  if(!el) return;
  if(!qe.id){
    el.innerHTML = `<h3>${icon('doc',15)} Quotation</h3>
      <div class="muted small">Draft a quote, then <b>Save &amp; send</b> to push a WhatsApp message to the customer's outbox.</div>`;
    return;
  }
  const c = customerById(qe.customerId);
  const btn = (id, cls, ic, label) => `<button class="btn ${cls} sm" id="${id}">${ic} ${label}</button>`;
  el.innerHTML = `
    <h3>${icon('doc',15)} ${qe.ref}</h3>
    <div class="row mb12">${chip(qe.status)}<span class="muted small">valid until ${fmtDate(qe.validUntil)}</span></div>
    <div class="row" style="flex-wrap:wrap">
      ${qe.status==='Draft' ? btn('qs-send','primary',icon('send',14),'Mark sent') : ''}
      ${qe.status==='Sent' ? btn('qs-approve','green',icon('check',14),'Mark approved') + btn('qs-decline','ghost',icon('x',14),'Declined') : ''}
      ${qe.status==='Approved' ? btn('qs-convert','primary',icon('receipt',14),'Convert to invoice') : ''}
      ${c && c.phone && ['Sent','Approved'].includes(qe.status) ? `<a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(c.phone, waTemplateMsg('quote_sent',{customer:c.name.split(' ')[0],ref:qe.ref,total:money(quoteTotal(qe)),title:qe.title||'works',valid:fmtDate(qe.validUntil),business:db.business.name}))}">${icon('wa',14)} WhatsApp</a>` : ''}
      <button class="btn ghost sm qs-del">${icon('trash',14)}</button>
    </div>`;
  const send2 = () => {
    if(!qe.customerId){ toast('Select a customer','warn'); return; }
    const cust = customerById(qe.customerId);
    pushOutbox(cust, 'Quote sent', waTemplateMsg('quote_sent', {customer:cust.name.split(' ')[0], ref:qe.ref, total:money(quoteTotal(qe)), title:qe.title||'plumbing works', valid:fmtDate(qe.validUntil), business:db.business.name}));
    qe.status = 'Sent'; commit(); toast(`${qe.ref} marked sent`); reRender();
  };
  const qsSend = $('#qs-send');   if(qsSend) qsSend.onclick = send2;
  const qsAppr = $('#qs-approve');if(qsAppr) qsAppr.onclick = () => { qe.status='Approved'; commit(); toast('Quotation approved'); reRender(); };
  const qsDecl = $('#qs-decline');if(qsDecl) qsDecl.onclick = () => { qe.status='Declined'; commit(); reRender(); };
  const qsConv = $('#qs-convert');if(qsConv) qsConv.onclick = () => convertQuoteToInvoice(qe);
  const qsDel  = $('#qs-del');    if(qsDel) qsDel.onclick = () => askConfirm(`Delete quotation <b>${qe.ref}</b>?`, () => {
    db.quotes = db.quotes.filter(x=>x.id!==qe.id); commit(); go('quotes',{}); toast('Quotation deleted');
  });
}

function convertQuoteToInvoice(q){
  const cust = customerById(q.customerId);
  const items = q.items.map(i => ({...i}));
  const inv = {
    id:uid('inv'), ref:nextRef('invoice'), customerId:q.customerId, jobId:q.jobId||null, quoteRef:q.ref,
    items, discount:q.discount||0, vatRate:q.vatRate||16,
    issued:isoDate(today()), due:isoDate(addDays(today(), db.business.dueDays||14)),
    payments:[], status:'Open', createdAt:isoDate(today())
  };
  db.invoices.unshift(inv);
  q.status = 'Converted';
  const warns = consumeStock(inv, items);
  if(cust) pushOutbox(cust, 'Invoice sent', waTemplateMsg('invoice_sent', {
    customer:cust.name.split(' ')[0], ref:inv.ref, total:money(invTotal(inv)),
    due:fmtDate(inv.due), business:db.business.name
  }));
  commit();
  toast(`Invoice ${inv.ref} created from ${q.ref}`);
  warns.forEach(w => toast(w, 'warn'));
  go('invoice', {id: inv.id});
}
