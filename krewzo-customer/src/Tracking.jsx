import { useEffect, useRef, useState } from 'react';
import { SKILL_TIERS, TRADE_TAGS, haversineKm, rupees } from '@krewzo/shared';
import { api, connectSocket, getServer, getToken } from './lib.js';
import HandshakeSheet from './HandshakeSheet.jsx';
import MapPin from './MapPin.jsx';

export default function Tracking({ groupId, onBack }) {
  const [g, setG] = useState(null);
  const [sheet, setSheet] = useState(null); // { id, phase }
  const [err, setErr] = useState('');
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

  if (!g) return <div className="p-6 text-slate-400">{err || 'Loading…'}</div>;
  const first = g.tickets[0];
  const open = sheet && g.tickets.find((t) => t.id === sheet.id);

  const cancel = async (id) => {
    if (!confirm('Cancel this worker? Your escrow is refunded in full.')) return;
    try { await api('POST', `/bookings/${id}/cancel`); } catch (e) { setErr(e.message); }
  };
  const rate = async (id, stars) => {
    try { const b = await api('POST', `/bookings/${id}/rate`, { stars }); setG((x) => ({ ...x, tickets: x.tickets.map((t) => (t.id === id ? b : t)) })); } catch (e) { setErr(e.message); }
  };

  const assigned = g.tickets.filter((t) => t.worker?.lat != null && ['ASSIGNED', 'ARRIVED'].includes(t.status));
  return (
    <div className="px-4 pb-6 flex flex-col gap-3">
      <button onClick={onBack} className="self-start text-sm text-slate-500">← All bookings</button>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xl font-black">{TRADE_TAGS[first.trade_tag]?.icon} {SKILL_TIERS[first.skill_tier].label} × {g.worker_count}</div>
          <div className="text-sm text-slate-500">{first.duration} · {first.booking_mode === 'SCHEDULED' ? new Date(first.scheduled_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Instant'} · {first.address}</div>
        </div>
        <a href={`${getServer()}/api/groups/${g.id}/invoice?token=${encodeURIComponent(getToken())}`} target="_blank" rel="noreferrer" className="shrink-0 text-xs font-semibold px-3 py-2 rounded-full bg-white border border-slate-200">🧾 {g.account_type === 'BUSINESS' ? 'GST invoice' : 'Invoice'}</a>
      </div>

      {assigned.length > 0 && <MapPin lat={first.lat} lng={first.lng} height={180} others={assigned.map((t) => ({ lat: t.worker.lat, lng: t.worker.lng, emoji: '👷' }))} />}

      {g.tickets.map((t, i) => <Ticket key={t.id} t={t} n={g.tickets.length > 1 ? i + 1 : null} onSheet={(phase) => setSheet({ id: t.id, phase })} onCancel={() => cancel(t.id)} onRate={(s) => rate(t.id, s)} />)}
      {err && <div className="text-sm text-red-600">{err}</div>}
      {open && <HandshakeSheet ticket={open} phase={sheet.phase} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Radar() {
  return (
    <div className="relative w-40 h-40 mx-auto my-2 rounded-full bg-emerald-50">
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
  return (
    <div>
      <div className="font-mono text-4xl font-black text-center">{String(Math.floor(s / 3600)).padStart(2, '0')}:{String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</div>
      <div className="h-2 rounded-full bg-slate-100 mt-2 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
      <div className="text-center text-xs text-slate-500 mt-1">{left > 0 ? 'Shift time left' : 'Shift time over'}</div>
    </div>
  );
}

function Ticket({ t, n, onSheet, onCancel, onRate }) {
  const w = t.worker;
  const km = w?.lat != null ? haversineKm(w, t) : null;
  return (
    <div className="rounded-3xl bg-white border border-slate-200 p-4">
      {n && <div className="text-xs font-bold text-slate-400 mb-2">WORKER {n}</div>}

      {t.status === 'SEARCHING' && (
        <>
          <Radar />
          <div className="text-center font-bold">Finding verified workers within 3 km…</div>
          <div className="text-center text-xs text-slate-500">{rupees(t.escrow_total)} is safe in escrow</div>
          <button onClick={onCancel} className="mt-3 w-full h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Cancel & refund</button>
        </>
      )}

      {w && ['ASSIGNED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'PAID_OUT'].includes(t.status) && (
        <div className="flex items-center gap-3">
          {w.photo_url ? <img src={w.photo_url} alt="" className="w-14 h-14 rounded-full object-cover" /> :
            <div className="w-14 h-14 rounded-full bg-emerald-600 text-white text-2xl font-black flex items-center justify-center">{w.name[0]}</div>}
          <div className="flex-1">
            <div className="font-bold flex items-center gap-1.5">{w.name} {w.kyc_verified && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ KYC VERIFIED</span>}</div>
            <div className="text-sm text-slate-500">⭐ {Number(w.rating).toFixed(1)} · {SKILL_TIERS[w.skill_tier].label}{km != null && t.status === 'ASSIGNED' ? ` · ${km.toFixed(1)} km away` : ''}</div>
          </div>
          {t.status !== 'PAID_OUT' && <a href={`tel:${w.phone}`} className="w-11 h-11 rounded-full bg-emerald-600 text-white flex items-center justify-center text-lg" aria-label="Call worker">📞</a>}
        </div>
      )}

      {t.status === 'ASSIGNED' && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => onSheet('START')} className="col-span-2 h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold">🤝 Show start code</button>
          <button onClick={onCancel} className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600">Cancel</button>
        </div>
      )}
      {t.status === 'ARRIVED' && <button onClick={() => onSheet('START')} className="mt-3 w-full h-12 rounded-xl bg-emerald-600 text-white font-bold">🚪 Worker is at your door — show start code</button>}
      {t.status === 'IN_PROGRESS' && (
        <div className="mt-4">
          <Countdown t={t} />
          <button onClick={() => onSheet('END')} className="mt-3 w-full h-12 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 font-bold">🔐 Work done — show finish code</button>
        </div>
      )}
      {t.status === 'PAID_OUT' && (
        <div className="mt-3">
          <button onClick={() => onSheet('END')} className="w-full text-left rounded-xl bg-amber-50 p-3 text-sm"><b>{rupees(t.escrow.worker_payout)}</b> released to worker · <span className="font-mono text-xs">{t.escrow.tx_ref}</span></button>
          <div className="flex justify-center gap-1 mt-2">
            {[1, 2, 3, 4, 5].map((s) => <button key={s} disabled={!!t.customer_rating} onClick={() => onRate(s)} className={`text-2xl ${s <= (t.customer_rating || 0) ? '' : 'grayscale opacity-40'}`}>⭐</button>)}
          </div>
        </div>
      )}
      {t.status === 'CANCELLED' && <div className="text-sm text-slate-500">Cancelled · {rupees(t.escrow.amount_held)} refunded ({t.escrow.tx_ref})</div>}
    </div>
  );
}
