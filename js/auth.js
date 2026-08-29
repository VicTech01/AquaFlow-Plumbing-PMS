'use strict';
/* ================= AquaFlow PMS — accounts (offline-first, local) =================
   Email + password per device. PBKDF2-SHA256 (pure JS, no backend).
   Each account owns its own database (localStorage key per email).
   Forgot password = answer the security question set at sign-up (works offline).
   Guest mode keeps the original local demo workspace. */

/* ---------- crypto: SHA-256 + PBKDF2 (pure JS) ---------- */
const K256 = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotr32 = (x,n) => (x>>>n) | (x<<(32-n));
function utf8Encode(s){
  const out = [];
  for(let i=0;i<s.length;i++){
    let c = s.codePointAt(i);
    if(c > 0xffff) i++;
    if(c < 0x80) out.push(c);
    else if(c < 0x800) out.push(0xc0|(c>>6), 0x80|(c&63));
    else if(c < 0x10000) out.push(0xe0|(c>>12), 0x80|((c>>6)&63), 0x80|(c&63));
    else out.push(0xf0|(c>>18), 0x80|((c>>12)&63), 0x80|((c>>6)&63), 0x80|(c&63));
  }
  return out;
}
function sha256Raw(bytes){
  const l = bytes.length;
  const bitHi = Math.floor(l*8 / 0x100000000);
  const bitLo = (l*8) >>> 0;
  const padLen = ((l + 9 + 63) & ~63);
  const msg = new Uint8Array(padLen);
  for(let i=0;i<l;i++) msg[i] = bytes[i];
  msg[l] = 0x80;
  msg[padLen-8] = (bitHi>>>24)&255; msg[padLen-7] = (bitHi>>>16)&255; msg[padLen-6] = (bitHi>>>8)&255; msg[padLen-5] = bitHi&255;
  msg[padLen-4] = (bitLo>>>24)&255; msg[padLen-3] = (bitLo>>>16)&255; msg[padLen-2] = (bitLo>>>8)&255; msg[padLen-1] = bitLo&255;
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const w = new Array(64);
  const gv = (o) => ((msg[o]<<24)|(msg[o+1]<<16)|(msg[o+2]<<8)|msg[o+3])>>>0;
  for(let off=0; off<padLen; off+=64){
    for(let t=0;t<16;t++) w[t] = gv(off+t*4);
    for(let t=16;t<64;t++){
      const x = w[t-15], y = w[t-2];
      const s0 = (rotr32(x,7)^rotr32(x,18)^(x>>>3))>>>0;
      const s1 = (rotr32(y,17)^rotr32(y,19)^(y>>>10))>>>0;
      w[t] = (w[t-16]+s0+w[t-7]+s1)>>>0;
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let t=0;t<64;t++){
      const S1 = (rotr32(e,6)^rotr32(e,11)^rotr32(e,25))>>>0;
      const ch = ((e&f)^(~e&g))>>>0;
      const t1 = (h+S1+ch+K256[t]+w[t])>>>0;
      const S0 = (rotr32(a,2)^rotr32(a,13)^rotr32(a,22))>>>0;
      const maj = ((a&b)^(a&c)^(b&c))>>>0;
      const t2 = (S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  const out = new Uint8Array(32);
  for(let i=0;i<8;i++){ out[i*4]=H[i]>>>24; out[i*4+1]=(H[i]>>>16)&255; out[i*4+2]=(H[i]>>>8)&255; out[i*4+3]=H[i]&255; }
  return out;
}
function bytesToHex(b){ return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(''); }
function hexToBytes(h){ const b = new Uint8Array(h.length>>1); for(let i=0;i<b.length;i++) b[i] = parseInt(h.slice(i*2,i*2+2),16); return b; }
function sha256Hex(str){ return bytesToHex(sha256Raw(utf8Encode(str))); }
/* HMAC-SHA256(key, msg) — required PRF for PBKDF2 */
function hmacSha256Raw(key, msg){
  const BLOCK = 64;
  const k = (key.length > BLOCK) ? sha256Raw(key) : key;
  const inner = new Uint8Array(BLOCK + msg.length);
  const outer = new Uint8Array(BLOCK + 32);
  for(let i=0;i<BLOCK;i++){
    const kb = (i < k.length) ? k[i] : 0;
    inner[i] = kb ^ 0x36; outer[i] = kb ^ 0x5c;
  }
  inner.set(msg, BLOCK);
  outer.set(sha256Raw(inner), BLOCK);
  return sha256Raw(outer);
}
/* PBKDF2-SHA256: DK = U1 ^ U2 ^ ... ^ U(iter), U1=HMAC(pw, salt||INT(1)), Ui=HMAC(pw, U(i-1)).
   32-byte output = single block (DKLen=32).
   Optimized: HMAC pad blocks depend only on the key — compute once, reuse per iteration. */
function pbkdf2Sha256Hex(password, saltBytes, iter){
  const pw = utf8Encode(password);
  const BLOCK = 64;
  const kp = (pw.length > BLOCK) ? sha256Raw(pw) : pw;
  const innerHead = new Uint8Array(BLOCK), outerHead = new Uint8Array(BLOCK);
  for(let i=0;i<BLOCK;i++){
    const kb = (i < kp.length) ? kp[i] : 0;
    innerHead[i] = kb ^ 0x36; outerHead[i] = kb ^ 0x5c;
  }
  // U1 = H(outerHead || H(innerHead || salt || INT(1)))
  const b1 = new Uint8Array(BLOCK + saltBytes.length + 4);
  b1.set(innerHead); b1.set(saltBytes, BLOCK); b1[BLOCK + saltBytes.length + 3] = 1;
  let u = sha256Raw(b1);
  const innerBuf = new Uint8Array(BLOCK + 32), outerBuf = new Uint8Array(BLOCK + 32);
  innerBuf.set(innerHead); outerBuf.set(outerHead);
  outerBuf.set(u, BLOCK);
  u = sha256Raw(outerBuf);
  const out = new Uint8Array(32);
  out.set(u);
  for(let it=1; it<iter; it++){
    innerBuf.set(u, BLOCK);
    outerBuf.set(sha256Raw(innerBuf), BLOCK);
    u = sha256Raw(outerBuf);
    for(let j=0;j<32;j++) out[j] ^= u[j];
  }
  return bytesToHex(out);
}
function randHex(n){
  const b = new Uint8Array(n);
  const c = (typeof window!=='undefined' && window.crypto) ? window.crypto : (typeof crypto!=='undefined'?crypto:null);
  if(c && c.getRandomValues) c.getRandomValues(b);
  else for(let i=0;i<n;i++) b[i] = Math.floor(Math.random()*256);
  return bytesToHex(b);
}

/* ---------- account store ---------- */
const SEC_QUESTIONS = [
  'What was the name of your first car?',
  'What city were you born in?',
  'What was the name of your primary school?'
];
const AUTH = {
  ACC_KEY: 'aquaflow_accounts_v1',
  SES_KEY: 'aquaflow_session_v1',
  ITER: 40000,

  accounts(){ try { return JSON.parse(localStorage.getItem(this.ACC_KEY)) || []; } catch(e){ return []; } },
  saveAccounts(list){ try { localStorage.setItem(this.ACC_KEY, JSON.stringify(list)); } catch(e){} },
  byEmail(email){
    const e = String(email||'').trim().toLowerCase();
    return this.accounts().find(a => a.email === e) || null;
  },
  session(){ try { return localStorage.getItem(this.SES_KEY) || ''; } catch(e){ return ''; } },
  setSession(v){ try { v ? localStorage.setItem(this.SES_KEY, v) : localStorage.removeItem(this.SES_KEY); } catch(e){} },
  hasSession(){ return !!this.session(); },
  role(email){
    const e = String(email || this.session() || '').trim().toLowerCase();
    if(!e || e === 'guest') return 'admin';
    const acc = this.byEmail(e);
    return (acc && acc.role === 'customer') ? 'customer' : 'admin';
  },
  dbKey(email){
    return email === 'guest' ? 'aquaflow_pms_v1' : 'aquaflow_pms_v1:' + String(email||'guest').toLowerCase();
  },

  createAccount({name, email, password, secQ, secA, role, custId, bizKey}){
    name = String(name||'').trim();
    email = String(email||'').trim().toLowerCase();
    secQ = secQ || SEC_QUESTIONS[0];
    secA = String(secA||'').trim();
    role = role === 'customer' ? 'customer' : 'admin';
    if(!name) return {ok:false, error:'Enter your name'};
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return {ok:false, error:'Enter a valid email address'};
    if(!password || password.length < 6) return {ok:false, error:'Password must be at least 6 characters'};
    if(!secA) return {ok:false, error:'Answer the security question (used to reset a forgotten password)'};
    if(this.byEmail(email)) return {ok:false, error:'An account with this email already exists on this device'};
    const salt = randHex(16);
    const acc = {
      email, name, role,
      salt,
      hash: pbkdf2Sha256Hex(password, hexToBytes(salt), this.ITER),
      sq: secQ,
      sqHash: sha256Hex(secA.toLowerCase()),
      createdAt: new Date().toISOString()
    };
    if(custId) acc.custId = custId;
    if(bizKey) acc.bizKey = bizKey;
    const list = this.accounts(); list.push(acc); this.saveAccounts(list);
    if(role !== 'customer'){
      // fresh clean workspace for this account (no demo data)
      const key = this.dbKey(email);
      try { localStorage.setItem(key, JSON.stringify(emptyDb(name))); } catch(e){}
    }
    this.setSession(email);
    return {ok:true, account:acc};
  },

  verify(email, password){
    const acc = this.byEmail(email);
    if(!acc) return false;
    return pbkdf2Sha256Hex(String(password||''), hexToBytes(acc.salt), this.ITER) === acc.hash;
  },
  signIn(email){ this.setSession(String(email||'').trim().toLowerCase()); },
  signOut(){ this.setSession(''); },
  signInGuest(){ this.setSession('guest'); },

  /* forgot password — offline, via security question */
  _findAcc(email){
    const e = String(email||'').trim().toLowerCase();
    const list = this.accounts();
    const acc = list.find(a => a.email === e) || null;
    return {list, acc, e};
  },
  resetPassword({email, answer, newPassword}){
    const {list, acc} = this._findAcc(email);
    if(!acc) return {ok:false, error:'No account with this email on this device'};
    if(sha256Hex(String(answer||'').trim().toLowerCase()) !== acc.sqHash) return {ok:false, error:'Incorrect security answer'};
    if(!newPassword || newPassword.length < 6) return {ok:false, error:'New password must be at least 6 characters'};
    acc.salt = randHex(16);
    acc.hash = pbkdf2Sha256Hex(newPassword, hexToBytes(acc.salt), this.ITER);
    this.saveAccounts(list);
    return {ok:true};
  },
  securityQuestionFor(email){
    const acc = this.byEmail(email);
    return acc ? acc.sq : null;
  },

  changePassword(email, oldPassword, newPassword){
    const {list, acc, e} = this._findAcc(email);
    if(!acc) return {ok:false, error:'Account not found'};
    if(!this.verify(e, oldPassword)) return {ok:false, error:'Current password is incorrect'};
    if(!newPassword || newPassword.length < 6) return {ok:false, error:'New password must be at least 6 characters'};
    acc.salt = randHex(16);
    acc.hash = pbkdf2Sha256Hex(newPassword, hexToBytes(acc.salt), this.ITER);
    this.saveAccounts(list);
    return {ok:true};
  },
  changeSecurityQuestion(email, newQ, newA){
    const {list, acc} = this._findAcc(email);
    if(!acc) return {ok:false, error:'Account not found'};
    newA = String(newA||'').trim();
    if(!newA) return {ok:false, error:'Answer is required'};
    acc.sq = newQ || SEC_QUESTIONS[0];
    acc.sqHash = sha256Hex(newA.toLowerCase());
    this.saveAccounts(list);
    return {ok:true};
  },
  deleteAccount(email){
    const e = String(email||'').trim().toLowerCase();
    this.saveAccounts(this.accounts().filter(a => a.email !== e));
    try { localStorage.removeItem(this.dbKey(e)); } catch(err){}
    if(this.session() === e) this.setSession('');
  }
};

/* fresh clean business workspace for a new account */
function emptyDb(ownerName){
  return {
    v:1,
    counters:{job:0, quote:0, invoice:0, lead:0},
    business:{
      name:'AquaFlow Plumbing Ltd', ownerName: ownerName || 'Boss', phone:'', whatsapp:'',
      email:'', address:'',
      vatRate:16, dueDays:14, currency:'KES',
      rates:{standard:1200, senior:1800, apprentice:900},
      travel:{city:400, outskirts:1200, county:2500},
      prefixes:{job:'JOB', quote:'QUO', invoice:'INV', lead:'LEAD'},
      templates: typeof DEFAULT_TEMPLATES !== 'undefined' ? {...DEFAULT_TEMPLATES} : {}
    },
    customers:[], technicians:[], jobs:[], quotes:[], invoices:[],
    inventory:[], maintenance:[], outbox:[], leads:[], expenses:[], tombstones:[],
    meta:{createdAt:new Date().toISOString()}
  };
}

/* ---------- auth screen ---------- */
AUTH.renderAuth = function(initialMode){
  const root = document.getElementById('auth-root');
  if(!root) return;
  root.hidden = false;
  document.body.classList.add('preauth');
  document.body.classList.remove('app-customer');
  root.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="logo-mark" style="width:44px;height:44px">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12z"/></svg>
        </div>
        <h1>AquaFlow</h1>
        <p class="muted small">Plumbing Business OS — manage jobs, track materials, get paid, know your profit.</p>
      </div>
      <div class="auth-tabs">
        <button id="au-tab-in" class="active">Sign in</button>
        <button id="au-tab-up">Create account</button>
      </div>
      <div id="au-view"></div>
      <div class="auth-div"><span>or</span></div>
      <button class="btn ghost" id="au-guest" style="width:100%;justify-content:center">Continue as guest (local demo)</button>
    </div>
    <div class="auth-foot muted small">Data stays on this device. Nothing is sent anywhere.</div>
  </div>`;
  const views = {
    'in': `
      <div class="field"><label>Email</label><input class="inp" id="au-email" type="email" autocomplete="email" placeholder="you@business.co.ke"></div>
      <div class="field"><label>Password</label><input class="inp" id="au-pass" type="password" autocomplete="current-password" placeholder="••••••••"></div>
      <div id="au-msg"></div>
      <button class="btn primary" id="au-signin" style="width:100%;justify-content:center">Sign in</button>
      <button class="linklike small mt8" id="au-forgot" style="display:block">Forgot password?</button>`,
    'up': `
      <div class="field"><label>Who is signing up?</label>
        <div class="role-pick" id="au-rolepick">
          <button type="button" class="role-btn active" data-role="admin">👷 Business owner<span class="muted small">full access to the business</span></button>
          <button type="button" class="role-btn" data-role="customer">👤 Customer<span class="muted small">view my quotes, invoices &amp; payments</span></button>
        </div></div>
      <div class="field"><label>Full name</label><input class="inp" id="au-name" placeholder="e.g. Victor Mwangi"></div>
      <div class="field"><label>Email</label><input class="inp" id="au-uemail" type="email" placeholder="you@business.co.ke"></div>
      <div class="field"><label>Password</label><input class="inp" id="au-upass" type="password" placeholder="At least 6 characters"></div>
      <div class="field"><label>Security question</label>
        <select class="inp" id="au-sq">${SEC_QUESTIONS.map(q=>`<option>${q}</option>`).join('')}</select></div>
      <div class="field"><label>Your answer <span class="muted small">(to reset a forgotten password)</span></label><input class="inp" id="au-sqa" placeholder="Remember this — it works offline"></div>
      <div id="au-msg"></div>
      <button class="btn primary" id="au-create" style="width:100%;justify-content:center">Create account</button>`,
    'forgot': `
      <p class="muted small" style="margin-top:0">Answer the security question you set when creating the account. This resets the password on this device — no internet needed.</p>
      <div class="field"><label>Email</label><input class="inp" id="au-femail" type="email"></div>
      <div id="au-fq"></div>
      <div class="field"><label>Your answer</label><input class="inp" id="au-fans"></div>
      <div class="field"><label>New password</label><input class="inp" id="au-fnew" type="password" placeholder="At least 6 characters"></div>
      <div id="au-msg"></div>
      <button class="btn primary" id="au-freset" style="width:100%;justify-content:center">Reset password</button>
      <button class="linklike small mt8" id="au-fback" style="display:block">← Back to sign in</button>`
  };
  let mode = (initialMode === 'up') ? 'up' : 'in';
  const view = document.getElementById('au-view');
  const setMsg = (text, ok) => {
    const el = document.getElementById('au-msg');
    if(el) el.innerHTML = text ? `<div class="${ok?'ok':'bad'} small" style="margin-bottom:8px">${esc(text)}</div>` : '';
  };
  const show = m => {
    mode = m;
    view.innerHTML = views[m];
    if(typeof bindPwToggles === 'function') bindPwToggles(view);
    document.getElementById('au-tab-in').classList.toggle('active', m==='in');
    document.getElementById('au-tab-up').classList.toggle('active', m==='up');
    if(m==='in'){
      document.getElementById('au-signin').onclick = () => {
        const email = document.getElementById('au-email').value.trim();
        const acc = AUTH.byEmail(email);
        if(!acc){
          setMsg('No account found for this email on this device. Accounts are stored on the device itself — tap "Create account" to set one up here.', false);
          return;
        }
        if(!AUTH.verify(email, document.getElementById('au-pass').value)){
          setMsg('Wrong password for this account. Try again, or use "Forgot password?" below.', false); return;
        }
        AUTH.signIn(email);
        bootedEnterApp();
      };
      document.getElementById('au-forgot').onclick = () => show('forgot');
      const em = document.getElementById('au-email'); if(em) em.focus();
      ['au-email','au-pass'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('au-signin').click(); });
      });
    }
    if(m==='up'){
      let upRole = 'admin';
      const pick = document.getElementById('au-rolepick');
      if(pick) $$('.role-btn', pick).forEach(b => b.onclick = () => {
        $$('.role-btn', pick).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        upRole = b.dataset.role;
      });
      document.getElementById('au-create').onclick = () => {
        const r = AUTH.createAccount({
          name: document.getElementById('au-name').value,
          email: document.getElementById('au-uemail').value,
          password: document.getElementById('au-upass').value,
          secQ: document.getElementById('au-sq').value,
          secA: document.getElementById('au-sqa').value,
          role: upRole
        });
        if(!r.ok){ setMsg(r.error, false); return; }
        bootedEnterApp();
      };
      const nm = document.getElementById('au-name'); if(nm) nm.focus();
      ['au-name','au-uemail','au-upass','au-sqa'].forEach(id => {
        const el = document.getElementById(id);
        if(el && el.tagName !== 'SELECT') el.addEventListener('keydown', e => { if(e.key === 'Enter') document.getElementById('au-create').click(); });
      });
    }
    if(m==='forgot'){
      const emailEl = document.getElementById('au-femail');
      const fq = document.getElementById('au-fq');
      emailEl.addEventListener('change', () => {
        const q = AUTH.securityQuestionFor(emailEl.value);
        fq.innerHTML = q ? `<div class="badge-info">${esc(q)}</div>` : '';
      });
      document.getElementById('au-fback').onclick = () => show('in');
      document.getElementById('au-freset').onclick = () => {
        const r = AUTH.resetPassword({
          email: emailEl.value,
          answer: document.getElementById('au-fans').value,
          newPassword: document.getElementById('au-fnew').value
        });
        if(!r.ok){ setMsg(r.error, false); return; }
        setMsg('Password reset — sign in with your new password.', true);
        setTimeout(() => { show('in'); setMsg('Password reset — sign in with your new password.', true); }, 900);
      };
    }
  };
  document.getElementById('au-tab-in').onclick = () => show('in');
  document.getElementById('au-tab-up').onclick = () => show('up');
  document.getElementById('au-guest').onclick = () => { AUTH.signInGuest(); bootedEnterApp(); };
  show(mode);
};

AUTH.hideAuth = function(){
  const root = document.getElementById('auth-root');
  if(root) root.hidden = true;
  document.body.classList.remove('preauth');
};

/* ---------- boot ---------- */
function bootedEnterApp(){
  AUTH.hideAuth();
  const s = AUTH.session() || 'guest';
  const role = AUTH.role(s);
  document.body.classList.toggle('app-customer', role === 'customer');
  if(typeof db !== 'undefined' && db && window.__AF_SESSION && window.__AF_SESSION !== s){
    // profile switched at the auth gate — load that profile's database
    if(role === 'customer'){
      db = DB.loadFor(s) || DB.load() || db;
    } else {
      db = DB.load();
      if(!db){
        if(s === 'guest'){
          // guest workspace is the seeded demo — create it if this device has never used it
          DB.seed();
        } else {
          const a = AUTH.byEmail(s);
          db = emptyDb(a ? a.name : 'Boss');
          DB.save();
        }
      }
    }
  }
  window.__AF_SESSION = s;
  // role may have changed (admin ↔ customer) — rebuild the navigation shell
  if(typeof buildNav === 'function'){ buildNav(); if(typeof buildTabbar === 'function') buildTabbar(); }
  if(typeof initApp === 'function') initApp();
  // always land on the correct home view for this role (profile switch at the gate)
  if(typeof go === 'function') go(role === 'customer' ? 'cust_dash' : 'dashboard', {});
}
function storageOK(){
  try { localStorage.setItem('__af_probe', '1'); localStorage.removeItem('__af_probe'); return true; }
  catch(e){ return false; }
}
function bootApp(){
  if(!storageOK()){
    AUTH.renderAuth();
    const foot = document.querySelector('.auth-foot');
    if(foot) foot.innerHTML = '⚠️ Browser storage is blocked (private browsing?) — accounts and data will NOT persist in this window. The app itself will work for the session.';
    return;
  }
  if(AUTH.hasSession()){
    bootedEnterApp();
  } else {
    AUTH.renderAuth();
  }
}
if(typeof document !== 'undefined'){
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootApp);
  else bootApp();
}
