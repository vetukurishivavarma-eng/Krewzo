import { useMemo, useState } from 'react';
import {
  ADDONS, DEFAULT_LOCATION, DURATIONS, GSTIN_RE, INSURANCE_FEE, MAX_WORKERS, SKILL_TIERS, SLOTS, TRADE_TAGS, UPI_RE,
  quotePrice, rupees, tradesForTier,
} from '@krewzo/shared';
import { api } from './lib.js';
import MapPin from './MapPin.jsx';

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const Pill = ({ on, children, ...p }) => (
  <button type="button" {...p} className={`px-4 h-11 rounded-full text-sm font-semibold border transition ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700'}`}>{children}</button>
);
const Section = ({ title, children, right }) => (
  <section className="px-4 py-3">
    <div className="flex items-center justify-between mb-2"><h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>{right}</div>
    {children}
  </section>
);

export default function Book({ user, onBooked }) {
  const last = user.addresses[0];
  const [f, setF] = useState({
    lat: last?.lat ?? DEFAULT_LOCATION.lat, lng: last?.lng ?? DEFAULT_LOCATION.lng, address: last?.address ?? '', address_label: last?.label ?? 'Home',
    booking_mode: 'INSTANT', scheduled_date: todayIST(), slot: 'MORNING',
    skill_tier: 'TIER_1', trade_tag: 'HELPER', duration: '2H', worker_count: 1, addons: [],
    account_type: user.account_type, gstin: user.gstin || '', business_name: user.business_name || '', insurance: true, upi_id: '',
  });
  const [step, setStep] = useState('book');
  const [err, setErr] = useState('');
  const [paying, setPaying] = useState(false);
  const [locating, setLocating] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const q = useMemo(() => quotePrice({ ...f }), [f.skill_tier, f.duration, f.worker_count, f.addons, f.insurance]); // eslint-disable-line

  function gps() {
    if (!navigator.geolocation) return setErr('Location not available on this device');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (p) => {
      const { latitude: lat, longitude: lng } = p.coords;
      set({ lat, lng });
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`).then((x) => x.json());
        if (r.display_name) set({ address: r.display_name.split(',').slice(0, 4).join(',') });
      } catch {}
      setLocating(false);
    }, () => { setLocating(false); setErr('Could not get your location. Drop the pin on the map instead.'); }, { enableHighAccuracy: true, timeout: 10000 });
  }

  async function pay() {
    setErr('');
    if (!UPI_RE.test(f.upi_id)) return setErr('Enter your UPI ID, e.g. name@okhdfc');
    if (f.account_type === 'BUSINESS' && !GSTIN_RE.test(f.gstin.toUpperCase())) return setErr('GSTIN must be 15 characters, e.g. 36ABCDE1234F1Z5');
    setPaying(true);
    try { onBooked(await api('POST', '/bookings', f)); }
    catch (e) { setErr(e.message); setPaying(false); }
  }

  if (step === 'checkout') {
    const p = q.total;
    const row = (label, v, cls = '') => <div className={`flex justify-between py-1.5 ${cls}`}><span>{label}</span><span>{rupees(v)}</span></div>;
    return (
      <div className="pb-6">
        <Section title="Billing">
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-200/60">
            {['PERSONAL', 'BUSINESS'].map((a) => (
              <button key={a} onClick={() => set({ account_type: a })} className={`h-11 rounded-xl font-semibold text-sm ${f.account_type === a ? 'bg-white shadow' : 'text-slate-500'}`}>{a === 'PERSONAL' ? '🏠 Personal' : '🏢 Business (GST)'}</button>
            ))}
          </div>
          {f.account_type === 'BUSINESS' && (
            <div className="mt-3 grid gap-2">
              <input placeholder="Business name" value={f.business_name} onChange={(e) => set({ business_name: e.target.value })} className="h-12 rounded-xl border border-slate-200 bg-white px-3" />
              <input placeholder="GSTIN (15 characters)" value={f.gstin} maxLength={15} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} className="h-12 rounded-xl border border-slate-200 bg-white px-3 font-mono uppercase" />
              <p className="text-xs text-slate-500">A GST tax invoice is generated for every booking.</p>
            </div>
          )}
        </Section>
        <Section title="Price breakdown">
          <div className="rounded-2xl bg-white border border-slate-200 p-4 text-sm">
            {row(`Worker wage (100% to worker) · ${f.worker_count} × ${f.duration}`, p.base_wage, 'font-semibold')}
            {p.addons_total > 0 && row('Tool add-ons (to worker)', p.addons_total)}
            {row('Platform fee', p.platform_fee)}
            {row('GST 18% on platform fee', p.gst_amount)}
            <label className="flex justify-between py-1.5 items-center">
              <span className="flex items-center gap-2"><input type="checkbox" checked={f.insurance} onChange={(e) => set({ insurance: e.target.checked })} className="w-4 h-4 accent-emerald-600" /> Shift insurance ({rupees(INSURANCE_FEE)}/worker)</span>
              <span>{rupees(p.insurance_fee)}</span>
            </label>
            <div className="flex justify-between pt-3 mt-2 border-t border-slate-200 text-lg font-black"><span>Total held in escrow</span><span>{rupees(p.escrow_total)}</span></div>
            <p className="text-xs text-slate-500 mt-2">🔒 Your money stays locked in escrow. It is released to the worker only when you show the FINISH code. Cancel before work starts for a full refund.</p>
          </div>
        </Section>
        <Section title="Pay with UPI">
          <input placeholder="yourname@okhdfc" value={f.upi_id} onChange={(e) => set({ upi_id: e.target.value.trim() })} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3" />
        </Section>
        {err && <div className="px-4 text-sm text-red-600">{err}</div>}
        <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 bg-gradient-to-t from-slate-50 via-slate-50 flex gap-2">
          <button onClick={() => setStep('book')} className="h-14 px-5 rounded-2xl bg-white border border-slate-200 font-semibold">Back</button>
          <button disabled={paying} onClick={pay} className="flex-1 h-14 rounded-2xl bg-emerald-600 text-white text-lg font-bold disabled:opacity-60">{paying ? 'Confirming UPI…' : `Pay ${rupees(p.escrow_total)} to escrow`}</button>
        </div>
      </div>
    );
  }

  const toggleAddon = (a) => set({ addons: f.addons.includes(a) ? f.addons.filter((x) => x !== a) : [...f.addons, a] });
  return (
    <div>
      <Section title="Where" right={<button onClick={gps} className="text-sm font-semibold text-emerald-700">{locating ? 'Locating…' : '◎ Use my location'}</button>}>
        <MapPin lat={f.lat} lng={f.lng} onMove={(lat, lng) => set({ lat, lng })} />
        <div className="flex gap-2 mt-2">
          <input placeholder="House / shop, street, area" value={f.address} onChange={(e) => set({ address: e.target.value })} className="flex-1 h-12 rounded-xl border border-slate-200 bg-white px-3" />
          <select value={f.address_label} onChange={(e) => set({ address_label: e.target.value })} className="h-12 rounded-xl border border-slate-200 bg-white px-2 text-sm">
            {['Home', 'Shop', 'Site', 'Office'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        {user.addresses.length > 1 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {user.addresses.map((a) => <Pill key={a.label} on={f.address_label === a.label} onClick={() => set({ lat: a.lat, lng: a.lng, address: a.address, address_label: a.label })}>{a.label}</Pill>)}
          </div>
        )}
      </Section>

      <Section title="When">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-200/60">
          <button onClick={() => set({ booking_mode: 'INSTANT' })} className={`h-12 rounded-xl text-sm font-semibold ${f.booking_mode === 'INSTANT' ? 'bg-white shadow' : 'text-slate-500'}`}>⚡ Instant · 30 min</button>
          <button onClick={() => set({ booking_mode: 'SCHEDULED' })} className={`h-12 rounded-xl text-sm font-semibold ${f.booking_mode === 'SCHEDULED' ? 'bg-white shadow' : 'text-slate-500'}`}>📅 Schedule</button>
        </div>
        {f.booking_mode === 'SCHEDULED' && (
          <div className="flex gap-2 mt-2">
            <input type="date" min={todayIST()} value={f.scheduled_date} onChange={(e) => set({ scheduled_date: e.target.value })} className="h-11 rounded-xl border border-slate-200 bg-white px-3 flex-1" />
            {Object.values(SLOTS).map((s) => <Pill key={s.id} on={f.slot === s.id} onClick={() => set({ slot: s.id })}>{s.label} {s.time}</Pill>)}
          </div>
        )}
      </Section>

      <Section title="Skill">
        <div className="grid gap-2">
          {Object.values(SKILL_TIERS).map((s) => (
            <button key={s.id} onClick={() => set({ skill_tier: s.id, trade_tag: tradesForTier(s.id)[0] })}
              className={`text-left rounded-2xl p-4 border-2 flex items-center gap-3 transition ${f.skill_tier === s.id ? 'border-emerald-600 bg-emerald-50' : 'border-transparent bg-white'}`}>
              <div className="text-3xl">{s.icon}</div>
              <div className="flex-1"><div className="font-bold">{s.label}</div><div className="text-xs text-slate-500">{s.blurb}</div></div>
              <div className="text-right"><div className="font-black">{rupees(s.rate2h)}</div><div className="text-xs text-slate-500">per 2h</div></div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          {tradesForTier(f.skill_tier).map((k) => <Pill key={k} on={f.trade_tag === k} onClick={() => set({ trade_tag: k })}>{TRADE_TAGS[k].icon} {TRADE_TAGS[k].label}</Pill>)}
        </div>
      </Section>

      <Section title="Duration & crew">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-2">{Object.keys(DURATIONS).map((d) => <Pill key={d} on={f.duration === d} onClick={() => set({ duration: d })}>{d}</Pill>)}</div>
          <div className="flex items-center rounded-full bg-white border border-slate-200">
            <button onClick={() => set({ worker_count: Math.max(1, f.worker_count - 1) })} className="w-11 h-11 text-xl font-bold">−</button>
            <span className="w-14 text-center font-bold">👷 {f.worker_count}</span>
            <button onClick={() => set({ worker_count: Math.min(MAX_WORKERS, f.worker_count + 1) })} className="w-11 h-11 text-xl font-bold">+</button>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {Object.values(ADDONS).map((a) => <Pill key={a.id} on={f.addons.includes(a.id)} onClick={() => toggleAddon(a.id)}>{a.icon} {a.label} +{rupees(a.price)}</Pill>)}
        </div>
      </Section>

      {err && <div className="px-4 text-sm text-red-600">{err}</div>}
      <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-4 bg-gradient-to-t from-slate-50 via-slate-50">
        <button onClick={() => { setErr(''); if (f.address.trim().length < 3) return setErr('Enter the address so the worker can find you'); setStep('checkout'); }}
          className="w-full h-14 rounded-2xl bg-slate-900 text-white text-lg font-bold flex items-center justify-between px-5">
          <span>Continue</span><span>{rupees(q.total.escrow_total)} →</span>
        </button>
      </div>
    </div>
  );
}
