'use strict';
/* ================= expenses: P&L side of the business ================= */
const EXP_CATEGORIES = ['Materials purchase','Fuel','Vehicle','Tools','Subcontractor','Shop rent','Utilities','Other'];

VIEWS.expenses = {
  title: () => 'Expenses',
  render(){
    const mk = monthKey(today());
    const mkLast = monthKey(addMonths(today(), -1));
    const thisM = expMonthTotal(mk);
    const lastM = expMonthTotal(mkLast);
    const all = db.expenses.slice().sort((a,b) => b.date.localeCompare(a.date));
    const totalAll = sum(db.expenses, e => e.amount);
    const revM = sum(db.invoices.flatMap(i => i.payments||[]).filter(p => (p.date||'').slice(0,7) === mk), p => p.amount);

    const catMap = {};
    db.expenses.filter(e => e.date.slice(0,7) === mk).forEach(e => { catMap[e.category] = (catMap[e.category]||0) + e.amount; });
    const catRows = Object.entries(catMap).map(([k,v]) => ({label:k, value:v})).sort((a,b) => b.value - a.value);

    const kpi = (lab, val, sub, cls) => `
      <div class="kpi"><div class="lab">${lab}</div><div class="val ${cls||''}">${val}</div><div class="sub">${sub}</div></div>`;

    return `
    <div class="kpis">
      ${kpi('This month', money(thisM), `${new Date().toLocaleDateString('en-KE',{month:'long'})} to date`,'')}
      ${kpi('Last month', money(lastM), 'for comparison','')}
      ${kpi('All time', money(totalAll), `${db.expenses.length} expenses recorded`,'')}
      ${kpi('Margin this month', revM ? Math.round((revM-thisM)/revM*100) + '%' : '—', `${money(revM)} revenue collected`,'ok')}
    </div>
    <div class="row mb16">
      <button class="btn primary" id="ex-new">${icon('plus',15)} Record expense</button>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>${icon('doc',15)} This month by category</h3>
        ${hbarList(catRows, {fmt:money, color:'#dc2626'})}
      </div>
      <div class="card">
        <h3>${icon('receipt',15)} All expenses</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>
            ${all.length ? all.map(e => `
              <tr>
                <td class="resp-sm">${fmtDateShort(e.date)}</td>
                <td class="resp-sm"><span class="chip c-${expCatChip(e.category)}">${esc(e.category)}</span></td>
                <td>${esc(e.description)}</td>
                <td class="num bold">${money(e.amount)}</td>
                <td><button class="btn icon ghost ex-del" data-e="${e.id}" title="Delete">✕</button></td>
              </tr>`).join('') : '<tr><td colspan="5" class="empty">No expenses recorded yet</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>`;
  },
  mount(){
    $('#ex-new').onclick = () => expModal(null);
    $$('#content .ex-del').forEach(b => b.onclick = () => {
      const e = db.expenses.find(x => x.id === b.dataset.e);
      if(!e) return;
      askConfirm(`Delete expense <b>${esc(e.description)}</b> (${money(e.amount)})?`, () => {
        db.expenses = db.expenses.filter(x => x.id !== e.id); commit(); reRender(); toast('Expense deleted');
      });
    });
  }
};

function expCatChip(cat){
  const map = {'Materials purchase':'blue','Fuel':'amber','Vehicle':'gray','Tools':'violet','Subcontractor':'sky','Shop rent':'red','Utilities':'green','Other':'gray'};
  return map[cat] || 'gray';
}

function expModal(exp){
  const isE = !!exp;
  openModal(isE ? 'Edit expense' : 'Record expense', `
    <div class="form-grid">
      <div class="field"><label>Date *</label><input type="date" class="inp" id="ef-date" value="${exp ? exp.date : isoDate(today())}"></div>
      <div class="field"><label>Category *</label>
        <select class="inp" id="ef-cat">${EXP_CATEGORIES.map(c=>`<option ${exp&&exp.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field span2"><label>Description *</label>
        <input class="inp" id="ef-desc" value="${esc(exp?exp.description:'')}" placeholder="e.g. PPR pipe bulk order — Harambee Traders"></div>
      <div class="field"><label>Amount (KES) *</label>
        <input class="inp" id="ef-amt" type="number" min="0" step="50" value="${exp?exp.amount:''}"></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="ef-x">Cancel</button><button class="btn primary" id="ef-save">${isE?'Save changes':'Record expense'}</button>`,
    onMount(){
      $('#ef-x').onclick = closeModal;
      $('#ef-save').onclick = () => {
        const date = $('#ef-date').value;
        const description = $('#ef-desc').value.trim();
        const amount = parseFloat($('#ef-amt').value) || 0;
        if(!date || !description || amount <= 0){ toast('Date, description and amount are required','warn'); return; }
        const data = {date, category:$('#ef-cat').value, description, amount};
        if(isE){ Object.assign(exp, data); commit(); closeModal(); reRender(); toast('Expense updated'); }
        else { db.expenses.unshift(Object.assign({id:uid('e')}, data)); commit(); closeModal(); reRender(); toast(`Expense recorded: ${money(amount)}`); }
      };
    }
  });
}
