import { useEffect, useState } from 'react';
import { SKILL_TIERS, TRADE_TAGS, rupees } from '@krewzo/shared';
import { api, getToken, setToken } from './lib.js';
import Book from './Book.jsx';
import Tracking from './Tracking.jsx';

export default function App() {
  const [token, setTok] = useState(getToken);
  const [user, setUser] = useState(null);
  const [view, setView] = useState({ name: 'book' });

  useEffect(() => {
    if (!token) return;
    api('GET', '/me').then((r) => setUser(r.user)).catch(() => { setToken(null); setTok(null); });
  }, [token]);

  if (!token) return <Login onDone={(r) => { setToken(r.token); setTok(r.token); setUser(r.user); }} />;
  if (!user) return <div className="h-full flex items-center justify-center text-slate-400">Loading…</div>;

  const logout = () => { setToken(null); setTok(null); setUser(null); };
  return (
    <div className="min-h-full max-w-md mx-auto bg-slate-50 pb-24">
      <header className="sticky top-0 z-20 bg-slate-50/90 backdrop-blur px-4 py-3 flex items-center justify-between">
        <button onClick={() => setView({ name: 'book' })} className="text-2xl font-black tracking-tight"><span className="text-emerald-600">Krew</span>zo</button>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setView({ name: 'list' })} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 font-medium">My bookings</button>
          <button onClick={logout} className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold" title="Log out">{user.name[0]}</button>
        </div>
      </header>
      {view.name === 'book' && <Book user={user} onBooked={(g) => { setUser((u) => ({ ...u, account_type: g.account_type })); setView({ name: 'track', id: g.id }); }} />}
      {view.name === 'track' && <Tracking groupId={view.id} onBack={() => setView({ name: 'list' })} />}
      {view.name === 'list' && <BookingList onOpen={(id) => setView({ name: 'track', id })} />}
    </div>
  );
}

function Login({ onDone }) {
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
    <form onSubmit={submit} className="min-h-full max-w-md mx-auto px-6 py-12 flex flex-col gap-4">
      <div className="text-4xl font-black tracking-tight"><span className="text-emerald-600">Krew</span>zo</div>
      <p className="text-slate-500 -mt-2">Verified daily-wage help at your door in 30 minutes. Pay only when the work is done.</p>
      <input inputMode="numeric" autoComplete="tel" placeholder="Mobile number" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-lg" />
      <input inputMode="numeric" type="password" maxLength={4} placeholder="4-digit PIN" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-lg tracking-widest" />
      {needName && <input placeholder="Your name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-lg" />}
      {err && <div className="text-red-600 text-sm">{err}</div>}
      <button className="h-14 rounded-2xl bg-emerald-600 text-white text-lg font-semibold">{needName ? 'Create account' : 'Continue'}</button>
      <p className="text-xs text-slate-400 text-center">New number? We'll create your account. Demo: 9999999999 / 1234</p>
    </form>
  );
}

const STATUS_LABEL = { SEARCHING: 'Finding worker', ASSIGNED: 'Worker on the way', ARRIVED: 'Worker arrived', IN_PROGRESS: 'Work in progress', COMPLETED: 'Completed', PAID_OUT: 'Paid', CANCELLED: 'Cancelled' };

function BookingList({ onOpen }) {
  const [groups, setGroups] = useState(null);
  useEffect(() => { api('GET', '/bookings').then(setGroups).catch(() => setGroups([])); }, []);
  if (!groups) return <div className="p-6 text-slate-400">Loading…</div>;
  if (!groups.length) return <div className="p-6 text-slate-500">No bookings yet.</div>;
  return (
    <div className="px-4 flex flex-col gap-3">
      {groups.map((g) => {
        const t = g.tickets[0];
        const statuses = [...new Set(g.tickets.map((x) => STATUS_LABEL[x.status]))].join(' · ');
        return (
          <button key={g.id} onClick={() => onOpen(g.id)} className="text-left rounded-2xl bg-white border border-slate-200 p-4 flex gap-3 items-center">
            <div className="text-3xl">{TRADE_TAGS[t.trade_tag]?.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{SKILL_TIERS[t.skill_tier].label} × {g.worker_count} · {t.duration}</div>
              <div className="text-sm text-slate-500 truncate">{t.address}</div>
              <div className="text-xs text-emerald-700 mt-0.5">{statuses}</div>
            </div>
            <div className="font-bold">{rupees(g.amount_total)}</div>
          </button>
        );
      })}
    </div>
  );
}
