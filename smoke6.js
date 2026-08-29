'use strict';
/* Round-6: accounts — sign up / sign in / forgot password / per-account data. */
const fs = require('fs');
const path = require('path');
const nodeCrypto = require('crypto');
const { JSDOM } = require('jsdom');

const errors = [];
function check(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '—', e.message); errors.push(name + ': ' + e.message); }
}

console.log('AquaFlow PMS — accounts tests');

/* ---------- 1) crypto core (pure Node, outside jsdom) ---------- */
const files = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js'];
const code = files.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
const ctx = { window: undefined, localStorage: undefined };
function runAuthLib() {
  const mod = new Function('window', 'localStorage', 'document', code + '\n;return {AUTH, sha256Hex, pbkdf2Sha256Hex, hexToBytes, emptyDb, SEC_QUESTIONS};');
  const mem = {};
  const ls = {
    getItem: k => (k in mem ? mem[k] : null),
    setItem: (k,v) => { mem[k] = String(v); },
    removeItem: k => { delete mem[k]; }
  };
  const win = { crypto: { getRandomValues: b => nodeCrypto.randomFillSync(Buffer.from(b.buffer, b.byteOffset, b.byteLength)) } };
  return { api: mod(win, ls, undefined), ls, mem };
}
const { api, ls, mem } = runAuthLib();
const { AUTH, sha256Hex, pbkdf2Sha256Hex, hexToBytes, emptyDb } = api;

