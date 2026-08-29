'use strict';
/* ================= utils ================= */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const pad2 = n => String(n).padStart(2,'0');
const pad4 = n => String(n).padStart(4,'0');

const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const uid = p => (p||'x') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);

const today = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
const isoDate = d => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const parseISO = s => {
  if(!s) return null;
  const [y,m,d] = String(s).slice(0,10).split('-').map(Number);
  return new Date(y, (m||1)-1, d||1);
};
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const addMonths = (d,n) => { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; };
const dayDiff = (a,b) => Math.round((parseISO(b) - parseISO(a)) / 86400000); // b - a in days

const fmtDate = s => { const d = parseISO(s); return d ? d.toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric'}) : ''; };
const fmtDateShort = s => { const d = parseISO(s); return d ? d.toLocaleDateString('en-KE',{weekday:'short',day:'numeric',month:'short'}) : ''; };
const fmtDateFull = s => { const d = parseISO(s); return d ? d.toLocaleDateString('en-KE',{weekday:'long',day:'numeric',month:'long',year:'numeric'}) : ''; };
const relDays = s => {
  const n = dayDiff(isoDate(today()), s);
  if(n===0) return 'today';
  if(n===1) return 'tomorrow';
  if(n===-1) return 'yesterday';
  if(n>0) return `in ${n} days`;
  return `${-n} days ago`;
};

const money = n => {
  n = Number(n)||0;
  return new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);
};
const clamp = (n,a,b) => Math.min(b, Math.max(a,n));
const sum = (arr,f) => arr.reduce((t,x)=>t+(f?f(x):x),0);
const minToHM = m => `${pad2(Math.floor(m/60))}:${pad2(m%60)}`;
const hmToMin = s => { const [h,m] = String(s||'0:0').split(':').map(Number); return (h||0)*60+(m||0); };
const initials = name => String(name||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
