'use strict';
/* Round-5: offline-first sync — merge engine + LAN server (pure Node) + PWA parts. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { JSDOM } = require('jsdom');
const SyncCore = require('./js/sync.js');
const lan = require('./js/lan-server.cjs');

const errors = [];
function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — sync & offline tests');

/* ---------- merge engine ---------- */
function mkDb(overrides) {
  const base = {
    v: 1,
    counters: { job: 1, quote: 1, invoice: 1, lead: 1 },
    business: { name: 'AquaFlow Plumbing Ltd', ownerName: 'Victor' },
    customers: [], technicians: [], jobs: [], quotes: [], invoices: [],
    inventory: [], maintenance: [], outbox: [], leads: [], expenses: [],
    tombstones: []
  };
  return Object.assign(base, overrides || {});
}

check('merge: union of new records from both sides', () => {
  const a = mkDb({ customers: [{ id: 'c1', name: 'A', updatedAt: '2026-08-01T00:00:00Z' }] });
  const b = mkDb({ customers: [{ id: 'c2', name: 'B', updatedAt: '2026-08-02T00:00:00Z' }] });
  const m = SyncCore.mergeDbs(a, b);
  if (m.customers.length !== 2) throw new Error('expected 2 customers, got ' + m.customers.length);
  if (!m.customers.some(c => c.id === 'c1') || !m.customers.some(c => c.id === 'c2')) throw new Error('union lost a record');
});

check('merge: last-write-wins per record', () => {
  const a = mkDb({ jobs: [{ id: 'j1', title: 'old', updatedAt: '2026-08-01T00:00:00Z' }] });
  const b = mkDb({ jobs: [{ id: 'j1', title: 'new', updatedAt: '2026-08-05T00:00:00Z' }] });
  const m = SyncCore.mergeDbs(a, b);
  if (m.jobs.length !== 1 || m.jobs[0].title !== 'new') throw new Error('LWW failed: ' + JSON.stringify(m.jobs));
});

check('merge: counters take max (refs never reset)', () => {
  const a = mkDb({ counters: { job: 7, invoice: 3 } });
  const b = mkDb({ counters: { job: 5, invoice: 9, lead: 2 } });
  const m = SyncCore.mergeDbs(a, b);
  if (m.counters.job !== 7 || m.counters.invoice !== 9 || m.counters.lead !== 2)
    throw new Error('counters wrong: ' + JSON.stringify(m.counters));
});

check('merge: tombstone deletes win over older record', () => {
  const a = mkDb({
    customers: [{ id: 'c1', name: 'A', updatedAt: '2026-08-01T00:00:00Z' }],
    tombstones: [{ coll: 'customers', id: 'c1', at: '2026-08-03T00:00:00Z' }]
  });
  const b = mkDb({ customers: [{ id: 'c1', name: 'A-resurrected', updatedAt: '2026-08-02T00:00:00Z' }] });
  const m = SyncCore.mergeDbs(a, b);
  if (m.customers.some(c => c.id === 'c1')) throw new Error('deleted record was resurrected');
});

check('merge: edit after deletion resurrects the record', () => {
  const a = mkDb({ customers: [{ id: 'c1', name: 'A', updatedAt: '2026-08-04T00:00:00Z' }] });
  const b = mkDb({ tombstones: [{ coll: 'customers', id: 'c1', at: '2026-08-03T00:00:00Z' }] });
  const m = SyncCore.mergeDbs(a, b);
  if (!m.customers.some(c => c.id === 'c1')) throw new Error('record should be alive (edited after delete)');
});

check('merge: business settings — newer wins', () => {
  const a = mkDb({ business: { name: 'OldName' }, businessUpdatedAt: '2026-08-01T00:00:00Z' });
  const b = mkDb({ business: { name: 'NewName' }, businessUpdatedAt: '2026-08-09T00:00:00Z' });
  const m = SyncCore.mergeDbs(a, b);
  if (m.business.name !== 'NewName') throw new Error('business not merged to newest');
});

check('stampChanges: detects changes, deletions, counter bumps', () => {
  const db = mkDb({
    customers: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
    counters: { job: 1 }
  });
  const before = JSON.stringify(db);
  db.customers[0].name = 'A2';
  db.customers.pop();                 // delete c2
  db.counters.job = 2;
  SyncCore.stampChanges(db, before);
  if (db.customers[0].updatedAt !== new Date().toISOString().slice(0,19) + 'Z' && !db.customers[0].updatedAt) throw new Error('changed record not stamped');
  if (!db.customers[0].updatedAt) throw new Error('no stamp');
  const tomb = db.tombstones.find(t => t.coll === 'customers' && t.id === 'c2');
  if (!tomb) throw new Error('deletion not tombstoned');
  if (db.countersUpdatedAt) { /* ok */ } else throw new Error('counter change not stamped');
});

/* ---------- LAN server (live) ---------- */
let server = null;
const PORT = 18484;
const stateFile = path.join(__dirname, '.test-lan-state.json');
try { fs.unlinkSync(stateFile); } catch (e) {}