check('crypto: sha256("abc") matches the FIPS vector', () => {
  if (sha256Hex('abc') !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    throw new Error('sha256 vector mismatch: ' + sha256Hex('abc'));
});

check('crypto: pbkdf2 matches node:crypto (3 random cases)', () => {
  for (let i = 0; i < 3; i++) {
    const pw = 'test-password-' + i + '✓';
    const salt = nodeCrypto.randomBytes(16);
    const iter = [1, 1000, 50000][i];
    const expect = nodeCrypto.pbkdf2Sync(pw, salt, iter, 32, 'sha256').toString('hex');
    const got = pbkdf2Sha256Hex(pw, new Uint8Array(salt), iter);
    if (got !== expect) throw new Error(`mismatch at iter=${iter}`);
  }
});

check('crypto: 40k-iter sign-in hash is fast enough (<600ms cold)', () => {
  const t0 = Date.now();
  pbkdf2Sha256Hex('password123', hexToBytes('00112233445566778899aabbccddeeff'), 40000);
  const ms = Date.now() - t0;
  if (ms > 600) throw new Error('too slow: ' + ms + 'ms');
});

check('accounts: sign up creates account + clean workspace + session', () => {
  const r = AUTH.createAccount({name:'Victor Mwangi', email:'victor@victech.co.ke', password:'mpesa2026', secQ:'What city were you born in?', secA:'nairobi'});
  if (!r.ok) throw new Error(r.error);
  const acc = AUTH.byEmail('VICTOR@victech.co.ke'); // case-insensitive
  if (!acc) throw new Error('account not stored');
  if (AUTH.session() !== 'victor@victech.co.ke') throw new Error('session not set');
  const key = AUTH.dbKey('victor@victech.co.ke');
  const raw = ls.getItem(key);
  if (!raw) throw new Error('profile db missing');
  const d = JSON.parse(raw);
  if (d.jobs.length !== 0 || d.counters.job !== 0) throw new Error('new account should start clean');
  if (d.business.ownerName !== 'Victor Mwangi') throw new Error('owner name not set from account');
  if (d.business.templates.job_confirm === undefined) throw new Error('default templates missing');
});

check('accounts: duplicate email rejected, weak password rejected', () => {
  let r = AUTH.createAccount({name:'X', email:'victor@victech.co.ke', password:'longenough', secQ:'q', secA:'a'});
  if (r.ok) throw new Error('duplicate email accepted');
  r = AUTH.createAccount({name:'Y', email:'y@y.co', password:'123', secQ:'q', secA:'a'});
  if (r.ok) throw new Error('short password accepted');
});

check('sign-in: wrong password rejected, correct accepted', () => {
  if (AUTH.verify('victor@victech.co.ke', 'wrongpass')) throw new Error('wrong password verified!');
  if (!AUTH.verify('victor@victech.co.ke', 'mpesa2026')) throw new Error('correct password rejected');
});

check('forgot password: wrong security answer rejected, correct resets', () => {
  let r = AUTH.resetPassword({email:'victor@victech.co.ke', answer:'mombasa', newPassword:'newpass99'});
  if (r.ok) throw new Error('wrong security answer accepted');
  r = AUTH.resetPassword({email:'victor@victech.co.ke', answer:'Nairobi', newPassword:'newpass99'});
  if (!r.ok) throw new Error('correct answer rejected: ' + r.error);
  if (AUTH.verify('victor@victech.co.ke', 'mpesa2026')) throw new Error('old password still works');
  if (!AUTH.verify('victor@victech.co.ke', 'newpass99')) throw new Error('new password does not work');
});

check('changePassword: old required, then verifiable', () => {
  let r = AUTH.changePassword('victor@victech.co.ke', 'nope', 'zombie123');
  if (r.ok) throw new Error('changed with wrong old password');
  r = AUTH.changePassword('victor@victech.co.ke', 'newpass99', 'zombie123');
  if (!r.ok) throw new Error('change failed: ' + r.error);
  if (!AUTH.verify('victor@victech.co.ke', 'zombie123')) throw new Error('new password not verified');
});

check('data isolation: two accounts, separate workspaces', () => {
  AUTH.createAccount({name:'Helper', email:'helper@victech.co.ke', password:'helper123', secQ:'What city were you born in?', secA:'kisumu'});
  const kA = AUTH.dbKey('victor@victech.co.ke');
  const dA = JSON.parse(ls.getItem(kA));
  dA.customers.push({id:'c-x', name:'Only for Victor', type:'Residential', phone:'', email:'', area:'', address:'', notes:[], createdAt:'2026-08-01'});
  ls.setItem(kA, JSON.stringify(dA));
  AUTH.signIn('helper@victech.co.ke');
  const dB = JSON.parse(ls.getItem(AUTH.dbKey('helper@victech.co.ke')));
  if (dB.customers.some(c => c.name === 'Only for Victor')) throw new Error('data leaked across accounts!');
  if (dB.customers.length !== 0) throw new Error('helper workspace not clean');
  AUTH.signIn('victor@victech.co.ke');
  const dA2 = JSON.parse(ls.getItem(kA));
  if (!dA2.customers.some(c => c.name === 'Only for Victor')) throw new Error("Victor's data lost");
});

check('deleteAccount: removes profile + its database', () => {
  const before = AUTH.dbKey('helper@victech.co.ke');
  AUTH.deleteAccount('helper@victech.co.ke');
  if (AUTH.byEmail('helper@victech.co.ke')) throw new Error('account still listed');
  if (ls.getItem(before) !== null) throw new Error('profile db not removed');
});

check('guest: legacy key preserved', () => {
  if (AUTH.dbKey('guest') !== 'aquaflow_pms_v1') throw new Error('guest key changed');
  AUTH.signInGuest();
  if (AUTH.session() !== 'guest') throw new Error('guest session not set');
});

/* ---------- 2) full UI flow in jsdom (no preset session) ---------- */
const appFiles = ['js/utils.js','js/seed.js','js/sync.js','js/auth.js','js/app.js','js/pdf.js',
  'js/views/dashboard.js','js/views/leads.js','js/views/jobs.js','js/views/dispatch.js','js/views/customers.js',
  'js/views/quotes.js','js/views/invoices.js','js/views/expenses.js','js/views/reports.js','js/views/inventory.js','js/views/maintenance.js',
  'js/views/whatsapp.js','js/views/sync.js','js/views/settings.js','js/main.js'];
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost:8484/', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
const doc = win.document;
win.scrollTo = () => {};
win.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){} });
win.addEventListener('error', e => errors.push('window error: ' + (e.message || e.error)));
const appCode = appFiles.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n;\n');
try { win.eval(appCode); } catch (e) { console.error('EVAL FAIL:', e); process.exit(1); }

