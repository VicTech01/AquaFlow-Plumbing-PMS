'use strict';
/* ================= inventory ================= */
let invQ = '';
let invCat = '';

VIEWS.inventory = {
  title: () => 'Inventory',
  render(){
    const stock = db.inventory.filter(i =>
      (!invQ || (i.name+i.sku).toLowerCase().includes(invQ.toLowerCase())) &&
      (!invCat || i.category === invCat));
    const value = sum(db.inventory, i => i.qty * i.cost);
    const low = db.inventory.filter(i => i.qty > 0 && i.qty <= i.reorder);
    const out = db.inventory.filter(i => i.qty <= 0);
    const cats = [...new Set(db.inventory.map(i=>i.category))];
    return `
    <div class="kpis">
      <div class="kpi"><div class="ic blue">${icon('box',17)}</div><div class="lab">Items</div><div class="val">${db.inventory.length}</div><div class="sub">${cats.length} categories</div></div>
      <div class="kpi"><div class="ic green">${icon('cash',17)}</div><div class="lab">Stock value (cost)</div><div class="val">${money(value)}</div><div class="sub">At retail: ${money(sum(db.inventory,i=>i.qty*i.price))}</div></div>
      <div class="kpi"><div class="ic amber">${icon('alert',17)}</div><div class="lab">Low stock</div><div class="val">${low.length}</div><div class="sub">At or below reorder level</div></div>
      <div class="kpi"><div class="ic red">${icon('x',17)}</div><div class="lab">Out of stock</div><div class="val">${out.length}</div><div class="sub">Needs reordering now</div></div>
    </div>
    ${(low.length || out.length) ? `
    <div class="badge-warn mb16">${icon('alert',15)}
      <div>
        ${out.length ? `<b>Out of stock:</b> ${out.map(i=>esc(i.name)).join(', ')}. ` : ''}
        ${low.length ? `<b>Low stock:</b> ${low.map(i=>esc(i.name)).join(', ')}. Consider reordering before jobs that need these parts.` : ''}
      </div>
    </div>` : ''}
    <div class="card">
      <div class="page-head" style="margin-bottom:12px">
        <div class="row" style="flex-wrap:wrap">
          <input class="inp search-inp" id="iv-q" placeholder="Search item or SKU…" value="${esc(invQ)}">
          <select class="inp" id="iv-cat" style="max-width:190px">
            <option value="">All categories</option>
            ${cats.map(c=>`<option ${invCat===c?'selected':''}>${esc(c)}</option>`).join('')}
          </select>
        </div>
        <button class="btn primary" id="iv-new">${icon('plus',15)} Add item</button>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Item</th><th class="resp-sm">SKU</th><th class="resp-md">Category</th><th class="num">In stock</th><th class="num resp-sm">Reorder at</th><th class="num resp-sm">Unit cost</th><th class="num">Sale price</th><th class="num resp-sm">Value</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${stock.length ? stock.map(i=>{
            const st = i.qty<=0 ? 'Out of stock' : i.qty<=i.reorder ? 'Low' : 'In stock';
            return `<tr class="click" data-i="${i.id}">
              <td><b>${esc(i.name)}</b><div class="subrow">${esc(i.location||'')}${i.category?` · ${esc(i.category)}`:''}</div></td>
              <td class="muted resp-sm">${esc(i.sku||'—')}</td>
              <td class="resp-md">${esc(i.category||'—')}</td>
              <td class="num bold">${i.qty} <span class="muted small">${esc(i.unit||'')}</span></td>
              <td class="num resp-sm">${i.reorder}</td>
              <td class="num resp-sm">${money(i.cost)}</td>
              <td class="num">${money(i.price)}</td>
              <td class="num resp-sm">${money(i.qty*i.cost)}</td>
              <td>${chip(st)}</td>
              <td class="row" style="gap:4px">
                <button class="btn icon ghost iv-adj" data-i="${i.id}" title="Adjust stock">${icon('edit',14)}</button>
                <button class="btn icon ghost iv-edit" data-i="${i.id}" title="Edit">${icon('doc',14)}</button>
                <button class="btn icon ghost iv-del" data-i="${i.id}" title="Delete">${icon('trash',14)}</button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="10" class="empty">No items match</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
  },
  mount(){
    $('#iv-new').onclick = () => itemModal({});
    $('#iv-q').oninput = e => { invQ = e.target.value; reRender(); setTimeout(()=>{const el=$('#iv-q'); el.focus(); el.setSelectionRange(el.value.length,el.value.length);},0); };
    $('#iv-cat').onchange = e => { invCat = e.target.value; reRender(); };
    $$('#content tr[data-i]').forEach(tr => {
      tr.onclick = e => { if(e.target.closest('button')) return; itemModal(invItemById(tr.dataset.i)); };
    });
    $$('.iv-adj').forEach(b => b.onclick = e => { e.stopPropagation(); adjustModal(invItemById(b.dataset.i)); });
    $$('.iv-edit').forEach(b => b.onclick = e => { e.stopPropagation(); itemModal(invItemById(b.dataset.i)); });
    $$('.iv-del').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const it = invItemById(b.dataset.i);
      askConfirm(`Delete <b>${esc(it.name)}</b> from inventory?`, () => {
        db.inventory = db.inventory.filter(x=>x.id!==it.id); commit(); reRender(); toast('Item deleted');
      });
    });
  }
};

