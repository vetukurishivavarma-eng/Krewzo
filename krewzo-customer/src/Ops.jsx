import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, LogOut, MapPin, Phone, RefreshCw, ShieldAlert, Siren, TriangleAlert } from 'lucide-react';
import { api, clearOpsPush, setToken, setupOpsPush } from './lib.js';
import { Wordmark } from './App.jsx';

const FLAG = { SIGNATURE_NOT_CHECKED: 'UIDAI signature not checked', NO_MOBILE_IN_QR: 'Aadhaar has no mobile to match', NAME_DIFFERS: 'Name differs from sign-up', DOB_UNREADABLE: 'Date of birth unreadable' };
const CAT = { NOT_DONE: 'Work not done', POOR_QUALITY: 'Poor quality', SAFETY: 'Safety', ASKED_EXTRA_MONEY: 'Asked for extra money', DAMAGE: 'Damage', OTHER: 'Other',
  NOT_PAID_EXTRA_WORK: 'Extra work not paid', UNSAFE: 'Unsafe place', ABUSIVE: 'Abusive customer', WRONG_JOB: 'Job not as described' };
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Krewzo team screens inside the customer app: SOS, problem reports, ID checks. Lists refresh on every push
// and every 30 s; tapping a notification opens its list.
export default function Ops({ onLogout }) {
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('kyc');
  const [data, setData] = useState({ kyc: null, reports: null, sos: null });
  const [err, setErr] = useState('');
  const seenSos = useRef(0);

  const load = useCallback(async () => {
    setErr('');
    try {
      const [kyc, reports, sos] = await Promise.all([api('GET', '/admin/kyc'), api('GET', '/admin/reports'), api('GET', '/admin/sos')]);
      setData({ kyc, reports, sos });
      if (sos.length > seenSos.current) setTab('sos'); // jump to SOS only when a new one arrives
      seenSos.current = sos.length;
    } catch (e) { if (e.status === 401) onLogout(); else setErr(e.message); }
  }, [onLogout]);

  useEffect(() => {
    api('GET', '/ops/me').then((r) => { setMe(r.admin); if (r.token) setToken(r.token); }).catch((e) => e.status === 401 && onLogout()); // renews the login
    load();
    setupOpsPush((t) => { if (t) setTab(t); load(); });
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load, onLogout]);

  const logout = () => { clearOpsPush(); onLogout(); };
  const tabs = [['sos', 'SOS', data.sos], ['reports', 'Reports', data.reports], ['kyc', 'ID checks', data.kyc]];
  return (
    <div className="min-h-full max-w-md mx-auto pb-10">
      <header className="sticky top-0 z-20 bg-ink text-paper px-4 py-3 flex items-center gap-3">
        <Wordmark size="text-xl" /><span className="text-xs font-bold bg-lime text-ink px-2 py-0.5 rounded-full">OPS</span>
        <span className="flex-1 text-sm text-paper/60 truncate text-right">{me?.name}</span>
        <button onClick={load} aria-label="Refresh" className="w-9 h-9 rounded-full bg-paper/10 flex items-center justify-center"><RefreshCw size={16} /></button>
        <button onClick={logout} aria-label="Log out" className="w-9 h-9 rounded-full bg-paper/10 flex items-center justify-center"><LogOut size={16} /></button>
      </header>
      <div className="px-4 pt-3 grid grid-cols-3 gap-2">
        {tabs.map(([id, label, list]) => (
          <button key={id} onClick={() => setTab(id)} className={`h-12 rounded-xl text-sm font-bold relative ${tab === id ? 'bg-ink text-paper' : 'bg-card border border-line'}`}>
            {label}
            {list?.length > 0 && <span className={`absolute -top-1.5 -right-1.5 min-w-6 h-6 px-1.5 rounded-full text-xs flex items-center justify-center ${id === 'sos' ? 'bg-danger text-white' : 'bg-lime text-ink'}`}>{list.length}</span>}
          </button>
        ))}
      </div>
      {err && <div className="px-4 pt-3 text-sm text-danger font-semibold">{err}</div>}
      <div className="px-4 pt-3 flex flex-col gap-3">
        {tab === 'sos' && <List items={data.sos} empty="No open SOS alerts." render={(a) => <SosCard key={a.id} a={a} onDone={load} />} />}
        {tab === 'reports' && <List items={data.reports} empty="No open problem reports." render={(r) => <ReportCard key={r.id} r={r} onDone={load} />} />}
        {tab === 'kyc' && <List items={data.kyc} empty="No ID checks waiting." render={(k) => <KycCard key={k.worker_id} k={k} onDone={load} />} />}
      </div>
    </div>
  );
}

