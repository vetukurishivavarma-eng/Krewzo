// In-app APK self-update. Releases are GitHub releases tagged `<app>-v1.2.3` (app = partner | customer)
// with one .apk asset; publish them with `node scripts/release.mjs <app>`.
import { Capacitor, registerPlugin } from '@capacitor/core';

const Updater = registerPlugin('Updater'); // native side: android/.../UpdaterPlugin.java
const REPO = 'vetukurishivavarma-eng/Krewzo';

export function isNewer(a, b) {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

export async function checkForUpdate(app, current) {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const list = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`)).json();
    const rel = list.find((r) => !r.draft && r.tag_name.startsWith(app + '-v')); // newest first
    const apk = rel?.assets.find((a) => a.name.endsWith('.apk'));
    const version = rel?.tag_name.slice(app.length + 2);
    return apk && isNewer(version, current) ? { version, url: apk.browser_download_url } : null;
  } catch { return null; } // offline / rate-limited: try again next launch
}

// Downloads in the background (Android DownloadManager, keeps going if the app is left or closed),
// then opens the installer. Calling it again joins a running download or reuses the finished file.
export async function installUpdate(url, onProgress, title, onReason) {
  const sub = await Updater.addListener('progress', (e) => { onProgress?.(e.pct); onReason?.(e.reason || ''); });
  try { await Updater.install({ url, title }); } finally { sub.remove(); }
}

// { status: 'NONE' | 'RUNNING' | 'DONE' | 'FAILED', pct }
export const updateStatus = (url) => Updater.status({ url }).catch(() => ({ status: 'NONE', pct: 0 }));