setTimeout(() => {
  check('ui: auth screen shown when no session (app hidden)', () => {
    const root = doc.getElementById('auth-root');
    if (!root || root.hidden) throw new Error('auth screen not visible');
    if (!doc.body.classList.contains('preauth')) throw new Error('body not in preauth');
    if (win.API) throw new Error('app booted despite no session');
  });

  check('ui: create account through the sign-up form', () => {
    doc.getElementById('au-tab-up').click();
    doc.getElementById('au-name').value = 'Victor Kiptanui';
    doc.getElementById('au-uemail').value = 'v.kiptanui@example.co.ke';
    doc.getElementById('au-upass').value = 'solar2026';
    doc.getElementById('au-sq').value = 'What city were you born in?';
    doc.getElementById('au-sqa').value = 'nairobi';
    doc.getElementById('au-create').click();
    if (!win.API) throw new Error('app did not boot after sign-up');
    if (doc.body.classList.contains('preauth')) throw new Error('still in preauth');
    if (win.API.db.jobs.length !== 0) throw new Error('new account workspace not clean');
    if (win.API.db.business.ownerName !== 'Victor Kiptanui') throw new Error('owner name missing');
  });

  check('ui: settings shows Account & security + Team', () => {
    win.API.go('settings', {});
    const h = doc.getElementById('content').innerHTML;
    if (!h.includes('Account &amp; security')) throw new Error('account card missing');
    if (!h.includes('Team')) throw new Error('team card missing');
    if (!h.includes('v.kiptanui@example.co.ke')) throw new Error('account email missing');
  });

  check('ui: add technician from settings', () => {
    doc.getElementById('st-tech-add').click();
    doc.getElementById('tf-name').value = 'Victor Kiptanui';
    doc.getElementById('tf-role').value = 'Standard';
    doc.getElementById('tf-rate').value = '1200';
    doc.getElementById('tf-save').click();
    const t = win.API.db.technicians.find(x => x.name === 'Victor Kiptanui');
    if (!t) throw new Error('technician not added');
    if (t.rate !== 1200) throw new Error('rate wrong');
  });

  check('ui: sign out returns to auth screen; sign in works', () => {
    win.API.go('settings', {});
    doc.getElementById('st-out').click();
    const root = doc.getElementById('auth-root');
    if (!root || root.hidden) throw new Error('auth screen not shown after sign out');
    doc.getElementById('au-email').value = 'v.kiptanui@example.co.ke';
    doc.getElementById('au-pass').value = 'wrongpw';
    doc.getElementById('au-signin').click();
    if (!doc.getElementById('au-msg').textContent.includes('Wrong')) throw new Error('bad password not flagged');
    doc.getElementById('au-pass').value = 'solar2026';
    doc.getElementById('au-signin').click();
    if (doc.body.classList.contains('preauth')) throw new Error('did not enter app after sign-in');
    if (win.API.db.technicians.length !== 1) throw new Error("profile data not restored after re-sign-in");
  });

  check('ui: forgot password via security question (UI)', () => {
    win.API.go('settings', {});
    doc.getElementById('st-out').click();
    doc.getElementById('au-forgot').click();
    doc.getElementById('au-femail').value = 'v.kiptanui@example.co.ke';
    doc.getElementById('au-femail').dispatchEvent(new win.Event('change', {bubbles:true}));
    if (!doc.getElementById('au-fq').textContent.includes('city')) throw new Error('security question not shown: ' + JSON.stringify(doc.getElementById('au-fq').textContent) + ' | acc=' + JSON.stringify(doc.getElementById('au-femail').value));
    doc.getElementById('au-fans').value = 'wrong-city';
    doc.getElementById('au-fnew').value = 'freshpass1';
    doc.getElementById('au-freset').click();
    if (!doc.getElementById('au-msg').textContent.includes('Incorrect')) throw new Error('wrong answer not flagged');
    doc.getElementById('au-fans').value = 'nairobi';
    doc.getElementById('au-freset').click();
    setTimeout(() => {
      try {
        if (!doc.getElementById('au-msg').textContent.toLowerCase().includes('reset')) throw new Error('reset confirmation missing: ' + JSON.stringify(doc.getElementById('au-msg').textContent));
        doc.getElementById('au-email').value = 'v.kiptanui@example.co.ke';
        doc.getElementById('au-pass').value = 'freshpass1';
        doc.getElementById('au-signin').click();
        check('ui: sign-in succeeds with the reset password', () => {
          if (doc.body.classList.contains('preauth')) throw new Error('still on auth screen after reset+sign-in');
        });
      } catch (e) { errors.push('forgot flow: ' + e.message); }
      finish();
    }, 1100);
    return;
  });

  setTimeout(finish, 2500); // safety if the forgot flow's inner check didn't run
  let done = false;
  function finish(){
    if (done) return; done = true;
    if (errors.length) {
      console.error(`\n${errors.length} FAILURE(S):`);
      errors.forEach(e => console.error(' - ' + e));
      process.exit(1);
    }
    console.log('\nALL ACCOUNTS TESTS PASSED ✅');
    process.exit(0);
  }
}, 200);