const List = ({ items, empty, render }) => (!items ? <div className="text-muted text-sm">Loading…</div> : !items.length ? <div className="rounded-3xl bg-card border border-dashed border-line p-8 text-center text-muted">{empty}</div> : items.map(render));

function SosCard({ a, onDone }) {
  return (
    <div className="rounded-3xl bg-danger/10 border-2 border-danger p-4 grid gap-2">
      <div className="font-black text-danger flex items-center gap-2"><Siren size={18} /> SOS · {a.role} · {when(a.created_at)}</div>
      <div className="font-bold">{a.name || '?'} {a.address && <span className="font-normal text-muted">· {a.address}</span>}</div>
      <div className="grid grid-cols-2 gap-2">
        <a href={`tel:${a.phone}`} className="h-12 rounded-xl bg-danger text-white font-black flex items-center justify-center gap-2"><Phone size={18} /> Call</a>
        {a.lat != null
          ? <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="h-12 rounded-xl bg-card border border-line font-bold flex items-center justify-center gap-2"><MapPin size={18} /> Location</a>
          : <span className="h-12 rounded-xl bg-card border border-line text-muted text-sm flex items-center justify-center">No location</span>}
      </div>
      <button onClick={async () => { await api('POST', `/admin/sos/${a.id}/handled`); onDone(); }} className="h-11 rounded-xl border border-line bg-card font-bold">Mark handled</button>
    </div>
  );
}

function ReportCard({ r, onDone }) {
  const [note, setNote] = useState('');
  const [strike, setStrike] = useState(false);
  const [err, setErr] = useState('');
  const held = !!(r.payment_held && r.disputed); // boolean: a bare 0 would render as "0"
  const act = async (action) => { setErr(''); try { await api('POST', `/admin/reports/${r.id}/resolve`, { action, note, strike }); onDone(); } catch (e) { setErr(e.message); } };
  return (
    <div className="rounded-3xl bg-card border border-line p-4 grid gap-2">
      <div className="font-bold flex items-center gap-2"><TriangleAlert size={17} className="text-amber" /> {CAT[r.category] || r.category}</div>
      <div className="text-xs text-muted">by {r.reporter_role} · job #{r.booking_id} ({r.booking_status}) · {when(r.created_at)}</div>
      {held && <div className="text-xs font-bold text-danger bg-danger/10 rounded-full px-3 py-1 justify-self-start">Payment on hold: ₹{r.worker_payout}</div>}
      {r.details && <div className="text-sm">{r.details}</div>}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <a href={`tel:${r.customer_phone}`} className="h-10 rounded-xl bg-paper font-semibold flex items-center justify-center gap-1.5"><Phone size={14} /> {r.customer_name}</a>
        {r.worker_phone ? <a href={`tel:${r.worker_phone}`} className="h-10 rounded-xl bg-paper font-semibold flex items-center justify-center gap-1.5"><Phone size={14} /> {r.worker_name}</a> : <span />}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you found out" className="h-11 rounded-xl border border-line bg-card px-3 outline-none focus:border-ink" />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={strike} onChange={(e) => setStrike(e.target.checked)} className="w-4 h-4 accent-ink" /> Give the worker a strike</label>
      <div className="grid grid-cols-2 gap-2">
        {held && <button onClick={() => act('PAY_WORKER')} className="h-11 rounded-xl bg-lime text-ink font-black">Pay worker</button>}
        {held && <button onClick={() => act('REFUND')} className="h-11 rounded-xl bg-danger/10 text-danger font-black">Refund customer</button>}
        <button onClick={() => act('CLOSE')} className={`h-11 rounded-xl border border-line font-bold ${held ? 'col-span-2' : 'col-span-2'}`}>Close report</button>
      </div>
      {err && <div className="text-sm text-danger font-semibold">{err}</div>}
    </div>
  );
}

