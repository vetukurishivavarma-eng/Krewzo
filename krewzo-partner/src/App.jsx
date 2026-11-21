import { useCallback, useEffect, useRef, useState } from 'react';
import { SKILL_TIERS, TRADE_TAGS, rupees } from '@krewzo/shared';
import { DICT, LANGS } from './i18n.js';
import { api, getServer, setServer, chime, connectSocket, getToken, setToken, speak, unlockAudio, vibrate, HELPLINE } from './lib.js';
import JobAlert from './JobAlert.jsx';
import ActiveJob from './ActiveJob.jsx';
import Passbook from './Passbook.jsx';

const LANG_KEY = 'krewzo.partner.lang';
const readLang = () => { try { return localStorage.getItem(LANG_KEY); } catch { return null; } };

export default function App() {
  const [lang, setLangState] = useState(readLang);
  const [token, setTok] = useState(getToken);
  const setLang = (l) => { try { localStorage.setItem(LANG_KEY, l); } catch {} setLangState(l); if (token) api('PATCH', '/workers/me', { language: l }).catch(() => {}); };

  if (!lang) return <LangPicker onPick={setLang} />;
  const t = DICT[lang];
  if (!token) return <Login t={t} lang={lang} setLang={setLang} onDone={(tok) => { setToken(tok); setTok(tok); }} />;
  return <Main t={t} lang={lang} setLang={setLang} onLogout={() => { setToken(null); setTok(null); }} />;
}

// ---------- shared bits ----------
export function SpeakBtn({ onClick }) {
  return <button onClick={onClick} aria-label="Read aloud" className="w-14 h-14 rounded-full bg-white/10 text-3xl flex items-center justify-center">🔊</button>;
}

function LangPill({ lang, setLang }) {
  return (
    <div className="flex rounded-full bg-white/10 p-1 text-lg font-bold">
      {LANGS.map((l) => (
        <button key={l.id} onClick={() => setLang(l.id)} className={`px-3 py-1.5 rounded-full ${lang === l.id ? 'bg-white text-black' : 'text-white/70'}`}>{l.label}</button>
      ))}
    </div>
  );
}

function LangPicker({ onPick }) {
  return (
    <div className="min-h-full flex flex-col justify-center gap-5 p-6 bg-neutral-950 text-white">
      <div className="text-center text-6xl">🗣️</div>
      {LANGS.map((l) => (
        <button key={l.id} onClick={() => { unlockAudio(); onPick(l.id); }} className="h-24 rounded-3xl bg-white text-black text-4xl font-black">{l.name}</button>
      ))}
    </div>
  );
}

export function Keypad({ value, onChange, max }) {
  const press = (k) => {
    vibrate(30);
    if (k === '⌫') onChange(value.slice(0, -1));
    else if (value.length < max) onChange(value + k);
  };
  return (
    <div className="grid grid-cols-3 gap-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
        k ? <button key={i} onClick={() => press(k)} className="h-20 rounded-2xl bg-white/10 text-white text-4xl font-black">{k}</button> : <div key={i} />)}
    </div>
  );
}

