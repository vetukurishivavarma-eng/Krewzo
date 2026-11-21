import { useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Calendar, Crosshair, Home as HomeIcon, Lock, Minus, Plus, ShieldCheck, Zap } from 'lucide-react';
import {
  ADDONS, DEFAULT_LOCATION, DURATIONS, GSTIN_RE, INSURANCE_FEE, MAX_WORKERS, SKILL_TIERS, SLOTS, TRADE_TAGS, UPI_RE,
  quotePrice, rupees, tradesForTier,
} from '@krewzo/shared';
import { api } from './lib.js';
import MapPin from './MapPin.jsx';
import { PageHead } from './App.jsx';

const todayIST = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const Pill = ({ on, children, ...p }) => (
  <button type="button" {...p} className={`px-4 h-11 rounded-full text-sm font-bold border whitespace-nowrap transition ${on ? 'bg-ink text-paper border-ink' : 'bg-card border-line text-ink/80'}`}>{children}</button>
);
const Section = ({ n, title, children, right }) => (
  <section className="px-4 py-3">
    <div className="flex items-center justify-between mb-2.5">
      <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">{n && <span className="w-6 h-6 rounded-full bg-ink text-paper text-xs flex items-center justify-center">{n}</span>}{title}</h2>
      {right}
    </div>
    {children}
  </section>
);
const Segment = ({ options, value, onChange }) => (
  <div className="grid grid-flow-col auto-cols-fr gap-1 p-1 rounded-2xl bg-ink/[0.06]">
    {options.map(([id, Icon, label]) => (
      <button key={id} type="button" onClick={() => onChange(id)} className={`h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition ${value === id ? 'bg-card shadow-sm' : 'text-muted'}`}><Icon size={16} />{label}</button>
    ))}
  </div>
);
const field = 'h-12 rounded-xl border border-line bg-card px-3 outline-none focus:border-ink';

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

  const bar = 'fixed bottom-[4.5rem] inset-x-0 max-w-md mx-auto px-4 pt-6 pb-2 bg-gradient-to-t from-paper via-paper/95 to-transparent safe-b';

  if (step === 'checkout') {
    const p = q.total;
    const row = (label, v, cls = '') => <div className={`flex justify-between py-1.5 ${cls}`}><span>{label}</span><span className="num">{rupees(v)}</span></div>;
    return (
      <div className="pb-40">
        <PageHead title="Checkout" sub={`${TRADE_TAGS[f.trade_tag].label} · ${f.worker_count} × ${f.duration}`}
          right={<button onClick={() => setStep('book')} className="w-11 h-11 rounded-full bg-card border border-line flex items-center justify-center" aria-label="Back"><ArrowLeft size={20} /></button>} />
        <Section title="Billing">
          <Segment value={f.account_type} onChange={(a) => set({ account_type: a })} options={[['PERSONAL', HomeIcon, 'Personal'], ['BUSINESS', Briefcase, 'Business (GST)']]} />
          {f.account_type === 'BUSINESS' && (
            <div className="mt-3 grid gap-2">
              <input placeholder="Business name" value={f.business_name} onChange={(e) => set({ business_name: e.target.value })} className={field} />
              <input placeholder="GSTIN (15 characters)" value={f.gstin} maxLength={15} onChange={(e) => set({ gstin: e.target.value.toUpperCase() })} className={`${field} font-mono uppercase`} />
              <p className="text-xs text-muted">A GST tax invoice is generated for every booking.</p>
            </div>
          )}
        </Section>
        <Section title="Price breakdown">
          <div className="rounded-3xl bg-card border border-line p-4 text-sm">
            {row(`Worker wage · ${f.worker_count} × ${f.duration}`, p.base_wage, 'font-bold')}
            <div className="text-xs text-forest font-semibold -mt-1 mb-1">100% goes to the worker</div>
            {p.addons_total > 0 && row('Tool add-ons (to worker)', p.addons_total)}
            {row('Platform fee', p.platform_fee)}
            {row('GST 18% on platform fee', p.gst_amount)}
            <label className="flex justify-between py-1.5 items-center">
              <span className="flex items-center gap-2"><input type="checkbox" checked={f.insurance} onChange={(e) => set({ insurance: e.target.checked })} className="w-4 h-4 accent-ink" /> Shift insurance ({rupees(INSURANCE_FEE)}/worker)</span>
              <span className="num">{rupees(p.insurance_fee)}</span>
            </label>
            <div className="flex justify-between pt-3 mt-2 border-t border-dashed border-line text-lg font-black"><span>Held in escrow</span><span className="num">{rupees(p.escrow_total)}</span></div>
          </div>
          <div className="mt-3 rounded-2xl bg-lime/30 p-3 text-sm flex gap-2.5"><Lock size={18} className="shrink-0 mt-0.5" /><span>Your money stays locked. It's released only when you show the FINISH code. Cancel before work starts for a full refund.</span></div>
        </Section>
        <Section title="Pay with UPI">
          <input placeholder="yourname@okhdfc" value={f.upi_id} onChange={(e) => set({ upi_id: e.target.value.trim() })} className={`${field} w-full`} />
        </Section>
        {err && <div className="px-4 text-sm text-danger font-semibold">{err}</div>}
        <div className={bar}>
          <button disabled={paying} onClick={pay} className="w-full h-14 rounded-2xl bg-ink text-paper text-lg font-bold disabled:opacity-60 flex items-center justify-center gap-2">
            <ShieldCheck size={20} className="text-lime" />{paying ? 'Confirming UPI…' : `Pay ${rupees(p.escrow_total)} to escrow`}
          </button>
        </div>
      </div>
    );
  }

  const toggleAddon = (a) => set({ addons: f.addons.includes(a) ? f.addons.filter((x) => x !== a) : [...f.addons, a] });
  return (
    <div className="pb-40">
      <PageHead title="Book help" sub={`Hello, ${user.name.split(' ')[0]} 👋`} />

      <Section n="1" title="Where" right={<button onClick={gps} className="text-sm font-bold flex items-center gap-1.5 px-3 h-9 rounded-full bg-card border border-line"><Crosshair size={15} />{locating ? 'Locating…' : 'My location'}</button>}>
        <div className="rounded-3xl overflow-hidden border border-line"><MapPin lat={f.lat} lng={f.lng} onMove={(lat, lng) => set({ lat, lng })} /></div>
        <div className="flex gap-2 mt-2">
          <input placeholder="House / shop, street, area" value={f.address} onChange={(e) => set({ address: e.target.value })} className={`${field} flex-1`} />
          <select value={f.address_label} onChange={(e) => set({ address_label: e.target.value })} className={`${field} px-2 text-sm`}>
            {['Home', 'Shop', 'Site', 'Office'].map((l) => <option key={l}>{l}</option>)}
          </select>
        </div>
        {user.addresses.length > 1 && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            {user.addresses.map((a) => <Pill key={a.label} on={f.address_label === a.label} onClick={() => set({ lat: a.lat, lng: a.lng, address: a.address, address_label: a.label })}>{a.label}</Pill>)}
          </div>
        )}
      </Section>

      <Section n="2" title="When">
        <Segment value={f.booking_mode} onChange={(m) => set({ booking_mode: m })} options={[['INSTANT', Zap, 'Now · 30 min'], ['SCHEDULED', Calendar, 'Schedule']]} />
        {f.booking_mode === 'SCHEDULED' && (
          <div className="flex gap-2 mt-2 overflow-x-auto">
            <input type="date" min={todayIST()} value={f.scheduled_date} onChange={(e) => set({ scheduled_date: e.target.value })} className={`${field} h-11 flex-1`} />
            {Object.values(SLOTS).map((s) => <Pill key={s.id} on={f.slot === s.id} onClick={() => set({ slot: s.id })}>{s.label} {s.time}</Pill>)}
          </div>
        )}
      </Section>

      <Section n="3" title="Who you need">
        <div className="grid gap-2">
          {Object.values(SKILL_TIERS).map((s) => {
            const on = f.skill_tier === s.id;
            return (
              <button key={s.id} onClick={() => set({ skill_tier: s.id, trade_tag: tradesForTier(s.id)[0] })}
                className={`text-left rounded-3xl p-4 border-2 flex items-center gap-3 transition ${on ? 'border-ink bg-card shadow-[0_6px_0_0_var(--color-ink)] -translate-y-0.5' : 'border-line bg-card'}`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${on ? 'bg-lime' : 'bg-paper'}`}>{s.icon}</div>
                <div className="flex-1"><div className="font-bold">{s.label}</div><div className="text-xs text-muted">{s.blurb}</div></div>
                <div className="text-right"><div className="num font-bold text-lg">{rupees(s.rate2h)}</div><div className="text-[11px] text-muted">per 2h</div></div>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {tradesForTier(f.skill_tier).map((k) => <Pill key={k} on={f.trade_tag === k} onClick={() => set({ trade_tag: k })}>{TRADE_TAGS[k].icon} {TRADE_TAGS[k].label}</Pill>)}
        </div>
      </Section>

      <Section n="4" title="How long & how many">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-1.5">{Object.keys(DURATIONS).map((d) => <Pill key={d} on={f.duration === d} onClick={() => set({ duration: d })}>{d.replace('H', ' hr')}</Pill>)}</div>
          <div className="flex items-center rounded-full bg-card border border-line">
            <button onClick={() => set({ worker_count: Math.max(1, f.worker_count - 1) })} className="w-10 h-11 flex items-center justify-center" aria-label="Fewer workers"><Minus size={16} /></button>
            <span className="num w-10 text-center font-bold text-lg">{f.worker_count}</span>
            <button onClick={() => set({ worker_count: Math.min(MAX_WORKERS, f.worker_count + 1) })} className="w-10 h-11 flex items-center justify-center" aria-label="More workers"><Plus size={16} /></button>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          {Object.values(ADDONS).map((a) => <Pill key={a.id} on={f.addons.includes(a.id)} onClick={() => toggleAddon(a.id)}>{a.icon} {a.label} +{rupees(a.price)}</Pill>)}
        </div>
      </Section>

      {err && <div className="px-4 text-sm text-danger font-semibold">{err}</div>}
      <div className={bar}>
        <button onClick={() => { setErr(''); if (f.address.trim().length < 3) return setErr('Enter the address so the worker can find you'); setStep('checkout'); }}
          className="w-full h-14 rounded-2xl bg-ink text-paper text-lg font-bold flex items-center justify-between px-5">
          <span>Continue</span><span className="num bg-lime text-ink rounded-xl px-3 py-1">{rupees(q.total.escrow_total)} →</span>
        </button>
      </div>
    </div>
  );
}
