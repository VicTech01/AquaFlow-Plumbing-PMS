'use strict';
/* Round-8: deployment integrity + login resilience.
   After the incident where the deployed site 404'd / served a stale service-worker
   shell, this suite guards the deploy chain itself:
   - every <script> in index.html must be in the SW precache list
   - SW cache must be versioned (bumped on shell changes)
   - vercel.json must keep html/js out of CDN/browser cache
   - index.html must contain the fail-fast blank-screen guard
   - with NO session, the auth screen must render and sign-in must work */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const errors = [];
function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — deployment & login integrity tests');
const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

/* ---------- static deployment checks ---------- */
check('deploy: every <script src> in index.html is precached by sw.js', () => {
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
  if (!scripts.length) throw new Error('no scripts found in index.html?!');
  const missing = scripts.filter(s => !sw.includes('./' + s));
  if (missing.length) throw new Error('not in SW SHELL: ' + missing.join(', '));
});

check('deploy: sw.js cache is versioned (aquaflow-shell-vN, N>=15)', () => {
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  const m = sw.match(/aquaflow-shell-v(\d+)/);
  if (!m) throw new Error('no versioned cache name');
  if (+m[1] < 15) throw new Error('cache version ' + m[1] + ' < 15 — bump it when the shell changes');
});

check('deploy: sw.js is network-first for navigations', () => {
  const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
  if (!sw.includes("request.mode === 'navigate'")) throw new Error('no network-first navigation handling');
});

check('deploy: vercel.json exists and sets no-cache for the site', () => {
  const v = fs.readFileSync(path.join(dir, 'vercel.json'), 'utf8');
  const j = JSON.parse(v);
  if (!Array.isArray(j.headers)) throw new Error('no headers config');
  if (!v.includes('must-revalidate')) throw new Error('no must-revalidate rule — stale CDN/browser caches could pin old code');
});

check('deploy: index.html contains the fail-fast guard (no blank page on broken deploys)', () => {
  if (!html.includes('could not start')) throw new Error('fail-fast guard missing from index.html');
  if (!html.includes('location.reload()')) throw new Error('guard has no reload action');
});

check('deploy: sw registration only over http(s), not file://', () => {
  if (!html.includes("location.protocol === 'http:' || location.protocol === 'https:'")) throw new Error('protocol guard missing');
});

/* ---------- live login path in a clean context (no session, no data) ---------- */
const files = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js','js/app.js','js/pdf.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/reports.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];

const dom = new JSDOM(html, { url: 'https://aquaflow-plumbing-pms.vercel.app/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
const doc = win.document;
win.scrollTo = () => {};
win.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });
const pageErrors = [];
win.addEventListener('error', e => pageErrors.push(e.message || String(e.error)));
try { win.eval(files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n')); }
catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

setTimeout(() => {
  check('login: fresh visitor (no session) sees the auth screen, app hidden', () => {
    if (pageErrors.length) throw new Error('page errors: ' + pageErrors.slice(0,3).join(' | '));
    const root = doc.getElementById('auth-root');
    if (root.hidden) throw new Error('auth screen hidden');
    if (!root.innerHTML.includes('Sign in')) throw new Error('sign-in form missing');
    if (!doc.getElementById('au-email') || !doc.getElementById('au-pass')) throw new Error('email/password fields missing');
    if (!doc.body.classList.contains('preauth')) throw new Error('app shell not hidden before auth');
    if (win.API) throw new Error('app booted without a session?!');
  });

  check('login: sign-up → app; sign-out → auth screen again (full cycle)', () => {
    doc.getElementById('au-tab-up').click();
    doc.getElementById('au-name').value = 'Deploy Check';
    doc.getElementById('au-uemail').value = 'deploy.check@test.co.ke';
    doc.getElementById('au-upass').value = 'test12345';
    doc.getElementById('au-sqa').value = 'nairobi';
    doc.getElementById('au-create').click();
    if (!win.API) throw new Error('app did not boot after sign-up');
    if (doc.body.classList.contains('preauth')) throw new Error('auth screen still visible after sign-up');
    win.API.go('settings', {});
    doc.getElementById('st-out').click();
    const root = doc.getElementById('auth-root');
    if (root.hidden) throw new Error('auth screen not restored after sign-out');
    if (!root.innerHTML.includes('Sign in')) throw new Error('sign-in view missing after sign-out');
  });

  check('login: wrong password is rejected; correct one is accepted', () => {
    doc.getElementById('au-email').value = 'deploy.check@test.co.ke';
    doc.getElementById('au-pass').value = 'wrong-pass';
    doc.getElementById('au-signin').click();
    if (!doc.getElementById('au-msg').textContent.includes('Wrong')) throw new Error('wrong password not flagged');
    if (!doc.body.classList.contains('preauth')) throw new Error('signed in with wrong password?!');
    doc.getElementById('au-pass').value = 'test12345';
    doc.getElementById('au-signin').click();
    if (doc.body.classList.contains('preauth')) throw new Error('correct password rejected');
  });

  check('login: Enter key submits the sign-in form', () => {
    win.API.go('settings', {});
    doc.getElementById('st-out').click();
    doc.getElementById('au-email').value = 'deploy.check@test.co.ke';
    const pass = doc.getElementById('au-pass');
    pass.value = 'test12345';
    pass.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    if (doc.body.classList.contains('preauth')) throw new Error('Enter did not submit sign-in');
  });

  if (errors.length) {
    console.error(`\n${errors.length} FAILURE(S):`);
    errors.forEach(e => console.error(' - ' + e));
    process.exit(1);
  }
  console.log('\nALL DEPLOYMENT/LOGIN INTEGRITY TESTS PASSED ✅');
  process.exit(0);
}, 400);
