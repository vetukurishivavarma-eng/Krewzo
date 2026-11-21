import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, DoorOpen, KeyRound, Phone, ReceiptText, Star } from 'lucide-react';
import { SKILL_TIERS, TRADE_TAGS, haversineKm, rupees } from '@krewzo/shared';
import { api, connectSocket, getServer, getToken } from './lib.js';
import HandshakeSheet from './HandshakeSheet.jsx';
import MapPin from './MapPin.jsx';
import { STATUS } from './App.jsx';

// ponytail: straight-line km x 1.4 road factor at ~18 km/h city speed. Swap for a routing API if ETAs feel off.
const etaMin = (km) => Math.max(1, Math.ceil(((km * 1.4) / 18) * 60));

export default function Tracking({ groupId, onBack }) {
  const [g, setG] = useState(null);
  const [sheet, setSheet] = useState(null); // { id, phase }
  const [err, setErr] = useState('');
  const [cancelQ, setCancelQ] = useState(null); // { id, fee, km, refund, worker_name }
  const prev = useRef({});

  useEffect(() => {
    const load = () => api('GET', `/groups/${groupId}`).then(setG).catch((e) => setErr(e.message));
    load();
    const s = connectSocket();
    s.on('connect', load);
    s.on('booking:update', (b) => setG((x) => (x && b.group_id === x.id ? { ...x, tickets: x.tickets.map((t) => (t.id === b.id ? b : t)) } : x)));
    s.on('worker:location', ({ booking_id, lat, lng }) => setG((x) => x && { ...x, tickets: x.tickets.map((t) => (t.id === booking_id && t.worker ? { ...t, worker: { ...t.worker, lat, lng } } : t)) }));
    return () => s.close();
  }, [groupId]);

  // Pop the START code automatically when the worker says they've arrived.
  useEffect(() => {
    g?.tickets.forEach((t) => {
      if (t.status === 'ARRIVED' && prev.current[t.id] !== 'ARRIVED' && !sheet) setSheet({ id: t.id, phase: 'START' });
      prev.current[t.id] = t.status;
    });
  }, [g]); // eslint-disable-line

  const back = <button onClick={onBack} className="w-11 h-11 rounded-full bg-card border border-line flex items-center justify-center shrink-0" aria-label="Back"><ArrowLeft size={20} /></button>;
  if (!g) return <div className="p-4">{back}<div className="mt-6 text-muted">{err || 'Loading…'}</div></div>;
  const first = g.tickets[0];
  const open = sheet && g.tickets.find((t) => t.id === sheet.id);

  // Fetch the quote first: if the worker is already on the way, the customer sees the travel fee before confirming.
  const cancel = async (id) => {
    setErr('');
    try { setCancelQ({ id, ...(await api('GET', `/bookings/${id}/cancel-quote`)) }); } catch (e) { setErr(e.message); }
  };
  const confirmCancel = async () => {
    const id = cancelQ.id;
    setCancelQ(null);
    try { await api('POST', `/bookings/${id}/cancel`); } catch (e) { setErr(e.message); }
  };
  const rate = async (id, stars) => {
    try { const b = await api('POST', `/bookings/${id}/rate`, { stars }); setG((x) => ({ ...x, tickets: x.tickets.map((t) => (t.id === id ? b : t)) })); } catch (e) { setErr(e.message); }
  };

  const assigned = g.tickets.filter((t) => t.worker?.lat != null && t.status === 'ASSIGNED');
  const nearest = assigned.map((t) => haversineKm(t.worker, t)).sort((a, b) => a - b)[0];
  return (
    <div className="px-4 pt-4 pb-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {back}
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl font-extrabold truncate">{TRADE_TAGS[first.trade_tag]?.icon} {TRADE_TAGS[first.trade_tag]?.label} × {g.worker_count}</div>
          <div className="text-xs text-muted truncate">{first.duration} · {first.booking_mode === 'SCHEDULED' ? new Date(first.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Instant'} · {first.address}</div>
        </div>
        <a href={`${getServer()}/api/groups/${g.id}/invoice?token=${encodeURIComponent(getToken())}`} target="_blank" rel="noreferrer" aria-label="Invoice"
          className="w-11 h-11 rounded-full bg-card border border-line flex items-center justify-center shrink-0"><ReceiptText size={19} /></a>
      </div>

      {assigned.length > 0 && (
        <div className="relative rounded-3xl overflow-hidden border border-line">
          <MapPin lat={first.lat} lng={first.lng} height={230} others={assigned.map((t) => ({ lat: t.worker.lat, lng: t.worker.lng, emoji: '👷' }))} />
          <div className="absolute top-3 left-3 z-[500] rounded-full bg-ink text-paper pl-2.5 pr-3.5 py-1.5 text-xs font-bold flex items-center gap-2 shadow-lg">
            <span className="w-2 h-2 rounded-full bg-lime animate-pulse" /> LIVE{nearest != null && <span className="text-lime">· ~{etaMin(nearest)} min</span>}
          </div>
        </div>
      )}

      {g.tickets.map((t, i) => <Ticket key={t.id} t={t} n={g.tickets.length > 1 ? i + 1 : null} onSheet={(phase) => setSheet({ id: t.id, phase })} onCancel={() => cancel(t.id)} onRate={(s) => rate(t.id, s)} />)}
      {err && <div className="text-sm text-danger font-semibold">{err}</div>}
      {open && <HandshakeSheet ticket={open} phase={sheet.phase} onClose={() => setSheet(null)} />}
      {cancelQ && <CancelSheet q={cancelQ} onKeep={() => setCancelQ(null)} onCancel={confirmCancel} />}
    </div>
  );
}

function CancelSheet({ q, onKeep, onCancel }) {
  const first = q.worker_name?.split(' ')[0];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={onKeep}>
      <div onClick={(e) => e.stopPropagation()} className="sheet w-full max-w-md rounded-t-[2rem] bg-card px-6 pt-3 pb-8">
        <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-5" />
        <div className="font-display text-2xl font-extrabold">Cancel this booking?</div>
        {q.fee > 0 ? (
          <>
            <p className="text-muted mt-2">{first} has already travelled <b className="text-ink">{q.km} km</b> toward you. To be fair to them, a travel fee goes to {first}.</p>
            <div className="mt-4 rounded-2xl bg-paper p-4 text-sm space-y-1.5">
              <div className="flex justify-between"><span>Travel fee to {first}</span><span className="num font-bold">{rupees(q.fee)}</span></div>
              <div className="flex justify-between text-forest font-bold"><span>Refunded to you</span><span className="num">{rupees(q.refund)}</span></div>
            </div>
          </>
        ) : (
          <p className="text-muted mt-2">{first ? `${first} hasn't started travelling yet, so` : 'No worker is on the way yet, so'} you get a <b className="text-forest">full refund of {rupees(q.refund)}</b>.</p>
        )}
        <p className="text-xs text-muted mt-3">Cancelling is free until the worker has travelled 0.5 km. After that it's ₹20 + ₹10 per km travelled (max ₹100), paid in full to the worker.</p>
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button onClick={onKeep} className="h-12 rounded-xl bg-ink text-paper font-bold">Keep booking</button>
          <button onClick={onCancel} className="h-12 rounded-xl border border-line font-bold text-danger">{q.fee > 0 ? `Cancel, pay ${rupees(q.fee)}` : 'Cancel booking'}</button>
        </div>
      </div>
    </div>
  );
}

function Radar() {
  return (
    <div className="relative w-36 h-36 mx-auto my-3 rounded-full bg-paper">
      <div className="radar-sweep" />
      <div className="radar-wave" /><div className="radar-wave" style={{ animationDelay: '0.8s' }} /><div className="radar-wave" style={{ animationDelay: '1.6s' }} />
      <div className="absolute inset-0 flex items-center justify-center text-3xl">📍</div>
    </div>
  );
}

function Countdown({ t }) {
  const end = Date.parse(t.started_at) + parseInt(t.duration) * 3600e3;
  const [left, setLeft] = useState(end - Date.now());
  useEffect(() => { const id = setInterval(() => setLeft(end - Date.now()), 1000); return () => clearInterval(id); }, [end]);
  const s = Math.max(0, Math.floor(left / 1000));
  const pct = Math.min(100, 100 - (left / (parseInt(t.duration) * 3600e3)) * 100);
  const p = (n) => String(n).padStart(2, '0');
  return (
    <div className="rounded-2xl bg-ink text-paper p-4">
      <div className="flex justify-between text-xs font-bold text-paper/60"><span>{left > 0 ? 'Shift time left' : 'Shift time over'}</span><span>{Math.round(pct)}%</span></div>
      <div className="num text-5xl font-bold mt-1">{p(Math.floor(s / 3600))}:{p(Math.floor((s % 3600) / 60))}:{p(s % 60)}</div>
      <div className="h-2 rounded-full bg-paper/15 mt-3 overflow-hidden"><div className="h-full bg-lime rounded-full" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Ticket({ t, n, onSheet, onCancel, onRate }) {
  const w = t.worker;
  const km = w?.lat != null ? haversineKm(w, t) : null;
  const [label, cls] = STATUS[t.status];
  return (
    <div className="rounded-3xl bg-card border border-line p-4 rise">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-muted">{n ? `WORKER ${n}` : 'YOUR WORKER'}</span>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>
      </div>

      {t.status === 'SEARCHING' && (
        <>
          <Radar />
          <div className="text-center font-display text-lg font-extrabold">Finding verified workers nearby</div>
          <div className="text-center text-sm text-muted">{rupees(t.escrow_total)} is safe in escrow</div>
          <button onClick={onCancel} className="mt-4 w-full h-11 rounded-xl border border-line text-sm font-bold text-muted">Cancel & refund</button>
        </>
      )}

      {w && ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'PAID_OUT'].includes(t.status) && (
        <div className="flex items-center gap-3">
          {w.photo_url ? <img src={w.photo_url.startsWith('/') ? getServer() + w.photo_url : w.photo_url} alt={w.name} className="w-14 h-14 rounded-2xl object-cover" /> :
            <div className="w-14 h-14 rounded-2xl bg-lime text-ink text-2xl font-display font-extrabold flex items-center justify-center">{w.name[0]}</div>}
          <div className="flex-1 min-w-0">
            <div className="font-bold flex items-center gap-1.5 truncate">{w.name} {w.kyc_verified && <BadgeCheck size={17} className="text-forest shrink-0" aria-label="KYC verified" />}</div>
            <div className="text-sm text-muted flex items-center gap-1"><Star size={13} className="fill-amber text-amber" /> {Number(w.rating).toFixed(1)} · {SKILL_TIERS[w.skill_tier].label}</div>
            {km != null && t.status === 'ASSIGNED' && <div className="text-sm font-bold mt-0.5">{km.toFixed(1)} km · ~{etaMin(km)} min away</div>}
          </div>
          {t.status !== 'PAID_OUT' && <a href={`tel:${w.phone}`} className="w-12 h-12 rounded-full bg-ink text-lime flex items-center justify-center" aria-label="Call worker"><Phone size={19} /></a>}
        </div>
      )}

      {t.status === 'ASSIGNED' && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={() => onSheet('START')} className="col-span-2 h-12 rounded-xl bg-ink text-paper text-sm font-bold flex items-center justify-center gap-2"><KeyRound size={16} className="text-lime" /> Start code</button>
          <button onClick={onCancel} className="h-12 rounded-xl border border-line text-sm font-bold text-muted">Cancel</button>
        </div>
      )}
      {t.status === 'ARRIVED' && <button onClick={() => onSheet('START')} className="mt-4 w-full h-14 rounded-2xl bg-lime text-ink font-black flex items-center justify-center gap-2"><DoorOpen size={20} /> At your door — show start code</button>}
      {t.status === 'IN_PROGRESS' && (
        <div className="mt-4">
          <Countdown t={t} />
          <button onClick={() => onSheet('END')} className="mt-3 w-full h-14 rounded-2xl bg-amber text-ink font-black flex items-center justify-center gap-2"><KeyRound size={18} /> Work done — show finish code</button>
        </div>
      )}
      {t.status === 'PAID_OUT' && (
        <div className="mt-4">
          <button onClick={() => onSheet('END')} className="w-full text-left rounded-2xl bg-paper p-3 text-sm"><b className="num">{rupees(t.escrow.worker_payout)}</b> released to worker · <span className="font-mono text-xs text-muted">{t.escrow.tx_ref}</span></button>
          <div className="text-center text-xs font-bold text-muted mt-3">{t.customer_rating ? 'Thanks for rating' : 'Rate your worker'}</div>
          <div className="flex justify-center gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} disabled={!!t.customer_rating} onClick={() => onRate(s)} aria-label={`${s} stars`} className="p-1">
                <Star size={30} className={s <= (t.customer_rating || 0) ? 'fill-amber text-amber' : 'text-line'} />
              </button>
            ))}
          </div>
        </div>
      )}
      {t.status === 'CANCELLED' && (
        <div className="text-sm text-muted">
          {rupees(t.escrow.amount_held - (t.cancel_fee || 0))} refunded ({t.escrow.tx_ref})
          {t.cancel_fee > 0 && <div>{rupees(t.cancel_fee)} paid to {t.worker?.name || 'the worker'} for travel</div>}
        </div>
      )}
    </div>
  );
}