function ServerField({ cls }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(getServer());
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={cls}>⚙️ {getServer() || 'Server'}</button>;
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="http://192.168.1.5:4000" className="flex-1 h-12 rounded-xl border border-slate-300 bg-white text-black px-3" />
      <button type="button" onClick={() => { setServer(v); setOpen(false); }} className="h-12 px-4 rounded-xl bg-emerald-600 text-white font-semibold">Save</button>
    </div>
  );
}

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
    <div className="flex items-center justify-between mb-6">
      <div className="text-3xl font-black text-emerald-400">Krewzo</div>
      <LangPill lang={lang} setLang={setLang} />
    </div>
  );

  if (step === 'register') {
    const toggle = (k) => setReg((r) => ({ ...r, trade_tags: r.trade_tags.includes(k) ? r.trade_tags.filter((x) => x !== k) : [...r.trade_tags, k] }));
    return (
      <div className="min-h-full p-5 bg-neutral-950 text-white space-y-5">
        {head}
        <label className="block text-xl font-bold">👤 {t.your_name}
          <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} className="mt-2 w-full h-16 rounded-2xl bg-white text-black text-2xl px-4" />
        </label>
        <div className="text-xl font-bold">🪪 {t.your_level}</div>
        <div className="grid grid-cols-3 gap-3">
          {Object.values(SKILL_TIERS).map((s) => (
            <button key={s.id} onClick={() => setReg({ ...reg, skill_tier: s.id })} className={`h-28 rounded-2xl text-5xl ${reg.skill_tier === s.id ? 'bg-emerald-500' : 'bg-white/10'}`}>
              {s.icon}<div className="text-sm mt-1">{'⭐'.repeat(s.rank)}</div>
            </button>
          ))}
        </div>
        <div className="text-xl font-bold">🧰 {t.your_work}</div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(TRADE_TAGS).map(([k, v]) => (
            <button key={k} onClick={() => toggle(k)} className={`h-24 rounded-2xl text-5xl ${reg.trade_tags.includes(k) ? 'bg-emerald-500' : 'bg-white/10'}`}>{v.icon}</button>
          ))}
        </div>
        <label className="block text-xl font-bold">💳 {t.upi}
          <input value={reg.upi_id} onChange={(e) => setReg({ ...reg, upi_id: e.target.value.trim() })} placeholder={`${phone}@upi`} className="mt-2 w-full h-16 rounded-2xl bg-white text-black text-xl px-4" />
        </label>
        {err && <div className="text-red-400 text-xl font-bold">⚠️ {err}</div>}
        <button onClick={() => submit(reg)} className="w-full h-20 rounded-3xl bg-emerald-500 text-black text-3xl font-black">{t.join} ✅</button>
      </div>
    );
  }

  const isPin = step === 'pin';
  const val = isPin ? pin : phone;
  return (
    <div className="min-h-full p-5 bg-neutral-950 text-white flex flex-col">
      {head}
      <div className="text-2xl font-bold mb-3">{isPin ? '🔒 ' + t.pin : '📱 ' + t.phone}</div>
      <div className="h-20 rounded-2xl bg-white text-black text-4xl font-black tracking-[0.3em] flex items-center justify-center mb-4">
        {isPin ? '●'.repeat(pin.length).padEnd(4, '○') : phone || '—'}
      </div>
      {err && <div className="text-red-400 text-xl font-bold mb-3">⚠️ {err}</div>}
      <Keypad value={val} onChange={isPin ? setPin : setPhone} max={isPin ? 4 : 10} />
      <div className="flex gap-3 mt-4">
        {isPin && <button onClick={() => { setStep('phone'); setPin(''); }} className="h-20 flex-1 rounded-3xl bg-white/10 text-2xl font-bold">⬅️ {t.back}</button>}
        {!isPin && <button disabled={phone.length !== 10} onClick={() => setStep('pin')} className="h-20 flex-1 rounded-3xl bg-emerald-500 text-black text-3xl font-black disabled:opacity-30">{t.next} ➡️</button>}
      </div>
      <div className="mt-6"><ServerField cls="text-sm text-white/40 underline" /></div>
    </div>
  );
}

