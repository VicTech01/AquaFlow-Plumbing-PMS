'use strict';
/* ================= technician dispatch ================= */
VIEWS.dispatch = {
  title: () => 'Technician Dispatch',
  render(){
    const t = isoDate(today());
    const techs = db.technicians.filter(x=>x.active);
    const pending = db.jobs.filter(j => j.status === 'Scheduled' && j.date >= t)
      .sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    const active = db.jobs.filter(j => ['Dispatched','In Progress'].includes(j.status))
      .sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));

    const techCards = techs.map(tech => {
      const todays = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status) && (j.technicianIds||[]).includes(tech.id));
      const load = sum(todays, j=>j.hours);
      const cap = tech.hoursPerDay || 8;
      const pct = clamp(load/cap*100, 0, 100);
      const conflicts = todays.filter(j => jobConflicts(j).some(o => (o.technicianIds||[]).includes(tech.id)));
      return `
      <div class="card" style="padding:14px">
        <div class="row">
          <div class="avatar">${initials(tech.name)}</div>
          <div style="min-width:0">
            <b class="small">${esc(tech.name)}</b>
            <div class="subrow">${tech.role} · ${money(tech.rate)}/h</div>
          </div>
          <span class="chip c-${todays.length?'teal':'gray'}" style="margin-left:auto">${todays.length} job${todays.length===1?'':'s'} today</span>
        </div>
        <div class="row mt8 small muted" style="gap:4px;flex-wrap:wrap">
          ${tech.skills.map(s=>`<span class="chip c-gray">${esc(s)}</span>`).join('')}
        </div>
        <div class="spread small"><span class="muted">Today's load</span><b>${load}h / ${cap}h</b></div>
        <div class="loadbar"><i class="${load>cap?'over':''}" style="width:${pct}%"></i></div>
        ${conflicts.length ? `<div class="badge-warn mt8" style="margin-bottom:0">${icon('alert',14)} Overlap: ${conflicts.map(c=>c.ref).join(', ')}</div>` : ''}
        ${todays.length ? `<div class="subrow mt8">${todays.map(j=>`${j.start} ${esc(j.title)}`).join(' · ')}</div>` : '<div class="subrow mt8">No jobs assigned today</div>'}
      </div>`;
    }).join('');

    const pendingRows = pending.length ? pending.map(j => {
      const c = customerById(j.customerId);
      const techsAssigned = j.technicianIds || [];
      return `<tr>
        <td style="width:120px"><b>${fmtDateShort(j.date)}</b><div class="subrow">${j.start} · ${j.hours}h</div></td>
        <td><b>${esc(j.title)}</b><div class="subrow">${j.ref} · ${esc(c?c.name:'—')}, ${esc(c?c.area:'')}</div></td>
        <td style="min-width:190px">
          <div class="row" style="gap:5px;flex-wrap:wrap">
            ${db.technicians.filter(x=>x.active).map(x=>`
              <label class="chip c-${techsAssigned.includes(x.id)?'teal':'gray'}" style="cursor:pointer;margin:0">
                <input type="checkbox" class="dp-check" data-j="${j.id}" value="${x.id}" ${techsAssigned.includes(x.id)?'checked':''} style="display:none">
                ${esc(x.name.split(' ')[0])}
              </label>`).join('')}
          </div>
        </td>
        <td style="width:110px"><button class="btn primary sm dp-go" data-j="${j.id}">${icon('truck',14)} Dispatch</button></td>
      </tr>`;
    }).join('') : `<tr><td colspan="4" class="empty">Nothing waiting to dispatch 🎉</td></tr>`;

    const activeRows = active.length ? active.map(j => {
      const c = customerById(j.customerId);
      const techsAssigned = (j.technicianIds||[]).map(techById).filter(Boolean);
      return `<tr>
        <td style="width:120px"><b>${fmtDateShort(j.date)}</b><div class="subrow">${j.start} · ${j.hours}h</div></td>
        <td><b>${esc(j.title)}</b><div class="subrow">${j.ref} · ${esc(c?c.name:'—')}</div></td>
        <td>${techsAssigned.length?techsAssigned.map(t=>`<span class="chip c-gray">${esc(t.name)}</span>`).join(' '):'<span class="muted small">unassigned</span>'}</td>
        <td style="width:220px">
          ${j.status==='Dispatched'
            ? `<button class="btn green sm dp-start" data-j="${j.id}">▶ Start work</button> <button class="btn danger sm dp-cancel" data-j="${j.id}">Cancel</button>`
            : `<button class="btn primary sm dp-done" data-j="${j.id}">✓ Complete</button> <button class="btn danger sm dp-cancel" data-j="${j.id}">Cancel</button>`}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="4" class="empty">No crews out right now</td></tr>`;

    return `
    <div class="row mb16" style="flex-wrap:wrap">
      <div class="small badge-info" style="margin:0">${icon('truck',14)} <span><b>Dispatch flow:</b> Scheduled → Dispatched (technician notified) → In Progress → Completed (invoice ready).</span></div>
    </div>
    <div class="grid3 mb16">${techCards}</div>
    <div class="stack">
      <div class="card">
        <h3>${icon('clock',15)} Ready to dispatch <span class="chip c-indigo">${pending.length}</span></h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>When</th><th>Job</th><th>Assign crew</th><th></th></tr></thead>
          <tbody>${pendingRows}</tbody>
        </table></div>
      </div>
      <div class="card">
        <h3>${icon('send',15)} On the move <span class="chip c-sky">${active.length}</span></h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>When</th><th>Job</th><th>Crew</th><th>Actions</th></tr></thead>
          <tbody>${activeRows}</tbody>
        </table></div>
      </div>
    </div>`;
  },
  mount(){
    const dispatch = id => {
      const j = jobById(id);
      if(!j) return;
      const c = customerById(j.customerId);
      const checks = $$('.dp-check[data-j="'+id+'"]');
      j.technicianIds = checks.filter(ch=>ch.checked).map(ch=>ch.value);
      const tech = techById(j.technicianIds[0]);
      if(!j.technicianIds.length){ toast('Pick at least one technician first','warn'); return; }
      j.status = 'Dispatched';
      if(c) pushOutbox(c, 'Dispatch', waTemplateMsg('dispatch', {
        customer: c.name.split(' ')[0], tech: tech?tech.name:'our team',
        address: j.address || (c?c.address:'your site'), job: j.title,
        time: j.start, business: db.business.name
      }));
      commit();
      toast(`${j.ref} dispatched to ${tech?tech.name:'crew'}`);
      reRender();
    };
    $$('.dp-go').forEach(b => b.onclick = () => dispatch(b.dataset.j));
    $$('.dp-start').forEach(b => b.onclick = () => {
      const j = jobById(b.dataset.j);
      if(j){ j.status = 'In Progress'; commit(); toast(`${j.ref} — work started`); reRender(); }
    });
    $$('.dp-done').forEach(b => b.onclick = () => {
      const j = jobById(b.dataset.j);
      if(j) askConfirm(`Mark <b>${esc(j.title)}</b> complete? You can invoice it afterwards from Invoices → New invoice.`, () => {
        j.status = 'Completed'; commit();
        toast(`${j.ref} completed — ready to invoice`);
        reRender();
      }, {danger:false, label:'Mark complete'});
    });
    $$('.dp-cancel').forEach(b => b.onclick = () => {
      const j = jobById(b.dataset.j);
      if(j) askConfirm(`Cancel <b>${esc(j.title)}</b>?`, () => { j.status='Cancelled'; commit(); reRender(); });
    });
  }
};
