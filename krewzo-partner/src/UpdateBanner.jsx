import { useEffect, useState } from 'react';
import { checkForUpdate, installUpdate, updateStatus } from '@krewzo/shared/update';

// Shown on any screen when a newer APK is on GitHub releases. Tap = background download (keeps going if you
// leave the app; progress also in the notification bar), then the installer opens. Hide it with x meanwhile.
export default function UpdateBanner() {
  const [u, setU] = useState(null);
  const [pct, setPct] = useState(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false); // file is downloaded: the next tap opens the installer straight away
  const [hidden, setHidden] = useState(false);

  const go = async (rel = u) => {
    setErr(''); setPct((p) => p ?? 0);
    try { await installUpdate(rel.url, setPct, 'Krewzo Partner ' + rel.version); setPct(null); setReady(true); }
    catch (e) { setErr(e.message); setPct(null); }
  };
  useEffect(() => {
    checkForUpdate('partner', __APP_VERSION__).then(async (rel) => {
      if (!rel) return;
      setU(rel);
      const s = await updateStatus(rel.url);
      if (s.status === 'DONE') setReady(true);
      if (s.status === 'RUNNING') { setPct(s.pct); go(rel); } // still downloading from last time: pick it back up
    });
  }, []); // eslint-disable-line
  if (!u || hidden) return null;

  return (
    <div className="drop fixed inset-x-3 top-3 z-[60] bg-raise border border-line text-cream rounded-2xl p-3 pl-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <div className="flex-1 font-bold leading-tight">
          New version {u.version}
          <div className="text-xs font-normal opacity-60">{pct !== null ? 'Downloading in background, you can keep using the app' : ready ? 'Downloaded, ready to install' : 'Tap Update to download'}</div>
          {err && <div className="text-sm text-[#ff5a4e] font-normal">{err}</div>}
        </div>
        <button disabled={pct !== null} onClick={() => go()} className="h-11 px-5 rounded-xl bg-[#c8f031] text-[#15130f] font-black disabled:opacity-80">
          {pct === null ? (ready ? 'Install' : 'Update') : pct + '%'}
        </button>
        <button onClick={() => setHidden(true)} aria-label="Hide" className="w-8 h-8 rounded-full opacity-50 text-xl leading-none">×</button>
      </div>
      {pct !== null && <div className="h-1 rounded-full bg-white/10 mt-2.5 overflow-hidden"><div className="h-full bg-[#c8f031] transition-all" style={{ width: pct + '%' }} /></div>}
    </div>
  );
}
