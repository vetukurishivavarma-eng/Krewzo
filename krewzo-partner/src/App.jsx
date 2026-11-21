import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, ChevronRight, Delete, Home, LifeBuoy, LogOut, MapPinOff, Power, ShieldAlert, Star, User, Wallet } from 'lucide-react';
import { SKILL_TIERS, TRADE_TAGS, rupees, upiLink } from '@krewzo/shared';
import QRCode from 'qrcode';
import { DICT, LANGS } from './i18n.js';
import {
  api, getServer, setServer, isNative, setupPush, clearPush, startTrip, stopTrip, chime, errorBuzz, connectSocket, getToken, setToken, speak, unlockAudio, vibrate, HELPLINE,
  syncNative, alertStatus, openOverlaySettings, openFullScreenSettings, onNativeRefresh, resendPushToken, openNotificationSettings,
} from './lib.js';
import JobAlert from './JobAlert.jsx';
import ActiveJob from './ActiveJob.jsx';
import Passbook from './Passbook.jsx';
import { KycCard } from './Kyc.jsx';

const LANG_KEY = 'krewzo.partner.lang';
const readLang = () => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } };

export default function App() {
  const [lang, setLangState] = useState(readLang);
  const [token, setTok] = useState(getToken);
  const setLang = (l) => { try { localStorage.setItem(LANG_KEY, l); } catch {} setLangState(l); if (token) api('PATCH', '/workers/me', { language: l }).catch(() => {}); };
  useEffect(() => { if (lang) syncNative(DICT[lang]); }, [lang, token]);

  if (!lang) return <LangPicker onPick={setLang} />;
  const t = DICT[lang];
  if (!token) return <Login t={t} lang={lang} setLang={setLang} onDone={(tok) => { setToken(tok); setTok(tok); }} />;
  return <Main t={t} lang={lang} setLang={setLang} onLogout={() => { clearPush(); setToken(null); setTok(null); syncNative(t); }} />;
}

// ---------- shared bits ----------
export function SpeakBtn({ onClick, light }) {
  return <button onClick={onClick} aria-label="Read aloud" className={`w-12 h-12 rounded-full text-xl flex items-center justify-center shrink-0 ${light ? 'bg-black/10' : 'bg-raise'}`}>🔊</button>;
}

export function Wordmark({ size = 'text-2xl' }) {
  return <div className={`font-display font-extrabold tracking-tight ${size}`}>krewzo<span className="text-lime">.</span></div>;
}

function LangPill({ lang, setLang }) {
  return (
    <div className="flex rounded-full bg-surface border border-line p-1 text-sm font-bold">
      {LANGS.map((l) => (
        <button key={l.id} onClick={() => setLang(l.id)} className={`px-3 py-1.5 rounded-full ${lang === l.id ? 'bg-lime text-ink' : 'text-muted'}`}>{l.label}</button>
      ))}
    </div>
  );
}

const GLYPH = { EN: 'Aa', TE: 'అ', HI: 'अ' };
function LangPicker({ onPick }) {
  return (
    <div className="min-h-full flex flex-col p-6 pt-14">
      <Wordmark size="text-4xl" />
      <div className="mt-2 text-muted text-lg">Choose language · భాష · भाषा</div>
      <div className="mt-10 flex flex-col gap-3">
        {LANGS.map((l, i) => (
          <button key={l.id} onClick={() => { unlockAudio(); onPick(l.id); }} style={{ animationDelay: `${i * 70}ms` }}
            className="rise h-24 rounded-3xl bg-surface border border-line flex items-center gap-5 px-5 text-left">
            <span className="w-14 h-14 rounded-2xl bg-lime text-ink font-display text-3xl font-extrabold flex items-center justify-center">{GLYPH[l.id]}</span>
            <span className="flex-1 text-3xl font-black">{l.name}</span>
            <ChevronRight className="text-muted" />
          </button>
        ))}
      </div>
    </div>
  );
}

