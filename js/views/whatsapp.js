'use strict';
/* ================= whatsapp notifications ================= */
let waPurpose = '';
let waShowSent = true;

VIEWS.whatsapp = {
  title: () => 'WhatsApp Notifications',
  render(){
    const b = db.business;
    const items = db.outbox.slice().sort((a,b2)=>b2.createdAt.localeCompare(a.createdAt))
      .filter(o => (!waPurpose || o.purpose === waPurpose) && (waShowSent || !o.sent));
    const purposes = [...new Set(db.outbox.map(o=>o.purpose))];
    return `
    <div class="badge-info mb16">${icon('wa',16)}
      <div>
        <b>How this works:</b> Every trigger (dispatch, quote sent, invoice, reminder…) composes a message to the customer's WhatsApp number and queues it below.
        Click <b>Open in WhatsApp</b> to send it instantly via a pre-filled wa.me chat — no Business API or number porting needed.
        Your business number: <b>+${esc(b.whatsapp)}</b> · <button class="linklike" id="wa-tpl">edit message templates</button>
      </div>
    </div>
    <div class="card">
      <div class="row mb12" style="flex-wrap:wrap">
        <select class="inp" id="wa-purpose" style="max-width:190px">
          <option value="">All purposes</option>
          ${[...new Set(db.outbox.map(o=>o.purpose))].map(p=>`<option ${waPurpose===p?'selected':''}>${esc(p)}</option>`).join('')}
        </select>
        <label style="margin:0;display:flex;align-items:center;gap:7px;font-size:13px">
          <input type="checkbox" id="wa-sent" ${waShowSent?'checked':''}> show already-sent
        </label>
        <span class="muted small">${items.length} message${items.length===1?'':'s'}</span>
        <button class="btn ghost sm" id="wa-clear" style="margin-left:auto">Clear sent</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th class="resp-sm">Created</th><th>To</th><th class="resp-md">Purpose</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${items.length ? items.map(o => `
            <tr>
              <td class="resp-sm" style="width:104px">${fmtDateShort(o.createdAt.slice(0,10))}<div class="subrow">${o.createdAt.slice(11,16)}</div></td>
              <td style="width:170px"><b class="small">${esc(o.contact)}</b><div class="subrow">+${esc(o.to)}</div></td>
              <td class="resp-md" style="width:130px">${chip(o.purpose)}</td>
              <td class="small" style="max-width:340px;color:var(--muted)">${esc(o.text.length>160 ? o.text.slice(0,160)+'…' : o.text)}</td>
              <td style="width:80px">${o.sent?chip('Sent'):chip('Queued')}</td>
              <td>
                <div class="row" style="gap:5px;flex-wrap:wrap">
                  <a class="btn wa sm" target="_blank" rel="noopener" href="${waLink(o.to, o.text)}">${icon('wa',14)} Open</a>
                  <button class="btn ghost sm wa-copy" data-o="${o.id}">${icon('copy',14)} Copy</button>
                  ${o.sent?'':`<button class="btn ghost sm wa-mark" data-o="${o.id}">${icon('check',14)} Sent</button>`}
                </div>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty">Outbox is empty — triggers from Jobs, Quotes, Invoices and Maintenance will land here.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $('#wa-tpl').onclick = () => go('settings', {section:'templates'});
    $('#wa-purpose').onchange = e => { waPurpose = e.target.value; reRender(); };
    $('#wa-sent').onchange = e => { waShowSent = e.target.checked; reRender(); };
    $('#wa-clear').onclick = () => askConfirm('Remove all messages marked as sent from the outbox?', () => {
      db.outbox = db.outbox.filter(o => !o.sent); commit(); reRender(); toast('Sent messages cleared');
    }, {label:'Clear'});
    $$('.wa-copy').forEach(b => b.onclick = () => {
      const o = db.outbox.find(x=>x.id===b.dataset.o);
      if(o) copyText(o.text);
    });
    $$('.wa-mark').forEach(b => b.onclick = () => {
      const o = db.outbox.find(x=>x.id===b.dataset.o);
      if(o){ o.sent = true; commit(); reRender(); toast('Marked as sent'); }
    });
  }
};
