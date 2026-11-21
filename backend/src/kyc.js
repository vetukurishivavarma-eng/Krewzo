// Worker ID check: Aadhaar Secure QR (signed by UIDAI) + a live selfie, then approval.
// Hard stops: unsigned/edited QR, Aadhaar mobile != registered phone, under 18, Aadhaar already on another
// account, blocklisted identity. Everything else is reviewed by ops (or auto-approved while AUTO_KYC=1, but only
// when nothing is flagged and the UIDAI signature was actually checked).
import crypto from 'node:crypto';
import { db, now, SECRET } from './db.js';
import { QrError, ageFrom, mobileMatches, parseSecureQr, photoDataUrl } from './aadhaar.js';
import { ApiError, getWorker, publicWorker } from './service.js';
import { sendPush } from './push.js';
import { notifyOps } from './ops.js';

const fail = (status, message, extra) => { throw new ApiError(status, message, extra); };
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
// Same person, stable across freshly downloaded QRs (the reference id changes every download).
const identityHash = (q) => crypto.createHmac('sha256', SECRET).update([q.aadhaar_last4, norm(q.name).join(' '), q.dob, q.gender].join('|')).digest('hex');

// Loose match: any shared name word of 3+ letters ("Ramu" vs "Ramu Naidu"; "K. Lakshmi" vs "Lakshmi K").
const namesMatch = (a, b) => { const x = new Set(norm(a).filter((w) => w.length >= 3)); return norm(b).some((w) => x.has(w)); };

const MSG = {
  OLD_QR: 'This is an old Aadhaar QR without UIDAI\'s signature. Download a new e-Aadhaar (myaadhaar.uidai.gov.in) or use the mAadhaar app, then scan that QR.',
  NOT_AADHAAR: 'This is not an Aadhaar Secure QR. Scan the large QR code on your Aadhaar card or e-Aadhaar.',
};

function decodeSelfie(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) fail(400, 'Take a selfie to continue');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 5000 || buf.length > 600_000 || buf[0] !== 0xff || buf[1] !== 0xd8) fail(400, 'Selfie photo is not valid, please take it again');
  return buf;
}

export function submitKyc(workerId, { qr, selfie, consent }) {
  const w = getWorker(workerId);
  if (consent !== true) fail(400, 'Please agree to share your Aadhaar details for verification');
  const photoSelfie = decodeSelfie(selfie);
  let q;
  try { q = parseSecureQr(qr); } catch (e) { if (e instanceof QrError) fail(400, MSG[e.message], { code: e.message }); throw e; }

  // Strict mode refuses a failed UIDAI signature outright; otherwise ops review it (until real cards are confirmed to verify).
  if (q.sig_ok === false && process.env.UIDAI_STRICT === '1') fail(400, 'This QR failed UIDAI\'s security check. Scan the QR printed by UIDAI on your Aadhaar or a fresh e-Aadhaar.', { code: 'BAD_SIGNATURE' });
  const mobile = mobileMatches(q, w.phone);
  if (mobile === false) fail(400, `This Aadhaar is linked to a different mobile number. Sign up with the number linked to your Aadhaar.`, { code: 'MOBILE_MISMATCH' });
  const age = ageFrom(q.dob);
  if (age != null && age < 18) fail(400, 'Krewzo partners must be 18 or older.', { code: 'UNDER_18' });

  const hash = identityHash(q);
  if (db.prepare('SELECT 1 FROM kyc_blocklist WHERE identity_hash = ?').get(hash)) fail(403, 'This Aadhaar cannot be used on Krewzo. Call Krewzo help.', { code: 'BLOCKED' });
  const other = db.prepare("SELECT worker_id FROM kyc_submissions WHERE identity_hash = ? AND worker_id != ? AND status != 'REJECTED'").get(hash, w.id);
  if (other) fail(409, 'This Aadhaar is already linked to another Krewzo account. Call Krewzo help.', { code: 'DUPLICATE' });

  const flags = [];
  if (q.sig_ok === null) flags.push('SIGNATURE_NOT_CHECKED'); // no UIDAI certificate installed on the server yet
  if (q.sig_ok === false) flags.push('SIGNATURE_FAILED');
  if (mobile === null) flags.push('NO_MOBILE_IN_QR');
  if (!namesMatch(q.name, w.name)) flags.push('NAME_DIFFERS');
  if (age == null) flags.push('DOB_UNREADABLE');

  const auto = process.env.AUTO_KYC === '1' && flags.length === 0;
  const status = auto ? 'VERIFIED' : 'PENDING';
  db.prepare(`INSERT INTO kyc_submissions (worker_id, status, identity_hash, aadhaar_last4, name, dob, gender, area, qr_version, sig_ok, photo, selfie, flags, submitted_at, reviewed_at, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)
    ON CONFLICT (worker_id) DO UPDATE SET status = excluded.status, identity_hash = excluded.identity_hash, aadhaar_last4 = excluded.aadhaar_last4,
      name = excluded.name, dob = excluded.dob, gender = excluded.gender, area = excluded.area, qr_version = excluded.qr_version, sig_ok = excluded.sig_ok,
      photo = excluded.photo, selfie = excluded.selfie, flags = excluded.flags, submitted_at = excluded.submitted_at, reviewed_at = excluded.reviewed_at, note = NULL`)
    .run(w.id, status, hash, q.aadhaar_last4, q.name, q.dob, q.gender, q.area, q.version, q.sig_ok === true ? 1 : q.sig_ok === false ? 0 : -1, q.photo, photoSelfie, JSON.stringify(flags), now(), auto ? now() : null);
  if (auto) approve(w.id);
  else notifyOps('🪪 New ID check to review', `${w.name} · XXXX ${q.aadhaar_last4}${flags.length ? ' · ' + flags.length + ' flag(s)' : ''}`, 'kyc');
  return kycStatus(w.id);
}

