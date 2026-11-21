// Aadhaar Secure QR (UIDAI offline verification): the big QR on Aadhaar letters, PVC cards, e-Aadhaar and
// mAadhaar. It is a decimal number -> bytes -> gzip -> fields separated by 0xFF, then the JPEG 2000 photo,
// optional email/mobile hashes, and a 256-byte RSA (SHA-256) signature by UIDAI over everything before it.
// We verify that signature with UIDAI's public certificate(s), so an edited or home-made QR fails.
// The QR never contains the full Aadhaar number: only its last 4 digits (inside the reference id).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import jpeg2000 from 'jpeg2000';

const SIG_LEN = 256;
const FIELDS_V1 = ['indicator', 'reference_id', 'name', 'dob', 'gender', 'care_of', 'district', 'landmark', 'house', 'location', 'pincode', 'post_office', 'state', 'street', 'sub_district', 'vtc'];
const FIELDS_V2 = ['version', ...FIELDS_V1, 'mobile_last4'];

// UIDAI certificates: every .cer/.crt/.pem in backend/certs (or UIDAI_CERT_DIR). PEM public keys also work (tests).
function loadKeys() {
  const dir = process.env.UIDAI_CERT_DIR || path.join(import.meta.dirname, '..', 'certs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /\.(cer|crt|pem)$/i.test(f)); } catch { return []; }
  return files.flatMap((f) => {
    const buf = fs.readFileSync(path.join(dir, f));
    try { return [{ name: f, key: new crypto.X509Certificate(buf).publicKey }]; } catch {}
    try { return [{ name: f, key: crypto.createPublicKey(buf) }]; } catch {}
    console.error('aadhaar: could not read certificate', f);
    return [];
  });
}
let keys = null;
export const uidaiKeys = () => (keys ??= loadKeys());
export const _resetKeys = () => { keys = null; }; // tests

export class QrError extends Error {}

function toBytes(text) {
  const s = String(text || '').trim();
  if (/^\s*<\?xml|<PrintLetterBarcodeData/i.test(s)) throw new QrError('OLD_QR'); // pre-2019 unsigned QR
  if (!/^\d{100,}$/.test(s)) throw new QrError('NOT_AADHAAR');
  let hex = BigInt(s).toString(16);
  if (hex.length % 2) hex = '0' + hex;
  const raw = Buffer.from(hex, 'hex');
  for (const fn of [zlib.gunzipSync, zlib.inflateSync, zlib.inflateRawSync]) {
    try { return fn(raw); } catch {}
  }
  throw new QrError('NOT_AADHAAR');
}

export function parseSecureQr(text) {
  const data = toBytes(text);
  if (data.length < SIG_LEN + 50) throw new QrError('NOT_AADHAAR');
  const signed = data.subarray(0, data.length - SIG_LEN);
  const signature = data.subarray(data.length - SIG_LEN);

  // Text fields: read up to the needed number of 0xFF delimiters; the photo starts right after.
  const readFields = (n) => {
    const out = [];
    let start = 0;
    for (let i = 0; i < signed.length && out.length < n; i++) {
      if (signed[i] === 0xff) { out.push(signed.subarray(start, i).toString('latin1')); start = i + 1; }
    }
    return { out, photoStart: start };
  };
  const first = readFields(1).out[0] || '';
  const versioned = /^V\d+$/.test(first); // V2+ starts with its version; the 2019 format starts with the indicator digit
  const names = versioned ? FIELDS_V2 : FIELDS_V1;
  const { out, photoStart } = readFields(names.length);
  if (out.length < names.length) throw new QrError('NOT_AADHAAR');
  const f = Object.fromEntries(names.map((k, i) => [k, Buffer.from(out[i], 'latin1').toString('utf8').trim()]));

  const indicator = Number(f.indicator);
  if (![0, 1, 2, 3].includes(indicator) || !/^\d{4}/.test(f.reference_id)) throw new QrError('NOT_AADHAAR');
  const hashBytes = { 0: 0, 1: 32, 2: 32, 3: 64 }[indicator]; // email and/or mobile SHA-256 hashes before the signature
  const photo = Buffer.from(signed.subarray(photoStart, signed.length - hashBytes));
  // 2 = mobile only, 3 = email then mobile: either way the mobile hash is the last 32 bytes before the signature.
  const mobileHash = indicator === 2 || indicator === 3 ? Buffer.from(signed.subarray(signed.length - 32)).toString('hex') : null;

  const ks = uidaiKeys();
  const sigOk = ks.length ? ks.some(({ key }) => { try { return crypto.verify('sha256', signed, key, signature); } catch { return false; } }) : null;

  return {
    version: versioned ? f.version : 'V1',
    aadhaar_last4: f.reference_id.slice(0, 4),
    generated_at: f.reference_id.slice(4, 18), // YYYYMMDDHHMMSS
    name: f.name, dob: f.dob, gender: f.gender,
    area: [f.vtc || f.location, f.district, f.state, f.pincode].filter(Boolean).join(', '),
    mobile_last4: /^\d{4}$/.test(f.mobile_last4 || '') ? f.mobile_last4 : null,
    mobile_hash: mobileHash,
    photo,
    sig_ok: sigOk, // true / false / null = no UIDAI certificate installed yet
  };
}

// Does this phone number match the mobile linked to the Aadhaar? true / false / null (QR carries no mobile).
// UIDAI hashes the 10-digit mobile with SHA-256 repeated N times, N = last digit of the Aadhaar number (0 or 1 -> once).
export function mobileMatches(qr, phone) {
  const mobile = String(phone).replace(/\D/g, '').slice(-10);
  if (qr.mobile_last4 && qr.mobile_last4 !== mobile.slice(-4)) return false;
  if (!qr.mobile_hash) return qr.mobile_last4 ? true : null;
  const rounds = Math.max(1, Number(qr.aadhaar_last4.slice(-1)));
  let hex = mobile, raw = Buffer.from(mobile);
  for (let i = 0; i < rounds; i++) {
    hex = crypto.createHash('sha256').update(hex).digest('hex'); // each round hashes the previous hex string
    raw = crypto.createHash('sha256').update(raw).digest(); // (and the raw-bytes reading of the spec, to be safe)
  }
  return hex === qr.mobile_hash || raw.toString('hex') === qr.mobile_hash;
}

// Age in whole years from "DD-MM-YYYY" or "YYYY"; null if unreadable.
export function ageFrom(dob, today = new Date()) {
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(dob || '') || /^(\d{4})$/.exec(dob || '');
  if (!m) return null;
  const [d, mo, y] = m.length === 4 ? [Number(m[1]), Number(m[2]), Number(m[3])] : [1, 1, Number(m[1])];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age;
}

// The QR photo is JPEG 2000, which phones and browsers can't show: decode it to a BMP data URL for the admin screen.
export function photoDataUrl(jp2) {
  try {
    const j = new jpeg2000.JpxImage();
    j.parse(jp2);
    const { width: w, height: h, componentsCount: cc } = j;
    const rgb = new Uint8Array(w * h * 3);
    for (const t of j.tiles) {
      for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) {
        const src = (y * t.width + x) * cc, dst = ((t.top + y) * w + (t.left + x)) * 3;
        rgb[dst] = t.items[src]; rgb[dst + 1] = t.items[src + (cc >= 3 ? 1 : 0)]; rgb[dst + 2] = t.items[src + (cc >= 3 ? 2 : 0)];
      }
    }
    const row = Math.ceil((w * 3) / 4) * 4;
    const bmp = Buffer.alloc(54 + row * h);
    bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
    bmp.writeInt32LE(w, 18); bmp.writeInt32LE(-h, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(row * h, 34);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3, d = 54 + y * row + x * 3;
      bmp[d] = rgb[s + 2]; bmp[d + 1] = rgb[s + 1]; bmp[d + 2] = rgb[s];
    }
    return 'data:image/bmp;base64,' + bmp.toString('base64');
  } catch { return null; }
}
