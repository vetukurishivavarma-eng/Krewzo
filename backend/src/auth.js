import crypto from 'node:crypto';
import { SECRET } from './db.js';

export const hmac = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(pin), salt, 32).toString('hex');
}
export function checkPin(pin, stored) {
  const [salt, hash] = stored.split(':');
  return safeEqual(crypto.scryptSync(String(pin), salt, 32).toString('hex'), hash);
}

// 60 days, renewed every time the app opens (/api/me, worker home, /api/ops/me), so active users never get logged out.
const TOKEN_TTL_MS = 60 * 24 * 3600 * 1000;
export function signToken(role, id) {
  const body = Buffer.from(JSON.stringify({ role, id, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
  return body + '.' + hmac(body);
}
export function readToken(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig || !safeEqual(hmac(body), sig)) return null;
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  return data.exp > Date.now() ? data : null;
}

export const normPhone = (p) => String(p || '').replace(/\D/g, '').slice(-10);
export const validPhone = (p) => /^[6-9]\d{9}$/.test(p);
export const validPin = (p) => /^\d{4}$/.test(String(p || ''));
