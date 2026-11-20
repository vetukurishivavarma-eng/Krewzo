import { useEffect, useState } from 'react';
import { TRADE_TAGS, rupees } from '@krewzo/shared';
import { api } from './lib.js';

const METHOD_ICON = { QR: '📷', COLOR_PIN: '🎨', OTP: '🔢' };

// Digital Work Passbook: every verified shift, plus the credit score lenders see.
export default function Passbook({ t, onBack }) {
  const [p, setP] = useState(null);
  useEffect(() => { api('GET', '/workers/me/passbook').then(setP).catch(() => {}); }, []);
  if (!p) return <div className="min-h-full flex items-center justify-center text-6xl bg-neutral-950">⏳</div>;
  const c = p.credit;
  return (
    <div className="min-h-full bg-neutral-950 text-white p-4 flex flex-col gap-4">
      <button onClick={onBack} className="h-16 rounded-2xl bg-white/10 text-2xl font-bold self-start px-6">⬅️ {t.back}</button>
      <div className="text-3xl font-black">📒 {t.passbook}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-white text-black p-4"><div className="font-bold opacity-60">💰 {t.total}</div><div className="text-3xl font-black">{rupees(p.total_earnings)}</div></div>
        <div className="rounded-3xl bg-white text-black p-4"><div className="font-bold opacity-60">✅ {t.shifts}</div><div className="text-3xl font-black">{c.verified_shift_count}</div></div>
      </div>
      <div className="rounded-3xl bg-gradient-to-br from-amber-300 to-amber-500 text-black p-4">
        <div className="font-bold opacity-70">🏦 {t.score}</div>
        <div className="text-5xl font-black">{c.krewzo_score}<span className="text-xl opacity-60"> / 900</span></div>
        <div className="flex gap-1 mt-2 h-10 items-end">
          {c.weekly_earnings_90d.map((v, i) => {
            const max = Math.max(1, ...c.weekly_earnings_90d);
            return <div key={i} className="flex-1 bg-black/70 rounded-t" style={{ height: `${Math.max(6, (v / max) * 100)}%`, opacity: v ? 1 : 0.2 }} />;
          })}
        </div>
        <div className="mt-2 text-lg font-bold">{c.loan_eligible ? `✅ ${t.loan_ready} ${rupees(c.suggested_limit)}` : `🔒 ${t.loan_not_yet}`}</div>
      </div>
      <div className="flex flex-col gap-2">
        {p.shifts.map((s) => (
          <div key={s.id} className="rounded-2xl bg-white/10 p-3 flex items-center gap-3">
            <div className="text-4xl">{TRADE_TAGS[s.trade_tag]?.icon}</div>
            <div className="flex-1">
              <div className="text-2xl font-black">{rupees(s.worker_payout)}</div>
              <div className="text-sm opacity-70">{new Date(s.paid_out_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {s.duration} · {METHOD_ICON[s.start_method]}{METHOD_ICON[s.end_method]} {s.customer_rating ? '⭐'.repeat(s.customer_rating) : ''}</div>
            </div>
            <div className="text-2xl">✅</div>
          </div>
        ))}
      </div>
    </div>
  );
}