export function Keypad({ value, onChange, max }) {
  const press = (k) => {
    vibrate(20);
    if (k === 'del') onChange(value.slice(0, -1));
    else if (value.length < max) onChange(value + k);
  };
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) =>
        !k ? <div key={i} /> : (
          <button key={i} onClick={() => press(k)} aria-label={k === 'del' ? 'Delete' : k}
            className="h-[4.25rem] rounded-2xl bg-surface border border-line text-3xl font-display font-bold flex items-center justify-center active:bg-raise">
            {k === 'del' ? <Delete className="text-muted" /> : k}
          </button>
        ))}
    </div>
  );
}

function ServerField() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(getServer());
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted/60">⚙ {getServer() || 'Server'}</button>;
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="http://192.168.1.5:4000" className="flex-1 h-12 rounded-xl bg-surface border border-line px-3 text-cream" />
      <button type="button" onClick={() => { setServer(v); setOpen(false); }} className="h-12 px-4 rounded-xl bg-lime text-ink font-bold">Save</button>
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="block">
    <div className="text-sm font-bold text-muted mb-2">{label}</div>
    {children}
  </label>
);

function Login({ t, lang, setLang, onDone }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [reg, setReg] = useState({ name: '', skill_tier: '', trade_tags: [], upi_id: '' });

  async function submit(extra) {
    setErr('');
    try {
      const r = await api('POST', '/auth/worker', { phone, pin, language: lang, ...extra });
      onDone(r.token);
    } catch (e) {
      if (e.data?.error === 'NEW_WORKER') setStep('register');
      else { setErr(e.message); if (e.status === 401 || e.status === 429) setPin(''); }
    }
  }
  useEffect(() => { if (step === 'pin' && pin.length === 4) submit(); }, [pin]); // eslint-disable-line

  const head = (
    <div className="flex items-center justify-between">
      <Wordmark />
      <LangPill lang={lang} setLang={setLang} />
    </div>
  );

  if (step === 'register') {
    const toggle = (k) => setReg((r) => ({ ...r, trade_tags: r.trade_tags.includes(k) ? r.trade_tags.filter((x) => x !== k) : [...r.trade_tags, k] }));
    const ok = reg.name.trim().length > 1 && reg.skill_tier && reg.trade_tags.length;
    return (
      <div className="min-h-full p-5 pb-32 space-y-6">
        {head}
        <div>
          <div className="font-display text-3xl font-extrabold">{t.join}</div>
          <div className="text-muted mt-1">+91 {phone}</div>
        </div>
        <Field label={t.your_name}>
          <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} className="w-full h-14 rounded-2xl bg-surface border border-line focus:border-lime outline-none text-xl px-4" />
        </Field>
        <Field label={t.your_level}>
          <div className="grid grid-cols-3 gap-2.5">
            {Object.values(SKILL_TIERS).map((s) => (
              <button key={s.id} type="button" onClick={() => setReg({ ...reg, skill_tier: s.id })}
                className={`rounded-2xl p-3 border text-center ${reg.skill_tier === s.id ? 'bg-lime text-ink border-lime' : 'bg-surface border-line'}`}>
                <div className="text-4xl">{s.icon}</div>
                <div className="text-sm font-black mt-1 leading-tight">{t.TIERS[s.id]}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{'★'.repeat(s.rank)}</div>
              </button>
            ))}
          </div>
        </Field>
        <Field label={t.your_work}>
          <div className="grid grid-cols-3 gap-2.5">
            {Object.entries(TRADE_TAGS).map(([k, v]) => (
              <button key={k} type="button" onClick={() => toggle(k)}
                className={`rounded-2xl p-3 border ${reg.trade_tags.includes(k) ? 'bg-lime text-ink border-lime' : 'bg-surface border-line'}`}>
                <div className="text-3xl">{v.icon}</div>
                <div className="text-xs font-bold mt-1 leading-tight">{t.TRADES[k]}</div>
              </button>
            ))}
          </div>
        </Field>
        <div className="rounded-2xl bg-surface border border-line p-3 text-sm text-muted">🪪 {t.kyc_phone_note}</div>
        <Field label={t.upi}>
          <input value={reg.upi_id} onChange={(e) => setReg({ ...reg, upi_id: e.target.value.trim() })} placeholder={`${phone}@upi`} className="w-full h-14 rounded-2xl bg-surface border border-line focus:border-lime outline-none text-lg px-4 placeholder:text-muted/50" />
        </Field>
        {err && <ErrorNote>{err}</ErrorNote>}
        <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-ink via-ink">
          <button disabled={!ok} onClick={() => submit(reg)} className="w-full h-16 rounded-2xl bg-lime text-ink text-xl font-black disabled:opacity-30">{t.join}</button>
        </div>
      </div>
    );
  }

  const isPin = step === 'pin';
  return (
    <div className="min-h-full p-5 flex flex-col">
      {head}
      <div className="mt-10">
        <div className="font-display text-[2.1rem] leading-tight font-extrabold">{isPin ? t.pin : t.welcome}</div>
        <div className="text-muted mt-2">{isPin ? `+91 ${phone}` : t.welcome_sub}</div>
      </div>
      <div className="mt-7 mb-5">
        {isPin ? (
          <div className="flex gap-4 justify-center h-16 items-center">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`w-5 h-5 rounded-full transition ${i < pin.length ? 'bg-lime scale-110' : 'border-2 border-line'}`} />)}
          </div>
        ) : (
          <div className="h-16 rounded-2xl bg-surface border border-line flex items-center px-4 gap-3">
            <span className="text-muted font-bold">+91</span><span className="w-px h-6 bg-line" />
            <span className="num text-3xl font-bold tracking-wider">{phone || <span className="text-muted/40">{t.phone}</span>}</span>
          </div>
        )}
      </div>
      {err && <ErrorNote>{err}</ErrorNote>}
      <div className="mt-auto">
        <Keypad value={isPin ? pin : phone} onChange={isPin ? setPin : setPhone} max={isPin ? 4 : 10} />
        <div className="flex gap-3 mt-3">
          {isPin
            ? <button onClick={() => { setStep('phone'); setPin(''); setErr(''); }} className="h-14 flex-1 rounded-2xl bg-surface border border-line text-lg font-bold">{t.back}</button>
            : <button disabled={phone.length !== 10} onClick={() => setStep('pin')} className="h-16 flex-1 rounded-2xl bg-lime text-ink text-xl font-black disabled:opacity-30">{t.next}</button>}
        </div>
        <div className="mt-4 text-center"><ServerField /></div>
      </div>
    </div>
  );
}

