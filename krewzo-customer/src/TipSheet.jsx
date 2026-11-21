import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { rupees, upiLink } from '@krewzo/shared';

const AMOUNTS = [20, 50, 100];

// Tip after a paid job: straight from the customer's UPI app to the worker's UPI (Krewzo isn't in the middle).
export default function TipSheet({ worker, onClose }) {
  const [amount, setAmount] = useState(50);
  const [img, setImg] = useState('');
  const first = worker.name.split(' ')[0];
  const link = upiLink({ upi_id: worker.upi_id, name: worker.name, amount, note: 'Krewzo tip' });
  useEffect(() => { if (link) QRCode.toDataURL(link, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then(setImg); }, [link]);
  if (!link) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="sheet w-full max-w-md rounded-t-[2rem] bg-card px-6 pt-3 pb-8">
        <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-5" />
        <div className="font-display text-2xl font-extrabold">Tip {first}</div>
        <p className="text-muted text-sm mt-1">Goes straight to {first}'s UPI. Every rupee is theirs.</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          {AMOUNTS.map((a) => (
            <button key={a} onClick={() => setAmount(a)} className={`h-12 rounded-xl font-bold border ${amount === a ? 'bg-ink text-paper border-ink' : 'bg-card border-line'}`}>{rupees(a)}</button>
          ))}
        </div>
        <div className="mt-5 mx-auto w-52 rounded-2xl bg-white p-3 border border-line">{img && <img src={img} alt={`UPI QR to tip ${first} ${rupees(amount)}`} className="w-full" />}</div>
        <p className="text-center text-xs text-muted mt-2">Scan with GPay, PhonePe or Paytm · <span className="select-all">{worker.upi_id}</span></p>
        <a href={link} className="mt-4 h-14 rounded-2xl bg-lime text-ink text-lg font-black flex items-center justify-center">Pay {rupees(amount)} with UPI app</a>
        <button onClick={onClose} className="mt-2 w-full h-11 rounded-xl text-muted font-semibold">Not now</button>
      </div>
    </div>
  );
}
