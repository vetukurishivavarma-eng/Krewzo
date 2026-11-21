// Ops review screen for worker ID checks, served at /admin. Self-contained; the admin key is typed in and kept
// only for this browser tab. All worker data is rendered with textContent (never innerHTML).
export const ADMIN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Krewzo ops</title>
<style>
:root { --bg:#f6f3ee; --card:#fff; --ink:#15130f; --muted:#6f6a62; --line:#e6dfd4; --lime:#c8f031; --red:#d6403a; --amber:#b86e00; --green:#1f7a4d; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap { max-width:1000px; margin:0 auto; padding:24px 16px 60px; display:grid; gap:18px; }
h1 { margin:0; font-size:26px; letter-spacing:-.02em; }
.bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; }
.tabs { display:flex; gap:6px; background:#ebe5db; padding:4px; border-radius:12px; }
.tabs button { border:0; background:none; padding:8px 14px; border-radius:9px; font:600 14px inherit; cursor:pointer; color:var(--muted); }
.tabs button.on { background:var(--card); color:var(--ink); box-shadow:0 1px 2px rgba(0,0,0,.08); }
input[type=password], input[type=text] { height:40px; border:1px solid var(--line); border-radius:10px; padding:0 12px; font:inherit; background:var(--card); }
.btn { height:40px; border:0; border-radius:10px; padding:0 14px; font:600 14px inherit; cursor:pointer; }
.ok { background:var(--lime); color:var(--ink); } .no { background:#f3dedd; color:var(--red); } .ghost { background:#ebe5db; }
.card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:18px; display:grid; grid-template-columns:auto 1fr; gap:18px; }
.photos { display:flex; gap:10px; }
.photos figure { margin:0; text-align:center; font-size:12px; color:var(--muted); }
.photos img, .photos .none { width:120px; height:150px; object-fit:cover; border-radius:12px; border:1px solid var(--line); background:#eee; display:flex; align-items:center; justify-content:center; image-rendering:auto; }
dl { margin:0; display:grid; grid-template-columns:max-content 1fr; gap:4px 14px; }
dt { color:var(--muted); } dd { margin:0; font-weight:600; min-width:0; overflow-wrap:anywhere; }
.chips { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
.chip { font-size:12px; font-weight:700; padding:3px 9px; border-radius:99px; background:#fbeed6; color:var(--amber); }
.chip.good { background:#dcefe4; color:var(--green); }
.actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.actions input { flex:1; min-width:180px; }
.empty, .err { padding:30px; text-align:center; color:var(--muted); background:var(--card); border-radius:20px; border:1px dashed var(--line); }
.err { color:var(--red); }
.sos { background:#fff1f0; border:2px solid var(--red); border-radius:20px; padding:16px; display:grid; gap:8px; }
.sos b { color:var(--red); }
.section-h { font-size:18px; margin:8px 0 0; letter-spacing:-.01em; }
.rep { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:16px; display:grid; gap:8px; }
.hold { font-size:12px; font-weight:700; padding:3px 9px; border-radius:99px; background:#f3dedd; color:var(--red); justify-self:start; }
@media (max-width:640px) { .card { grid-template-columns:1fr; } }
</style></head>
<body><div class="wrap">
  <div class="bar"><h1>Krewzo ops</h1>
    <form id="keyf" style="display:flex;gap:8px"><input id="key" type="password" placeholder="Admin key" autocomplete="off"><button class="btn ghost">Use key</button></form></div>
  <div id="sos"></div>
  <h2 class="section-h">Problem reports</h2>
  <div id="reports"></div>
  <h2 class="section-h">ID checks</h2>
  <div class="bar"><div class="tabs" id="tabs"><button data-s="PENDING" class="on">To review</button><button data-s="VERIFIED">Approved</button><button data-s="REJECTED">Rejected</button></div>
    <span id="count" style="color:var(--muted)"></span></div>
  <div id="list"></div>
  <form id="resetf" class="bar" style="justify-content:flex-start;border-top:1px solid var(--line);padding-top:16px">
    <span style="color:var(--muted)">Send a partner back through the ID check:</span>
    <input id="rphone" type="text" inputmode="numeric" placeholder="Partner phone" style="width:170px"><button class="btn ghost">Reset ID check</button><span id="rmsg" style="color:var(--muted)"></span></form>
</div>
<script>
let key = sessionStorage.getItem('krewzo.admin') || '', tab = 'PENDING';
const FLAG = { SIGNATURE_NOT_CHECKED: 'UIDAI signature NOT checked (no certificate on server)', NO_MOBILE_IN_QR: 'Aadhaar has no mobile to match', NAME_DIFFERS: 'Name differs from sign-up name', DOB_UNREADABLE: 'Date of birth unreadable' };
const el = (t, props = {}, kids = []) => { const e = document.createElement(t); Object.assign(e, props); kids.forEach((k) => e.append(k)); return e; };
const api = async (path, opts = {}) => {
  const r = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', 'x-admin-key': key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
  return j;
};
const CAT = { NOT_DONE: 'Work not done', POOR_QUALITY: 'Poor quality', SAFETY: 'Safety', ASKED_EXTRA_MONEY: 'Asked for extra money', DAMAGE: 'Damage', OTHER: 'Other',
  NOT_PAID_EXTRA_WORK: 'Extra work not paid', UNSAFE: 'Unsafe place', ABUSIVE: 'Abusive customer', WRONG_JOB: 'Job not as described' };
async function loadSafety() {
  const sos = document.getElementById('sos'), reps = document.getElementById('reports');
  sos.replaceChildren(); reps.replaceChildren();
  if (!key) return;
  try {
    for (const a of await api('/api/admin/sos')) {
      const map = a.lat != null ? el('a', { href: 'https://www.google.com/maps?q=' + a.lat + ',' + a.lng, target: '_blank', rel: 'noopener', textContent: 'Open location on map' }) : el('span', { textContent: 'No location sent' });
      sos.append(el('div', { className: 'sos' }, [
        el('b', { textContent: 'SOS · ' + a.role + ' · ' + new Date(a.created_at).toLocaleString('en-IN') }),
        el('div', { textContent: (a.name || '?') + ' · +91 ' + (a.phone || '?') + (a.address ? ' · ' + a.address : '') }),
        map,
        el('button', { className: 'btn ghost', textContent: 'Handled', onclick: async () => { await api('/api/admin/sos/' + a.id + '/handled', { method: 'POST', body: '{}' }); loadSafety(); } }),
      ]));
    }
    const rows = await api('/api/admin/reports');
    if (!rows.length) reps.append(el('div', { className: 'empty', textContent: 'No open reports.' }));
    for (const r of rows) {
      const note = el('input', { type: 'text', placeholder: 'Note (what you found out)' });
      const strike = el('input', { type: 'checkbox' });
      const act = (action) => async () => {
        try { await api('/api/admin/reports/' + r.id + '/resolve', { method: 'POST', body: JSON.stringify({ action, note: note.value, strike: strike.checked }) }); loadSafety(); }
        catch (e) { alert(e.message); }
      };
      const held = r.payment_held && r.disputed;
      reps.append(el('div', { className: 'rep' }, [
        el('b', { textContent: CAT[r.category] + ' · reported by ' + r.reporter_role + ' · job #' + r.booking_id + ' (' + r.booking_status + ')' }),
        ...(held ? [el('span', { className: 'hold', textContent: 'Payment on hold: Rs ' + r.worker_payout })] : []),
        el('div', { textContent: r.details || '(no details)' }),
        el('div', { style: 'color:var(--muted)', textContent: 'Customer ' + r.customer_name + ' +91 ' + r.customer_phone + ' · Worker ' + (r.worker_name || '-') + (r.worker_phone ? ' +91 ' + r.worker_phone : '') + ' · ' + r.address }),
        el('div', { className: 'actions' }, [note,
          el('label', { style: 'display:flex;gap:6px;align-items:center' }, [strike, 'Strike worker']),
          ...(held ? [el('button', { className: 'btn ok', textContent: 'Pay worker', onclick: act('PAY_WORKER') }), el('button', { className: 'btn no', textContent: 'Refund customer', onclick: act('REFUND') })] : []),
          el('button', { className: 'btn ghost', textContent: 'Close', onclick: act('CLOSE') })]),
      ]));
    }
  } catch (e) { reps.append(el('div', { className: 'err', textContent: e.message })); }
}

async function load() {
  const list = document.getElementById('list');
  list.replaceChildren();
  if (!key) { list.append(el('div', { className: 'empty', textContent: 'Enter the admin key (ADMIN_KEY in the Render dashboard).' })); return; }
  try {
    const rows = await api('/api/admin/kyc?status=' + tab);
    document.getElementById('count').textContent = rows.length + ' worker' + (rows.length === 1 ? '' : 's');
    if (!rows.length) list.append(el('div', { className: 'empty', textContent: tab === 'PENDING' ? 'Nothing to review.' : 'None yet.' }));
    rows.forEach((k) => list.append(card(k)));
  } catch (e) { list.append(el('div', { className: 'err', textContent: e.message })); }
}
function photo(src, label) {
  return el('figure', {}, [src ? el('img', { src, alt: label }) : el('div', { className: 'none', textContent: 'No photo' }), el('figcaption', { textContent: label })]);
}
function card(k) {
  const dl = el('dl');
  [['Sign-up name', k.worker_name], ['Aadhaar name', k.name], ['Phone', k.phone], ['Aadhaar', 'XXXX XXXX ' + k.aadhaar_last4], ['DOB / gender', (k.dob || '?') + ' / ' + (k.gender || '?')], ['Area', k.area || '-'], ['Skills', k.skill_tier + ' · ' + k.trade_tags.join(', ')], ['Submitted', new Date(k.submitted_at).toLocaleString('en-IN')], ...(k.note ? [['Note', k.note]] : [])]
    .forEach(([a, b]) => dl.append(el('dt', { textContent: a }), el('dd', { textContent: b })));
  const chips = el('div', { className: 'chips' }, [
    el('span', { className: 'chip' + (k.sig_ok ? ' good' : ''), textContent: k.sig_ok ? 'UIDAI signature verified' : 'Signature not checked' }),
    ...k.flags.filter((f) => f !== 'SIGNATURE_NOT_CHECKED').map((f) => el('span', { className: 'chip', textContent: FLAG[f] || f })),
  ]);
  const body = el('div', {}, [dl, chips]);
  if (k.status === 'PENDING') {
    const note = el('input', { type: 'text', placeholder: 'Note (shown to ops only)' });
    const act = (body) => async () => { try { await api('/api/admin/workers/' + k.worker_id + '/kyc', { method: 'POST', body: JSON.stringify({ ...body, note: note.value }) }); load(); } catch (e) { alert(e.message); } };
    body.append(el('div', { className: 'actions' }, [note,
      el('button', { className: 'btn ok', textContent: 'Approve', onclick: act({ verified: true }) }),
      el('button', { className: 'btn no', textContent: 'Reject', onclick: act({ verified: false }) }),
      el('button', { className: 'btn no', textContent: 'Reject + block this Aadhaar', onclick: act({ verified: false, block: true }) })]));
  }
  return el('div', { className: 'card' }, [el('div', { className: 'photos' }, [photo(k.selfie, 'Selfie'), photo(k.aadhaar_photo, 'Aadhaar photo')]), body]);
}
document.getElementById('keyf').onsubmit = (e) => { e.preventDefault(); key = document.getElementById('key').value.trim(); sessionStorage.setItem('krewzo.admin', key); load(); loadSafety(); };
setInterval(loadSafety, 30000); // SOS / reports refresh by themselves
document.getElementById('resetf').onsubmit = async (e) => {
  e.preventDefault();
  const msg = document.getElementById('rmsg');
  try { const w = await api('/api/admin/kyc/reset', { method: 'POST', body: JSON.stringify({ phone: document.getElementById('rphone').value }) }); msg.textContent = w.name + ' must verify again.'; load(); }
  catch (err) { msg.textContent = err.message; }
};
document.getElementById('tabs').onclick = (e) => { const s = e.target.dataset.s; if (!s) return; tab = s; [...e.currentTarget.children].forEach((b) => b.classList.toggle('on', b === e.target)); load(); };
load();
loadSafety();
</script></body></html>`;