export const ErrorNote = ({ children }) => <div className="rounded-2xl bg-danger/15 border border-danger/30 text-danger p-3 font-bold">{children}</div>;

// ---------- logged-in shell ----------
function Main({ t, lang, setLang, onLogout }) {
  const [home, setHome] = useState(null);
  const [offers, setOffers] = useState([]);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState('home');
  const [geoErr, setGeoErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dutyErr, setDutyErr] = useState('');
  const [cancelled, setCancelled] = useState(null);
  const activeRef = useRef(null);
  activeRef.current = active;
  const langRef = useRef(lang);
  langRef.current = lang;

  const load = useCallback(async () => {
    try {
      const h = await api('GET', '/workers/me/home');
      setHome(h); setActive(h.active); setOffers(h.offers);
      if (isNative && !h.worker.push_ok) resendPushToken(); // server lost this phone's token: send it again
    } catch (e) {
      if (e.status === 401) onLogout();
      else retry.current = setTimeout(() => loadRef.current(), 5000); // offline or Render waking up (~50 s)
    }
  }, [onLogout]);
  const retry = useRef();
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => () => clearTimeout(retry.current), []);
  useEffect(() => { const id = setInterval(() => loadRef.current(), 5 * 60e3); return () => clearInterval(id); }, []); // scheduled jobs become current on time
  useEffect(() => {
    setupPush(() => loadRef.current());
    const l = onNativeRefresh(() => loadRef.current()); // accepted / skipped from the island or lock screen
    return () => { l?.then?.((h) => h.remove()); };
  }, []);

  useEffect(() => {
    load();
    const s = connectSocket();
    s.on('connect', load);
    s.on('job:offer', (o) => {
      setOffers((list) => [o, ...list.filter((x) => x.booking_id !== o.booking_id)]);
      chime(); vibrate([300, 150, 300]);
      speak(langRef.current, 'job', { ...o, hours: parseInt(o.duration) });
    });
    s.on('job:taken', ({ booking_id }) => setOffers((list) => list.filter((x) => x.booking_id !== booking_id)));
    s.on('booking:update', (b) => {
      if (b.status === 'CANCELLED' && activeRef.current?.id === b.id) { // customer cancelled while we were on it: say so loudly
        setCancelled(b); errorBuzz(); vibrate([400, 150, 400]); speak(langRef.current, 'cancelled', b.cancel_fee);
        loadRef.current();
      }
      setActive((a) => (b.status === 'SEARCHING' || b.status === 'CANCELLED' ? (a?.id === b.id ? null : a) : a?.id === b.id || !a ? b : a));
    });
    return () => s.close();
  }, [load]);

  // While on duty, keep the server's idea of where we are fresh (every ~100 m / 30 s).
  const online = home?.worker.is_online;
  const enRoute = active?.status === 'ASSIGNED';
  const enRouteRef = useRef(false);
  enRouteRef.current = enRoute;
  useEffect(() => {
    if (!online || !navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setGeoErr(false);
        if (enRouteRef.current && isNative) return; // the trip watcher below is sending
        if (Date.now() - last > (enRouteRef.current ? 5000 : 30000)) { last = Date.now(); api('PATCH', '/workers/me', { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => {}); } },
      () => setGeoErr(true), { enableHighAccuracy: true, maximumAge: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  // On the way to a job: live location for the customer until "I've arrived".
  useEffect(() => {
    if (!enRoute) return;
    let id, dead = false;
    startTrip(() => setGeoErr(true)).then((x) => { if (dead) stopTrip(x); else id = x; });
    return () => { dead = true; stopTrip(id); };
  }, [enRoute, active?.id]);

  async function toggleDuty() {
    unlockAudio(); vibrate(80); setBusy(true);
    const goOnline = !online;
    let loc = {};
    if (goOnline && navigator.geolocation) {
      loc = await new Promise((r) => navigator.geolocation.getCurrentPosition((p) => r({ lat: p.coords.latitude, lng: p.coords.longitude }), () => { setGeoErr(true); r({}); }, { timeout: 8000 }));
    }
    try {
      await api('PATCH', '/workers/me', { is_online: goOnline, ...loc });
      speak(lang, goOnline ? 'on' : 'off');
      await load();
    } catch (e) { setDutyErr(e.message); } finally { setBusy(false); }
  }

  if (!home) return <Splash />;
  if (online && offers[0] && !active) {
    return <JobAlert t={t} lang={lang} offer={offers[0]} count={offers.length}
      onAccept={async () => { try { setActive(await api('POST', `/bookings/${offers[0].booking_id}/accept`)); setOffers([]); setTab('home'); } catch { setOffers((l) => l.slice(1)); } }}
      onSkip={async () => { const id = offers[0].booking_id; setOffers((l) => l.slice(1)); api('POST', `/bookings/${id}/skip`).catch(() => {}); }}
      onTimeout={() => { const id = offers[0].booking_id; setOffers((l) => l.filter((x) => x.booking_id !== id)); }} />;
  }

  const w = home.worker;
  return (
    <div className="min-h-full pb-28">
      {tab === 'home' && (active
        ? <ActiveJob t={t} lang={lang} job={active} onChange={setActive} onDone={() => { setActive(null); load(); }} />
        : <HomeTab t={t} lang={lang} home={home} online={online} busy={busy} geoErr={geoErr} dutyErr={dutyErr} onToggle={toggleDuty} onReload={load} />)}
      {tab === 'earnings' && <Passbook t={t} />}
      {tab === 'profile' && <Profile t={t} w={w} lang={lang} setLang={setLang} onLogout={onLogout} onReload={load} />}
      <NavBar t={t} tab={tab} setTab={setTab} badge={!!active} />
      {cancelled && <CancelledCard t={t} job={cancelled} onClose={() => setCancelled(null)} />}
    </div>
  );
}

function CancelledCard({ t, job, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur flex items-center justify-center p-5" onClick={onClose}>
      <div className="drop w-full rounded-[2rem] bg-surface border border-danger/40 p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto w-16 h-16 rounded-full bg-danger/15 text-danger text-3xl flex items-center justify-center">✕</div>
        <div className="font-display text-2xl font-extrabold mt-4">{t.cancelled_title}</div>
        <div className="text-muted mt-1">{t.cancelled_body}</div>
        {job.cancel_fee > 0 && (
          <div className="mt-5 rounded-2xl bg-mint/10 border border-mint/30 p-4">
            <div className="text-sm font-bold text-muted">{t.travel_paid}</div>
            <div className="num text-4xl font-bold text-mint">{rupees(job.cancel_fee)}</div>
          </div>
        )}
        <button onClick={onClose} className="mt-5 w-full h-14 rounded-2xl bg-lime text-ink text-lg font-black">{t.done}</button>
      </div>
    </div>
  );
}

const Splash = () => (
  <div className="min-h-full flex flex-col items-center justify-center gap-4">
    <Wordmark size="text-5xl" />
    <div className="w-24 h-1 rounded-full bg-line overflow-hidden"><div className="scanbar w-1/3 h-full bg-lime rounded-full" /></div>
  </div>
);

function NavBar({ t, tab, setTab, badge }) {
  const items = [['home', Home, t.home], ['earnings', Wallet, t.earnings], ['profile', User, t.profile]];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-ink/90 backdrop-blur-xl border-t border-line safe-b">
      <div className="grid grid-cols-3 h-[4.5rem]">
        {items.map(([id, Icon, label]) => (
          <button key={id} onClick={() => { vibrate(10); setTab(id); }} className={`relative flex flex-col items-center justify-center gap-1 ${tab === id ? 'text-lime' : 'text-muted'}`}>
            {tab === id && <span className="absolute top-0 h-[3px] w-10 rounded-b-full bg-lime" />}
            <span className="relative"><Icon size={24} strokeWidth={tab === id ? 2.6 : 2} />{id === 'home' && badge && <span className="absolute -top-1 -right-1.5 w-2.5 h-2.5 rounded-full bg-mint ring-2 ring-ink" />}</span>
            <span className="text-xs font-bold">{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function HomeTab({ t, lang, home, online, busy, geoErr, dutyErr, onToggle, onReload }) {
  const paused = home.worker.suspended_until && Date.parse(home.worker.suspended_until) > Date.now();
  const w = home.worker;
  return (
    <div className="p-5 flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <Avatar name={w.name} />
        <div className="flex-1 min-w-0">
          <div className="text-muted text-sm">{t.hello},</div>
          <div className="font-display text-2xl font-extrabold truncate">{w.name}</div>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-surface border border-line px-3 py-1.5 font-bold"><Star size={15} className="fill-amber text-amber" /> {Number(w.rating).toFixed(1)}</div>
      </header>

      <section className={`relative overflow-hidden rounded-[2rem] border p-6 flex flex-col items-center transition-colors ${online ? 'bg-lime/[0.07] border-lime/30' : 'bg-surface border-line'}`}>
        <button disabled={busy || !w.kyc_verified} onClick={onToggle} aria-label={online ? t.tap_to_stop : t.tap_to_start}
          className="relative w-44 h-44 my-3 rounded-full disabled:opacity-50">
          {online && <><span className="sonar" /><span className="sonar" style={{ animationDelay: '1.2s' }} /></>}
          <span className={`absolute inset-0 rounded-full flex items-center justify-center transition-all duration-300 ${online ? 'bg-lime text-ink shadow-[0_0_60px_rgba(200,240,49,.45)]' : 'bg-raise text-muted border-2 border-line'}`}>
            <Power size={64} strokeWidth={2.6} />
          </span>
        </button>
        <div className={`font-display text-3xl font-extrabold mt-2 ${online ? 'text-lime' : ''}`}>{online ? t.on_duty : t.off_duty}</div>
        <div className="text-muted mt-1 text-center">{online ? t.tap_to_stop : t.tap_to_start}</div>
        {online && (
          <div className="w-full mt-5 rounded-2xl bg-ink/60 border border-line p-3">
            <div className="flex items-center justify-between text-sm"><span className="font-bold">{t.scanning}</span><span className="text-muted">{t.within}</span></div>
            <div className="mt-2 h-1 rounded-full bg-line overflow-hidden"><div className="scanbar w-1/3 h-full bg-lime rounded-full" /></div>
          </div>
        )}
      </section>

      {paused && <Notice icon={ShieldAlert}>{t.suspended} {new Date(w.suspended_until).toLocaleDateString('en-IN')}</Notice>}
      {dutyErr && !paused && <ErrorNote>{dutyErr}</ErrorNote>}
      {!w.kyc_verified && <KycCard t={t} onVerified={onReload} />}
      {geoErr && <Notice icon={MapPinOff}>{t.location_off}</Notice>}
      <AlertsSetup t={t} />
      <Upcoming t={t} jobs={home.upcoming || []} />

      <section className="grid grid-cols-5 gap-3">
        <div className="col-span-3 rounded-3xl bg-surface border border-line p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-muted">{t.today}</div>
            <SpeakBtn onClick={() => speak(lang, 'paid', home.today_earnings)} />
          </div>
          <div className="num text-[2.6rem] leading-none font-bold text-mint -mt-1">{rupees(home.today_earnings)}</div>
        </div>
        <div className="col-span-2 rounded-3xl bg-surface border border-line p-4 flex flex-col justify-between">
          <div className="text-sm font-bold text-muted capitalize">{t.jobs}</div>
          <div className="num text-[2.6rem] leading-none font-bold">{home.today_shifts}</div>
        </div>
      </section>

      <a href={`tel:${HELPLINE}`} className="rounded-3xl bg-surface border border-line p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-danger/15 text-danger flex items-center justify-center"><LifeBuoy /></span>
        <span className="flex-1 font-bold">{t.help_line}</span>
        <ChevronRight className="text-muted" />
      </a>
    </div>
  );
}

// Scheduled jobs already accepted; each becomes the current job 2 hours before its slot.
function Upcoming({ t, jobs }) {
  if (!jobs.length) return null;
  return (
    <section className="rounded-3xl bg-surface border border-line p-4">
      <div className="text-sm font-bold text-muted mb-2">{t.upcoming}</div>
      <div className="flex flex-col divide-y divide-line">
        {jobs.map((j) => (
          <div key={j.id} className="py-2.5 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-raise flex items-center justify-center text-2xl">{TRADE_TAGS[j.trade_tag]?.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold">{new Date(j.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
              <div className="text-sm text-muted truncate">{t.TRADES[j.trade_tag]} · {parseInt(j.duration)} {t.hours} · {j.address}</div>
            </div>
            <div className="num font-bold text-mint">{rupees(j.worker_payout)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export const Avatar = ({ name, size = 'w-12 h-12 text-xl' }) => (
  <div className={`${size} rounded-2xl bg-lime text-ink font-display font-extrabold flex items-center justify-center shrink-0`}>
    {name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
  </div>
);

const Notice = ({ icon: Icon, children }) => (
  <div className="rounded-2xl bg-amber/10 border border-amber/30 text-amber p-4 flex gap-3 font-bold"><Icon className="shrink-0" />{children}</div>
);

// Native only: the two permissions behind the full-screen ring and the island pop-up.
function AlertsSetup({ t, always }) {
  const [s, setS] = useState(null);
  useEffect(() => {
    const check = () => alertStatus().then(setS);
    check();
    document.addEventListener('visibilitychange', check); // back from Settings
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
  if (!s) return null;
  const ok = s.overlay && s.fullScreen;
  if (ok && !always) return null;
  return (
    <section className={`rounded-3xl border p-4 ${ok ? 'bg-mint/10 border-mint/30' : 'bg-lime/[0.07] border-lime/30'}`}>
      <div className="flex gap-3">
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${ok ? 'bg-mint text-ink' : 'bg-lime text-ink'}`}><BellRing /></span>
        <div>
          <div className="font-black text-lg">{ok ? t.alerts_ok : t.alerts_title}</div>
          {!ok && <div className="text-muted text-sm mt-0.5">{t.alerts_body}</div>}
        </div>
      </div>
      {!ok && (
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button disabled={s.overlay} onClick={openOverlaySettings} className="h-12 rounded-xl bg-lime text-ink font-black text-sm disabled:bg-raise disabled:text-mint">{s.overlay ? '✓ ' : ''}{t.allow_popup}</button>
          <button disabled={s.fullScreen} onClick={openFullScreenSettings} className="h-12 rounded-xl bg-lime text-ink font-black text-sm disabled:bg-raise disabled:text-mint">{s.fullScreen ? '✓ ' : ''}{t.allow_full}</button>
        </div>
      )}
    </section>
  );
}

// The worker's own UPI QR: anyone can scan it with GPay / PhonePe / Paytm to pay or tip them directly.
function MyUpiQr({ t, w }) {
  const [img, setImg] = useState('');
  const link = upiLink({ upi_id: w.upi_id, name: w.name });
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then(setImg); }, [link]);
  if (!link) return null;
  return (
    <div className="rounded-3xl bg-surface border border-line p-4">
      <div className="font-bold">{t.my_qr}</div>
      <div className="text-sm text-muted">{t.my_qr_sub}</div>
      <div className="mt-4 mx-auto w-56 rounded-2xl bg-white p-3">{img && <img src={img} alt={t.my_qr} className="w-full" />}</div>
      <div className="text-center mt-3 font-black">{w.name}</div>
      <div className="text-center text-sm text-muted select-all">{w.upi_id}</div>
    </div>
  );
}

// Whether job alerts can reach this phone (the server holds its push token), with a one-tap fix.
function PushStatus({ t, w, onReload }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  if (!isNative) return null;
  async function fix() {
    setBusy(true); setMsg('');
    const r = await setupPush();
    if (r === 'denied') { setMsg(t.push_blocked); openNotificationSettings(); }
    await onReload();
    setBusy(false);
  }
  return (
    <div className={`rounded-3xl border p-4 flex items-center gap-3 ${w.push_ok ? 'bg-mint/10 border-mint/30' : 'bg-amber/10 border-amber/30'}`}>
      <BellRing className={w.push_ok ? 'text-mint' : 'text-amber'} />
      <div className="flex-1 min-w-0">
        <div className="font-bold">{w.push_ok ? t.push_on : t.push_off}</div>
        {msg && <div className="text-sm text-muted">{msg}</div>}
      </div>
      {!w.push_ok && <button disabled={busy} onClick={fix} className="h-11 px-5 rounded-xl bg-lime text-ink font-black disabled:opacity-50">{busy ? '…' : t.push_fix}</button>}
    </div>
  );
}

function Profile({ t, w, lang, setLang, onLogout, onReload }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="rounded-[2rem] bg-surface border border-line p-5 flex items-center gap-4">
        <Avatar name={w.name} size="w-16 h-16 text-2xl" />
        <div className="min-w-0">
          <div className="font-display text-2xl font-extrabold truncate">{w.name}</div>
          <div className="text-muted">+91 {w.phone}</div>
          <div className="flex items-center gap-1 text-sm font-bold mt-1"><Star size={14} className="fill-amber text-amber" /> {Number(w.rating).toFixed(1)} · {t.TIERS[w.skill_tier]}</div>
        </div>
      </div>
      <div className="rounded-3xl bg-surface border border-line p-4">
        <div className="text-sm font-bold text-muted mb-3">{t.skills}</div>
        <div className="flex flex-wrap gap-2">
          {w.trade_tags.map((k) => <span key={k} className="rounded-full bg-raise border border-line px-3 py-1.5 text-sm font-bold">{TRADE_TAGS[k]?.icon} {t.TRADES[k]}</span>)}
        </div>

      </div>
      <PushStatus t={t} w={w} onReload={onReload} />
      <MyUpiQr t={t} w={w} />
      <div className="rounded-3xl bg-surface border border-line p-4 flex items-center justify-between">
        <div className="font-bold">{t.language}</div>
        <LangPill lang={lang} setLang={setLang} />
      </div>
      <AlertsSetup t={t} always />
      <a href={`tel:${HELPLINE}`} className="rounded-3xl bg-surface border border-line p-4 flex items-center gap-3 font-bold"><LifeBuoy className="text-danger" /> <span className="flex-1">{t.help_line}</span><ChevronRight className="text-muted" /></a>
      <button onClick={onLogout} className="rounded-3xl border border-line p-4 flex items-center gap-3 font-bold text-muted"><LogOut /> {t.logout}</button>
      <div className="text-center text-xs text-muted/50">v{__APP_VERSION__}</div>
    </div>
  );
}
