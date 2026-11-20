import { useEffect } from 'react';
import { TRADE_TAGS, rupees } from '@krewzo/shared';
import { chime, speak } from './lib.js';
import { SpeakBtn } from './App.jsx';

// Full-screen job alert: payout, distance, duration, task icon. Two buttons. Nothing else to read.
export default function JobAlert({ t, lang, offer, count, onAccept, onSkip }) {
  const hours = parseInt(offer.duration);
  const say = () => speak(lang, 'job', { ...offer, hours });
  useEffect(() => {
    // Keep ringing every 6 s until the worker decides.
    const id = setInterval(chime, 6000);
    return () => clearInterval(id);
  }, [offer.booking_id]);

  const when = offer.booking_mode === 'SCHEDULED' && new Date(offer.scheduled_at).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="fixed inset-0 flash text-white flex flex-col p-5 gap-4">
      <div className="flex items-center justify-between">
        <div className="text-3xl font-black">🔔 {t.new_job}{count > 1 ? ` (${count})` : ''}</div>
        <SpeakBtn onClick={say} />
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="text-[7rem] leading-none">{TRADE_TAGS[offer.trade_tag]?.icon}</div>
        <div className="text-7xl font-black text-emerald-300">{rupees(offer.payout)}</div>
        <div className="flex gap-4 text-4xl font-black">
          <span className="rounded-2xl bg-white/10 px-4 py-2">📍 {offer.distance_km} {t.km}</span>
          <span className="rounded-2xl bg-white/10 px-4 py-2">⏱ {hours} {t.hours}</span>
        </div>
        {when && <div className="text-2xl font-bold rounded-2xl bg-sky-500 text-black px-4 py-2">📅 {t.scheduled}: {when}</div>}
        {offer.addons?.length > 0 && <div className="text-4xl">{offer.addons.includes('TOOLKIT') && '🧰'} {offer.addons.includes('LADDER') && '🪜'}</div>}
      </div>
      <div className="grid grid-cols-5 gap-3">
        <button onClick={onSkip} className="col-span-2 h-32 rounded-3xl bg-neutral-600 text-3xl font-black">✖<br />{t.skip}</button>
        <button onClick={onAccept} className="col-span-3 h-32 rounded-3xl bg-emerald-500 text-black text-4xl font-black">✔<br />{t.accept}</button>
      </div>
    </div>
  );
}