async function serverTests() {
  server = await lan.start({ rootDir: __dirname, port: PORT, stateFile });
  const getJson = (p) => new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d, ct: r.headers['content-type'] }));
    }).on('error', rej);
  });
  const postJson = (p, obj) => new Promise((res, rej) => {
    const data = JSON.stringify(obj);
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, r => {
      let d = ''; r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    });
    req.on('error', rej);
    req.write(data); req.end();
  });

  const h = await getJson('/api/health');
  check('lan: /api/health reports app + ip + port', () => {
    const j = JSON.parse(h.body);
    if (!j.ok || j.app !== 'aquaflow-pms') throw new Error('bad health: ' + h.body);
    if (!j.ip) throw new Error('no ip in health');
  });

  const empty = await getJson('/api/sync');
  check('lan: /api/sync 404 before any data', () => {
    if (empty.status !== 404) throw new Error('expected 404, got ' + empty.status);
  });

  const seedDb = mkDb({ customers: [{ id: 'cX', name: 'Phone Customer', updatedAt: '2026-08-29T08:00:00Z' }] });
  const push1 = await postJson('/api/sync', { db: seedDb });
  check('lan: POST /api/sync stores state', () => {
    const j = JSON.parse(push1.body);
    if (!j.ok) throw new Error('push rejected: ' + push1.body);
  });
  const g1 = await getJson('/api/sync');
  check('lan: GET /api/sync returns pushed db', () => {
    const j = JSON.parse(g1.body);
    if (!j.db || j.db.customers.length !== 1 || j.db.customers[0].name !== 'Phone Customer')
      throw new Error('state not round-tripped: ' + g1.body.slice(0, 120));
  });
  const bad = await postJson('/api/sync', { db: { nope: true } });
  check('lan: POST rejects invalid payloads', () => {
    if (bad.status !== 400) throw new Error('expected 400, got ' + bad.status);
  });
  const idx = await getJson('/');
  check('lan: serves the web app (phones install from here)', () => {
    if (idx.status !== 200 || !idx.body.includes('AquaFlow')) throw new Error('index not served');
    if (!/text\/html/.test(idx.ct || '')) throw new Error('wrong content type');
  });
  const man = await getJson('/manifest.json');
  check('lan: serves PWA manifest', () => {
    if (man.status !== 200 || !JSON.parse(man.body).name) throw new Error('manifest missing');
  });
  check('lan: persists db to state file (survives restart)', () => {
    if (!fs.existsSync(stateFile)) throw new Error('state file not written');
    const j = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (j.customers[0].name !== 'Phone Customer') throw new Error('state file content wrong');
  });
  const info = server.info();
  check('lan: info() exposes shareable URL', () => {
    if (!info.on || !info.url || !info.port) throw new Error('bad info: ' + JSON.stringify(info));
  });
}

(async () => {
  await serverTests();

  /* ---------- in-app: sync view + stamping round trip (jsdom) ---------- */
  const files = ['js/utils.js','js/seed.js','js/sync.js','js/app.js',
    'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
    'js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/inventory.js','js/views/maintenance.js',
    'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost:18484/', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  win.scrollTo = () => {};
  win.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });
  win.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
  const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
  try { win.eval(code); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

  setTimeout(async () => {
    const A = win.API;
    if (!A) { console.error('API not exposed'); process.exit(1); }
    const doc = win.document;

    check('app: sync view renders (web mode — no desktop card)', () => {
      A.go('sync', {});
      const h = doc.getElementById('content').innerHTML;
      if (!h.includes('Sync with another device')) throw new Error('sync card missing');
      if (!h.includes('Offline transfer')) throw new Error('offline transfer card missing');
      if (h.includes('Share this PC on your Wi-Fi')) throw new Error('desktop card visible in web mode');
      if (!h.includes('This is the web version')) throw new Error('web-version card missing');
    });

    check('app: commit() stamps updatedAt on records', () => {
      A.go('leads', {});
      const n = A.db.leads.length;
      doc.getElementById('lead-new').click();
      doc.getElementById('lf-name').value = 'Stamp Test';
      doc.getElementById('lf-save').click();
      if (A.db.leads.length !== n + 1) throw new Error('lead not added');
      const lead = A.db.leads[0];
      if (!lead.updatedAt) throw new Error('new lead not stamped');
      if (!A.db.meta || !A.db.meta.lastChangedAt) throw new Error('meta.lastChangedAt missing');
    });

    check('app: PWA parts present (manifest link + sw registration guarded)', () => {
      const html2 = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      if (!html2.includes('rel="manifest"')) throw new Error('manifest link missing');
      if (!html2.includes('sw.js')) throw new Error('sw registration missing');
      const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8');
      if (!sw.includes('/api/')) throw new Error('sw must skip /api routes');
    });

    await (server ? server.stop() : Promise.resolve());
    try { fs.unlinkSync(stateFile); } catch (e) {}
    if (errors.length) {
      console.error(`\n${errors.length} FAILURE(S):`);
      errors.forEach(e => console.error(' - ' + e));
      process.exit(1);
    }
    console.log('\nALL SYNC/OFFLINE TESTS PASSED ✅');
    process.exit(0);
  }, 250);
})();