const RESULT_TEXT = {
  EN: ["✅ You're verified!", 'Go on duty to start getting jobs.', 'ID check not approved', 'Open Krewzo to try again, or call Krewzo help.'],
  TE: ['✅ ధృవీకరణ పూర్తి!', 'పనుల కోసం డ్యూటీ ఆన్ చేయండి.', 'ID చెక్ ఆమోదం కాలేదు', 'మళ్ళీ ప్రయత్నించడానికి Krewzo తెరవండి లేదా సహాయానికి కాల్ చేయండి.'],
  HI: ['✅ आप सत्यापित हैं!', 'काम पाने के लिए ड्यूटी चालू करें।', 'ID जाँच मंज़ूर नहीं हुई', 'फिर से कोशिश के लिए Krewzo खोलें या मदद को कॉल करें।'],
};
function tellWorker(workerId, ok) {
  const w = getWorker(workerId);
  const [okT, okB, noT, noB] = RESULT_TEXT[w.language] || RESULT_TEXT.EN;
  sendPush('workers', w, { title: ok ? okT : noT, body: ok ? okB : noB, channel: 'jobs', ttlSec: 7 * 24 * 3600, data: { type: 'kyc', status: ok ? 'VERIFIED' : 'REJECTED' } });
}

function approve(workerId) {
  db.prepare('UPDATE workers SET kyc_verified = 1, photo_url = NULL, photo_token = ? WHERE id = ?').run(crypto.randomBytes(18).toString('base64url'), workerId);
  tellWorker(workerId, true);
}

export function kycStatus(workerId) {
  const k = db.prepare('SELECT status, aadhaar_last4, name, flags, note, submitted_at FROM kyc_submissions WHERE worker_id = ?').get(workerId);
  if (!k) return { status: getWorker(workerId).kyc_verified ? 'VERIFIED' : 'NONE' };
  return { ...k, flags: JSON.parse(k.flags) };
}

// Customers see the verified worker's selfie so they know who is at the door. The link is a random token
// that only appears in that worker's bookings, so photos can't be collected by counting ids.
export function workerPhoto(token) {
  if (!/^[\w-]{20,40}$/.test(token || '')) return null;
  const r = db.prepare("SELECT k.selfie FROM workers w JOIN kyc_submissions k ON k.worker_id = w.id WHERE w.photo_token = ? AND k.status = 'VERIFIED'").get(token);
  return r?.selfie || null;
}

// ---------- ops review ----------
export function listKyc(status = 'PENDING') {
  return db.prepare('SELECT k.*, w.name AS worker_name, w.phone, w.skill_tier, w.trade_tags FROM kyc_submissions k JOIN workers w ON w.id = k.worker_id WHERE k.status = ? ORDER BY k.submitted_at').all(status)
    .map((k) => ({
      worker_id: k.worker_id, worker_name: k.worker_name, phone: k.phone, skill_tier: k.skill_tier, trade_tags: JSON.parse(k.trade_tags),
      status: k.status, aadhaar_last4: k.aadhaar_last4, name: k.name, dob: k.dob, gender: k.gender, area: k.area, qr_version: k.qr_version,
      sig_ok: k.sig_ok === 1, sig_failed: k.sig_ok === 0, flags: JSON.parse(k.flags), submitted_at: k.submitted_at, note: k.note,
      aadhaar_photo: k.photo ? photoDataUrl(Buffer.from(k.photo)) : null,
      selfie: 'data:image/jpeg;base64,' + Buffer.from(k.selfie).toString('base64'),
    }));
}

