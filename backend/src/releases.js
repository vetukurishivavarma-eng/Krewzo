// "New version ready" push for both apps. The release script pings POST /api/releases/check right after
// publishing (that also wakes the free Render instance); a slow poll covers anything missed.
// FCM keeps the message for 7 days, so a phone that is switched off gets it when it comes back on.
import { db } from './db.js';
import { pushEnabled, sendPush } from './push.js';

const REPO = 'vetukurishivavarma-eng/Krewzo';
const APPS = { partner: { table: 'workers', name: 'Krewzo Partner' }, customer: { table: 'users', name: 'Krewzo' } };
const FRESH_MS = 6 * 3600e3; // only announce recent releases (the DB resets on deploy, so "seen" is not durable)

let lastCheck = 0;
export async function announceNewReleases() {
  if (!pushEnabled || Date.now() - lastCheck < 30e3) return 0;
  lastCheck = Date.now();
  let sent = 0;
  try {
    // The public Atom feed, not api.github.com: Render's shared IPs hit the API's anonymous rate limit.
    const xml = await (await fetch(`https://github.com/${REPO}/releases.atom`)).text();
    const list = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)].map(([e]) => ({
      tag_name: e.match(/releases\/tag\/([^"<]+)/)?.[1] || '', published_at: e.match(/<updated>([^<]+)<\/updated>/)?.[1],
    })).sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
    for (const [app, { table, name }] of Object.entries(APPS)) {
      const rel = list.find((r) => r.tag_name.startsWith(app + '-v'));
      if (!rel || Date.now() - Date.parse(rel.published_at) > FRESH_MS) continue;
      const key = 'announced:' + rel.tag_name;
      if (db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key)) continue;
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, new Date().toISOString());
      const version = rel.tag_name.slice(app.length + 2);
      // ponytail: one FCM call per phone; switch to an FCM topic once there are thousands of installs.
      for (const row of db.prepare(`SELECT id, fcm_token FROM ${table} WHERE fcm_token IS NOT NULL`).all()) {
        sendPush(table, row, {
          title: `⬆️ ${name} ${version} is ready`, body: 'Open the app and tap Update. It downloads in the background.',
          channel: 'app_updates', ttlSec: 7 * 24 * 3600, data: { type: 'app_update', version },
        });
        sent++;
      }
    }
  } catch (e) { console.error('release check failed', e.message); }
  return sent;
}

export function startReleaseWatch() {
  if (!pushEnabled) return;
  setInterval(announceNewReleases, 15 * 60e3).unref(); // only runs while the instance is awake
  setTimeout(announceNewReleases, 20e3).unref();
}
