// "Krewzo Handshake": one token set, three ways to prove the worker is standing at the customer's door.
import crypto from 'node:crypto';
import { COLOR_TAGS } from '@krewzo/shared';
import { hmac, safeEqual } from './auth.js';

const COLORS = Object.keys(COLOR_TAGS);
const qrSig = (bookingId, phase, nonce) => hmac(`qr.${bookingId}.${phase}.${nonce}`).slice(0, 22);

export function newHandshake(bookingId, phase) {
  const nonce = crypto.randomBytes(8).toString('hex');
  const body = {
    booking_id: bookingId,
    phase,
    qr_token: `KRZ1.${bookingId}.${phase}.${nonce}.${qrSig(bookingId, phase, nonce)}`,
    color_tag: COLORS[crypto.randomInt(COLORS.length)],
    short_pin: String(crypto.randomInt(10, 100)),
    otp_code: String(crypto.randomInt(0, 10000)).padStart(4, '0'),
    issued_at: new Date().toISOString(),
  };
  return { ...body, signature: hmac('hs.' + JSON.stringify(body)) };
}

function intact(hs) {
  const { signature, verified_at, verified_method, ...body } = hs;
  return safeEqual(signature, hmac('hs.' + JSON.stringify(body)));
}

export function checkHandshake(hs, method, payload = {}) {
  if (!hs || !intact(hs)) return false;
  switch (method) {
    case 'QR': {
      const token = String(payload.qr_token || '');
      const [v, id, phase, nonce, sig] = token.split('.');
      return v === 'KRZ1' && Number(id) === hs.booking_id && phase === hs.phase &&
        safeEqual(sig || '', qrSig(id, phase, nonce)) && safeEqual(token, hs.qr_token);
    }
    case 'COLOR_PIN':
      return payload.color_tag === hs.color_tag && safeEqual(String(payload.short_pin ?? ''), hs.short_pin);
    case 'OTP':
      return safeEqual(String(payload.otp_code ?? ''), hs.otp_code);
    default:
      return false;
  }
}
