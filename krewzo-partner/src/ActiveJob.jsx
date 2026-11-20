import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { COLOR_TAGS, TRADE_TAGS, rupees } from '@krewzo/shared';
import { api, errorBuzz, speak, successChime, vibrate } from './lib.js';
import { Keypad, SpeakBtn } from './App.jsx';

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
      errorBuzz(); vibrate([100, 80, 100]); speak(lang, 'wrong');
      setErr(e.data?.rotated ? t.new_code : `${t.wrong} — ${e.data?.attempts_left ?? ''} ${t.tries_left}`);
      return false;
    }
  };

  const atDoor = job.status === 'ARRIVED' || job.status === 'IN_PROGRESS';
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${job.lat},${job.lng}`;
  return (
    <div className="min-h-full bg-neutral-950 text-white p-4 flex flex-col gap-4">
      <div className="rounded-3xl bg-white text-black p-4 flex items-center gap-4">
        <div className="text-6xl">{TRADE_TAGS[job.trade_tag]?.icon}</div>
        <div className="flex-1">
          <div className="text-4xl font-black">{rupees(job.worker_payout)}</div>
          <div className="text-lg font-bold opacity-70">⏱ {parseInt(job.duration)} {t.hours} · 👤 {job.customer?.name}</div>
          <div className="text-base opacity-70 leading-tight">📍 {job.address}</div>
        </div>
      </div>

      {job.status === 'IN_PROGRESS' && <ShiftTimer t={t} job={job} />}

      {job.status === 'ASSIGNED' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <a href={maps} target="_blank" rel="noreferrer" className="h-28 rounded-3xl bg-sky-500 text-black text-2xl font-black flex flex-col items-center justify-center">🗺️<span>{t.navigate}</span></a>
            <a href={`tel:${job.customer?.phone}`} className="h-28 rounded-3xl bg-white/10 text-2xl font-black flex flex-col items-center justify-center">📞<span>{t.call}</span></a>
          </div>
          <button onClick={() => { act('arrive'); speak(lang, 'arrived'); }} className="h-28 rounded-3xl bg-emerald-500 text-black text-3xl font-black">📍 {t.arrived}</button>
          <button onClick={() => act('release')} className="h-14 rounded-2xl bg-white/5 text-white/60 text-lg font-bold">🙅 {t.cant_come}</button>
        </>
      )}

      {atDoor && (
        <>
          <div className="text-2xl font-black text-center">{job.status === 'ARRIVED' ? '🔑 ' + t.start_shift : '🏁 ' + t.end_shift}</div>
          <VerifyPad key={job.status} t={t} onVerify={verify} />
          <a href={`tel:${job.customer?.phone}`} className="h-14 rounded-2xl bg-white/10 text-xl font-bold flex items-center justify-center">📞 {t.call} {t.customer}</a>
        </>
      )}

      {err && <div className="rounded-2xl bg-red-600 p-4 text-2xl font-black text-center">❌ {err}</div>}
    </div>
  );
}

function ShiftTimer({ t, job }) {
  const end = Date.parse(job.started_at) + parseInt(job.duration) * 3600e3;
  const [left, setLeft] = useState(end - Date.now());
  useEffect(() => { const id = setInterval(() => setLeft(end - Date.now()), 1000); return () => clearInterval(id); }, [end]);
  const s = Math.max(0, Math.floor(left / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return (
    <div className="rounded-3xl bg-emerald-600 text-black p-4 text-center">
      <div className="text-xl font-black">⚒️ {t.working}</div>
      <div className="text-6xl font-black font-mono">{hh}:{mm}:{ss}</div>
      <div className="font-bold opacity-70">{t.time_left}</div>
    </div>
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
      <button onClick={() => setMode('scan')} className="h-32 rounded-3xl bg-emerald-500 text-black text-3xl font-black flex flex-col items-center justify-center">📷<span>{t.scan}</span></button>
      <div className="text-center text-lg text-white/60">{t.or_tap}</div>
      <div className="grid grid-cols-3 gap-3">
        {Object.values(COLOR_TAGS).map((c) => (
          <button key={c.id} onClick={() => { vibrate(40); setColor(c.id); setDigits(''); }} style={{ background: c.hex }}
            className={`h-20 rounded-2xl text-4xl ${color === c.id ? 'ring-8 ring-white' : color ? 'opacity-40' : ''}`}>{c.emoji}</button>
        ))}
      </div>
      {color && (
        <>
          <div className="h-16 rounded-2xl bg-white text-black text-5xl font-black flex items-center justify-center gap-3">
            <span>{COLOR_TAGS[color].emoji}</span><span className="font-mono">{digits.padEnd(2, '_')}</span>
          </div>
          <Keypad value={digits} onChange={setDigits} max={2} />
        </>
      )}
      {!color && (mode === 'otp' ? (
        <>
          <div className="h-16 rounded-2xl bg-white text-black text-4xl font-black font-mono tracking-[0.4em] flex items-center justify-center">{otp.padEnd(4, '_')}</div>
          <Keypad value={otp} onChange={setOtp} max={4} />
        </>
      ) : (
        <button onClick={() => setMode('otp')} className="h-14 rounded-2xl bg-white/10 text-xl font-bold">🔢 {t.or_otp}</button>
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
      <div id="krz-scan" className="w-full aspect-square rounded-3xl overflow-hidden bg-black" />
      <button onClick={onClose} className="h-16 rounded-2xl bg-white/10 text-3xl font-black">✖</button>
    </div>
  );
}

function Payout({ t, lang, job, onDone }) {
  const amount = job.escrow?.worker_payout ?? job.worker_payout;
  useEffect(() => { successChime(); vibrate([200, 100, 200, 100, 400]); speak(lang, 'paid', amount); }, []); // eslint-disable-line
  return (
    <div className="fixed inset-0 bg-emerald-500 text-black flex flex-col items-center justify-center p-6 gap-4 overflow-hidden">
      {Array.from({ length: 14 }, (_, i) => <span key={i} className="coin" style={{ left: `${(i * 7.3) % 95}%`, animationDelay: `${(i % 7) * 0.18}s` }}>{i % 2 ? '🪙' : '💵'}</span>)}
      <div className="text-8xl">🎉</div>
      <div className="text-4xl font-black">{t.paid}</div>
      <div className="text-8xl font-black">{rupees(amount)}</div>
      <div className="text-xl font-bold">{t.to_upi}</div>
      <div className="font-mono text-sm opacity-70">{job.escrow?.tx_ref}</div>
      <div className="flex gap-3 items-center mt-4 relative">
        <SpeakBtn onClick={() => speak(lang, 'paid', amount)} />
        <button onClick={onDone} className="h-20 px-12 rounded-3xl bg-black text-white text-3xl font-black">{t.done} ✔</button>
      </div>
    </div>
  );
}
