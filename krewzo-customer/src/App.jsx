import { useEffect, useState } from 'react';
import { Briefcase, ChevronRight, ClipboardList, LifeBuoy, LogOut, Plus, User } from 'lucide-react';
import { TRADE_TAGS, rupees } from '@krewzo/shared';
import { api, clearPush, getMode, getServer, getToken, setMode, setServer, setToken, setupPush } from './lib.js';
import Book from './Book.jsx';
import Tracking from './Tracking.jsx';
import Business from './Business.jsx';
import Ops, { OpsLogin } from './Ops.jsx';

const HELPLINE = import.meta.env.VITE_HELPLINE || '18001234567';

export const Wordmark = ({ size = 'text-2xl' }) => (
  <span className={`font-display font-extrabold tracking-tight ${size}`}>krewzo<span className="inline-block w-[0.32em] h-[0.32em] rounded-full bg-lime ml-0.5 ring-2 ring-ink/80" /></span>
);

export default function App() {
  const [mode, setModeState] = useState(getMode);
  const [token, setTok] = useState(getToken);
  const [teamLogin, setTeamLogin] = useState(false);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('book');
  const [trackId, setTrackId] = useState(null);

  useEffect(() => {
    if (!token || mode === 'ops') return;
    // /me also renews the login, so customers stay logged in
    api('GET', '/me').then((r) => { if (r.token) setToken(r.token); setUser(r.user); }).catch(() => { setToken(null); setTok(null); });
    setupPush((id) => { setTab('list'); setTrackId(id); });
  }, [token]);

  const toOps = (r) => { setToken(r.token); setMode('ops'); setModeState('ops'); setTok(r.token); setTeamLogin(false); };
  const leaveOps = () => { setToken(null); setMode('customer'); setModeState('customer'); setTok(null); };
  if (token && mode === 'ops') return <Ops onLogout={leaveOps} />;
  if (!token && teamLogin) return <OpsLogin onDone={toOps} onBack={() => setTeamLogin(false)} />;
  if (!token) return <Login onDone={(r) => { setToken(r.token); setTok(r.token); setUser(r.user); }} onTeam={() => setTeamLogin(true)} />;
  if (!user) return <div className="h-full flex items-center justify-center"><Wordmark size="text-4xl" /></div>;

  const logout = () => { clearPush(); setToken(null); setTok(null); setUser(null); };
  const refreshUser = () => api('GET', '/me').then((r) => setUser(r.user)).catch(() => {});
  const go = (id) => { setTab(id); setTrackId(null); };
  return (
    <div className="min-h-full max-w-md mx-auto pb-24">
      {trackId ? <Tracking groupId={trackId} onBack={() => setTrackId(null)} />
        : tab === 'book' ? <Book user={user} onBooked={(g) => { setUser((u) => ({ ...u, account_type: g.account_type })); setTab('list'); setTrackId(g.id); }} />
        : tab === 'list' ? <BookingList onOpen={setTrackId} onBook={() => go('book')} />
        : tab === 'business' ? <Business user={user} onBack={() => go('account')} onChanged={refreshUser} />
        : <Account user={user} onLogout={logout} onBusiness={() => go('business')} />}
      <NavBar tab={tab === 'business' ? 'account' : tab} go={go} />
    </div>
  );
}

