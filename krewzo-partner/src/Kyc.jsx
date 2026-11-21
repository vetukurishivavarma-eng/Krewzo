import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, CheckCircle2, ImageUp, Loader2, ScanLine, ShieldCheck, UserRound } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { api, vibrate } from './lib.js';
import { ErrorNote } from './App.jsx';

const QR_OPTS = { formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE], experimentalFeatures: { useBarCodeDetectorIfSupported: true }, verbose: false };

// Home-screen card: what the partner has to do (or is waiting for) before they can take jobs.
export function KycCard({ t, onVerified }) {
  const [s, setS] = useState(null);
  const [open, setOpen] = useState(false);
  const load = () => api('GET', '/workers/me/kyc').then(setS).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!s || s.status === 'VERIFIED') return null;
  if (open) return <KycFlow t={t} onClose={() => { setOpen(false); load(); }} onVerified={onVerified} />;

  if (s.status === 'PENDING') return (
    <section className="rounded-3xl bg-amber/10 border border-amber/30 p-4 flex gap-3">
      <span className="w-11 h-11 rounded-2xl bg-amber/20 text-amber flex items-center justify-center shrink-0"><Loader2 className="animate-spin" /></span>
      <div><div className="font-black">{t.kyc_pending_t}</div><div className="text-sm text-muted">{s.name} · XXXX XXXX {s.aadhaar_last4}</div><div className="text-sm text-muted mt-1">{t.kyc_pending_b}</div></div>
    </section>
  );
  return (
    <section className="rounded-3xl bg-lime/[0.07] border border-lime/30 p-4">
      <div className="flex gap-3">
        <span className="w-11 h-11 rounded-2xl bg-lime text-ink flex items-center justify-center shrink-0"><ShieldCheck /></span>
        <div><div className="font-black text-lg">{t.kyc_title}</div><div className="text-sm text-muted">{s.status === 'REJECTED' ? t.kyc_rejected : t.kyc_sub}</div></div>
      </div>
      <button onClick={() => setOpen(true)} className="mt-3 w-full h-14 rounded-2xl bg-lime text-ink text-lg font-black">{t.kyc_start}</button>
    </section>
  );
}

