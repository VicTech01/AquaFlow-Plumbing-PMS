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
    const sess = (typeof AUTH !== 'undefined') ? AUTH.session() : 'guest';
    const acc = sess && sess !== 'guest' ? AUTH.byEmail(sess) : null;
    const accounts = (typeof AUTH !== 'undefined') ? AUTH.accounts() : [];
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
            <div class="field span2"><label>Logo (appears on quotations &amp; invoices)</label>
              <div class="row">
                ${b.logo ? `<img class="logo-preview" src="${b.logo}" alt="Business logo">` : '<span class="muted small">No logo yet — upload one for professional PDFs.</span>'}
                <label class="btn ghost sm" style="cursor:pointer">${icon('upload',14)} Upload logo<input type="file" id="st-logo" accept="image/*" style="display:none"></label>
                ${b.logo ? '<button class="btn ghost sm" id="st-logo-rm">Remove</button>' : ''}
              </div></div>
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
          <h3>${icon('users',15)} Team</h3>
          ${db.technicians.length ? `<div class="tbl-wrap"><table class="tbl">
            <thead><tr><th>Name</th><th class="resp-sm">Role</th><th class="resp-sm">Phone</th><th class="num resp-sm">Rate</th><th>Skills</th><th></th></tr></thead>
            <tbody>
              ${db.technicians.map(t => `<tr>
                <td class="bold">${esc(t.name)}</td>
                <td class="resp-sm"><span class="chip c-gray">${esc(t.role)}</span></td>
                <td class="resp-sm">${esc(t.phone||'—')}</td>
                <td class="num resp-sm">${money(t.rate)}</td>
                <td class="resp-md small muted">${esc((t.skills||[]).join(', ')||'—')}</td>
                <td class="row" style="justify-content:flex-end">
                  <button class="btn ghost sm" data-ted="${t.id}">✎</button>
                  <button class="btn ghost sm" data-tact="${t.id}">${t.active?'Disable':'Enable'}</button>
                  <button class="btn danger sm" data-tdel="${t.id}">✕</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table></div>` : '<div class="empty small">No technicians yet — add your team (yourself counts!).</div>'}
          <button class="btn ghost sm mt12" id="st-tech-add">${icon('plus',14)} Add technician</button>
        </div>
        <div class="card">
          <h3>${icon('gear',15)} Account &amp; security</h3>
          ${acc ? `
          <div class="spread" style="padding:4px 0">
            <div><b>${esc(acc.name)}</b><div class="muted small">${esc(acc.email)} · signed in</div></div>
            <span class="row" style="gap:6px"><span class="chip c-${(acc.role||'admin')==='customer'?'teal':'indigo'}">${(acc.role||'admin')==='customer'?'👤 Customer':'👷 Admin'}</span><span class="chip c-green">Active</span></span>
          </div>
          <div class="row mt8" style="flex-wrap:wrap">
            <button class="btn ghost sm" id="st-pw">${icon('gear',14)} Change password</button>
            <button class="btn ghost sm" id="st-sq">${icon('gear',14)} Change security question</button>
            <button class="btn ghost sm" id="st-out">Sign out</button>
          </div>
          ${accounts.length > 1 ? `
          <div class="muted small mt12">Other accounts on this device:</div>
          ${accounts.filter(a => a.email !== acc.email).map(a => `
            <div class="spread" style="padding:5px 0;border-top:1px dashed #eef2f7">
              <div><b class="small">${esc(a.name)}</b><div class="subrow">${esc(a.email)}</div></div>
              <div class="row" style="gap:6px">
                <button class="btn ghost sm" data-acc-switch="${esc(a.email)}">Switch</button>
                <button class="btn danger sm" data-acc-del="${esc(a.email)}">Delete</button>
              </div>
            </div>`).join('')}` : ''}` : `
          <div class="badge-info">You're in <b>guest mode</b> — data lives in the local demo workspace, no password. Create an account to protect your business data with email + password.</div>
          <button class="btn primary sm mt12" id="st-create-acc">${icon('userPlus',14)} Create an account</button>`}
        </div>
        <div class="card">
          <h3>${icon('box',15)} Data</h3>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn ghost" id="st-export">${icon('download',14)} Export JSON backup</button>
            <label class="btn ghost" style="cursor:pointer">${icon('upload',14)} Import JSON<input type="file" id="st-import" accept="application/json" style="display:none"></label>
            <button class="btn danger" id="st-reset">${icon('trash',14)} Reset demo data</button>
          </div>
          <div class="mt12" style="border-top:1px dashed #eef2f7;padding-top:12px">
            <b class="small">Automatic backups</b>
            <div class="muted small">A snapshot of your whole business is saved on this device as you work (last 3 kept, one per 5 minutes). Restore one if anything ever goes wrong.</div>
            <div id="st-baklist" class="mt8"></div>
            <div class="row mt8" style="flex-wrap:wrap">
              <button class="btn ghost sm" id="st-bak-restore">↩ Restore latest backup</button>
              <button class="btn ghost sm" id="st-bak-clear">Clear backups</button>
            </div>
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
      b.prefixes = {job:$('#st-p1').value.trim()||'JOB', quote:$('#st-p2').value.trim()||'QUO', invoice:$('#st-p3').value.trim()||'INV', lead:b.prefixes.lead||'LEAD'};
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

    /* ---- logo ---- */
    const logoInput = $('#st-logo');
    if(logoInput) logoInput.onchange = async () => {
      const f = logoInput.files && logoInput.files[0];
      if(!f) return;
      try {
        const dataUrl = await compressImageFile(f, 256, 0.85);
        b.logo = dataUrl;
        commit(); reRender();
        toast('Logo saved — it now appears on quotations & invoices');
      } catch(e){ toast('Could not read that image','err'); }
    };
    if($('#st-logo-rm')) $('#st-logo-rm').onclick = () => { b.logo = null; commit(); reRender(); toast('Logo removed'); };

    /* ---- automatic backups ---- */
    const renderBak = () => {
      const list = listAutoBackups();
      const el = $('#st-baklist');
      if(!el) return;
      el.innerHTML = list.length
        ? list.map((x,i) => `<div class="r small" style="padding:3px 0"><span>${fmtDate(x.at)} · ${new Date(x.at).toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}</span><span class="muted">${Math.round(x.size/1024)} KB${i===0?' · <b>latest</b>':''}</span></div>`).join('')
        : '<div class="muted small">No automatic backups yet — they appear as you work.</div>';
    };
    renderBak();
    $('#st-bak-restore').onclick = () => {
      const list = listAutoBackups();
      if(!list.length){ toast('No backups to restore yet','warn'); return; }
      askConfirm(`Replace current data with the backup from <b>${fmtDate(list[0].at)}</b>? Your changes since then will be lost (export a manual backup first if unsure).`, () => {
        const r = restoreAutoBackup(0);
        if(r.ok){ reRender(); renderBak(); toast(`Restored backup from ${fmtDate(r.at)}`); }
        else toast(r.error, 'err');
      }, {label:'Restore backup'});
    };
    $('#st-bak-clear').onclick = () => askConfirm('Delete all automatic backups?', () => {
      clearAutoBackups(); renderBak(); toast('Backups cleared');
    }, {label:'Clear all'});

    /* ---- team ---- */
    $('#st-tech-add').onclick = () => techModal(null);
    $$('#content [data-ted]').forEach(b => b.onclick = () => techModal(db.technicians.find(t => t.id === b.dataset.ted)));
    $$('#content [data-tact]').forEach(b => b.onclick = () => {
      const t = db.technicians.find(x => x.id === b.dataset.tact);
      if(t){ t.active = !t.active; commit(); reRender(); toast(`${t.name} ${t.active?'enabled':'disabled'}`); }
    });
    $$('#content [data-tdel]').forEach(b => b.onclick = () => {
      const t = db.technicians.find(x => x.id === b.dataset.tdel);
      if(!t) return;
      askConfirm(`Remove <b>${esc(t.name)}</b> from the team? Their past jobs are kept.`, () => {
        db.technicians = db.technicians.filter(x => x.id !== t.id);
        db.jobs.forEach(j => j.technicianIds = (j.technicianIds||[]).filter(x => x !== t.id));
        commit(); reRender(); toast('Technician removed');
      });
    });

    /* ---- account & security ---- */
    if($('#st-pw')) $('#st-pw').onclick = () => {
      openModal('Change password', `
        <div class="field"><label>Current password</label><input class="inp" id="pw-old" type="password" autocomplete="current-password"></div>
        <div class="field"><label>New password</label><input class="inp" id="pw-new" type="password" placeholder="At least 6 characters"></div>
        <div class="field"><label>Confirm new password</label><input class="inp" id="pw-new2" type="password"></div>
        <div id="pw-msg"></div>`,
        { width:'sm', footerHtml:`<button class="btn ghost" id="pw-x">Cancel</button><button class="btn primary" id="pw-go">Change password</button>`,
          onMount(){
            if(typeof bindPwToggles === 'function') bindPwToggles($('#modal-root'));
            $('#pw-x').onclick = closeModal;
            $('#pw-go').onclick = () => {
              const n1 = $('#pw-new').value, n2 = $('#pw-new2').value;
              if(n1 !== n2){ $('#pw-msg').innerHTML = '<div class="bad small">New passwords do not match.</div>'; return; }
              const r = AUTH.changePassword(AUTH.session(), $('#pw-old').value, n1);
              if(!r.ok){ $('#pw-msg').innerHTML = `<div class="bad small">${esc(r.error)}</div>`; return; }
              closeModal(); toast('Password changed');
            };
          }});
    };
    if($('#st-sq')) $('#st-sq').onclick = () => {
      openModal('Change security question', `
        <div class="field"><label>Question</label>
          <select class="inp" id="sq-q">${SEC_QUESTIONS.map(q=>`<option ${q===AUTH.byEmail(AUTH.session()).sq?'selected':''}>${q}</option>`).join('')}</select></div>
        <div class="field"><label>New answer</label><input class="inp" id="sq-a" placeholder="Used to reset a forgotten password"></div>`,
        { width:'sm', footerHtml:`<button class="btn ghost" id="sq-x">Cancel</button><button class="btn primary" id="sq-go">Save</button>`,
          onMount(){
            $('#sq-x').onclick = closeModal;
            $('#sq-go').onclick = () => {
              const r = AUTH.changeSecurityQuestion(AUTH.session(), $('#sq-q').value, $('#sq-a').value);
              if(!r.ok){ toast(r.error, 'warn'); return; }
              closeModal(); toast('Security question updated');
            };
          }});
    };
    if($('#st-out')) $('#st-out').onclick = () => {
      AUTH.signOut();
      closeModal();
      AUTH.renderAuth();
    };
    if($('#st-create-acc')) $('#st-create-acc').onclick = () => {
      AUTH.renderAuth('up');
    };
    $$('#content [data-acc-switch]').forEach(b => b.onclick = () => {
      switchToSession(b.dataset.accSwitch);
    });
    $$('#content [data-acc-del]').forEach(b => b.onclick = () => {
      const email = b.dataset.accDel;
      const a = AUTH.byEmail(email);
      askConfirm(`Delete account <b>${esc(a?a.name:email)}</b> and ALL of its data on this device?`, () => {
        AUTH.deleteAccount(email);
        reRender();
        toast('Account deleted');
      }, {label:'Delete account'});
    });
  }
};
function dbCheckKeys(d){ return ['customers','technicians','jobs','quotes','invoices','inventory','maintenance','outbox','business','counters'].every(k=>k in d); }

/* ---- technician modal ---- */
function techModal(tech){
  const isE = !!tech;
  openModal(isE ? `Edit technician — ${esc(tech.name)}` : 'Add technician', `
    <div class="form-grid">
      <div class="field span2"><label>Name *</label><input class="inp" id="tf-name" value="${esc(tech?tech.name:'')}" placeholder="e.g. Brian Otieno"></div>
      <div class="field"><label>Phone</label><input class="inp" id="tf-phone" value="${esc(tech?tech.phone:'')}" placeholder="07xx xxx xxx"></div>
      <div class="field"><label>Role</label>
        <select class="inp" id="tf-role">
          ${['Apprentice','Standard','Senior'].map(r=>`<option ${tech&&tech.role===r?'selected':''}>${r}</option>`).join('')}
        </select></div>
      <div class="field"><label>Rate (KES/hour) *</label><input class="inp" id="tf-rate" type="number" min="0" step="50" value="${tech?tech.rate:db.business.rates.standard}"></div>
      <div class="field"><label>Skills (comma-separated)</label><input class="inp" id="tf-skills" value="${esc(tech?(tech.skills||[]).join(', '):'')}" placeholder="Geyser & heating, Drains, Solar install"></div>
    </div>`,
  { width:'md',
    footerHtml:`<button class="btn ghost" id="tf-x">Cancel</button><button class="btn primary" id="tf-save">${isE?'Save changes':'Add technician'}</button>`,
    onMount(){
      $('#tf-x').onclick = closeModal;
      $('#tf-save').onclick = () => {
        const name = $('#tf-name').value.trim();
        const rate = parseFloat($('#tf-rate').value) || 0;
        if(!name || rate <= 0){ toast('Name and rate are required','warn'); return; }
        const data = {
          name, phone: $('#tf-phone').value.trim(), role: $('#tf-role').value, rate,
          skills: $('#tf-skills').value.split(',').map(s=>s.trim()).filter(Boolean)
        };
        if(isE){ Object.assign(tech, data); toast(`${name} updated`); }
        else { db.technicians.push(Object.assign({id:uid('t'), active:true, hoursPerDay:8}, data)); toast(`${name} added to the team`); }
        commit(); closeModal(); reRender();
      };
    }
  });
}
function sideFootHTML(){
  return `<b>${esc(db.business.name)}</b>${esc(db.business.phone)}<br>${esc(db.business.address)}${db.memoryMode?'<span class="mem-badge">DEMO MODE — not persisted</span>':''}`;
}
