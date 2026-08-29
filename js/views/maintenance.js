'use strict';
/* ================= maintenance reminders ================= */
const EQUIPMENT_TYPES = ['Geyser / water heater','Solar water heater','Solar PV system','Boiler','Submersible / booster pump','Backflow preventer','Septic tank / drainage','Gutters & downpipes','Grease trap','Gas cylinder & piping','General plumbing'];

VIEWS.maintenance = {
  title: () => 'Maintenance Reminders',
  render(){
    const t = isoDate(today());
    const plans = db.maintenance.map(m => ({...m, next: nextDueDate(m)}))
      .sort((a,b) => a.next.localeCompare(b.next));
    const dueSoon = plans.filter(p => dayDiff(t, p.next) <= 14);
    return `
    <div class="page-head">
      <div class="small muted">Recurring service plans per customer &amp; equipment — we remind you (and the customer on WhatsApp) as the due date approaches.</div>
      <button class="btn primary" id="mt-new">${icon('plus',15)} New plan</button>
    </div>
    <div class="card mb16">
      <h3>${icon('bell',15)} Due within 14 days / overdue <span class="chip c-amber">${dueSoon.length}</span></h3>
      ${dueSoon.length ? dueSoon.map(m => {
        const c = customerById(m.customerId);
        const n = dayDiff(t, m.next);
        return `<div class="spread mb8" style="padding:10px 0;border-bottom:1px dashed #eef2f7;flex-wrap:wrap">
          <div>
            <b>${esc(m.equipment)}</b> — ${esc(c?c.name:'—')}
            <div class="subrow">every ${m.frequencyMonths} mo · last serviced ${fmtDate(m.lastDone)} (${relDays(m.lastDone)})${m.notes?' · '+esc(m.notes):''}</div>
          </div>
          <div class="row" style="flex-wrap:wrap">
            ${chip(n<0?`Overdue ${-n}d`: n===0?'Due today':`Due in ${n}d`, n<0?'red':n<=7?'amber':'green')}
            <button class="btn ghost sm mt-sched" data-m="${m.id}">${icon('calendar',14)} Schedule job</button>
            ${c && c.phone ? `<button class="btn wa sm mt-wa" data-m="${m.id}">${icon('wa',14)} Remind customer</button>` : ''}
            <button class="btn green sm mt-done" data-m="${m.id}">${icon('check',14)} Mark done</button>
          </div>
        </div>`;
      }).join('') : '<div class="empty">Nothing due in the next 14 days ✅</div>'}
    </div>
    <div class="card">
      <h3>${icon('wrench',15)} All plans (${plans.length})</h3>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Customer</th><th>Equipment</th><th class="resp-sm">Frequency</th><th class="resp-md">Last serviced</th><th>Next due</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${plans.length ? plans.map(m => {
            const c = customerById(m.customerId);
            const n = dayDiff(t, m.next);
            return `<tr class="click" data-m="${m.id}">
              <td><b>${esc(c?c.name:'—')}</b><div class="subrow">${esc(c?c.area:'')}</div></td>
              <td>${esc(m.equipment)}</td>
              <td class="resp-sm">every ${m.frequencyMonths} mo</td>
              <td class="resp-md">${fmtDate(m.lastDone)}</td>
              <td>${fmtDate(m.next)}<div class="subrow">${relDays(m.next)}</div></td>
              <td>${chip(n<0?'Overdue':n<=14?'Due soon':'On track', n<0?'red':n<=14?'amber':'green')}</td>
              <td class="row" style="gap:4px">
                <button class="btn icon ghost mt-edit" data-m="${m.id}" title="Edit">${icon('edit',14)}</button>
                <button class="btn icon ghost mt-del" data-m="${m.id}" title="Delete">${icon('trash',14)}</button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="7" class="empty">No maintenance plans yet</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $('#mt-new').onclick = () => maintModal({});
    $$('.mt-sched').forEach(b => b.onclick = () => {
      const m = db.maintenance.find(x=>x.id===b.dataset.m);
      const c = customerById(m.customerId);
      const next = nextDueDate(m);
      const date = next < isoDate(today()) ? isoDate(today()) : next;
      jobModal({
        customerId:c.id, type:'Maintenance', priority:'Medium',
        title:`${m.equipment} maintenance`, date, address:c.address,
        notes:m.notes ? `Recurring plan: ${m.notes}` : ''
      }, () => go('maintenance', {}));
    });
    $$('.mt-wa').forEach(b => b.onclick = () => {
      const m = db.maintenance.find(x=>x.id===b.dataset.m);
      const c = customerById(m.customerId);
      if(!c || !c.phone) return;
      const text = waTemplateMsg('maintenance_due', {customer:c.name.split(' ')[0], equipment:m.equipment, last:fmtDate(m.lastDone), business:db.business.name});
      pushOutbox(c, 'Maintenance reminder', text);
      toast(`Reminder queued for ${c.name}`);
    });
    $$('.mt-done').forEach(b => b.onclick = () => {
      const m = db.maintenance.find(x=>x.id===b.dataset.m);
      const c = customerById(m.customerId);
      askConfirm(`Record <b>${esc(m.equipment)}</b> as serviced today? Next due date moves to ${fmtDate(isoDate(addMonths(today(), m.frequencyMonths)))}.`, () => {
        m.lastDone = isoDate(today());
        commit(); toast('Service recorded — next due date updated'); reRender();
      }, {danger:false, label:'Mark done'});
    });
    $$('.mt-edit').forEach(b => b.onclick = e => { e.stopPropagation(); maintModal(db.maintenance.find(x=>x.id===b.dataset.m)); });
    $$('.mt-del').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const m = db.maintenance.find(x=>x.id===b.dataset.m);
      const c = customerById(m.customerId);
      askConfirm(`Delete the <b>${esc(m.equipment)}</b> plan for ${esc(c?c.name:'customer')}?`, () => {
        db.maintenance = db.maintenance.filter(x=>x.id!==m.id); commit(); reRender(); toast('Plan deleted');
      });
    });
    $$('#content tr[data-m]').forEach(tr => tr.onclick = e => { if(e.target.closest('button')) return; maintModal(db.maintenance.find(x=>x.id===tr.dataset.m)); });
  }
};