function NavBar({ tab, go }) {
  const items = [['book', Plus, 'Book'], ['list', ClipboardList, 'Bookings'], ['account', User, 'Account']];
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-paper/90 backdrop-blur-xl border-t border-line safe-b">
      <div className="max-w-md mx-auto grid grid-cols-3 h-[4.25rem]">
        {items.map(([id, Icon, label]) => (
          <button key={id} onClick={() => go(id)} className={`flex flex-col items-center justify-center gap-1 text-xs font-bold ${tab === id ? 'text-ink' : 'text-muted'}`}>
            <span className={`w-14 h-8 rounded-full flex items-center justify-center transition ${tab === id ? 'bg-lime' : ''}`}><Icon size={21} strokeWidth={tab === id ? 2.6 : 2} /></span>
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export const PageHead = ({ title, sub, right }) => (
  <header className="px-4 pt-5 pb-3 flex items-end justify-between gap-3">
    <div>
      <h1 className="font-display text-[1.9rem] leading-none font-extrabold tracking-tight">{title}</h1>
      {sub && <div className="text-muted text-sm mt-1.5">{sub}</div>}
    </div>
    {right}
  </header>
);

function ServerField() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(getServer());
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted/60">⚙ {getServer() || 'Server'}</button>;
  return (
    <div className="flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="http://192.168.1.5:4000" className="flex-1 h-12 rounded-xl border border-line bg-card px-3" />
      <button type="button" onClick={() => { setServer(v); setOpen(false); }} className="h-12 px-4 rounded-xl bg-ink text-paper font-semibold">Save</button>
    </div>
  );
}

const input = 'h-14 w-full rounded-2xl border border-line bg-card px-4 text-lg outline-none focus:border-ink transition';

function Login({ onDone, onTeam }) {
  const [f, setF] = useState({ phone: '', pin: '', name: '' });
  const [err, setErr] = useState('');
  const [needName, setNeedName] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr('');
    try { onDone(await api('POST', '/auth/customer', f)); }
    catch (x) { if (/name/i.test(x.message)) setNeedName(true); setErr(x.message); }
  }
  return (
    <form onSubmit={submit} className="min-h-full max-w-md mx-auto px-6 pt-14 pb-8 flex flex-col">
      <Wordmark size="text-3xl" />
      <h1 className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight mt-10">Skilled hands,<br /><span className="bg-lime px-1.5 -mx-1.5 rounded-lg box-decoration-clone">in 30 minutes.</span></h1>
      <p className="text-muted mt-4">Verified daily-wage workers at your door. Your money waits in escrow until the job is done.</p>
      <div className="flex flex-col gap-3 mt-8">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted">+91</span>
          <input inputMode="numeric" autoComplete="tel" placeholder="Mobile number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className={`${input} pl-14`} />
        </div>
        <input inputMode="numeric" type="password" maxLength={4} placeholder="4-digit PIN" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} className={`${input} tracking-widest`} />
        {needName && <input placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />}
        {err && <div className="text-danger text-sm font-semibold">{err}</div>}
        <button className="h-14 rounded-2xl bg-ink text-paper text-lg font-bold mt-1">{needName ? 'Create account' : 'Continue'}</button>
      </div>
      <p className="text-xs text-muted text-center mt-4">New number? We'll create your account. Demo: 9999999999 / 1234</p>
      <div className="mt-auto pt-8 flex flex-col items-center gap-3">
        <button type="button" onClick={onTeam} className="text-sm font-semibold text-muted underline underline-offset-4">Krewzo team login</button>
        <ServerField />
      </div>
    </form>
  );
}

export const STATUS = {
  SEARCHING: ['Finding worker', 'bg-amber/15 text-[#9a5b00]'], ASSIGNED: ['On the way', 'bg-lime/40 text-ink'], ARRIVED: ['At your door', 'bg-lime text-ink'],
  IN_PROGRESS: ['Working', 'bg-forest/15 text-forest'], COMPLETED: ['Completed', 'bg-forest/15 text-forest'], PAID_OUT: ['Paid', 'bg-ink/5 text-muted'], CANCELLED: ['Cancelled', 'bg-ink/5 text-muted'],
};

function BookingList({ onOpen, onBook }) {
  const [groups, setGroups] = useState(null);
  useEffect(() => { api('GET', '/bookings').then(setGroups).catch(() => setGroups([])); }, []);
  return (
    <>
      <PageHead title="Bookings" />
      {!groups ? <div className="px-4 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl bg-card animate-pulse" />)}</div>
        : !groups.length ? (
          <div className="mx-4 mt-6 rounded-3xl bg-card border border-line p-8 text-center">
            <div className="text-5xl">🧰</div>
            <div className="font-display text-xl font-extrabold mt-3">No bookings yet</div>
            <div className="text-muted text-sm mt-1">Book a helper, mason or electrician in a few taps.</div>
            <button onClick={onBook} className="mt-5 h-12 px-6 rounded-2xl bg-ink text-paper font-bold">Book now</button>
          </div>
        ) : (
          <div className="px-4 flex flex-col gap-3">
            {groups.map((g, i) => {
              const t = g.tickets[0];
              const statuses = [...new Set(g.tickets.map((x) => x.status))];
              return (
                <button key={g.id} onClick={() => onOpen(g.id)} style={{ animationDelay: `${i * 40}ms` }} className="rise text-left rounded-3xl bg-card border border-line p-4 flex gap-3 items-center">
                  <div className="w-14 h-14 rounded-2xl bg-paper flex items-center justify-center text-3xl">{TRADE_TAGS[t.trade_tag]?.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{TRADE_TAGS[t.trade_tag]?.label} <span className="text-muted font-semibold">× {g.worker_count} · {t.duration}</span></div>
                    <div className="text-sm text-muted truncate">{t.address}</div>
                    <div className="flex gap-1.5 mt-1.5">{statuses.map((s) => <span key={s} className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS[s][1]}`}>{STATUS[s][0]}</span>)}</div>
                  </div>
                  <div className="text-right">
                    <div className="num font-bold">{rupees(g.amount_total)}</div>
                    <ChevronRight size={18} className="text-muted ml-auto mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
    </>
  );
}

function Account({ user, onLogout, onBusiness }) {
  const b = user.business;
  return (
    <>
      <PageHead title="Account" />
      <div className="px-4 flex flex-col gap-3">
        <div className="rounded-3xl bg-ink text-paper p-5 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-lime text-ink font-display text-2xl font-extrabold flex items-center justify-center">{user.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</div>
          <div className="min-w-0">
            <div className="font-display text-2xl font-extrabold truncate">{user.name}</div>
            <div className="text-paper/60">+91 {user.phone}</div>
            <div className="text-xs font-bold mt-1 text-lime">{b ? `🏢 ${b.business_name} · ${b.plan_name}` : user.account_type === 'BUSINESS' ? `🏢 ${user.business_name || 'Business'} · GST` : '🏠 Personal'}</div>
          </div>
        </div>
        <button onClick={onBusiness} className="text-left rounded-3xl bg-card border border-line p-4 flex items-center gap-3">
          <span className="w-11 h-11 rounded-2xl bg-lime flex items-center justify-center shrink-0"><Briefcase size={20} /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold">Krewzo Business</span>
            <span className="block text-sm text-muted truncate">{b ? `${b.plan_name}${b.role === 'MEMBER' ? ` · ${b.business_name} team` : ''}` : 'Lower fees, monthly billing, team logins'}</span>
          </span>
          {b ? <span className="text-[11px] font-bold px-2 py-1 rounded-full bg-forest/15 text-forest">ACTIVE</span> : <ChevronRight className="text-muted" />}
        </button>
        {user.addresses?.length > 0 && (
          <div className="rounded-3xl bg-card border border-line p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-muted mb-2">Saved places</div>
            {user.addresses.map((a) => <div key={a.label} className="py-2 border-t border-line first:border-0"><div className="font-bold text-sm">{a.label}</div><div className="text-sm text-muted truncate">{a.address}</div></div>)}
          </div>
        )}
        <a href={`tel:${HELPLINE}`} className="rounded-3xl bg-card border border-line p-4 flex items-center gap-3 font-bold"><LifeBuoy className="text-danger" /><span className="flex-1">Help & support</span><ChevronRight className="text-muted" /></a>
        <button onClick={onLogout} className="rounded-3xl border border-line p-4 flex items-center gap-3 font-bold text-muted"><LogOut /> Log out</button>
        <div className="text-center text-xs text-muted/60 mt-2">v{__APP_VERSION__}</div>
      </div>
    </>
  );
}

