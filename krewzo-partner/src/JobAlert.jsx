import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Clock, MapPin, UserRound, X } from 'lucide-react';
import { TRADE_TAGS, rupees } from '@krewzo/shared';
import { chime, speak, vibrate } from './lib.js';
import { SpeakBtn } from './App.jsx';

const RING_S = 30;

// Incoming job, full screen: countdown ring, what you earn, what / where / who, slide to accept.
// Same look as the native lock-screen alert and the island, so it feels like one product.
// The server owns the deadline (expires_at) and withdraws the offer with job:taken when it passes.
export default function JobAlert({ t, lang, offer, count, onAccept, onSkip, onTimeout }) {
  const hours = parseInt(offer.duration);
  const say = () => speak(lang, 'job', { ...offer, hours });
  // Clamp: a phone clock that is off shouldn't show a silly countdown.
  const secsLeft = () => Math.max(0, Math.min(RING_S, Math.ceil((Date.parse(offer.expires_at) - Date.now()) / 1000) || RING_S));
  const [left, setLeft] = useState(secsLeft);
  useEffect(() => {
    setLeft(secsLeft());
    const ring = setInterval(chime, 6000); // keep ringing until the worker decides
    const tick = setInterval(() => setLeft(secsLeft()), 1000);
    const gone = setTimeout(onTimeout, (RING_S + 4) * 1000); // backstop if the socket missed the server's withdrawal
    return () => { clearInterval(ring); clearInterval(tick); clearTimeout(gone); };
  }, [offer.booking_id]); // eslint-disable-line

  const when = offer.booking_mode === 'SCHEDULED' && new Date(offer.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const R = 76, C = 2 * Math.PI * R;
  return (
    <div className="fixed inset-0 z-50 bg-ink flex flex-col p-5 overflow-hidden">
      <div className="glow absolute -top-40 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] rounded-full bg-[radial-gradient(circle,rgba(200,240,49,.28),transparent_60%)] pointer-events-none" />
      <div className="relative flex items-center justify-between drop">
        <span className="rounded-full bg-lime text-ink px-3 py-1.5 text-xs font-black tracking-widest">● {t.new_job.toUpperCase()}{count > 1 ? ` · ${count}` : ''}</span>
        <SpeakBtn onClick={say} />
      </div>

      <div className="relative flex-1 flex flex-col items-center justify-center">
        <div className="relative w-44 h-44 drop" style={{ animationDelay: '60ms' }}>
          <svg viewBox="0 0 168 168" className="absolute inset-0 -rotate-90">
            <circle cx="84" cy="84" r={R} fill="none" stroke="var(--color-line)" strokeWidth="7" />
            <circle cx="84" cy="84" r={R} fill="none" stroke="var(--color-lime)" strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - left / RING_S)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="breathe text-6xl">{TRADE_TAGS[offer.trade_tag]?.icon}</span>
            <span className="num text-sm font-bold text-muted mt-1">{left}{t.sec}</span>
          </div>
        </div>

        <div className="mt-7 text-xs font-black tracking-[0.2em] text-muted">{t.you_earn.toUpperCase()}</div>
        <div className="num text-7xl font-bold text-mint mt-1 rise">{rupees(offer.payout)}</div>
        <div className="text-2xl font-black mt-2">{t.TRADES[offer.trade_tag]}</div>

        <div className="flex flex-wrap justify-center gap-2 mt-6">
          <Chip icon={MapPin}>{offer.distance_km} {t.km}</Chip>
          <Chip icon={Clock}>{hours} {t.hours}</Chip>
          {offer.customer_name && <Chip icon={UserRound}>{offer.customer_name}{offer.customer_rating ? ` ★${Number(offer.customer_rating).toFixed(1)}` : ''}</Chip>}
        </div>
        {offer.area && <div className="text-muted mt-3 text-center">{offer.area}</div>}
        {when && <div className="mt-3 rounded-2xl bg-amber/15 border border-amber/30 text-amber px-4 py-2 font-bold flex items-center gap-2"><CalendarClock size={18} /> {t.scheduled}: {when}</div>}
        {offer.addons?.length > 0 && <div className="mt-3 text-3xl">{offer.addons.includes('TOOLKIT') && '🧰'} {offer.addons.includes('LADDER') && '🪜'}</div>}
      </div>

      <div className="relative flex flex-col gap-3">
        <SlideToAccept label={t.slide} onDone={onAccept} />
        <button onClick={onSkip} className="h-14 rounded-2xl bg-surface border border-line text-muted font-bold flex items-center justify-center gap-2"><X size={20} /> {t.skip}</button>
      </div>
    </div>
  );
}

const Chip = ({ icon: Icon, children }) => (
  <span className="rounded-2xl bg-surface border border-line px-4 py-2.5 text-lg font-black flex items-center gap-2"><Icon size={18} className="text-lime" />{children}</span>
);

// Drag the knob to the end (Enter also works, for keyboards and screen readers). Hard to trigger by accident in a pocket.
export function SlideToAccept({ label, onDone }) {
  const track = useRef(null);
  const [x, setX] = useState(0);
  const [drag, setDrag] = useState(null);
  const [done, setDone] = useState(false);
  const KNOB = 64;
  const max = () => (track.current?.clientWidth || 300) - KNOB - 8;
  const finish = () => { if (done) return; setDone(true); setX(max()); vibrate(60); onDone(); };

  return (
    <div ref={track} role="button" tabIndex={0} aria-label={label} onKeyDown={(e) => e.key === 'Enter' && finish()}
      className="relative h-[4.5rem] rounded-full bg-lime/15 border border-lime/40 overflow-hidden touch-none"
      onPointerDown={(e) => { if (!done) { setDrag(e.clientX - x); e.currentTarget.setPointerCapture(e.pointerId); } }}
      onPointerMove={(e) => drag != null && setX(Math.max(0, Math.min(max(), e.clientX - drag)))}
      onPointerUp={() => { if (drag == null) return; setDrag(null); if (x > max() * 0.8) finish(); else setX(0); }}>
      <div className="absolute inset-y-0 left-0 bg-lime/25" style={{ width: x + KNOB }} />
      <div className="absolute inset-0 flex items-center justify-center font-black text-lime text-lg pl-14" style={{ opacity: 1 - x / (max() || 1) }}>{label} ›››</div>
      <div className="absolute top-1 left-1 rounded-full bg-lime text-ink flex items-center justify-center text-3xl font-black shadow-[0_0_30px_rgba(200,240,49,.5)]"
        style={{ width: KNOB, height: KNOB, transform: `translateX(${x}px)`, transition: drag != null ? 'none' : 'transform .25s ease' }}>→</div>
    </div>
  );
}
