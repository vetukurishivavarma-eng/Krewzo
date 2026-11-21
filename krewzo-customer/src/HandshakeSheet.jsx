import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { COLOR_TAGS, rupees } from '@krewzo/shared';

// Krewzo Handshake: one sheet, three ways for the worker to confirm. START glows emerald, END glows vault-gold.
export default function HandshakeSheet({ ticket, phase, onClose }) {
  const hs = phase === 'START' ? ticket.start_handshake : ticket.end_handshake;
  const [qr, setQr] = useState('');
  useEffect(() => {
    if (hs?.qr_token) QRCode.toDataURL(hs.qr_token, { width: 480, margin: 1, errorCorrectionLevel: 'M' }).then(setQr);
  }, [hs?.qr_token]);

  const startDone = phase === 'START' && ['IN_PROGRESS', 'COMPLETED', 'PAID_OUT'].includes(ticket.status);
  const paid = phase === 'END' && ticket.status === 'PAID_OUT';
  useEffect(() => { if (startDone) { const id = setTimeout(onClose, 1800); return () => clearTimeout(id); } }, [startDone]); // eslint-disable-line

  const gold = phase === 'END';
  const c = hs && COLOR_TAGS[hs.color_tag];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="sheet w-full max-w-md rounded-t-[2rem] bg-white/85 backdrop-blur-xl border-t border-white shadow-2xl px-6 pt-3 pb-8">
        <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-4" />

        {paid ? <Receipt ticket={ticket} onClose={onClose} /> : startDone ? (
          <div className="pop py-10 text-center">
            <div className="mx-auto w-24 h-24 rounded-full bg-forest text-white text-5xl flex items-center justify-center ring-emerald">✓</div>
            <div className="mt-4 text-xl font-black">Shift started</div>
            <div className="text-muted text-sm">Timer is running. Show the FINISH code when the work is done.</div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <div className={`text-xs font-bold uppercase tracking-widest ${gold ? 'text-[#9a5b00]' : 'text-forest'}`}>{gold ? '🔐 Release payment' : '🤝 Start shift'}</div>
              <div className="text-lg font-display font-extrabold mt-1">{gold ? 'Show this to finish & pay the worker' : 'Show this to the worker at your door'}</div>
            </div>
            <div className={`relative mx-auto mt-5 w-64 h-64 rounded-3xl bg-white p-3 ${gold ? 'ring-gold' : 'ring-emerald'}`}>
              {qr && <img src={qr} alt="Handshake QR code" className="w-full h-full" />}
              <div className={`laser ${gold ? 'gold' : ''}`} />
            </div>
            <div className="mt-5 flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 rounded-full px-5 py-2 text-3xl font-black text-white shadow-lg" style={{ background: c?.hex }} aria-label={`Colour ${hs?.color_tag} pin ${hs?.short_pin}`}>
                <span>{c?.emoji}</span><span>{hs?.short_pin}</span>
              </div>
            </div>
            <div className="mt-3 text-center text-xs text-muted">or 4-digit code</div>
            <div className="text-center font-mono text-3xl font-black tracking-[0.5em] text-ink">{hs?.otp_code}</div>
            {ticket.handshake_fails > 0 && <div className="mt-3 text-center text-sm text-[#9a5b00]">Worker entered a wrong code {ticket.handshake_fails}×. Codes refresh after 5 tries.</div>}
            {gold && <div className="mt-4 text-center text-sm text-muted">{rupees(ticket.worker_payout)} will be released from escrow to {ticket.worker?.name}'s UPI.</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Receipt({ ticket, onClose }) {
  const e = ticket.escrow;
  return (
    <div className="pop">
      <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-amber to-[#e08a00] text-white text-5xl flex items-center justify-center ring-gold">🔓</div>
      <div className="text-center mt-4">
        <div className="text-xs font-bold uppercase tracking-widest text-[#9a5b00]">Escrow unlocked</div>
        <div className="text-4xl font-display font-extrabold mt-1">{rupees(e.worker_payout)}</div>
        <div className="text-muted text-sm">sent to {ticket.worker?.name}'s UPI</div>
      </div>
      <div className="mt-5 rounded-2xl bg-white border border-dashed border-amber p-4 text-sm space-y-1.5">
        <div className="flex justify-between"><span className="text-muted">Held in escrow</span><span>{rupees(e.amount_held)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Paid to worker</span><span className="font-bold">{rupees(e.worker_payout)}</span></div>
        <div className="flex justify-between"><span className="text-muted">Platform, GST & insurance</span><span>{rupees(e.platform_fee)}</span></div>
        <div className="flex justify-between"><span className="text-muted">UPI ref</span><span className="font-mono text-xs">{e.tx_ref}</span></div>
        <div className="flex justify-between"><span className="text-muted">Released</span><span>{new Date(e.updated_at).toLocaleString('en-IN')}</span></div>
      </div>
      <button onClick={onClose} className="mt-5 w-full h-12 rounded-2xl bg-ink text-white font-bold">Done</button>
    </div>
  );
}