function maintModal(prefill){
  openModal(prefill.id ? 'Edit maintenance plan' : 'New maintenance plan', `
    <div class="form-grid">
      <div class="field span2"><label>Customer *</label>
        <select class="inp" id="mt-cust"><option value="">Select customer…</option>
        ${db.customers.map(c=>`<option value="${c.id}" ${prefill.customerId===c.id?'selected':''}>${esc(c.name)} — ${esc(c.area)}</option>`).join('')}</select></div>
      <div class="field"><label>Equipment</label>
        <select class="inp" id="mt-eq">
          ${EQUIPMENT_TYPES.map(e=>`<option ${prefill.equipment===e?'selected':''}>${e}</option>`).join('')}
        </select></div>
      <div class="field"><label>Frequency (months)</label>
        <select class="inp" id="mt-freq">
          ${[1,3,6,12,24].map(f=>`<option ${prefill.frequencyMonths===f?'selected':''}>${f}</option>`).join('')}
        </select></div>
      <div class="field"><label>Last serviced</label><input type="date" class="inp" id="mt-last" value="${prefill.lastDone || isoDate(addDays(today(),-30))}"></div>
      <div class="field"><label>Notes</label><input class="inp" id="mt-notes" value="${esc(prefill.notes||'')}" placeholder="What to check, parts on hand…"></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="mt-x">Cancel</button><button class="btn primary" id="mt-save">${prefill.id?'Save plan':'Create plan'}</button>`,
    onMount(){
      $('#mt-x').onclick = closeModal;
      $('#mt-save').onclick = () => {
        const custId = $('#mt-cust').value;
        if(!custId){ toast('Select a customer','warn'); return; }
        const data = {
          customerId:custId, equipment:$('#mt-eq').value,
          frequencyMonths:parseInt($('#mt-freq').value)||3,
          lastDone:$('#mt-last').value || isoDate(today()),
          notes:$('#mt-notes').value.trim()
        };
        if(prefill.id){ Object.assign(prefill, data); toast('Plan updated'); }
        else { db.maintenance.push({id:uid('m'), ...data}); toast('Maintenance plan created'); }
        commit(); closeModal(); reRender();
      };
    }
  });
}
