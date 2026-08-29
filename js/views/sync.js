'use strict';
/* ================= sync & devices: offline-first multi-device ================= */
const SYNC_STORE = {
  get address(){ try { return localStorage.getItem('aquaflow_sync_address') || ''; } catch(e){ return ''; } },
  set address(v){ try { localStorage.setItem('aquaflow_sync_address', v); } catch(e){} }
};

VIEWS.sync = {
  title: () => 'Sync & Devices',
  render(){
    const t = db.meta || {};
    const counts = SyncCore.recordCounts(db);
    const total = sum(Object.values(counts), x => x);
    const isDesktop = !!(window.__AQUAFLOW && window.__AQUAFLOW.isDesktop);
    const lastChanged = t.lastChangedAt ? new Date(t.lastChangedAt).toLocaleString('en-KE') : '—';
    const lastSync = t.lastSyncAt ? `${new Date(t.lastSyncAt).toLocaleString('en-KE')} · with ${esc(t.lastSyncWith||'?')}` : 'never';

    const countRows = ['customers','jobs','invoices','quotes','leads','expenses','inventory','maintenance']
      .map(k => `<div class="bd-row"><span>${k[0].toUpperCase()+k.slice(1)}</span><b>${counts[k]}</b></div>`).join('');

    return `
    <div class="kpis">
      <div class="kpi"><div class="ic blue">${icon('clock',17)}</div><div class="lab">Last change</div><div class="val small" style="font-size:13px;padding-top:4px">${lastChanged}</div></div>
      <div class="kpi"><div class="ic green">${icon('sync',17)}</div><div class="lab">Last sync</div><div class="val small" style="font-size:13px;padding-top:4px">${lastSync}</div></div>
      <div class="kpi"><div class="ic amber">${icon('box',17)}</div><div class="lab">Records on this device</div><div class="val">${total}</div><div class="sub">stored locally — works offline</div></div>
    </div>

    <div class="grid2">
      <div class="stack">
        <div class="card">
          <h3>${icon('sync',15)} Sync with another device</h3>
          <p class="muted small">Both devices must be on the <b>same Wi-Fi</b>. Enter the address shown on the other device's Sync page (e.g. your PC's AquaFlow shows <code>http://192.168.x.x:8484</code>).</p>
          <div class="row" style="flex-wrap:wrap">
            <input class="inp" id="sy-addr" style="flex:1;min-width:220px" placeholder="http://192.168.1.50:8484" value="${esc(SYNC_STORE.address)}">
            <button class="btn ghost" id="sy-test">${icon('clock',14)} Test</button>
          </div>
          <div id="sy-status" class="small mt8"></div>
          <div class="row mt12" style="flex-wrap:wrap">
            <button class="btn primary" id="sy-sync">${icon('sync',15)} Sync (both ways)</button>
            <button class="btn ghost" id="sy-pull">⬇ Full pull — replace this device's data</button>
            <button class="btn ghost" id="sy-push">⬆ Full push — replace the other device's data</button>
          </div>
          <div class="badge-info mt12">💡 First time setting up the phone? Use <b>Full pull</b> on the phone to download the desktop database (it replaces the phone's demo data). After that, normal <b>Sync</b> is safe — it merges both sides.</div>
        </div>

        ${isDesktop ? `
        <div class="card">
          <h3>${icon('wifi',15)} Share this PC on your Wi-Fi</h3>
          <p class="muted small">Start the built-in server and phones on the same network can open <b>${'http://&lt;your-PC-ip&gt;:8484'}</b> — install it on the home screen for a phone app. Everything stays on your network.</p>
          <div class="row" style="flex-wrap:wrap;gap:10px">
            <button class="btn primary" id="sy-lan-toggle">${icon('wifi',15)} Turn on</button>
            <span class="sync-url" id="sy-lan-url" style="display:none"></span>
            <button class="btn ghost sm" id="sy-show-file" style="display:none">${icon('doc',14)} Show data file</button>
          </div>
          <div id="sy-lan-note" class="small muted mt8">Server is off.</div>
        </div>` : `
        <div class="card">
          <h3>${icon('wifi',15)} This is the web version</h3>
          <p class="muted small">You're running AquaFlow in a browser. For the full offline setup: install the <b>Windows desktop app</b> (it runs the Wi-Fi sharing server), then open that address on your phone and add it to the home screen.</p>
        </div>`}

        <div class="card">
          <h3>${icon('download',15)} Offline transfer (no Wi-Fi needed)</h3>
          <p class="muted small">Move data between devices that can't see each other: export a sync file here, send it over WhatsApp/USB/SD card, then import it on the other device. Importing <b>merges</b> — it never wipes.</p>
          <div class="row" style="flex-wrap:wrap">
            <button class="btn ghost" id="sy-export">${icon('download',14)} Export sync file</button>
            <label class="btn ghost" style="cursor:pointer">${icon('upload',14)} Import &amp; merge file
              <input type="file" id="sy-import" accept="application/json,.json" hidden>
            </label>
          </div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <h3>${icon('box',15)} This device's data</h3>
          <div>${countRows}</div>
          <div class="muted small mt12">Data lives <b>on this device</b> (offline database). Sync or export to move it.</div>
        </div>
        <div class="card">
          <h3>${icon('doc',15)} How sync works</h3>
          <ul class="assume">
            <li>Each device keeps its own complete offline copy — you can record payments, jobs and expenses with no internet at all.</li>
            <li>When both devices are on the same Wi-Fi, <b>Sync</b> merges them: every record is matched by ID, the most recent edit wins, deletions are tracked properly, and reference numbers never reset.</li>
            <li>The desktop app also serves the app itself over Wi-Fi — that's how the phone gets it.</li>
            <li>For devices on different networks, use <b>Offline transfer</b> (a single .json file you can send anywhere).</li>
            <li>Nothing ever leaves your network. There is no cloud.</li>
          </ul>
        </div>
      </div>
    </div>`;
  },
  mount(){
    const isDesktop = !!(window.__AQUAFLOW && window.__AQUAFLOW.isDesktop);
    const status = (msg, ok) => {
      const el = $('#sy-status');
      if(el) el.innerHTML = `<span class="${ok?'ok':'bad'}">${esc(msg)}</span>`;
    };
    const addr = () => {
      let a = ($('#sy-addr').value || '').trim();
      if(a && !/^https?:\/\//.test(a)) a = 'http://' + a;
      SYNC_STORE.address = a;
      return a;
    };

    const apiFetch = (a, opts) => fetch(a + '/api/sync', opts);

    $('#sy-test').onclick = async () => {
      const a = addr();
      if(!a) return status('Enter an address first.', false);
      status('Testing connection…');
      try {
        const r = await fetch(a + '/api/health', {cache:'no-store'});
        const j = await r.json();
        status(`✓ Connected to ${j.app} v${j.version} at ${j.ip} (this device can see it)`, true);
      } catch(e) {
        status(`✗ Cannot reach ${a} — check it's the right address and both devices are on the same Wi-Fi.`, false);
      }
    };

    const doSync = async () => {
      const a = addr();
      if(!a) return status('Enter the other device’s address first.', false);
      status('Pulling…');
      try {
        const r = await apiFetch(a);
        if(r.status === 404) return status('The other device has no data yet — use Full push instead.', false);
        const j = await r.json();
        if(!SyncCore.isValidDb(j.db)) throw new Error('bad payload');
        const merged = SyncCore.mergeDbs(db, j.db, {});
        db = merged; DB.save(); initChangeTracking();
        db.meta.lastSyncAt = new Date().toISOString();
        db.meta.lastSyncWith = a;
        status('Pushing merged state…');
        const p = await fetch(a + '/api/sync', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({db})});
        if(!p.ok) throw new Error('push failed: ' + p.status);
        db.meta.lastSyncAt = new Date().toISOString();
        commit();
        status('✓ Synced — both devices now have the same data.', true);
        reRender();
      } catch(e) {
        status('✗ Sync failed: ' + e.message, false);
      }
    };
    $('#sy-sync').onclick = doSync;

    $('#sy-pull').onclick = async () => {
      const a = addr();
      if(!a) return status('Enter the other device’s address first.', false);
      askConfirm('Full pull <b>replaces everything on this device</b> with the other device\'s data. Continue?', async () => {
        try {
          const r = await apiFetch(a);
          const j = await r.json();
          if(!SyncCore.isValidDb(j.db)) throw new Error('bad payload');
          db = j.db; DB.save(); initChangeTracking();
          db.meta.lastSyncAt = new Date().toISOString();
          db.meta.lastSyncWith = a;
          commit();
          status('✓ Pulled — this device now mirrors the other one.', true);
          reRender();
        } catch(e) { status('✗ Pull failed: ' + e.message, false); }
      }, {label:'Replace & pull'});
    };

    $('#sy-push').onclick = async () => {
      const a = addr();
      if(!a) return status('Enter the other device’s address first.', false);
      askConfirm('Full push <b>replaces everything on the other device</b> with this device\'s data. Continue?', async () => {
        try {
          const p = await fetch(a + '/api/sync', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({db})});
          if(!p.ok) throw new Error('push failed: ' + p.status);
          db.meta.lastSyncAt = new Date().toISOString();
          db.meta.lastSyncWith = a;
          commit();
          status('✓ Pushed — the other device now mirrors this one.', true);
          reRender();
        } catch(e) { status('✗ Push failed: ' + e.message, false); }
      }, {label:'Replace & push'});
    };

    $('#sy-export').onclick = () => {
      const blob = new Blob([JSON.stringify(db, null, 1)], {type:'application/json'});
      const aEl = document.createElement('a');
      aEl.href = URL.createObjectURL(blob);
      aEl.download = `aquaflow-sync-${isoDate(today())}.json`;
      document.body.appendChild(aEl); aEl.click(); aEl.remove();
      setTimeout(() => URL.revokeObjectURL(aEl.href), 5000);
      toast('Sync file exported — send it to the other device');
    };

    $('#sy-import').onchange = async e => {
      const f = e.target.files[0];
      if(!f) return;
      try {
        const parsed = JSON.parse(await f.text());
        if(!SyncCore.isValidDb(parsed)) throw new Error('not a valid AquaFlow sync file');
        const merged = SyncCore.mergeDbs(db, parsed, {});
        db = merged; DB.save(); initChangeTracking();
        db.meta.lastSyncAt = new Date().toISOString();
        db.meta.lastSyncWith = 'file: ' + f.name;
        commit();
        toast('Imported & merged from ' + f.name);
        reRender();
      } catch(err) {
        toast('Import failed: ' + err.message, 'err');
      }
      e.target.value = '';
    };

    /* desktop LAN server */
    if(isDesktop){
      const renderLan = (info) => {
        const urlEl = $('#sy-lan-url');
        const note = $('#sy-lan-note');
        const btn = $('#sy-lan-toggle');
        const showFile = $('#sy-show-file');
        if(info){
          urlEl.style.display = '';
          urlEl.innerHTML = `<b style="font-size:15px;letter-spacing:.02em">${info.url}</b>`;
          showFile.style.display = '';
          btn.textContent = '⏻ Turn off';
          btn.classList.remove('primary'); btn.classList.add('danger');
          note.innerHTML = `On. Open this address on your phone (same Wi-Fi), then <b>Add to Home screen</b>. If the phone can't connect: check both devices are on the same network and Windows Firewall allows the app (allow it when prompted).`;
        } else {
          urlEl.style.display = 'none';
          showFile.style.display = 'none';
          btn.textContent = '📶 Turn on';
          btn.classList.remove('danger'); btn.classList.add('primary');
          note.textContent = 'Server is off.';
        }
      };
      window.__AQUAFLOW.lanInfo().then(renderLan);
      $('#sy-lan-toggle').onclick = async () => {
        const cur = await window.__AQUAFLOW.lanInfo();
        const on = !cur;
        await window.__AQUAFLOW.lanToggle(on);
        const info = await window.__AQUAFLOW.lanInfo();
        renderLan(info);
        toast(on ? `Sharing on Wi-Fi: ${info.url}` : 'Wi-Fi sharing turned off');
      };
      $('#sy-show-file').onclick = () => window.__AQUAFLOW.openStateFile();
    }
  }
};