function itemModal(prefill){
  const cats = ['Pipes & fittings','Fixtures','Geysers & heating','Pumps & motors','Consumables','Tools'];
  openModal(prefill.id ? 'Edit item' : 'Add inventory item', `
    <div class="form-grid">
      <div class="field span2"><label>Name *</label><input class="inp" id="it-name" value="${esc(prefill.name||'')}" placeholder="e.g. PVC pipe 25mm"></div>
      <div class="field"><label>SKU</label><input class="inp" id="it-sku" value="${esc(prefill.sku||'')}"></div>
      <div class="field"><label>Category</label><select class="inp" id="it-cat">
        ${cats.map(c=>`<option ${prefill.category===c?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Unit</label><select class="inp" id="it-unit">
        ${['pcs','m','kit','roll','L','set'].map(u=>`<option ${prefill.unit===u?'selected':''}>${u}</option>`).join('')}</select></div>
      <div class="field"><label>Location</label><input class="inp" id="it-loc" value="${esc(prefill.location||'')}" placeholder="Shelf A1, Yard…"></div>
      <div class="field"><label>Quantity in stock</label><input type="number" class="inp" id="it-qty" min="0" value="${prefill.qty!=null?prefill.qty:0}"></div>
      <div class="field"><label>Reorder level</label><input type="number" class="inp" id="it-reorder" min="0" value="${prefill.reorder!=null?prefill.reorder:5}"></div>
      <div class="field"><label>Unit cost (KES)</label><input type="number" class="inp" id="it-cost" min="0" value="${prefill.cost||0}"></div>
      <div class="field"><label>Sale price (KES)</label><input type="number" class="inp" id="it-price" min="0" value="${prefill.price||0}"></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="it-x">Cancel</button><button class="btn primary" id="it-save">${prefill.id?'Save changes':'Add item'}</button>`,
    onMount(){
      $('#it-x').onclick = closeModal;
      $('#it-save').onclick = () => {
        const name = $('#it-name').value.trim();
        if(!name){ toast('Name is required','warn'); return; }
        const data = {
          name, sku:$('#it-sku').value.trim(), category:$('#it-cat').value, unit:$('#it-unit').value,
          location:$('#it-loc').value.trim(), qty:parseFloat($('#it-qty').value)||0,
          reorder:parseFloat($('#it-reorder').value)||0, cost:parseFloat($('#it-cost').value)||0, price:parseFloat($('#it-price').value)||0
        };
        if(prefill.id){
          Object.assign(prefill, data);
          if(data.qty < prefill._origQty){
            prefill.history = prefill.history||[];
            prefill.history.unshift({at:isoDate(today()), delta:data.qty-prefill._origQty, reason:'Stock count correction'});
          }
          delete prefill._origQty;
          toast('Item updated');
        } else {
          db.inventory.push({id:uid('i'), history:[{at:isoDate(today()), delta:data.qty, reason:'Initial stock'}], ...data});
          toast(`${name} added to inventory`);
        }
        commit(); closeModal(); reRender();
      };
      if(prefill.id) prefill._origQty = prefill.qty;
    }
  });
}

function adjustModal(it){
  openModal(`Adjust stock — ${esc(it.name)}`, `
    <p class="muted small" style="margin-top:0">Current stock: <b>${it.qty} ${esc(it.unit||'')}</b> · reorder level ${it.reorder}</p>
    <div class="form-grid">
      <div class="field"><label>Movement type</label>
        <select class="inp" id="aj-type">
          <option value="in">Received / purchased (+)</option>
          <option value="used">Used on job (−)</option>
          <option value="damaged">Damaged / wasted (−)</option>
          <option value="count">Stock count correction</option>
        </select></div>
      <div class="field"><label>Quantity</label><input type="number" class="inp" id="aj-qty" min="0" step="0.5" value="1"></div>
      <div class="field span2"><label>Reference / reason</label><input class="inp" id="aj-reason" placeholder="e.g. JOB-2026-0014, supplier invoice #445"></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="aj-x">Cancel</button><button class="btn primary" id="aj-go">Apply</button>`,
    onMount(){
      $('#aj-x').onclick = closeModal;
      $('#aj-go').onclick = () => {
        const type = $('#aj-type').value;
        const q = parseFloat($('#aj-qty').value) || 0;
        const reason = $('#aj-reason').value.trim() || type;
        if(q <= 0 && type !== 'count'){ toast('Enter a quantity','warn'); return; }
        let delta = 0;
        if(type === 'in') delta = q;
        else if(type === 'used') delta = -q;
        else if(type === 'damaged') delta = -q;
        else delta = q - it.qty;
        if(type !== 'count' && it.qty + delta < 0){ toast(`Only ${it.qty} ${it.unit} in stock`,'warn'); return; }
        it.qty = Math.max(0, it.qty + delta);
        it.history = it.history||[];
        it.history.unshift({at:isoDate(today()), delta, reason});
        commit(); closeModal();
        toast(`${it.name}: ${it.qty} ${it.unit} in stock`);
        reRender();
      };
    }
  });
}
