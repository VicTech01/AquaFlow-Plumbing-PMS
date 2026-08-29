'use strict';
/* ================= dashboard ================= */
VIEWS.dashboard = {
  title: () => 'Dashboard',
  render(){
    const t = isoDate(today());
    const monthKey = t.slice(0,7);
    const allPayments = db.invoices.flatMap(i => (i.payments||[]).map(p => ({d:p.date, a:p.amount})));
    const revMonth = sum(allPayments, p => p.d && p.d.slice(0,7) === monthKey ? p.a : 0);
    const outstanding = sum(db.invoices, invBalance);
    const overdueInvs = db.invoices.filter(i => invState(i).label === 'Overdue');
    const overdue = sum(overdueInvs, invBalance);
    const jobsToday = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status));
    const low = db.inventory.filter(i => i.qty <= i.reorder);
    const maintDue = db.maintenance
      .map(m => ({...m, next: nextDueDate(m)}))
      .filter(m => dayDiff(t, m.next) <= 14)
      .sort((a,b) => a.next.localeCompare(b.next));

    const months = [];
    for(let k=5;k>=0;k--){
      const d = addMonths(today(), -k);
      const key = isoDate(d).slice(0,7);
      const v = sum(allPayments, p => p.d && p.d.slice(0,7) === key ? p.a : 0);
      months.push({v, l: d.toLocaleDateString('en-KE',{month:'short'})});
    }
    const segs = [
      {label:'Paid', color:'#059669', value: sum(db.invoices.filter(i=>invState(i).label==='Paid'), invTotal)},
      {label:'Partial', color:'#d97706', value: sum(db.invoices.filter(i=>invState(i).label==='Partial'), invBalance)},
      {label:'Open', color:'#0284c7', value: sum(db.invoices.filter(i=>invState(i).label==='Open'), invBalance)},
      {label:'Overdue', color:'#dc2626', value: overdue}
    ];
    const upcoming = db.jobs
      .filter(j => !['Cancelled','Completed'].includes(j.status) && j.date >= t)
      .sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start))
      .slice(0,6);

    const kpi = (lab, val, sub, ic, cls) => `
      <div class="kpi"><div class="ic ${cls}">${icon(ic,17)}</div>
        <div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;

    return `
    <div class="kpis">
      ${kpi('Revenue (this month)', money(revMonth), `${allPayments.filter(p=>p.d&&p.d.slice(0,7)===monthKey).length} payments received`, 'cash','green')}
      ${kpi('Outstanding', money(outstanding), 'Across open invoices', 'receipt','blue')}
      ${kpi('Overdue', money(overdue), `${overdueInvs.length} invoice${overdueInvs.length===1?'':'s'} past due`, 'alert','red')}
      ${kpi('Jobs today', jobsToday.length, `${db.jobs.filter(j=>!['Cancelled'].includes(j.status)).length} active in pipeline`, 'calendar','amber')}
      ${kpi('Low stock', low.length, `${db.inventory.filter(i=>i.qty<=0).length} out of stock`, 'box','violet')}
      ${kpi('Maintenance due', maintDue.length, 'Within 14 days', 'wrench','gray')}
    </div>

    <div class="row mb16">
      <button class="btn primary" id="da-job">${icon('plus',15)} New job</button>
      <button class="btn ghost" id="da-quote">${icon('spark',15)} AI quotation</button>
      <button class="btn ghost" id="da-inv">${icon('receipt',15)} New invoice</button>
      <button class="btn ghost" id="da-pay">${icon('cash',15)} Record payment</button>
    </div>

    <div class="grid2">
      <div class="stack">
        <div class="card">
          <h3>${icon('calendar',15)} Jobs — next 7 days</h3>
          <div class="tbl-wrap"><table class="tbl">
            <tbody>
              ${upcoming.length ? upcoming.map(j => {
                const c = customerById(j.customerId);
                return `<tr class="click" data-job="${j.id}">
                  <td style="width:118px"><b>${fmtDateShort(j.date)}</b><div class="subrow">${j.start} · ${j.hours}h</div></td>
                  <td><b>${TYPE_EMOJI[j.type]||''} ${esc(j.title)}</b><div class="subrow">${esc(c?c.name:'—')} · ${esc(j.address || (c?c.area:''))}</div></td>
                  <td style="width:120px">${chip(j.status)}</td>
                </tr>`;
              }).join('') : `<tr><td class="empty">No upcoming jobs — enjoy the calm 🌤</td></tr>`}
            </tbody>
          </table></div>
        </div>
        <div class="card">
          <h3>${icon('cash',15)} Revenue collected — last 6 months</h3>
          ${areaChart(months.map(m=>m.v), months.map(m=>m.l))}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <h3>${icon('receipt',15)} Invoice value by status</h3>
          <div class="row" style="justify-content:center">
            ${donut(segs)}
          </div>
          <div class="dlegend mt12">
            ${segs.map(s => `<div class="r"><span class="dotc" style="background:${s.color}"></span>${s.label}<span class="v">${money(s.value)}</span></div>`).join('')}
          </div>
        </div>
        <div class="card">
          <h3>${icon('alert',15)} Low stock</h3>
          ${low.length ? low.slice(0,5).map(i => `
            <div class="spread" style="padding:6px 0;border-bottom:1px dashed #eef2f7">
              <div><b class="small">${esc(i.name)}</b><div class="subrow">${i.location}</div></div>
              ${chip(i.qty<=0?'Out of stock':'Low')}
            </div>`).join('') : '<div class="empty small">All stock levels healthy</div>'}
          <button class="btn ghost sm mt12" id="da-stock">Open inventory</button>
        </div>
        <div class="card">
          <h3>${icon('wrench',15)} Maintenance due</h3>
          ${maintDue.length ? maintDue.slice(0,4).map(m => {
            const c = customerById(m.customerId);
            const n = dayDiff(t, m.next);
            return `<div class="spread" style="padding:6px 0;border-bottom:1px dashed #eef2f7">
              <div><b class="small">${esc(m.equipment)}</b><div class="subrow">${esc(c?c.name:'—')}</div></div>
              ${chip(n<0?`Overdue ${-n}d`: n===0?'Due today':`In ${n}d`, n<0?'red': n<=7?'amber':'green')}
            </div>`;
          }).join('') : '<div class="empty small">Nothing due in the next 14 days</div>'}
          <button class="btn ghost sm mt12" id="da-maint">Open maintenance</button>
        </div>
      </div>
    </div>`;
  },
  mount(){
    $('#da-job').onclick = () => jobModal({});
    $('#da-quote').onclick = () => go('quote_edit', {});
    $('#da-inv').onclick = () => go('invoice_new', {});
    $('#da-pay').onclick = quickRecordPayment;
    $('#da-stock').onclick = () => go('inventory', {});
    $('#da-maint').onclick = () => go('maintenance', {});
    $$('#content tr[data-job]').forEach(tr => tr.onclick = () => openJobModal(tr.dataset.job));
  }
};
