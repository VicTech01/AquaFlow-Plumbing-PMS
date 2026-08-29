'use strict';
/* ================= settings ================= */
VIEWS.settings = {
  title: () => 'Settings',
  render(p){
    const b = db.business;
    const tplHelp = {
      job_confirm: 'Placeholders: {customer} {job} {type} {date} {time} {tech} {business}',
      dispatch: 'Placeholders: {customer} {tech} {address} {job} {time} {business}',
      quote_sent: 'Placeholders: {customer} {ref} {total} {title} {valid} {business}',
      invoice_sent: 'Placeholders: {customer} {ref} {total} {due} {business}',
      payment_reminder: 'Placeholders: {customer} {ref} {balance} {due} {business}',
      payment_received: 'Placeholders: {customer} {amount} {ref} {business}',
      maintenance_due: 'Placeholders: {customer} {equipment} {last} {business}',
      job_complete: 'Placeholders: {customer} {job} {total} {business}'
    };
    const tplLabel = {
      job_confirm:'Job confirmation', dispatch:'Technician dispatched', quote_sent:'Quotation sent',
      invoice_sent:'Invoice sent', payment_reminder:'Payment reminder', payment_received:'Payment received',
      maintenance_due:'Maintenance due reminder', job_complete:'Job completed'
    };
    const num = (id, v) => `<input type="number" class="inp" id="${id}" min="0" value="${v}">`;
    return `
    <div class="grid2">
      <div class="stack">
        <div class="card">
          <h3>${icon('doc',15)} Business profile</h3>
          <div class="form-grid">
            <div class="field span2"><label>Business name</label><input class="inp" id="st-name" value="${esc(b.name)}"></div>
            <div class="field"><label>Owner name (dashboard greeting)</label><input class="inp" id="st-owner" value="${esc(b.ownerName||'')}" placeholder="e.g. Victor"></div>
            <div class="field"><label>Phone</label><input class="inp" id="st-phone" value="${esc(b.phone)}"></div>
            <div class="field"><label>WhatsApp number (digits, intl)</label><input class="inp" id="st-wa" value="${esc(b.whatsapp)}" placeholder="254712345678"></div>
            <div class="field"><label>Email</label><input class="inp" id="st-email" value="${esc(b.email)}"></div>
            <div class="field"><label>Address</label><input class="inp" id="st-addr" value="${esc(b.address)}"></div>
          </div>
        </div>
        <div class="card">
          <h3>${icon('cash',15)} Rates, travel &amp; invoicing</h3>
          <div class="form-grid">
            <div class="field"><label>Standard rate (KES/h)</label>${num('st-rate1', b.rates.standard)}</div>
            <div class="field"><label>Senior rate (KES/h)</label>${num('st-rate2', b.rates.senior)}</div>
            <div class="field"><label>Apprentice rate (KES/h)</label>${num('st-rate3', b.rates.apprentice)}</div>
            <div class="field"><label>VAT %</label>${num('st-vat', b.vatRate)}</div>
            <div class="field"><label>Travel — within-city</label>${num('st-tr1', b.travel.city)}</div>
            <div class="field"><label>Travel — outskirts</label>${num('st-tr2', b.travel.outskirts)}</div>
            <div class="field"><label>Travel — outside county</label>${num('st-tr3', b.travel.county)}</div>
            <div class="field"><label>Invoice due (days)</label>${num('st-due', b.dueDays)}</div>
            <div class="field"><label>Job ref prefix</label><input class="inp" id="st-p1" value="${esc(b.prefixes.job)}"></div>
            <div class="field"><label>Quote ref prefix</label><input class="inp" id="st-p2" value="${esc(b.prefixes.quote)}"></div>
            <div class="field span2"><label>Invoice ref prefix</label><input class="inp" id="st-p3" value="${esc(b.prefixes.invoice)}"></div>
          </div>
        </div>
        <div class="card">
          <h3>${icon('box',15)} Data</h3>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn ghost" id="st-export">${icon('download',14)} Export JSON backup</button>
            <label class="btn ghost" style="cursor:pointer">${icon('upload',14)} Import JSON<input type="file" id="st-import" accept="application/json" style="display:none"></label>
            <button class="btn danger" id="st-reset">${icon('trash',14)} Reset demo data</button>
          </div>
          ${db.memoryMode ? '<div class="badge-warn mt12">Storage is unavailable in this context — changes will not persist after reload (demo mode).</div>' : ''}
        </div>
        <div class="card" style="background:#f8fafc">
          <h3>${icon('spark',15)} About the AI estimate assistant</h3>
          <p class="muted small" style="margin:0">The assistant is a local rules-pricing model (<b>aquaflow-rules-v1</b>) built from your labor rates, live inventory prices, standard scopes of work and zone travel fees. It explains every line it generates and flags stock problems. You stay in control — nothing is sent until you approve.</p>
        </div>
      </div>
      <div class="stack">
        <div class="card" id="st-templates">
          <h3>${icon('chat',15)} WhatsApp message templates</h3>
          ${Object.keys(b.templates).map(k => `
            <div class="field">
              <label>${esc(tplLabel[k]||k)}</label>
              <textarea class="inp st-tpl" data-k="${k}" rows="2">${esc(b.templates[k])}</textarea>
              <div class="hint">${esc(tplHelp[k]||'')}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="row mt16">
      <button class="btn primary" id="st-save">${icon('check',15)} Save settings</button>
      <span class="muted small">Prefixes apply to new references only.</span>
    </div>`;
  },
  mount(p){
    const b = db.business;
    const n = id => parseFloat($(id).value) || 0;
    $('#st-save').onclick = () => {
      b.name = $('#st-name').value.trim() || b.name;
      b.ownerName = $('#st-owner').value.trim();
      b.phone = $('#st-phone').value.trim();
      b.whatsapp = $('#st-wa').value.replace(/\D/g,'');
      b.email = $('#st-email').value.trim();
      b.address = $('#st-addr').value.trim();
      b.rates = {standard:n('#st-rate1'), senior:n('#st-rate2'), apprentice:n('#st-rate3')};
      b.vatRate = n('#st-vat'); b.dueDays = n('#st-due');
      b.travel = {city:n('#st-tr1'), outskirts:n('#st-tr2'), county:n('#st-tr3')};
      b.prefixes = {job:$('#st-p1').value.trim()||'JOB', quote:$('#st-p2').value.trim()||'QUO', invoice:$('#st-p3').value.trim()||'INV'};
      $$('.st-tpl').forEach(t => { b.templates[t.dataset.k] = t.value; });
      commit();
      $('#side-foot').innerHTML = sideFootHTML();
      toast('Settings saved');
    };
    $('#st-export').onclick = () => {
      const blob = new Blob([JSON.stringify(db, null, 2)], {type:'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `aquaflow-backup-${isoDate(today())}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
      toast('Backup downloaded');
    };
    $('#st-import').onchange = e => {
      const f = e.target.files[0];
      if(!f) return;
      const r = new FileReader();
      r.onload = () => {
        try{
          const d = JSON.parse(r.result);
          if(!d || d.v !== 1 || !d.customers || !dbCheckKeys(d)) throw new Error('bad file');
          db = d; commit(); go('dashboard', {});
          $('#side-foot').innerHTML = sideFootHTML();
          toast('Data imported successfully');
        }catch(err){ toast('Import failed — not a valid AquaFlow backup','err'); }
      };
      r.readAsText(f);
    };
    $('#st-reset').onclick = () => askConfirm('Replace ALL current data with fresh demo data? This cannot be undone.', () => {
      db = DB.seed(); commit(); go('dashboard', {});
      $('#side-foot').innerHTML = sideFootHTML();
      toast('Demo data restored');
    }, {label:'Reset everything'});
  }
};
function dbCheckKeys(d){ return ['customers','technicians','jobs','quotes','invoices','inventory','maintenance','outbox','business','counters'].every(k=>k in d); }
function sideFootHTML(){
  return `<b>${esc(db.business.name)}</b>${esc(db.business.phone)}<br>${esc(db.business.address)}${db.memoryMode?'<span class="mem-badge">DEMO MODE — not persisted</span>':''}`;
}
