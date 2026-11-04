'use strict';
/* ================= dashboard v2 — decision-first =================
   Reading order follows how an owner actually runs the day:
     MONEY  → what did I make?
     ACTION → what needs me right now?
     WORK   → what is happening on site?
     SALES  → what is coming next?
     STOCK  → can I still do the work?
     DETAIL → trends, jobs, debtors, activity.
   Everything here is derived from the existing database — no new fields,
   no writes. The dashboard never changes business data. */
VIEWS.dashboard = {
  title: () => 'Dashboard',
  render(){
    const t = isoDate(today());
    const tm = isoDate(addDays(today(), 1));
    const mk = monthKey(today());
    const mkLast = monthKey(addMonths(today(), -1));
    const allPayments = db.invoices.flatMap(i => (i.payments||[]).map(p => ({d:p.date, a:p.amount, inv:i})));
    const payIn = (key, fn) => sum(allPayments.filter(p => p.d && p.d.slice(0,7) === key), p => fn ? fn(p) : p.a);

    /* ---------- MONEY ---------- */
    const revToday = payIn(mk, p => p.d === t ? p.a : 0);
    const startOfWeek_ = addDays(today(), -((today().getDay()+6)%7));
    const revWeek = sum(allPayments.filter(p => p.d >= isoDate(startOfWeek_) && p.d <= t), p => p.a);
    const revMonth = payIn(mk);
    const revLast = payIn(mkLast);
    const invoicedMonth = sum(db.invoices.filter(i => i.issued.slice(0,7) === mk), invTotal);
    const expMonth = expMonthTotal(mk);
    const expLast = expMonthTotal(mkLast);
    const net = revMonth - expMonth;
    const netLast = revLast - expLast;
    const outstanding = sum(db.invoices, invBalance);
    const overdueInvs = db.invoices.filter(i => invState(i).label === 'Overdue');
    const overdue = sum(overdueInvs, invBalance);
    const marginPct = revMonth > 0 ? Math.round(net / revMonth * 100) : 0;

    /* 6-month series (cash in, spend out, jobs done) */
    const months = [];
    for(let k=5;k>=0;k--){
      const d = addMonths(today(), -k);
      const key = monthKey(d);
      const rev = payIn(key);
      const ex = expMonthTotal(key);
      const done = sum(db.jobs.filter(j => j.status === 'Completed' && j.date.slice(0,7) === key), () => 1);
      months.push({key, rev, ex, done, net: rev - ex, l: d.toLocaleDateString('en-KE',{month:'short'})});
    }

    /* ---------- WORK ---------- */
    const jobsToday = db.jobs.filter(j => j.date === t && !['Cancelled','Completed'].includes(j.status));
    const jobsTomorrow = db.jobs.filter(j => j.date === tm && !['Cancelled','Completed'].includes(j.status));
    const jobsActive = db.jobs.filter(j => ['Scheduled','Dispatched','In Progress'].includes(j.status) && j.date >= t);
    const jobsOverdue = db.jobs.filter(j => !['Cancelled','Completed'].includes(j.status) && j.date < t);
    const jobsMonth = db.jobs.filter(j => j.date.slice(0,7) === mk && j.status !== 'Cancelled');
    const completedMonth = db.jobs.filter(j => j.status === 'Completed' && j.date.slice(0,7) === mk);
    const unassigned = db.jobs.filter(j => ['Scheduled','Dispatched'].includes(j.status) && j.date >= t && !(j.technicianIds||[]).length);

    /* ---------- SALES ---------- */
    const newLeads = db.leads.filter(l => l.status === 'New');
    const openLeads = db.leads.filter(l => !['Won','Lost'].includes(l.status));
    const sentQuotes = db.quotes.filter(q => q.status === 'Sent');
    const decidedQuotes = db.quotes.filter(q => ['Approved','Converted','Declined'].includes(q.status));
    const wonQuotes = db.quotes.filter(q => ['Approved','Converted'].includes(q.status));
    const approvalRate = decidedQuotes.length ? Math.round(wonQuotes.length / decidedQuotes.length * 100) : null;
    const pipelineValue = sum(openLeads, l => Number(l.budget)||0) + sum(sentQuotes, quoteTotal);

    /* ---------- STOCK & SERVICE ---------- */
    const low = db.inventory.filter(i => i.qty <= i.reorder);
    const outOfStock = db.inventory.filter(i => i.qty <= 0);
    const stockValue = sum(db.inventory, i => (i.qty||0) * (Number(i.cost)||Number(i.price)||0));
    const restocked = db.inventory.reduce((tot, it) => tot + (it.history||[])
      .filter(h => (h.delta||0) > 0 && String(h.at||'').slice(0,7) === mk)
      .reduce((s,h) => s + h.delta * (Number(it.cost)||Number(it.price)||0), 0), 0);
    const maintDue = db.maintenance
      .map(m => ({...m, next: nextDueDate(m)}))
      .filter(m => dayDiff(t, m.next) <= 14)
      .sort((a,b) => a.next.localeCompare(b.next));
    const waQueued = db.outbox.filter(o => !o.sent);

    /* ---------- revenue mix (this month's invoiced lines) ---------- */
    const mixItems = db.invoices.filter(i => String(i.issued||'').slice(0,7) === mk).flatMap(i => i.items||[]);
    const mix = breakdown(mixItems);
    const mixTotal = mix.labour + mix.materials + mix.transport;

    /* ---------- most profitable job types (invoiced jobs, by type) ---------- */
    const byType = {};
    db.jobs.forEach(j => {
      const inv = jobInvoice(j);
      if(!inv) return;
      const bal = invTotal(inv);
      byType[j.type] = (byType[j.type]||0) + bal;
    });
    const typeRows = Object.entries(byType).map(([k,v]) => ({label:k, value:v}))
      .sort((a,b) => b.value - a.value).slice(0,5);

    /* ---------- top debtors ---------- */
    const debtorMap = {};
    db.invoices.forEach(i => {
      const b = invBalance(i);
      if(b > 0 && i.status !== 'Draft') debtorMap[i.customerId] = (debtorMap[i.customerId]||0) + b;
    });
    const debtors = Object.entries(debtorMap).map(([cid,v]) => ({c: customerById(cid), v}))
      .filter(d => d.c).sort((a,b) => b.v - a.v).slice(0,4);

    const net6 = sum(months, m => m.net);
    const upcoming = db.jobs
      .filter(j => !['Cancelled','Completed'].includes(j.status) && j.date >= t)
      .sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start))
      .slice(0,6);

    const g = greeting();
    const nRem = (typeof reminders === 'function') ? reminders().length : 0;

    /* ---------- helpers ---------- */
    const kpi = (o) => `
      <div class="kpi ${o.k||''}">
        <div class="ic ${o.tone}">${icon(o.ic,17)}</div>
        <div class="lab">${o.lab}</div>
        <div class="val">${o.val}</div>
        <div class="sub">${o.sub||''}</div>
        ${o.spark||''}
      </div>`;
    /* Trend chip. Percentages lie when the previous value is 0 or negative
       (a swing from a loss to a profit is not "+616%"), so pass fmt=money to
       show the absolute change instead. */
    const delta = (cur, prev, {goodUp=true, suffix='%', fmt=null} = {}) => {
      if(prev === null || prev === undefined) return '';
      const up = cur > prev, flat = cur === prev;
      const good = goodUp ? !up === false || flat ? up || flat : up : !up;
      const cls = flat ? 'flat' : (goodUp ? (up ? 'up' : 'down') : (up ? 'down' : 'up'));
      const arrow = flat ? '' : icon(up ? 'trendUp' : 'trendDown', 11);
      if(fmt){
        if(flat) return `<span class="delta flat">no change</span>`;
        const d = cur - prev;
        return `<span class="delta ${cls}">${arrow}${d>0?'+':'−'}${fmt(Math.abs(d))}</span>`;
      }
      if(!prev){
        return cur > 0 ? `<span class="delta up">${icon('trendUp',11)} new</span>`
                       : `<span class="delta flat">no change</span>`;
      }
      const p = Math.round((cur - prev) / Math.abs(prev) * 100);
      return `<span class="delta ${cls}">${arrow}${Math.abs(p)}${suffix}</span>`;
    };
    const stat = (o) => `<button type="button" class="stat" data-goto="${o.go}" title="${esc(o.sub||'')}">
        <span class="ic ${o.tone}">${icon(o.ic,16)}</span>
        <span class="stat-b"><span class="stat-l">${o.lab}</span><span class="stat-v">${o.val}</span>
        ${o.sub?`<span class="stat-s">${o.sub}</span>`:''}</span>
      </button>`;
    const band = (label, note) => `<div class="band"><span class="band-l">${label}</span>
      <span class="band-line"></span>${note?`<span class="band-note">${note}</span>`:''}</div>`;

    /* ---------- ACTION REQUIRED (severity ordered) ---------- */
    const actions = [];
    if(overdueInvs.length) actions.push({tone:'bad', ic:'receipt', n:overdueInvs.length, t:'Overdue invoices', s:`${money(overdue)} outstanding past due date`, go:'invoices'});
    if(jobsOverdue.length) actions.push({tone:'bad', ic:'alert', n:jobsOverdue.length, t:'Jobs past their date', s:'not completed or cancelled — reschedule or close them off', go:'jobs'});
    if(sentQuotes.length) actions.push({tone:'ai', ic:'doc', n:sentQuotes.length, t:'Quotes awaiting approval', s:`${money(sum(sentQuotes, quoteTotal))} sitting with customers`, go:'quotes'});
    if(unassigned.length) actions.push({tone:'warn', ic:'truck', n:unassigned.length, t:'Jobs with no crew', s:'assign a technician before dispatch', go:'dispatch'});
    if(jobsToday.length) actions.push({tone:'info', ic:'calendar', n:jobsToday.length, t:`Job${jobsToday.length===1?'':'s'} today`, s:jobsToday.slice(0,2).map(j=>`${j.start} ${j.title}`).join(' · ') + (jobsToday.length>2?' …':''), go:'jobs'});
    if(jobsTomorrow.length) actions.push({tone:'info', ic:'clock', n:jobsTomorrow.length, t:'Scheduled tomorrow', s:'confirm with the customer on WhatsApp', go:'jobs'});
    if(low.length) actions.push({tone:'warn', ic:'box', n:low.length, t:'Materials below reorder level', s:`${outOfStock.length} out of stock · ${money(sum(low, i => (i.reorder - i.qty) * (Number(i.cost)||Number(i.price)||0)))} to restock`, go:'inventory'});
    if(maintDue.length) actions.push({tone:'warn', ic:'wrench', n:maintDue.length, t:'Maintenance visits due', s: maintDue[0] ? `${esc(maintDue[0].equipment||'Plan')} — ${dayDiff(t, maintDue[0].next) <= 0 ? 'overdue' : 'in ' + dayDiff(t, maintDue[0].next) + ' days'}` : '', go:'maintenance'});
    if(waQueued.length) actions.push({tone:'info', ic:'wa', n:waQueued.length, t:'WhatsApp messages queued', s:'ready to send from the outbox', go:'whatsapp'});

    const actionHTML = actions.length
      ? actions.slice(0,6).map(a => `<button type="button" class="action-item tone-${a.tone}" data-goto="${a.go}">
          <span class="aic">${icon(a.ic,16)}</span>
          <span class="atx"><b>${esc(a.t)}</b><span>${a.s||''}</span></span>
          <span class="an">${a.n}</span>${icon('arrowR',15)}
        </button>`).join('')
      : `<div class="empty mini">${icon('check',20)}<div class="mt8 bold ok">All clear — nothing needs your attention.</div>
         <div class="muted small">Overdue invoices, quotes, jobs, stock and maintenance all look healthy.</div></div>`;

    /* pipeline + activity for the admin strip */
    const stageCounts = PIPELINE.map((lbl, s) => db.jobs.filter(j => j.status !== 'Cancelled' && jobStage(j) === s).length);
    const acts = [];
    db.jobs.forEach(j => (j.timeline||[]).forEach(tl => acts.push({at: tl.at, text: `${j.ref} — ${tl.text}`})));
    acts.sort((a,b) => String(b.at).localeCompare(String(a.at)));
    const recentActs = acts.slice(0,7);

    return `
    <div class="greet card">
      <div style="min-width:0">
        <div class="row" style="align-items:center;flex-wrap:wrap">
          <h1 class="greet-h">${g.text} ${g.part==='morning'?'☀️':g.part==='afternoon'?'🌤':'🌙'}</h1>
          <span class="chip c-indigo role-chip plain" title="Signed in with full business access">👷 Admin</span>
          <button class="btn ghost sm" id="da-bell" style="margin-left:auto">${icon('bell',14)} Reminders${nRem ? ` <span class="bell-badge" style="position:static;display:inline-grid;border-color:transparent">${nRem}</span>` : ''}</button>
          <button class="btn ghost sm" id="da-search">${icon('search',14)} Search</button>
        </div>
        <div class="muted small">${fmtDateFull(t)} · ${jobsToday.length} job${jobsToday.length===1?'':'s'} on today's schedule · ${money(revToday)} collected today</div>
      </div>
      <div class="greet-mini">
        <div class="r"><span>Today</span><b>${money(revToday)}</b></div>
        <div class="r"><span>This week</span><b>${money(revWeek)}</b></div>
        <div class="r"><span>This month</span><b>${money(revMonth)}</b></div>
      </div>
    </div>

    ${band('Money', `${mk} · month to date`)}
    <div class="kpis kpis-4">
      ${kpi({k:'k-money', tone:'green', ic:'cash', lab:'Revenue (this month)', val:money(revMonth),
        sub:`${delta(revMonth, revLast)}<span>vs ${money(revLast)} last month</span>`,
        spark:sparkline(months.map(m=>m.rev), {color:'#059669'})})}
      ${kpi({k:'k-cost', tone:'red', ic:'alert', lab:'Expenses (this month)', val:money(expMonth),
        sub:`${delta(expMonth, expLast, {goodUp:false})}<span>last month ${money(expLast)}</span>`,
        spark:sparkline(months.map(m=>m.ex), {color:'#dc2626'})})}
      ${kpi({k:'k-profit', tone: net>=0?'blue':'red', ic:'spark', lab:'Net profit', val:money(net),
        sub:`${delta(net, netLast, {fmt:money})}<span>${net>=0 ? marginPct+'% margin' : 'spending above income'}</span>`,
        spark:sparkline(months.map(m=>m.net), {color: net>=0?'#0284c7':'#dc2626'})})}
      ${kpi({k:'k-due', tone:'amber', ic:'receipt', lab:'Outstanding', val:money(outstanding),
        sub:`<span>${overdueInvs.length} overdue · ${money(overdue)}</span>`})}
    </div>

    <div class="grid2">
      <div class="card">
        <h3>${icon('target',15)} Action required
          ${actions.length ? `<span class="chip c-red plain" style="margin-left:auto">${actions.length}</span>` : `<span class="chip c-green plain" style="margin-left:auto">clear</span>`}</h3>
        <div class="action-list">${actionHTML}</div>
      </div>
      <div class="card">
        <h3>${icon('chart',15)} Pipeline at a glance</h3>
        <div class="pipe-strip">
          ${PIPELINE.map((lbl, s) => `<div class="pipe-cell ${stageCounts[s]?'has':''} ${s===5?'paid':''}">
            <div class="pipe-n">${stageCounts[s]}</div><div class="pipe-l">${lbl}</div>
          </div>`).join('')}
        </div>
        <div class="muted small mt8">Live count of jobs per stage — Quote → Paid</div>
        <div class="row mt12" style="flex-wrap:wrap">
          <button class="btn primary sm" id="da-job">${icon('plus',14)} New job</button>
          <button class="btn ghost sm" id="da-quote">${icon('spark',14)} AI quotation</button>
          <button class="btn ghost sm" id="da-pay">${icon('cash',14)} Collect payment</button>
        </div>
        <div class="row mt8" style="flex-wrap:wrap">
          <button class="btn ghost sm" id="da-lead">${icon('userPlus',14)} New lead</button>
          <button class="btn ghost sm" id="da-exp">${icon('cash',14)} Record expense</button>
        </div>
      </div>
    </div>

    ${band('Work', `${jobsActive.length} live jobs`)}
    <div class="stat-row">
      ${stat({tone:'blue', ic:'calendar', lab:"Today's jobs", val:jobsToday.length, sub:jobsToday.length?`next ${jobsToday[0].start}`:'nothing scheduled', go:'jobs'})}
      ${stat({tone:'indigo', ic:'truck', lab:'Active', val:jobsActive.length, sub:`${unassigned.length} without a crew`, go:'dispatch'})}
      ${stat({tone:'green', ic:'check', lab:'Completed', val:completedMonth.length, sub:`of ${jobsMonth.length} this month`, go:'jobs'})}
      ${stat({tone: jobsOverdue.length?'red':'gray', ic:'alert', lab:'Overdue', val:jobsOverdue.length, sub:jobsOverdue.length?'past date, still open':'all jobs on time', go:'jobs'})}
    </div>

    ${band('Sales', approvalRate===null ? 'no decided quotes yet' : `${approvalRate}% quote win rate`)}
    <div class="stat-row">
      ${stat({tone:'blue', ic:'userPlus', lab:'New leads', val:newLeads.length, sub:`${openLeads.length} open in total`, go:'leads'})}
      ${stat({tone:'violet', ic:'doc', lab:'Quotations pending', val:sentQuotes.length, sub:money(sum(sentQuotes, quoteTotal)), go:'quotes'})}
      ${stat({tone:'green', ic:'target', lab:'Approval rate', val:approvalRate===null?'—':approvalRate+'%', sub:`${wonQuotes.length} won · ${decidedQuotes.length-wonQuotes.length} declined`, go:'reports'})}
      ${stat({tone:'amber', ic:'wallet', lab:'Pipeline value', val:money(pipelineValue), sub:'open leads + sent quotes', go:'leads'})}
    </div>

    ${band('Stock & service', `${db.inventory.length} materials tracked`)}
    <div class="stat-row">
      ${stat({tone: low.length?'amber':'green', ic:'box', lab:'Low stock', val:low.length, sub:`${outOfStock.length} out of stock`, go:'inventory'})}
      ${stat({tone:'teal', ic:'wallet', lab:'Stock value', val:money(stockValue), sub:restocked>0?`${money(restocked)} restocked this month`:'at purchase cost', go:'inventory'})}
      ${stat({tone: maintDue.length?'amber':'gray', ic:'wrench', lab:'Maintenance due', val:maintDue.length, sub:'within 14 days', go:'maintenance'})}
      ${stat({tone: waQueued.length?'blue':'gray', ic:'wa', lab:'Messages to send', val:waQueued.length, sub:'WhatsApp outbox', go:'whatsapp'})}
    </div>

    ${band('Trends', 'last 6 months')}
    <div class="grid-eq charts2">
      <div class="card">
        <h3>${icon('cash',15)} Revenue vs Expenses — last 6 months</h3>
        ${groupedBar(months.map(m=>m.rev), months.map(m=>m.ex), months.map(m=>m.l))}
        <div class="spread small muted mt8"><span>Net (6mo): <b class="${net6>=0?'ok':'bad'}">${money(net6)}</b></span><span>${money(sum(months,m=>m.rev))} in · ${money(sum(months,m=>m.ex))} out</span></div>
      </div>
      <div class="card">
        <h3>${icon('trendUp',15)} Cash collected — trend</h3>
        ${areaChart(months.map(m=>m.rev), months.map(m=>m.l), {color:'#0284c7', h:200})}
        <div class="spread small muted mt8"><span>Best month: <b>${money(Math.max(...months.map(m=>m.rev)))}</b></span><span>6-month total ${money(sum(months,m=>m.rev))}</span></div>
      </div>
      <div class="card">
        <h3>${icon('wrench',15)} Jobs completed — last 6 months</h3>
        ${barChart(months.map(m=>m.done), months.map(m=>m.l), {color:'#0d9488'})}
      </div>
      <div class="card">
        <h3>${icon('layers',15)} Revenue mix — invoiced this month</h3>
        ${mixTotal > 0 ? `<div class="row" style="gap:20px;align-items:center;flex-wrap:wrap">
          ${donut([
            {label:'Labour', value:mix.labour, color:'#0284c7'},
            {label:'Materials', value:mix.materials, color:'#0d9488'},
            {label:'Transport', value:mix.transport, color:'#7c3aed'}
          ], {size:158, thick:22, centerTop:money(mixTotal).replace(/^[A-Za-z]+\s*/,''), centerSub:'invoiced this month'})}
          <div class="dlegend" style="flex:1;min-width:150px">
            <div class="r"><i class="dotc" style="background:#0284c7"></i>Labour<b class="v">${money(mix.labour)}</b></div>
            <div class="r"><i class="dotc" style="background:#0d9488"></i>Materials<b class="v">${money(mix.materials)}</b></div>
            <div class="r"><i class="dotc" style="background:#7c3aed"></i>Transport<b class="v">${money(mix.transport)}</b></div>
          </div></div>`
        : '<div class="empty mini">No invoices issued this month yet.</div>'}
      </div>
    </div>

    <div class="grid-eq">
      <div class="card">
        <h3>${icon('spark',15)} Most profitable job types</h3>
        ${hbarList(typeRows, {fmt:money, color:'#0284c7'})}
        <div class="muted small mt8">By invoiced value, linked jobs</div>
      </div>
      <div class="card">
        <h3>${icon('receipt',15)} Outstanding payments — top debtors</h3>
        ${debtors.length ? debtors.map(d => `
          <div class="spread" style="padding:7px 0;border-bottom:1px dashed var(--border-soft)">
            <div><b class="small">${esc(d.c.name)}</b><div class="subrow">${esc(d.c.area)} · ${esc(d.c.phone)}</div></div>
            <div class="row" style="gap:6px"><b class="bad">${money(d.v)}</b>
              <a class="btn icon wa" target="_blank" rel="noopener" href="${waLink(d.c.phone, waTemplateMsg('payment_reminder', {customer:d.c.name.split(' ')[0], ref:'an open invoice', balance:money(d.v), due:'the due date', business:db.business.name}))}" title="Nudge on WhatsApp">${icon('wa',13)}</a>
            </div>
          </div>`).join('') : '<div class="empty small">Nothing outstanding 🎉</div>'}
      </div>
    </div>

    <div class="grid2 mt16">
      <div class="card">
        <h3>${icon('calendar',15)} Jobs — next 7 days</h3>
        <div class="tbl-wrap"><table class="tbl stick">
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
      <div class="stack">
        <div class="card">
          <h3>${icon('clock',15)} Recent activity</h3>
          ${recentActs.length ? recentActs.map(a => {
            const d = new Date(a.at);
            return `<div class="tl-item"><span class="tl-dot"></span><div>
              <div class="tl-text">${esc(a.text)}</div>
              <div class="muted small">${d.toLocaleDateString('en-KE',{day:'numeric',month:'short'})} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}</div>
            </div></div>`;
          }).join('') : '<div class="empty small">Job activity (schedule, dispatch, completion, payments…) will appear here.</div>'}
          <div class="muted small mt8">Auto-logged from the job timeline</div>
        </div>
        <div class="card">
          <h3>${icon('wrench',15)} Maintenance due</h3>
          ${maintDue.length ? maintDue.slice(0,4).map(m => {
            const c = customerById(m.customerId);
            const n = dayDiff(t, m.next);
            return `<div class="spread" style="padding:6px 0;border-bottom:1px dashed var(--border-soft)">
              <div><b class="small">${esc(m.equipment)}</b><div class="subrow">${esc(c?c.name:'—')}</div></div>
              ${chip(n<0?`Overdue ${-n}d`: n===0?'Due today':`In ${n}d`, n<0?'red': n<=7?'amber':'green')}
            </div>`;
          }).join('') : '<div class="empty small">Nothing due in the next 14 days</div>'}
          <div class="row mt12" style="gap:8px">
            <button class="btn ghost sm" id="da-maint">Open maintenance</button>
            <button class="btn ghost sm" id="da-stock">Open inventory</button>
          </div>
        </div>
      </div>
    </div>`;
  },
  mount(){
    const on = (id, fn) => { const el = document.getElementById(id); if(el) el.onclick = fn; };
    on('da-job', () => jobModal({}));
    on('da-lead', () => go('leads', {}));
    on('da-quote', () => go('quote_edit', {}));
    on('da-exp', () => go('expenses', {}));
    on('da-pay', quickRecordPayment);
    on('da-stock', () => go('inventory', {}));
    on('da-maint', () => go('maintenance', {}));
    on('da-bell', reminderSheet);
    on('da-search', () => (typeof cmdkOpen === 'function') ? cmdkOpen() : toast('Search is unavailable','warn'));
    $$('#content [data-goto]').forEach(b => b.onclick = () => go(b.dataset.goto, {}));
    $$('#content tr[data-job]').forEach(tr => tr.onclick = () => openJobModal(tr.dataset.job));
  }
};
