import { useEffect, useState } from 'react';
import { checkForUpdate, installUpdate } from '@krewzo/shared/update';

// Shown on any screen when a newer APK is on GitHub releases; one tap downloads it and opens the installer.
export default function UpdateBanner() {
  const [u, setU] = useState(null);
  const [pct, setPct] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { checkForUpdate('customer', __APP_VERSION__).then(setU); }, []);
  if (!u) return null;

  const go = async () => {
    setErr(''); setPct(0);
    try { await installUpdate(u.url, setPct); setPct(null); } catch (e) { setErr(e.message); setPct(null); }
  };
  return (
    <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl bg-neutral-900 text-white p-4 shadow-2xl flex items-center gap-3">
      <div className="flex-1 text-base font-bold">
        ⬆️ New version {u.version}
        {err && <div className="text-sm text-red-400 font-normal">{err}</div>}
      </div>
      <button disabled={pct !== null} onClick={go} className="h-12 px-5 rounded-xl bg-emerald-600 text-white text-base font-black disabled:opacity-70">
        {pct === null ? 'Update' : pct + '%'}
      </button>
    </div>
  );
}