// Full-screen steps: consent -> scan Aadhaar Secure QR -> selfie -> submit.
function KycFlow({ t, onClose, onVerified }) {
  const [step, setStep] = useState('intro');
  const [consent, setConsent] = useState(false);
  const [qr, setQr] = useState('');
  const [selfie, setSelfie] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const fail = (e) => setErr(t.KYC_ERR[e?.data?.code] || e?.message || String(e));
  async function submit() {
    setErr(''); setBusy(true);
    try {
      const r = await api('POST', '/workers/me/kyc', { qr, selfie, consent });
      setDone(r); vibrate([100, 60, 200]);
      if (r.status === 'VERIFIED') onVerified?.();
    } catch (e) {
      fail(e);
      if (['BAD_SIGNATURE', 'OLD_QR', 'NOT_AADHAAR', 'MOBILE_MISMATCH', 'DUPLICATE', 'BLOCKED', 'UNDER_18'].includes(e?.data?.code)) { setQr(''); setStep('scan'); }
    } finally { setBusy(false); }
  }

  const steps = ['intro', 'scan', 'selfie'];
  return (
    <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
      <div className="min-h-full p-5 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <button onClick={onClose} aria-label="Back" className="w-11 h-11 rounded-full bg-surface border border-line flex items-center justify-center"><ArrowLeft size={20} /></button>
          <div className="flex-1 flex gap-1.5">{steps.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${steps.indexOf(step) >= i || done ? 'bg-lime' : 'bg-line'}`} />)}</div>
        </div>

        {done ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <CheckCircle2 size={72} className={done.status === 'VERIFIED' ? 'text-mint' : 'text-amber'} />
            <div className="font-display text-2xl font-extrabold">{done.status === 'VERIFIED' ? t.kyc_done : t.kyc_pending_t}</div>
            <div className="text-muted">{done.name} · XXXX XXXX {done.aadhaar_last4}</div>
            {done.status !== 'VERIFIED' && <div className="text-muted">{t.kyc_pending_b}</div>}
            <button onClick={onClose} className="mt-4 h-14 px-12 rounded-2xl bg-lime text-ink text-lg font-black">{t.done}</button>
          </div>
        ) : step === 'intro' ? (
          <>
            <div><div className="font-display text-3xl font-extrabold">{t.kyc_title}</div><div className="text-muted mt-1">{t.kyc_sub}</div></div>
            <div className="rounded-3xl bg-surface border border-line p-4 space-y-3 text-sm">
              <p className="flex gap-3"><ShieldCheck className="text-lime shrink-0" size={20} />{t.kyc_what}</p>
              <p className="flex gap-3"><UserRound className="text-lime shrink-0" size={20} />{t.kyc_phone_note}</p>
            </div>
            <label className="flex gap-3 items-start rounded-2xl bg-surface border border-line p-4 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 w-5 h-5 accent-[#c8f031]" />
              <span className="font-bold">{t.kyc_consent}</span>
            </label>
            <button disabled={!consent} onClick={() => setStep('scan')} className="mt-auto h-16 rounded-2xl bg-lime text-ink text-xl font-black disabled:opacity-30">{t.next}</button>
          </>
        ) : step === 'scan' ? (
          <QrStep t={t} err={err} onCode={(c) => { setErr(''); setQr(c); setStep('selfie'); vibrate(150); }} onError={setErr} />
        ) : (
          <>
            <div className="rounded-2xl bg-mint/10 border border-mint/30 text-mint p-3 font-bold flex items-center gap-2"><CheckCircle2 size={18} /> {t.kyc_qr_ok}</div>
            <SelfieStep t={t} value={selfie} onChange={setSelfie} />
            {err && <ErrorNote>{err}</ErrorNote>}
            <button disabled={!selfie || busy} onClick={submit} className="mt-auto h-16 rounded-2xl bg-lime text-ink text-xl font-black disabled:opacity-30 flex items-center justify-center gap-2">
              {busy && <Loader2 className="animate-spin" />}{t.kyc_submit}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// The Secure QR is dense: live camera first (native barcode detector where available), photo/screenshot as backup.
function QrStep({ t, err, onCode, onError }) {
  const scanner = useRef(null);
  const fileRef = useRef(null);
  useEffect(() => {
    const q = new Html5Qrcode('kyc-cam', QR_OPTS);
    scanner.current = q;
    let handled = false;
    q.start({ facingMode: 'environment' }, { fps: 10, qrbox: (w, h) => { const s = Math.floor(Math.min(w, h) * 0.85); return { width: s, height: s }; } }, (text) => {
      if (handled) return;
      handled = true;
      q.stop().catch(() => {}).finally(() => onCode(text));
    }, () => {}).catch(() => {}); // no camera permission: the photo option still works
    return () => { if (q.isScanning) q.stop().catch(() => {}); };
  }, []); // eslint-disable-line

  async function fromFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const q = scanner.current;
    try {
      if (q.isScanning) await q.stop();
      onCode(await new Html5Qrcode('kyc-file', QR_OPTS).scanFile(f, false));
    } catch { onError(t.kyc_no_qr); }
  }

  return (
    <>
      <div><div className="font-display text-2xl font-extrabold">{t.kyc_scan}</div><div className="text-muted text-sm mt-1">{t.kyc_scan_hint}</div></div>
      <div className="relative rounded-[2rem] overflow-hidden border-2 border-lime/50 bg-black aspect-square">
        <div id="kyc-cam" className="w-full h-full" />
        <ScanLine className="absolute top-3 right-3 text-lime" />
      </div>
      <div id="kyc-file" className="hidden" />
      {err && <ErrorNote>{err}</ErrorNote>}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={fromFile} />
      <button onClick={() => fileRef.current.click()} className="h-14 rounded-2xl bg-surface border border-line font-bold flex items-center justify-center gap-2"><ImageUp size={20} /> {t.kyc_pick}</button>
    </>
  );
}

// Front camera via the phone's own camera app; shrunk to ~640 px JPEG before upload.
function SelfieStep({ t, value, onChange }) {
  const ref = useRef(null);
  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      onChange(c.toDataURL('image/jpeg', 0.82));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  }
  return (
    <>
      <div><div className="font-display text-2xl font-extrabold">{t.kyc_selfie}</div><div className="text-muted text-sm mt-1">{t.kyc_selfie_hint}</div></div>
      <input ref={ref} type="file" accept="image/*" capture="user" className="hidden" onChange={pick} />
      {value ? (
        <div className="flex flex-col items-center gap-3">
          <img src={value} alt="" className="w-48 h-60 object-cover rounded-[2rem] border-2 border-lime/50" />
          <button onClick={() => ref.current.click()} className="h-12 px-6 rounded-xl bg-surface border border-line font-bold">{t.kyc_retake}</button>
        </div>
      ) : (
        <button onClick={() => ref.current.click()} className="aspect-[4/5] w-56 mx-auto rounded-[2rem] border-2 border-dashed border-lime/50 bg-surface flex flex-col items-center justify-center gap-3 text-lime font-black">
          <Camera size={48} /> {t.kyc_selfie}
        </button>
      )}
    </>
  );
}
