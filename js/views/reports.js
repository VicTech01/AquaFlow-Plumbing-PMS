'use strict';
/* ================= reports: period-based business performance ================= */
let rpPeriod = 'month';

function reportPeriodRange(p){
  const t = today();
  const mk = s => isoDate(s);
  if(p === 'today') return {from: mk(t), to: mk(t)};
  if(p === 'week'){ const ws = startOfWeek(t); return {from: mk(ws), to: mk(addDays(ws,6))}; }
  if(p === 'month') return {from: mk(new Date(t.getFullYear(), t.getMonth(), 1)), to: mk(new Date(t.getFullYear(), t.getMonth()+1, 0))};
  if(p === 'year') return {from: mk(new Date(t.getFullYear(), 0, 1)), to: mk(new Date(t.getFullYear()+1, 0, 1))};
  return {from: '0000-01-01', to: '9999-12-31'}; // all time
}
function reportInRange(d, from, to){ return d >= from && d <= to; }

function reportStats(p){
  const {from, to} = reportPeriodRange(p);
  const t = isoDate(today());
  const nowD = today();
  let collected = 0;
  db.invoices.forEach(i => (i.payments||[]).forEach(pm => { if(reportInRange(pm.date||i.issued, from, to)) collected += pm.amount; }));
  const expenses = sum(db.expenses.filter(e => reportInRange(e.date, from, to)), e => e.amount);
  const outstanding = sum(db.invoices.filter(i => i.status !== 'Draft' && invBalance(i) > 0), invBalance);
  const pendingQuotes = sum(db.quotes.filter(q => q.status === 'Sent'), quoteTotal);
  const jobsDone = db.jobs.filter(j => j.status === 'Completed' && reportInRange(j.date, from, to)).length;
  const jobsActive = db.jobs.filter(j => ['Scheduled','Dispatched','In Progress'].includes(j.status)).length;
  const jobsCancelled = db.jobs.filter(j => j.status === 'Cancelled' && reportInRange(j.date, from, to)).length;
  // new vs returning customers (first job in period = new)
  const firstByCust = {};
  db.jobs.forEach(j => { const k = j.date; if(!firstByCust[j.customerId] || k < firstByCust[j.customerId]) firstByCust[j.customerId] = k; });
  let newC = 0, retC = 0;
  const custsInPeriod = new Set(db.jobs.filter(j => reportInRange(j.date, from, to) && j.status !== 'Cancelled').map(j => j.customerId));
  custsInPeriod.forEach(cid => { (firstByCust[cid] || '9999') > to ? (retC += 1) : (newC += 1); });
  // most-used materials: invoice material lines (with stock id) in period
  const matUse = {};
  db.invoices.forEach(i => { if(!reportInRange(i.issued, from, to)) return; i.items.forEach(it => {
    if(it.kind === 'Material' && it.invId){ matUse[it.invId] = (matUse[it.invId]||0) + (it.qty||0); }
  });});
  const topMats = Object.entries(matUse).map(([id, qty]) => ({item: invItemById(id), qty}))
    .filter(r => r.item).sort((a,b) => b.qty - a.qty).slice(0,8);
  // revenue vs expenses by month (last 6 months)
  const months = [...Array(6)].map((_,i) => {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - 5 + i, 1);
    const mk = monthKey(d);
    let rev = 0;
    db.invoices.forEach(inv => (inv.payments||[]).forEach(pm => { if(monthKey(new Date(pm.date || inv.issued)) === mk) rev += pm.amount; }));
    const exp = expMonthTotal(mk);
    return {label: d.toLocaleDateString('en-KE',{month:'short'}), rev, exp};
  });
  const topDebtors = Object.entries(
    db.invoices.filter(i => i.status !== 'Draft' && invBalance(i) > 0)
      .reduce((m,i) => { m[i.customerId] = (m[i.customerId]||0) + invBalance(i); return m; }, {})
  ).map(([cid, v]) => ({c: customerById(cid), v})).filter(r => r.c)
    .sort((a,b) => b.v - a.v).slice(0,5);
  return {from, to, collected, expenses, outstanding, pendingQuotes, jobsDone, jobsActive, jobsCancelled, newC, retC, topMats, months, topDebtors};
}

VIEWS.reports = {
  title: () => 'Reports',
  render(){
    const s = reportStats(rpPeriod);
    const periodLabels = {today:'Today', week:'This week', month:'This month', year:'This year', all:'All time'};
    const kpi = (lab, val, sub, cls) => `<div class="kpi"><div class="ic ${cls||'blue'}">${icon(cls==='green'?'cash':cls==='red'?'alert':cls==='amber'?'calendar':'doc',17)}</div><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub||''}</div></div>`;
    const net = s.collected - s.expenses;
    return `
    <div class="page-head">
      <div class="tabs">
        ${Object.entries(periodLabels).map(([k,l]) => `<button data-rp="${k}" class="${rpPeriod===k?'active':''}">${l}</button>`).join('')}
      </div>
      <span class="muted small">${fmtDate(s.from)} → ${s.to === '9999-12-31' ? 'today' : fmtDate(s.to)}</span>
    </div>

    <div class="kpis">
      ${kpi('Revenue (collected)', money(s.collected), 'payments received in period', 'green')}
      ${kpi('Expenses', money(s.expenses), 'business spending in period', 'red')}
      ${kpi('Net profit', money(net), net >= 0 ? 'revenue − expenses' : 'spending above income', net >= 0 ? 'green' : 'red')}
      ${kpi('Outstanding', money(s.outstanding), 'all unpaid invoices', 'amber')}
      ${kpi('Quotations pending', money(s.pendingQuotes), 'sent, awaiting approval', 'blue')}
      ${kpi('Jobs', `${s.jobsDone} / ${s.jobsActive}`, `completed in period / active now${s.jobsCancelled?` · ${s.jobsCancelled} cancelled`:''}`, 'amber')}
    </div>

    <div class="grid2">
      <div class="card">
        <h3>${icon('chart',15)} Revenue vs Expenses — last 6 months</h3>
        ${groupedBar(s.months.map(m=>m.rev), s.months.map(m=>m.exp), s.months.map(m=>m.label))}
      </div>
      <div class="card">
        <h3>${icon('users',15)} Customers in period</h3>
        <div class="row" style="gap:28px">
          <div><div class="bold" style="font-size:24px">${s.newC}</div><div class="muted small">New customers (first job in period)</div></div>
          <div><div class="bold" style="font-size:24px">${s.retC}</div><div class="muted small">Returning customers</div></div>
        </div>
        <h3 class="mt16">${icon('receipt',15)} Top outstanding (all time)</h3>
        ${s.topDebtors.length ? s.topDebtors.map(d => `<div class="r small" style="padding:4px 0"><span>${esc(d.c.name)}</span><b>${money(d.v)}</b></div>`).join('') : '<div class="muted small">No outstanding invoices 🎉</div>'}
      </div>
    </div>

    <div class="card mt12">
      <h3>${icon('box',15)} Most-used materials (billed via stock, in period)</h3>
      ${hbarList(s.topMats.map(m => ({label: m.item.name, value: m.qty, color:'#0f766e'})), {fmt: fmtInt})}
    </div>`;
  },
  mount(){
    $$('#content [data-rp]').forEach(b => b.onclick = () => { rpPeriod = b.dataset.rp; reRender(); });
  }
};
