// Firebase Cloud Messaging (HTTP v1) push, no SDK: sign a service-account JWT, swap it for an access token, send.
// Needs FIREBASE_SERVICE_ACCOUNT = the service-account JSON. Without it push is off (tests, local dev).
import crypto from 'node:crypto';
import { db } from './db.js';

const sa = (() => {
  try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || 'null'); }
  catch { console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON; push disabled'); return null; }
})();
export const pushEnabled = !!sa;

const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
let cached = { token: null, exp: 0 };
async function accessToken() {
  if (cached.exp > Date.now() + 60e3) return cached.token;
  const iat = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })}`;
  const jwt = `${unsigned}.${crypto.sign('RSA-SHA256', Buffer.from(unsigned), sa.private_key).toString('base64url')}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('FCM auth failed: ' + JSON.stringify(j));
  cached = { token: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return cached.token;
}

const TABLES = new Set(['workers', 'users']); // whose row holds the token

// Fire-and-forget; never throws into the booking flow.
export async function sendPush(table, row, { title, body, data = {}, ttlSec = 120, channel = 'jobs', dataOnly = false }) {
  if (!sa || !row?.fcm_token || !TABLES.has(table)) return false;
  try {
    const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + (await accessToken()), 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token: row.fcm_token,
        ...(!dataOnly && { notification: { title, body } }),
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? '')])),
        android: { priority: 'HIGH', ttl: `${ttlSec}s`, ...(!dataOnly && { notification: { channel_id: channel, sound: 'default', default_vibrate_timings: true } }) },
      } }),
    });
    if (r.ok) return true;
    const err = await r.text();
    // App uninstalled / token rotated: forget it so we stop trying.
    if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(err)) db.prepare(`UPDATE ${table} SET fcm_token = NULL WHERE id = ?`).run(row.id);
    else console.error('FCM send failed', r.status, err);
  } catch (e) { console.error('FCM error', e.message); }
  return false;
}