export function reviewKyc(workerId, { verified, note, block }) {
  const k = db.prepare('SELECT identity_hash FROM kyc_submissions WHERE worker_id = ?').get(workerId);
  if (verified) {
    if (k) db.prepare("UPDATE kyc_submissions SET status = 'VERIFIED', reviewed_at = ?, note = ? WHERE worker_id = ?").run(now(), note || null, workerId);
    approve(workerId);
  } else {
    if (k) db.prepare("UPDATE kyc_submissions SET status = 'REJECTED', reviewed_at = ?, note = ? WHERE worker_id = ?").run(now(), note || null, workerId);
    db.prepare('UPDATE workers SET kyc_verified = 0, is_online = 0, photo_token = NULL WHERE id = ?').run(workerId);
    tellWorker(workerId, false);
    if (block && k) db.prepare('INSERT OR IGNORE INTO kyc_blocklist (identity_hash, reason, created_at) VALUES (?,?,?)').run(k.identity_hash, note || 'blocked by ops', now());
  }
  return publicWorker(getWorker(workerId));
}

// Ops/testing: send a worker back through the ID check (e.g. accounts approved before Aadhaar checks existed).
export function resetKyc(phone) {
  const w = db.prepare('SELECT id FROM workers WHERE phone = ?').get(String(phone).replace(/\D/g, '').slice(-10));
  if (!w) throw new ApiError(404, 'No partner with that phone number');
  db.prepare('DELETE FROM kyc_submissions WHERE worker_id = ?').run(w.id);
  db.prepare('UPDATE workers SET kyc_verified = 0, is_online = 0, photo_url = NULL, photo_token = NULL WHERE id = ?').run(w.id);
  return publicWorker(getWorker(w.id));
}

// ---------- police verification (optional "Police verified" badge) ----------
// The worker uploads a photo of their Police Clearance Certificate (from their state police portal or station);
// ops check it and the badge shows to customers for a year.
const POLICE_VALID_DAYS = 365;

export function submitPolice(workerId, { image }) {
  const w = getWorker(workerId);
  if (!w.kyc_verified) fail(409, 'Finish the Aadhaar check first');
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(image || '');
  if (!m) fail(400, 'Take a photo of the certificate');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length < 10000 || buf.length > 900_000 || buf[0] !== 0xff || buf[1] !== 0xd8) fail(400, 'Photo is not clear enough, please take it again');
  db.prepare(`INSERT INTO police_checks (worker_id, status, image, submitted_at) VALUES (?,?,?,?)
    ON CONFLICT (worker_id) DO UPDATE SET status = 'PENDING', image = excluded.image, submitted_at = excluded.submitted_at, reviewed_at = NULL, note = NULL`).run(w.id, 'PENDING', buf, now());
  notifyOps('👮 Police certificate to check', `${w.name} · +91 ${w.phone}`, 'police');
  return policeStatus(w.id);
}

export function policeStatus(workerId) {
  const r = db.prepare('SELECT status, submitted_at, reviewed_at, valid_until, note FROM police_checks WHERE worker_id = ?').get(workerId);
  if (!r) return { status: 'NONE' };
  if (r.status === 'VERIFIED' && Date.parse(r.valid_until) < Date.now()) return { ...r, status: 'EXPIRED' };
  return r;
}

export const policeVerified = (workerId) => policeStatus(workerId).status === 'VERIFIED';

export function listPolice(status = 'PENDING') {
  return db.prepare('SELECT p.*, w.name, w.phone, k.selfie FROM police_checks p JOIN workers w ON w.id = p.worker_id LEFT JOIN kyc_submissions k ON k.worker_id = p.worker_id WHERE p.status = ? ORDER BY p.submitted_at').all(status)
    .map((r) => ({ worker_id: r.worker_id, name: r.name, phone: r.phone, status: r.status, submitted_at: r.submitted_at, note: r.note,
      image: 'data:image/jpeg;base64,' + Buffer.from(r.image).toString('base64'),
      selfie: r.selfie ? 'data:image/jpeg;base64,' + Buffer.from(r.selfie).toString('base64') : null }));
}

export function reviewPolice(workerId, { verified, note }) {
  const r = db.prepare('SELECT 1 FROM police_checks WHERE worker_id = ?').get(workerId);
  if (!r) fail(404, 'No police certificate from this worker');
  const until = verified ? new Date(Date.now() + POLICE_VALID_DAYS * 864e5).toISOString() : null;
  db.prepare('UPDATE police_checks SET status = ?, reviewed_at = ?, valid_until = ?, note = ? WHERE worker_id = ?').run(verified ? 'VERIFIED' : 'REJECTED', now(), until, note || null, workerId);
  const w = getWorker(workerId);
  sendPush('workers', w, { title: verified ? '👮 Police verified!' : 'Police certificate not accepted',
    body: verified ? 'Customers now see the Police verified badge on your profile.' : (note || 'Please upload a clear photo of a valid certificate.'), channel: 'jobs', ttlSec: 7 * 86400, data: { type: 'police' } });
  return policeStatus(workerId);
}
