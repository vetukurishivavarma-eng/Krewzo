import { useEffect, useRef, useState } from 'react';
import { Hash, MapPin, Navigation, Phone, ScanLine, Siren, Star, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { COLOR_TAGS, TRADE_TAGS, rupees } from '@krewzo/shared';
import { api, errorBuzz, speak, successChime, vibrate } from './lib.js';
import { ErrorNote, Keypad, SpeakBtn } from './App.jsx';

const STEPS = ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'PAID_OUT'];

export default function ActiveJob({ t, lang, job, onChange, onDone }) {
  const [err, setErr] = useState('');
  if (job.status === 'PAID_OUT') return <Payout t={t} lang={lang} job={job} onDone={onDone} />;

  const act = async (path) => {
    setErr('');
    try { onChange(await api('POST', `/bookings/${job.id}/${path}`)); } catch (e) { setErr(e.message); }
  };
  const verify = async (method, payload) => {
    try {
      const r = await api('POST', `/bookings/${job.id}/verify-handshake`, { method, payload });
      successChime(); vibrate(200);
      if (r.phase === 'START') speak(lang, 'started');
      onChange(r.booking);
      return true;
    } catch (e) {
      errorBuzz(); vibrate([100, 80, 100]);
      if (e.data?.code === 'DISPUTED') { setErr(t.held); return false; }
      if (e.status === 423) { setErr(t.codes_locked); return false; }
      if (e.data?.code === 'TOO_EARLY') { setErr(t.too_early); return false; }
      speak(lang, 'wrong');
      setErr(e.data?.rotated ? t.new_code : `${t.wrong} — ${e.data?.attempts_left ?? ''} ${t.tries_left}`);
      return false;
    }
  };

  const atDoor = job.status === 'ARRIVED' || job.status === 'IN_PROGRESS';
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
  const step = Math.max(0, STEPS.indexOf(job.status === 'COMPLETED' ? 'IN_PROGRESS' : job.status));
  const labels = [t.on_way, t.at_door, t.working_step, t.paid_step];
  const c = job.customer;
  return (
    <div className="p-5 flex flex-col gap-4">
      {/* progress */}
      <div className="flex items-center gap-1.5">
        {labels.map((l, i) => (
          <div key={l} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < step ? 'bg-lime' : i === step ? 'bg-lime/60 animate-pulse' : 'bg-line'}`} />
            <div className={`text-[11px] font-bold mt-1.5 ${i <= step ? 'text-cream' : 'text-muted/60'}`}>{l}</div>
          </div>
        ))}
      </div>

      {/* the job */}
      <section className="rounded-[2rem] bg-surface border border-line p-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-raise flex items-center justify-center text-4xl">{TRADE_TAGS[job.trade_tag]?.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="font-black text-lg leading-tight">{t.TRADES[job.trade_tag]}</div>
            <div className="text-muted text-sm">{parseInt(job.duration)} {t.hours}</div>
          </div>
          <div className="num text-3xl font-bold text-mint">{rupees(job.worker_payout)}</div>
        </div>
        <div className="h-px bg-line my-4" />
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-raise flex items-center justify-center font-display font-extrabold text-lg">{c?.name?.[0]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-muted">{t.for_customer}</div>
            <div className="font-black truncate">{c?.name}</div>
          </div>
          <a href={`tel:${c?.phone}`} aria-label={t.call} className="w-12 h-12 rounded-full bg-mint text-ink flex items-center justify-center"><Phone size={20} /></a>
        </div>
        <div className="flex gap-3 mt-3 text-sm"><MapPin size={18} className="text-lime shrink-0 mt-0.5" /><span className="text-cream/90">{job.address}</span></div>
      </section>

      {job.status === 'IN_PROGRESS' && <ShiftTimer t={t} job={job} />}

      {job.status === 'ASSIGNED' && (
        <>
          <a href={maps} target="_blank" rel="noreferrer" className="h-16 rounded-2xl bg-cream text-ink text-lg font-black flex items-center justify-center gap-2"><Navigation size={22} /> {t.open_maps}</a>
          <button onClick={() => { act('arrive'); speak(lang, 'arrived'); }} className="h-20 rounded-2xl bg-lime text-ink text-2xl font-black">📍 {t.arrived}</button>
          <button onClick={() => act('release')} className="h-12 rounded-2xl text-muted font-bold">{t.cant_come}</button>
        </>
      )}

      {atDoor && (
        <>
          <div className="text-center">
            <div className="font-display text-xl font-extrabold">{job.status === 'ARRIVED' ? t.start_shift : t.end_shift}</div>
          </div>
          <VerifyPad key={job.status} t={t} onVerify={verify} />
        </>
      )}

      {job.disputed ? <div className="rounded-2xl bg-amber/10 border border-amber/30 text-amber p-4 font-bold">{t.disputed}</div> : null}
      {err && <ErrorNote>{err}</ErrorNote>}
      <TrustBar t={t} job={job} />
    </div>
  );
}

// Report a problem with this job / customer, and SOS (calls 112 and alerts Krewzo with this phone's location).
function TrustBar({ t, job }) {
  const [open, setOpen] = useState(null); // 'report' | 'sos'
  const [cat, setCat] = useState('');
  const [msg, setMsg] = useState('');
  const sendReport = async () => {
    try { await api('POST', `/bookings/${job.id}/report`, { category: cat }); setMsg(t.report_sent); setOpen(null); } catch (e) { setMsg(e.message); }
  };
  const alertKrewzo = () => {
    const send = (p) => api('POST', '/sos', { booking_id: job.id, lat: p?.coords.latitude, lng: p?.coords.longitude }).then(() => setMsg(t.sos_sent)).catch(() => {});
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(send, () => send(null), { timeout: 5000, enableHighAccuracy: true }); else send(null);
  };
  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setOpen('report')} className="flex-1 h-12 rounded-2xl border border-line text-muted font-bold">{t.report}</button>
        <button onClick={() => setOpen('sos')} className="h-12 px-5 rounded-2xl bg-danger text-white font-black flex items-center gap-2"><Siren size={18} />{t.sos}</button>
      </div>
      {msg && <div className="text-sm text-muted text-center">{msg}</div>}
      {open === 'report' && (
        <div className="rounded-3xl bg-surface border border-line p-4 grid gap-2">
          {Object.entries(t.R).map(([id, label]) => (
            <button key={id} onClick={() => setCat(id)} className={`text-left h-12 px-4 rounded-xl border font-bold ${cat === id ? 'bg-lime text-ink border-lime' : 'border-line'}`}>{label}</button>
          ))}
          <button disabled={!cat} onClick={sendReport} className="h-12 rounded-xl bg-lime text-ink font-black disabled:opacity-30">{t.send}</button>
        </div>
      )}
      {open === 'sos' && (
        <div className="rounded-3xl bg-danger/10 border border-danger/40 p-4 grid gap-2">
          <a href="tel:112" onClick={alertKrewzo} className="h-14 rounded-2xl bg-danger text-white text-lg font-black flex items-center justify-center gap-2"><Phone size={20} /> {t.call_police}</a>
          <button onClick={alertKrewzo} className="h-12 rounded-xl border border-danger/40 text-danger font-bold">{t.sos} · Krewzo</button>
        </div>
      )}
    </>
  );
}

// After payout: the worker rates the customer (other workers see it on future job offers).
function RateCustomer({ t, job }) {
  const [stars, setStars] = useState(0);
  const rate = async (s) => { setStars(s); try { await api('POST', `/bookings/${job.id}/rate-customer`, { stars: s }); } catch {} };
  return (
    <div className="mt-6 relative text-center">
      <div className="font-bold">{stars ? t.thanks : t.rate_customer}</div>
      <div className="flex justify-center gap-1 mt-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} disabled={!!stars} onClick={() => rate(s)} aria-label={`${s}`} className="p-1"><Star size={34} className={s <= stars ? 'fill-ink text-ink' : 'text-ink/30'} /></button>
        ))}
      </div>
    </div>
  );
}

function ShiftTimer({ t, job }) {
  const total = parseInt(job.duration) * 3600e3;
  const end = Date.parse(job.started_at) + total;
  const [left, setLeft] = useState(end - Date.now());
  useEffect(() => { const id = setInterval(() => setLeft(end - Date.now()), 1000); return () => clearInterval(id); }, [end]);
  const s = Math.max(0, Math.floor(left / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return (
    <section className="rounded-[2rem] bg-lime text-ink p-5">
      <div className="flex items-center justify-between font-black"><span>⚒ {t.working}</span><span className="text-sm opacity-70">{t.time_left}</span></div>
      <div className="num text-6xl font-bold mt-2">{p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}</div>
      <div className="h-2 rounded-full bg-ink/15 mt-3 overflow-hidden"><div className="h-full bg-ink rounded-full" style={{ width: `${Math.min(100, 100 - (left / total) * 100)}%` }} /></div>
    </section>
  );
}

// Primary: scan the customer's QR. Fallback: colour + 2-digit pin (2 taps), or the 4-digit code.
function VerifyPad({ t, onVerify }) {
  const [mode, setMode] = useState('pick');
  const [color, setColor] = useState(null);
  const [digits, setDigits] = useState('');
  const [otp, setOtp] = useState('');

  useEffect(() => {
    if (color && digits.length === 2) onVerify('COLOR_PIN', { color_tag: color, short_pin: digits }).then((ok) => { if (!ok) { setDigits(''); setColor(null); } });
  }, [digits]); // eslint-disable-line
  useEffect(() => {
    if (otp.length === 4) onVerify('OTP', { otp_code: otp }).then((ok) => { if (!ok) setOtp(''); });
  }, [otp]); // eslint-disable-line

  if (mode === 'scan') return <Scanner onCode={async (code) => { const ok = await onVerify('QR', { qr_token: code }); if (!ok) setMode('pick'); return ok; }} onClose={() => setMode('pick')} />;

  return (
    <div className="flex flex-col gap-3">
      <button onClick={() => setMode('scan')} className="h-24 rounded-[1.75rem] bg-lime text-ink text-xl font-black flex items-center justify-center gap-3"><ScanLine size={30} /> {t.scan}</button>
      <div className="flex items-center gap-3 text-muted text-sm font-bold"><span className="flex-1 h-px bg-line" />{t.or_tap}<span className="flex-1 h-px bg-line" /></div>
      <div className="grid grid-cols-3 gap-2.5">
        {Object.values(COLOR_TAGS).map((c) => (
          <button key={c.id} onClick={() => { vibrate(40); setColor(c.id); setDigits(''); }} style={{ background: c.hex }} aria-label={c.id}
            className={`h-16 rounded-2xl transition ${color === c.id ? 'ring-4 ring-cream ring-offset-4 ring-offset-ink' : color ? 'opacity-30' : ''}`} />
        ))}
      </div>
      {color && (
        <>
          <div className="h-16 rounded-2xl bg-surface border border-line flex items-center justify-center gap-4">
            <span className="w-8 h-8 rounded-full" style={{ background: COLOR_TAGS[color].hex }} />
            <span className="num text-4xl font-bold tracking-[0.3em]">{digits.padEnd(2, '·')}</span>
          </div>
          <Keypad value={digits} onChange={setDigits} max={2} />
        </>
      )}
      {!color && (mode === 'otp' ? (
        <>
          <div className="h-16 rounded-2xl bg-surface border border-line num text-4xl font-bold tracking-[0.5em] flex items-center justify-center">{otp.padEnd(4, '·')}</div>
          <Keypad value={otp} onChange={setOtp} max={4} />
        </>
      ) : (
        <button onClick={() => setMode('otp')} className="h-14 rounded-2xl bg-surface border border-line font-bold flex items-center justify-center gap-2"><Hash size={18} /> {t.or_otp}</button>
      ))}
    </div>
  );
}

function Scanner({ onCode, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const q = new Html5Qrcode('krz-scan');
    ref.current = q;
    let handled = false;
    q.start({ facingMode: 'environment' }, { fps: 12, qrbox: { width: 240, height: 240 } }, async (text) => {
      if (handled || !text.startsWith('KRZ1.')) return;
      handled = true;
      vibrate(200);
      await q.stop().catch(() => {});
      const ok = await onCode(text);
      if (!ok) handled = false;
    }, () => {}).catch(() => onClose());
    return () => { if (q.isScanning) q.stop().catch(() => {}); };
  }, []); // eslint-disable-line
  return (
    <div className="flex flex-col gap-3">
      <div id="krz-scan" className="w-full aspect-square rounded-[2rem] overflow-hidden bg-black border-2 border-lime/50" />
      <button onClick={onClose} className="h-14 rounded-2xl bg-surface border border-line font-bold flex items-center justify-center"><X /></button>
    </div>
  );
}

function Payout({ t, lang, job, onDone }) {
  const amount = job.escrow?.worker_payout ?? job.worker_payout;
  useEffect(() => { successChime(); vibrate([200, 100, 200, 100, 400]); speak(lang, 'paid', amount); }, []); // eslint-disable-line
  return (
    <div className="fixed inset-0 z-50 bg-lime text-ink flex flex-col items-center justify-center p-6 gap-3 overflow-hidden">
      {Array.from({ length: 14 }, (_, i) => <span key={i} className="coin" style={{ left: `${(i * 7.3) % 95}%`, animationDelay: `${(i % 7) * 0.18}s` }}>{i % 2 ? '🪙' : '💵'}</span>)}
      <div className="w-24 h-24 rounded-full bg-ink text-lime text-5xl flex items-center justify-center rise">✓</div>
      <div className="font-display text-3xl font-extrabold mt-2">{t.paid}</div>
      <div className="num text-8xl font-bold">{rupees(amount)}</div>
      <div className="font-bold opacity-70">{t.to_upi}</div>
      <div className="font-mono text-xs opacity-60">{job.escrow?.tx_ref}</div>
      <RateCustomer t={t} job={job} />
      <div className="flex gap-3 items-center mt-6 relative">
        <SpeakBtn light onClick={() => speak(lang, 'paid', amount)} />
        <button onClick={onDone} className="h-16 px-12 rounded-2xl bg-ink text-lime text-2xl font-black">{t.done}</button>
      </div>
    </div>
  );
}