// ---------- logged-in shell ----------
function Main({ t, lang, setLang, onLogout }) {
  const [home, setHome] = useState(null);
  const [offers, setOffers] = useState([]);
  const [active, setActive] = useState(null);
  const [screen, setScreen] = useState('home');
  const [geoErr, setGeoErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const langRef = useRef(lang);
  langRef.current = lang;

  const load = useCallback(async () => {
    try {
      const h = await api('GET', '/workers/me/home');
      setHome(h); setActive(h.active); setOffers(h.offers);
    } catch (e) {
      if (e.status === 401) onLogout();
      else retry.current = setTimeout(() => loadRef.current(), 5000); // offline or Render waking up (~50 s)
    }
  }, [onLogout]);
  const retry = useRef();
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => () => clearTimeout(retry.current), []);

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
    s.on('booking:update', (b) => setActive((a) => (b.status === 'SEARCHING' || b.status === 'CANCELLED' ? (a?.id === b.id ? null : a) : a?.id === b.id || !a ? b : a)));
    return () => s.close();
  }, [load]);

  // While on duty, keep the server's idea of where we are fresh (every ~100 m / 30 s).
  const online = home?.worker.is_online;
  useEffect(() => {
    if (!online || !navigator.geolocation) return;
    let last = 0;
    const id = navigator.geolocation.watchPosition(
      (p) => { setGeoErr(false); if (Date.now() - last > 30000) { last = Date.now(); api('PATCH', '/workers/me', { lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => {}); } },
      () => setGeoErr(true), { enableHighAccuracy: true, maximumAge: 15000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

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
    } finally { setBusy(false); }
  }

  if (!home) return <div className="min-h-full flex items-center justify-center text-6xl bg-neutral-950">⏳</div>;
  if (screen === 'passbook') return <Passbook t={t} onBack={() => setScreen('home')} />;
  if (active) return <ActiveJob t={t} lang={lang} job={active} onChange={setActive} onDone={() => { setActive(null); load(); }} />;
  if (online && offers[0]) {
    return <JobAlert t={t} lang={lang} offer={offers[0]} count={offers.length}
      onAccept={async () => { try { setActive(await api('POST', `/bookings/${offers[0].booking_id}/accept`)); setOffers([]); } catch { setOffers((l) => l.slice(1)); } }}
      onSkip={async () => { const id = offers[0].booking_id; setOffers((l) => l.slice(1)); api('POST', `/bookings/${id}/skip`).catch(() => {}); }} />;
  }

  const w = home.worker;
  return (
    <div className="min-h-full bg-neutral-950 text-white p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onLogout} className="flex items-center gap-2" aria-label="Log out">
          <div className="w-12 h-12 rounded-full bg-emerald-500 text-black text-2xl font-black flex items-center justify-center">{w.name[0]}</div>
          <span className="text-xl font-bold">{w.name}</span>
        </button>
        <LangPill lang={lang} setLang={setLang} />
      </div>

      <button disabled={busy || !w.kyc_verified} onClick={toggleDuty}
        className={`h-56 rounded-[2.5rem] flex flex-col items-center justify-center gap-2 text-black transition-colors ${online ? 'bg-emerald-500 pulse-ring' : 'bg-red-500'} disabled:opacity-60`}>
        <span className="text-7xl">{online ? '🟢' : '🔴'}</span>
        <span className="text-5xl font-black">{online ? t.on_duty : t.off_duty}</span>
        <span className="text-lg font-bold opacity-80">{online ? t.tap_to_stop : t.tap_to_start}</span>
      </button>

      {!w.kyc_verified && <div className="rounded-2xl bg-amber-400 text-black p-4 text-xl font-bold">🪪 {t.kyc_pending}</div>}
      {geoErr && <div className="rounded-2xl bg-amber-400 text-black p-4 text-xl font-bold">📍 {t.location_off}</div>}

      <div className="rounded-3xl bg-white text-black p-5 flex items-center justify-between">
        <div>
          <div className="text-lg font-bold opacity-60">💰 {t.today}</div>
          <div className="text-5xl font-black">{rupees(home.today_earnings)}</div>
          <div className="text-lg font-bold opacity-60">{home.today_shifts} {t.jobs}</div>
        </div>
        <SpeakBtn onClick={() => speak(lang, 'paid', home.today_earnings)} />
      </div>

      <div className="text-center text-xl text-white/60 py-2">{online ? '📡 ' + t.waiting : '😴 ' + t.offline_hint}</div>

      <div className="grid grid-cols-2 gap-3 mt-auto">
        <button onClick={() => setScreen('passbook')} className="h-24 rounded-3xl bg-white/10 text-xl font-bold">📒<br />{t.passbook}</button>
        <a href={`tel:${HELPLINE}`} className="h-24 rounded-3xl bg-red-600 text-xl font-black flex flex-col items-center justify-center">🆘<span>{t.help}</span></a>
      </div>
    </div>
  );
}
