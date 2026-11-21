import { useEffect, useState } from 'react';
import { ArrowLeft, Briefcase, Check, Download, FileText, Loader2, Radar, Receipt, Trash2, UserPlus, Users, Wallet } from 'lucide-react';
import { GST_PCT, rupees } from '@krewzo/shared';
import { api, getServer, getToken } from './lib.js';

const PERKS = (p) => [
  p.fee_off === 1 ? 'No platform fee on any booking' : `${Math.round(p.fee_off * 100)}% off the platform fee`,
  `Book now, pay once a month (credit up to ${rupees(p.credit)})`,
  `${p.seats} team logins for supervisors and site managers`,
  p.radius_km > 3 ? `Workers searched within ${p.radius_km} km, so more workers and faster matches` : 'Workers searched within 3 km',
  'One GST invoice per month + attendance report',
];
const withGst = (n) => n + Math.round(n * GST_PCT);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const monthName = (m) => new Date(`${m}-15`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const fileUrl = (path) => `${getServer()}/api${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(getToken())}`;

export default function Business({ user, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api('GET', '/business').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);
  const update = (d) => { setData(d); onChanged?.(); };

  const head = (
    <header className="px-4 pt-4 pb-2 flex items-center gap-3">
      <button onClick={onBack} aria-label="Back" className="w-11 h-11 rounded-full bg-card border border-line flex items-center justify-center"><ArrowLeft size={20} /></button>
      <h1 className="font-display text-2xl font-extrabold">Krewzo Business</h1>
    </header>
  );
  if (!data) return <>{head}<div className="px-4 text-muted">{err || 'Loading…'}</div></>;
  const b = data.business;
  return (
    <>
      {head}
      {!b ? <Plans plans={data.plans} user={user} onDone={update} /> : b.role === 'MEMBER' ? <Member b={b} /> : <Owner b={b} plans={data.plans} onDone={update} />}
    </>
  );
}

function Plans({ plans, user, onDone }) {
  const [pick, setPick] = useState('PRO');
  const [f, setF] = useState({ business_name: user.business_name || '', gstin: user.gstin || '', upi_id: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.id === pick);
  async function go() {
    setErr(''); setBusy(true);
    try { onDone(await api('POST', '/business/subscribe', { plan: pick, ...f })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const field = 'h-12 w-full rounded-xl border border-line bg-card px-3 outline-none focus:border-ink';
  return (
    <div className="px-4 pb-8 flex flex-col gap-4">
      <p className="text-muted">For contractors, shops, builders and offices that book workers every week.</p>
      <div className="grid gap-3">
        {plans.map((p) => {
          const on = p.id === pick;
          return (
            <button key={p.id} onClick={() => setPick(p.id)}
              className={`text-left rounded-3xl p-4 border-2 transition ${on ? 'border-ink bg-card shadow-[0_6px_0_0_var(--color-ink)] -translate-y-0.5' : 'border-line bg-card'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-xl font-extrabold flex items-center gap-2">{p.name}{p.id === 'PRO' && <span className="text-[11px] font-bold bg-lime px-2 py-0.5 rounded-full">BEST VALUE</span>}</div>
                  <div className="text-sm text-muted">{rupees(p.price)} + GST every 30 days</div>
                </div>
                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'bg-ink border-ink text-lime' : 'border-line'}`}>{on && <Check size={14} />}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">{PERKS(p).map((x) => <li key={x} className="flex gap-2"><Check size={16} className="text-forest shrink-0 mt-0.5" />{x}</li>)}</ul>
            </button>
          );
        })}
      </div>
      <section className="rounded-3xl bg-card border border-line p-4 grid gap-2">
        <div className="font-bold">Business details</div>
        <input placeholder="Business name" value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} className={field} />
        <input placeholder="GSTIN (15 characters)" maxLength={15} value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} className={`${field} font-mono uppercase`} />
        <input placeholder="UPI ID for autopay, e.g. accounts@okhdfc" value={f.upi_id} onChange={(e) => setF({ ...f, upi_id: e.target.value.trim() })} className={field} />
        <p className="text-xs text-muted">Renews automatically every 30 days. Cancel any time; the plan runs until the end of the period you paid for.</p>
      </section>
      {err && <div className="text-sm text-danger font-semibold">{err}</div>}
      <button disabled={busy} onClick={go} className="h-14 rounded-2xl bg-ink text-paper text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60">
        {busy && <Loader2 className="animate-spin" size={18} />}Start {plan.name} · {rupees(withGst(plan.price))}
      </button>
      <p className="text-xs text-muted text-center -mt-2">{rupees(plan.price)} + {rupees(withGst(plan.price) - plan.price)} GST</p>
    </div>
  );
}

function Member({ b }) {
  return (
    <div className="px-4 pb-8 flex flex-col gap-3">
      <div className="rounded-3xl bg-ink text-paper p-5">
        <div className="text-xs font-bold text-lime">TEAM MEMBER</div>
        <div className="font-display text-2xl font-extrabold mt-1">{b.business_name}</div>
        <div className="text-paper/60 text-sm">{b.plan_name} · GSTIN {b.gstin}</div>
      </div>
      <div className="rounded-3xl bg-card border border-line p-4 text-sm space-y-2">
        <p>Your bookings use {b.business_name}'s plan: {b.fee_off === 1 ? 'no platform fee' : `${Math.round(b.fee_off * 100)}% off the platform fee`}, and you can put jobs on the monthly bill at checkout.</p>
        <Credit b={b} />
      </div>
    </div>
  );
}

function Credit({ b }) {
  const pct = Math.min(100, (b.credit_used / b.credit_limit) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-muted">Monthly bill this month</span><span className="num font-bold">{rupees(b.credit_used)} <span className="text-muted font-normal">of {rupees(b.credit_limit)}</span></span></div>
      <div className="h-2 rounded-full bg-paper mt-2 overflow-hidden"><div className={`h-full rounded-full ${pct > 85 ? 'bg-danger' : 'bg-forest'}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function Owner({ b, plans, onDone }) {
  const [err, setErr] = useState('');
  const run = async (fn) => { setErr(''); try { onDone(await fn()); } catch (e) { setErr(e.message); } };
  const other = plans.find((p) => p.id !== b.plan);
  return (
    <div className="px-4 pb-8 flex flex-col gap-3">
      <div className="rounded-3xl bg-ink text-paper p-5">
        <div className="flex items-center gap-2 text-xs font-bold text-lime"><Briefcase size={14} /> {b.plan_name.toUpperCase()}</div>
        <div className="font-display text-2xl font-extrabold mt-1">{b.business_name}</div>
        <div className="text-paper/60 text-sm">GSTIN {b.gstin}</div>
        <div className="text-sm mt-3">{b.status === 'CANCELLED' ? `Cancelled. Plan ends ${fmtDate(b.renews_at)}.` : `Renews ${fmtDate(b.renews_at)}`}</div>
      </div>

      {b.overdue.length > 0 && <div className="rounded-2xl bg-danger/10 border border-danger/30 text-danger p-3 text-sm font-semibold">Bill for {b.overdue.map(monthName).join(', ')} is unpaid. Pay it below to keep monthly billing on.</div>}

      <section className="rounded-3xl bg-card border border-line p-4 grid gap-3">
        <Credit b={b} />
        <div className="flex gap-4 text-sm text-muted">
          <span className="flex items-center gap-1.5"><Wallet size={15} /> {b.fee_off === 1 ? 'No platform fee' : `${Math.round(b.fee_off * 100)}% off fees`}</span>
          <span className="flex items-center gap-1.5"><Radar size={15} /> {b.radius_km} km search</span>
        </div>
      </section>

      <Statement overdue={b.overdue} onPaid={() => onDone && api('GET', '/business').then(onDone)} />
      <Team b={b} run={run} />

      <section className="rounded-3xl bg-card border border-line p-4 grid gap-2">
        <div className="font-bold">Plan</div>
        {b.status === 'CANCELLED'
          ? <button onClick={() => run(() => api('POST', '/business/resume'))} className="h-12 rounded-xl bg-ink text-paper font-bold">Keep my plan</button>
          : <>
            <button onClick={() => run(() => api('POST', '/business/plan', { plan: other.id }))} className="h-12 rounded-xl border border-line font-bold">
              Switch to {other.name} ({rupees(other.price)} + GST)
            </button>
            <button onClick={() => run(() => api('POST', '/business/cancel'))} className="h-11 rounded-xl text-muted font-semibold">Cancel plan</button>
          </>}
        <p className="text-xs text-muted">Switching starts a new 30-day period today; unused days of your current plan count toward the new price.</p>
        {b.payments?.length > 0 && (
          <div className="mt-2 border-t border-line pt-3 text-sm space-y-1">
            {b.payments.map((p) => <div key={p.tx_ref} className="flex justify-between"><span className="text-muted">{fmtDate(p.period_start)} · {p.plan === 'PRO' ? 'Pro' : 'Starter'}</span><span className="num">{rupees(p.amount + p.gst_amount)}</span></div>)}
          </div>
        )}
      </section>
      {err && <div className="text-sm text-danger font-semibold">{err}</div>}
    </div>
  );
}

function Statement({ overdue, onPaid }) {
  const months = (() => { const out = []; const d = new Date(); for (let i = 0; i < 6; i++) { out.push(new Date(d.getFullYear(), d.getMonth() - i, 15).toISOString().slice(0, 7)); } return out; })();
  const [month, setMonth] = useState(overdue[0] || months[0]);
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { setSt(null); api('GET', `/business/statement?month=${month}`).then(setSt).catch((e) => setErr(e.message)); }, [month]);
  const pay = async () => { setErr(''); try { setSt(await api('POST', '/business/statement/pay', { month })); onPaid?.(); } catch (e) { setErr(e.message); } };
  const t = st?.totals;
  return (
    <section className="rounded-3xl bg-card border border-line p-4 grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="font-bold flex items-center gap-2"><Receipt size={18} /> Monthly bill</div>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-10 rounded-xl border border-line bg-card px-2 text-sm font-semibold">
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
      </div>
      {!st ? <div className="text-muted text-sm">{err || 'Loading…'}</div> : (
        <>
          <div className="text-sm space-y-1">
            <Row k="Worker wages (paid to workers)" v={t.wages} />
            <Row k="Platform fees" v={t.platform_fee} />
            <Row k="GST on fees" v={t.gst} />
            <Row k="Shift insurance" v={t.insurance} />
            {t.travel_fee > 0 && <Row k="Travel fees (late cancels)" v={t.travel_fee} />}
            <div className="flex justify-between pt-2 border-t border-dashed border-line font-black text-base"><span>{st.paid ? 'Paid' : 'Total'}</span><span className="num">{rupees(t.due)}</span></div>
            <div className="text-xs text-muted">{st.rows.filter((r) => r.pay_mode === 'MONTHLY').length} jobs on monthly billing{st.paid ? ` · ref ${st.paid.tx_ref}` : ''}</div>
          </div>
          {st.payable && <button onClick={pay} className="h-12 rounded-xl bg-ink text-paper font-bold">Pay {rupees(t.due)} by UPI</button>}
          {!st.paid && !st.payable && t.due > 0 && <div className="text-xs text-muted">This month is still running. The bill is ready on the 1st and due by the 7th.</div>}
          <div className="grid grid-cols-2 gap-2">
            <a href={fileUrl(`/business/invoice?month=${month}`)} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-line text-sm font-bold flex items-center justify-center gap-1.5"><FileText size={16} /> GST invoice</a>
            <a href={fileUrl(`/business/attendance.csv?month=${month}`)} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-line text-sm font-bold flex items-center justify-center gap-1.5"><Download size={16} /> Attendance</a>
          </div>
        </>
      )}
      {err && st && <div className="text-sm text-danger font-semibold">{err}</div>}
    </section>
  );
}
const Row = ({ k, v }) => <div className="flex justify-between"><span className="text-muted">{k}</span><span className="num">{rupees(v)}</span></div>;

function Team({ b, run }) {
  const [phone, setPhone] = useState('');
  return (
    <section className="rounded-3xl bg-card border border-line p-4 grid gap-3">
      <div className="flex items-center justify-between">
        <div className="font-bold flex items-center gap-2"><Users size={18} /> Team</div>
        <span className="text-sm text-muted">{b.seats_used} of {b.seats} people</span>
      </div>
      <p className="text-xs text-muted -mt-1">Team members book with their own Krewzo login. Their jobs use your plan and can go on your monthly bill.</p>
      {b.members.map((m) => (
        <div key={m.id} className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-paper font-display font-extrabold flex items-center justify-center">{m.name[0]}</div>
          <div className="flex-1 min-w-0"><div className="font-semibold truncate">{m.name}</div><div className="text-xs text-muted">+91 {m.phone}</div></div>
          <button onClick={() => run(() => api('DELETE', `/business/members/${m.id}`))} aria-label={`Remove ${m.name}`} className="w-10 h-10 rounded-full text-muted flex items-center justify-center"><Trash2 size={17} /></button>
        </div>
      ))}
      {b.seats_used < b.seats && (
        <div className="flex gap-2">
          <input inputMode="numeric" placeholder="Their Krewzo mobile number" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} className="flex-1 h-11 rounded-xl border border-line bg-card px-3 outline-none focus:border-ink" />
          <button disabled={phone.length !== 10} onClick={() => run(async () => { const r = await api('POST', '/business/members', { phone }); setPhone(''); return r; })}
            className="h-11 px-4 rounded-xl bg-ink text-paper font-bold flex items-center gap-1.5 disabled:opacity-40"><UserPlus size={16} /> Add</button>
        </div>
      )}
    </section>
  );
}
