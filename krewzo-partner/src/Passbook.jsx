import { useEffect, useState } from 'react';
import { Landmark, Lock } from 'lucide-react';
import { TRADE_TAGS, rupees } from '@krewzo/shared';
import { api } from './lib.js';

const METHOD = { QR: 'QR', COLOR_PIN: 'Colour', OTP: 'Code' };

// Digital Work Passbook: every verified shift, plus the credit score lenders see.
export default function Passbook({ t }) {
  const [p, setP] = useState(null);
  useEffect(() => { api('GET', '/workers/me/passbook').then(setP).catch(() => {}); }, []);
  if (!p) return <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-3xl bg-surface animate-pulse" />)}</div>;
  const c = p.credit;
  const max = Math.max(1, ...c.weekly_earnings_90d);
  const pct = Math.round((c.krewzo_score / 900) * 100);
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="font-display text-3xl font-extrabold">{t.passbook}</div>

      <section className="rounded-[2rem] bg-surface border border-line p-5">
        <div className="text-sm font-bold text-muted">{t.total}</div>
        <div className="num text-5xl font-bold text-mint mt-1">{rupees(p.total_earnings)}</div>
        <div className="flex gap-1 mt-5 h-16 items-end">
          {c.weekly_earnings_90d.map((v, i) => <div key={i} className="flex-1 rounded-t-md bg-lime" style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v ? 1 : 0.15 }} />)}
        </div>
        <div className="flex justify-between text-[11px] text-muted mt-1.5"><span>90d</span><span>{c.verified_shift_count} {t.shifts}</span></div>
      </section>

      <section className="rounded-[2rem] bg-gradient-to-br from-[#2a2414] to-surface border border-amber/25 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-amber"><Landmark size={18} /> {t.score}</div>
          <div className="num text-4xl font-bold">{c.krewzo_score}<span className="text-base text-muted"> / 900</span></div>
        </div>
        <div className="h-2.5 rounded-full bg-ink/60 mt-4 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-amber to-lime" style={{ width: `${pct}%` }} /></div>
        <div className="mt-4 font-bold flex items-center gap-2">
          {c.loan_eligible ? <>✅ {t.loan_ready} <span className="text-mint">{rupees(c.suggested_limit)}</span></> : <><Lock size={16} className="text-muted" /> <span className="text-muted">{t.loan_not_yet}</span></>}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        {p.shifts.map((s) => (
          <div key={s.id} className="rounded-2xl bg-surface border border-line p-3.5 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-raise flex items-center justify-center text-2xl">{TRADE_TAGS[s.trade_tag]?.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{t.TRADES[s.trade_tag]}</div>
              <div className="text-xs text-muted">
                {new Date(s.paid_out_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {s.duration} · {METHOD[s.start_method]}/{METHOD[s.end_method]}
                {s.customer_rating ? ` · ${'★'.repeat(s.customer_rating)}` : ''}
              </div>
            </div>
            <div className="num text-xl font-bold text-mint">{rupees(s.worker_payout)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
