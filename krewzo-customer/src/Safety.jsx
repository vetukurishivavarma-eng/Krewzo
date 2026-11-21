import { useState } from 'react';
import { AlertTriangle, Phone, Siren } from 'lucide-react';
import { api } from './lib.js';

const HELPLINE = import.meta.env.VITE_HELPLINE || '18001234567';
const CATEGORIES = [
  ['NOT_DONE', 'The work was not done'], ['POOR_QUALITY', 'Poor quality work'], ['ASKED_EXTRA_MONEY', 'Asked me for extra money'],
  ['SAFETY', 'I felt unsafe / bad behaviour'], ['DAMAGE', 'Something was damaged'], ['OTHER', 'Something else'],
];

const Sheet = ({ onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} className="sheet w-full max-w-md rounded-t-[2rem] bg-card px-6 pt-3 pb-8 max-h-[90vh] overflow-y-auto">
      <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-5" />
      {children}
    </div>
  </div>
);

// Report a problem. During the job this also puts the worker's payment on hold until Krewzo reviews it.
export function ReportSheet({ ticket, onClose }) {
  const [cat, setCat] = useState('');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(null);
  const [err, setErr] = useState('');
  async function send() {
    setErr('');
    try { setDone(await api('POST', `/bookings/${ticket.id}/report`, { category: cat, details })); } catch (e) { setErr(e.message); }
  }
  if (done) return (
    <Sheet onClose={onClose}>
      <div className="font-display text-2xl font-extrabold">Thanks, we've got it</div>
      <p className="text-muted mt-2">{done.payment_held ? "The worker's payment is on hold. " : ''}Krewzo will call you about this soon.</p>
      <button onClick={onClose} className="mt-5 w-full h-12 rounded-xl bg-ink text-paper font-bold">OK</button>
    </Sheet>
  );
  const holds = ['ARRIVED', 'IN_PROGRESS'].includes(ticket.status);
  return (
    <Sheet onClose={onClose}>
      <div className="font-display text-2xl font-extrabold">Report a problem</div>
      {holds && <p className="text-sm text-muted mt-1">Reporting now puts the worker's payment on hold until Krewzo checks.</p>}
      <div className="grid gap-2 mt-4">
        {CATEGORIES.map(([id, label]) => (
          <button key={id} onClick={() => setCat(id)} className={`text-left h-12 px-4 rounded-xl border font-semibold ${cat === id ? 'bg-ink text-paper border-ink' : 'bg-card border-line'}`}>{label}</button>
        ))}
      </div>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What happened? (optional)" rows={3}
        className="mt-3 w-full rounded-xl border border-line bg-card p-3 outline-none focus:border-ink" />
      {err && <div className="text-sm text-danger font-semibold mt-2">{err}</div>}
      <button disabled={!cat} onClick={send} className="mt-4 w-full h-12 rounded-xl bg-ink text-paper font-bold disabled:opacity-40">Send report</button>
    </Sheet>
  );
}

// SOS: alert Krewzo with this phone's location, and call 112.
export function SosSheet({ bookingId, onClose }) {
  const [sent, setSent] = useState(false);
  function alertKrewzo() {
    const send = (pos) => api('POST', '/sos', { booking_id: bookingId, lat: pos?.coords.latitude, lng: pos?.coords.longitude }).catch(() => {});
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(send, () => send(null), { timeout: 5000, enableHighAccuracy: true });
    else send(null);
    setSent(true);
  }
  return (
    <Sheet onClose={onClose}>
      <div className="flex items-center gap-2 font-display text-2xl font-extrabold text-danger"><Siren /> Emergency</div>
      <p className="text-muted mt-2">If you are in danger, call the police now. We'll also alert the Krewzo team with your location.</p>
      <a href="tel:112" onClick={alertKrewzo} className="mt-5 h-14 rounded-2xl bg-danger text-white text-lg font-black flex items-center justify-center gap-2"><Phone size={20} /> Call 112</a>
      {!sent
        ? <button onClick={alertKrewzo} className="mt-2 w-full h-12 rounded-xl border border-danger/40 text-danger font-bold flex items-center justify-center gap-2"><AlertTriangle size={18} /> Alert Krewzo only</button>
        : <div className="mt-3 text-sm text-forest font-semibold text-center">Krewzo has been alerted with your location.</div>}
      <p className="text-xs text-muted text-center mt-3">Krewzo help: <span className="select-all font-semibold">{HELPLINE}</span></p>
    </Sheet>
  );
}
