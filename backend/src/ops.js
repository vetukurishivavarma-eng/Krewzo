// Krewzo ops team: accounts that log in from the customer app ("Krewzo team"), stay logged in, and get pushed
// the moment something needs a human: a new ID check, a problem report, an SOS.
// The owner manages accounts on /admin with ADMIN_KEY; each new account gets a one-time setup code, so knowing
// someone's phone number is not enough to claim it. Ops PINs are 6 digits.
import crypto from 'node:crypto';
import { db, now } from './db.js';
import { checkPin, hashPin } from './auth.js';
import { sendPush } from './push.js';
import { ApiError } from './service.js';
import { verifyPinLimited } from './safety.js';

const fail = (status, msg, extra) => { throw new ApiError(status, msg, extra); };
const pub = (a) => a && { id: a.id, phone: a.phone, name: a.name, active: !!a.pin_hash, push: !!a.fcm_token, created_at: a.created_at };
export const getAdmin = (id) => db.prepare('SELECT * FROM admins WHERE id = ?').get(id);

const setupCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

// Owner: add (or reset) an ops account. Returns the setup code once; only its hash is stored.
export function addAdmin(phone, name) {
  const p = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(p)) fail(400, 'Enter a 10-digit mobile number');
  const n = String(name || '').trim();
  if (n.length < 2) fail(400, 'Enter their name');
  const code = setupCode();
  db.prepare(`INSERT INTO admins (phone, name, pin_hash, setup_hash, created_at) VALUES (?,?,NULL,?,?)
    ON CONFLICT (phone) DO UPDATE SET name = excluded.name, pin_hash = NULL, setup_hash = excluded.setup_hash, fcm_token = NULL`).run(p, n, hashPin(code), now());
  return { admin: pub(db.prepare('SELECT * FROM admins WHERE phone = ?').get(p)), setup_code: code };
}
export const listAdmins = () => db.prepare('SELECT * FROM admins ORDER BY name').all().map(pub);
export function removeAdmin(id) { db.prepare('DELETE FROM admins WHERE id = ?').run(id); return listAdmins(); }

// First login: phone + setup code + new 6-digit PIN. After that: phone + PIN. Wrong tries lock like everyone else's.
export function login({ phone, pin, setup_code }) {
  const p = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!/^\d{6}$/.test(String(pin || ''))) fail(400, 'Ops PIN is 6 digits');
  const a = db.prepare('SELECT * FROM admins WHERE phone = ?').get(p);
  if (!a) { verifyPinLimited('admin:' + p, false); }
  if (!a.pin_hash) {
    if (!setup_code) fail(400, 'First time? Enter the setup code you were given, then choose a 6-digit PIN.', { code: 'SETUP_REQUIRED' });
    verifyPinLimited('admin:' + p, checkPin(String(setup_code), a.setup_hash));
    db.prepare('UPDATE admins SET pin_hash = ?, setup_hash = NULL WHERE id = ?').run(hashPin(pin), a.id);
  } else {
    verifyPinLimited('admin:' + p, checkPin(pin, a.pin_hash));
  }
  return pub(getAdmin(a.id));
}

export function setAdminPush(id, token) {
  if (token !== null && !(typeof token === 'string' && token.length > 0 && token.length < 4096)) fail(400, 'Bad push token');
  if (token) db.prepare('UPDATE admins SET fcm_token = NULL WHERE fcm_token = ? AND id != ?').run(token, id);
  db.prepare('UPDATE admins SET fcm_token = ? WHERE id = ?').run(token, id);
  return { ok: true };
}
export const meAdmin = (id) => pub(getAdmin(id));

// Push to every ops phone. `tab` tells the app which list to open. Returns how many phones were targeted.
export let lastNotice = null; // tests
export function notifyOps(title, body, tab, { urgent = false } = {}) {
  lastNotice = { title, body, tab, urgent };
  const rows = db.prepare('SELECT id, fcm_token FROM admins WHERE fcm_token IS NOT NULL AND pin_hash IS NOT NULL').all();
  for (const r of rows) {
    sendPush('admins', r, { title, body, channel: urgent ? 'ops_sos' : 'ops', ttlSec: urgent ? 3600 : 24 * 3600, data: { type: 'ops', tab } });
  }
  return rows.length;
}
