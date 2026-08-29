'use strict';
/* ================= dashboard: business OS (income, expenses, net profit, pipeline) ================= */
VIEWS.dashboard = {
  title: () => 'Dashboard',
  render(){
    const t = isoDate(today());
    const mk = monthKey(today());
    const mkLast = monthKey(addMonths(today(), -1));
    const allPayments = db.invoices.flatMap(i => (i.payments||[]).map(p => ({d:p.date, a:p.amount, inv:i})));
    const payIn = (key, fn) => sum(allPayments.filter(p => p.d && p.d.slice(0,7) === key), p => fn ? fn(p) : p.a);

    const revToday = payIn(mk, p => p.d === t ? p.a : 0);
    const startOfWeek_ = addDays(today(), -((today().getDay()+6)%7));
    const revWeek = sum(allPayments.filter(p => p.d >= isoDate(startOfWeek_) && p.d <= t), p => p.a);
    const revMonth = payIn(mk);
    const invoicedMonth = sum(db.invoices.filter(i => i.issued.slice(0,7) === mk), invTotal);
    const expMonth = expMonthTotal(mk);
    const expLast = expMonthTotal(mkLast);
    const net = revMonth - expMonth;
    const outstanding = sum(db.invoices, invBalance);
    const overdueInvs = db.invoices.filter(i => invState(i).label === 'Overdue');
    const overdue = sum(overdueInvs, invBalance);
    const jobsToday = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status));
    const jobsMonth = db.jobs.filter(j => j.date.slice(0,7) === mk && j.status !== 'Cancelled');
    const completedMonth = db.jobs.filter(j => j.status === 'Completed' && j.date.slice(0,7) === mk);
    const low = db.inventory.filter(i => i.qty <= i.reorder);
    const maintDue = db.maintenance
      .map(m => ({...m, next: nextDueDate(m)}))
      .filter(m => dayDiff(t, m.next) <= 14)
      .sort((a,b) => a.next.localeCompare(b.next));

    /* 6-month series */
    const months = [];
    for(let k=5;k>=0;k--){
      const d = addMonths(today(), -k);
      const key = monthKey(d);
      const rev = payIn(key);
      const ex = expMonthTotal(key);
      const done = sum(db.jobs.filter(j => j.status === 'Completed' && j.date.slice(0,7) === key), () => 1);
      months.push({key, rev, ex, done, l: d.toLocaleDateString('en-KE',{month:'short'})});
    }

    /* most profitable job types (invoiced jobs, by type) */
    const byType = {};
    db.jobs.forEach(j => {
      const inv = jobInvoice(j);
      if(!inv) return;
      const bal = invTotal(inv);
      byType[j.type] = (byType[j.type]||0) + bal;
    });
    const typeRows = Object.entries(byType).map(([k,v]) => ({label:k, value:v}))
      .sort((a,b) => b.value - a.value).slice(0,5);

    /* top debtors */
    const debtorMap = {};
    db.invoices.forEach(i => {
      const b = invBalance(i);
      if(b > 0 && i.status !== 'Draft') debtorMap[i.customerId] = (debtorMap[i.customerId]||0) + b;
    });
    const debtors = Object.entries(debtorMap).map(([cid,v]) => ({c: customerById(cid), v}))
      .filter(d => d.c).sort((a,b) => b.v - a.v).slice(0,4);
    const net6 = sum(months, m => m.rev - m.ex);
    const upcoming = db.jobs
      .filter(j => !['Cancelled','Completed'].includes(j.status) && j.date >= t)
      .sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start))
      .slice(0,6);

    const g = greeting();
    const kpi = (lab, val, sub, ic, cls) => `
      <div class="kpi"><div class="ic ${cls}">${icon(ic,17)}</div>
        <div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;

    return `
    <div class="greet card">
      <div>
        <h1 class="greet-h">${g.text} ${g.part==='morning'?'☀️':g.part==='afternoon'?'🌤':'🌙'}</h1>
        <div class="muted small">${fmtDateFull(t)} · ${jobsToday.length} job${jobsToday.length===1?'':'s'} on today's schedule · ${money(revToday)} collected today</div>
      </div>
      <div class="greet-mini">
        <div class="r"><span>Today</span><b>${money(revToday)}</b></div>
        <div class="r"><span>This week</span><b>${money(revWeek)}</b></div>
        <div class="r"><span>This month</span><b>${money(revMonth)}</b></div>
      </div>
    </div>

    <div class="kpis">
      ${kpi('Revenue (this month)', money(revMonth), `invoiced ${money(invoicedMonth)}`, 'cash','green')}
      ${kpi('Expenses (this month)', money(expMonth), `last month ${money(expLast)}`, 'alert','red')}
      ${kpi('Net profit', money(net), net>=0?'revenue − expenses':'spending above income','spark', net>=0?'green':'red')}
      ${kpi('Outstanding', money(outstanding), `${overdueInvs.length} overdue · ${money(overdue)}`, 'receipt','blue')}
      ${kpi('Jobs this month', jobsMonth.length, `${completedMonth.length} completed`, 'calendar','amber')}
      ${kpi('Low stock', low.length, `${db.inventory.filter(i=>i.qty<=0).length} out of stock`, 'box','violet')}
      ${kpi('Quotations pending', money(sum(db.quotes.filter(q=>q.status==='Sent'), quoteTotal)), `${db.quotes.filter(q=>q.status==='Sent').length} awaiting approval`, 'doc','violet')}
    </div>

    <div class="row mb16">
      <button class="btn primary" id="da-job">${icon('plus',15)} New job</button>
      <button class="btn ghost" id="da-lead">${icon('userPlus',15)} New lead</button>
      <button class="btn ghost" id="da-quote">${icon('spark',15)} AI quotation</button>
      <button class="btn ghost" id="da-exp">${icon('cash',15)} Record expense</button>
      <button class="btn ghost" id="da-pay">${icon('cash',15)} Record payment</button>
    </div>

    <div class="grid2 charts2">
      <div class="card">
        <h3>${icon('cash',15)} Revenue vs Expenses — last 6 months</h3>
        ${groupedBar(months.map(m=>m.rev), months.map(m=>m.ex), months.map(m=>m.l))}
        <div class="spread small muted mt8"><span>Net (6mo): <b class="${net6>=0?'ok':'bad'}">${money(net6)}</b></span><span>${money(sum(months,m=>m.rev))} in · ${money(sum(months,m=>m.ex))} out</span></div>
      </div>
      <div class="card">
        <h3>${icon('wrench',15)} Jobs completed — last 6 months</h3>
        ${barChart(months.map(m=>m.done), months.map(m=>m.l))}
      </div>
      <div class="card">
        <h3>${icon('spark',15)} Most profitable job types</h3>
        ${hbarList(typeRows, {fmt:money})}
        <div class="muted small mt8">By invoiced value, linked jobs</div>
      </div>
      <div class="card">
        <h3>${icon('receipt',15)} Outstanding payments — top debtors</h3>
        ${debtors.length ? debtors.map(d => `
          <div class="spread" style="padding:7px 0;border-bottom:1px dashed #eef2f7">
            <div><b class="small">${esc(d.c.name)}</b><div class="subrow">${esc(d.c.area)} · ${esc(d.c.phone)}</div></div>
            <div class="row" style="gap:6px"><b class="bad">${money(d.v)}</b>
              <a class="btn icon wa" target="_blank" rel="noopener" href="${waLink(d.c.phone, waTemplateMsg('payment_reminder', {customer:d.c.name.split(' ')[0], ref:'an open invoice', balance:money(d.v), due:'the due date', business:db.business.name}))}" title="Nudge on WhatsApp">${icon('wa',13)}</a>
            </div>
          </div>`).join('') : '<div class="empty small">Nothing outstanding 🎉</div>'}
      </div>
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
      </div>
      <div class="stack">
        <div class="card">
          <h3>${icon('alert',15)} Low stock</h3>
          ${low.length ? low.slice(0,5).map(i => `
            <div class="spread" style="padding:6px 0;border-bottom:1px dashed #eef2f7">
              <div><b class="small">${esc(i.name)}</b><div class="subrow">${i.location} · ${i.qty} ${esc(i.unit)} left</div></div>
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
    $('#da-lead').onclick = () => go('leads', {});
    $('#da-quote').onclick = () => go('quote_edit', {});
    $('#da-exp').onclick = () => go('expenses', {});
    $('#da-pay').onclick = quickRecordPayment;
    $('#da-stock').onclick = () => go('inventory', {});
    $('#da-maint').onclick = () => go('maintenance', {});
    $$('#content tr[data-job]').forEach(tr => tr.onclick = () => openJobModal(tr.dataset.job));
  }
};