function KycCard({ k, onDone }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const act = async (body) => { setErr(''); try { await api('POST', `/admin/workers/${k.worker_id}/kyc`, { ...body, note }); onDone(); } catch (e) { setErr(e.message); } };
  const photo = (src, label) => (
    <figure className="m-0 text-center text-xs text-muted">
      {src ? <img src={src} alt={label} className="w-full aspect-[4/5] object-cover rounded-2xl border border-line bg-paper" /> : <div className="w-full aspect-[4/5] rounded-2xl border border-line bg-paper flex items-center justify-center">No photo</div>}
      <figcaption className="mt-1">{label}</figcaption>
    </figure>
  );
  return (
    <div className="rounded-3xl bg-card border border-line p-4 grid gap-3">
      <div className="grid grid-cols-2 gap-3">{photo(k.selfie, 'Selfie')}{photo(k.aadhaar_photo, 'Aadhaar photo')}</div>
      <div className="text-sm grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span className="text-muted">Sign-up</span><b className="truncate">{k.worker_name} · +91 {k.phone}</b>
        <span className="text-muted">Aadhaar</span><b>{k.name} · XXXX {k.aadhaar_last4}</b>
        <span className="text-muted">DOB</span><b>{k.dob || '?'} · {k.gender || '?'}</b>
        <span className="text-muted">Area</span><span className="truncate">{k.area || '-'}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[11px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${k.sig_ok ? 'bg-forest/15 text-forest' : 'bg-amber/20 text-[#9a5b00]'}`}>{k.sig_ok ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}{k.sig_ok ? 'UIDAI signature verified' : 'Signature not checked'}</span>
        {k.flags.filter((f) => f !== 'SIGNATURE_NOT_CHECKED').map((f) => <span key={f} className="text-[11px] font-bold px-2 py-1 rounded-full bg-amber/20 text-[#9a5b00]">{FLAG[f] || f}</span>)}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (ops only)" className="h-11 rounded-xl border border-line bg-card px-3 outline-none focus:border-ink" />
      <button onClick={() => act({ verified: true })} className="h-12 rounded-xl bg-lime text-ink font-black">Approve</button>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => act({ verified: false })} className="h-11 rounded-xl bg-danger/10 text-danger font-bold">Reject</button>
        <button onClick={() => act({ verified: false, block: true })} className="h-11 rounded-xl bg-danger/10 text-danger font-bold">Reject + block</button>
      </div>
      {err && <div className="text-sm text-danger font-semibold">{err}</div>}
    </div>
  );
}

// Krewzo team login: phone + 6-digit PIN; first time also the setup code from the owner.
export function OpsLogin({ onDone, onBack }) {
  const [f, setF] = useState({ phone: '', pin: '', setup_code: '' });
  const [needCode, setNeedCode] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault(); setErr('');
    try { onDone(await api('POST', '/auth/ops', { ...f, setup_code: f.setup_code || undefined })); }
    catch (x) { if (x.data?.code === 'SETUP_REQUIRED') setNeedCode(true); setErr(x.message); }
  }
  const input = 'h-14 w-full rounded-2xl border border-line bg-card px-4 text-lg outline-none focus:border-ink';
  return (
    <form onSubmit={submit} className="min-h-full max-w-md mx-auto px-6 pt-14 pb-8 flex flex-col gap-3">
      <div className="flex items-center gap-2"><Wordmark size="text-3xl" /><span className="text-xs font-bold bg-ink text-lime px-2 py-0.5 rounded-full">TEAM</span></div>
      <h1 className="font-display text-3xl font-extrabold mt-6">Krewzo team login</h1>
      <p className="text-muted -mt-1">For the Krewzo operations team only.</p>
      <input inputMode="numeric" placeholder="Mobile number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className={input} />
      {needCode && <input inputMode="numeric" placeholder="Setup code (first login)" value={f.setup_code} onChange={(e) => setF({ ...f, setup_code: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={input} />}
      <input inputMode="numeric" type="password" placeholder={needCode ? 'Choose a 6-digit PIN' : '6-digit PIN'} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} className={`${input} tracking-widest`} />
      {err && <div className="text-danger text-sm font-semibold">{err}</div>}
      <button className="h-14 rounded-2xl bg-ink text-paper text-lg font-bold">Log in</button>
      <button type="button" onClick={onBack} className="h-11 text-muted font-semibold">Back to customer login</button>
    </form>
  );
}
