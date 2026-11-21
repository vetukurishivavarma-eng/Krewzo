// Trust & safety: jobs nobody takes, workers who don't show, strikes, problem reports (with payment hold),
// SOS alerts, workers rating customers, and limits that make fake / spam bookings costly.
import { BOOKING_STATUS as S } from '@krewzo/shared';
import { db, now, tx } from './db.js';
import * as svc from './service.js';
import { sendPush } from './push.js';
import { notifyOps } from './ops.js';

const fail = (status, msg, extra) => { throw new svc.ApiError(status, msg, extra); };
const ago = (min) => new Date(Date.now() - min * 60e3).toISOString();
const ahead = (min) => new Date(Date.now() + min * 60e3).toISOString();

export const RULES = {
  NO_WORKER_MIN: 15,         // keep searching at least this long before giving up
  FILL_BEFORE_SLOT_MIN: 60,  // a scheduled job still unassigned this close to its slot is cancelled + refunded
  NOSHOW_INSTANT_MIN: 45,    // instant job: worker must arrive within this of accepting
  NOSHOW_SCHEDULED_MIN: 30,  // scheduled job: worker must arrive within this after the slot starts
  CUSTOMER_LATE_MIN: 30,     // customer may report "worker isn't coming" after this
  STRIKES_TO_SUSPEND: 3, STRIKE_WINDOW_DAYS: 30, SUSPEND_DAYS: 7,
  BOOKINGS_PER_HOUR: 6, MAX_SEARCHING_TICKETS: 20, FREE_CANCELS_PER_DAY: 5,
};

// ---------- jobs nobody takes / workers who don't come (run every minute) ----------
export function sweep() {
  const stuck = db.prepare(`SELECT * FROM bookings WHERE status = 'SEARCHING' AND COALESCE(searching_since, created_at) < ?
    AND (scheduled_at IS NULL OR scheduled_at < ?)`).all(ago(RULES.NO_WORKER_MIN), ahead(RULES.FILL_BEFORE_SLOT_MIN));
  for (const b of stuck) { try { noWorker(svc.getBooking(b.id)); } catch (e) { console.error('sweep no-worker', b.id, e.message); } }

  const late = db.prepare(`SELECT id FROM bookings WHERE status = 'ASSIGNED' AND (
    (scheduled_at IS NULL AND assigned_at < ?) OR (scheduled_at IS NOT NULL AND scheduled_at < ?))`).all(ago(RULES.NOSHOW_INSTANT_MIN), ago(RULES.NOSHOW_SCHEDULED_MIN));
  for (const b of late) { try { noShow(svc.getBooking(b.id), 'AUTO'); } catch (e) { console.error('sweep no-show', b.id, e.message); } }
  return { cancelled: stuck.length, released: late.length };
}

function noWorker(b) {
  const nb = tx(() => {
    const x = svc.transition(b, S.CANCELLED, { cancelled_at: now(), cancel_reason: 'NO_WORKER' });
    db.prepare("UPDATE escrow_ledger SET status = 'REFUNDED', tx_ref = ?, updated_at = ? WHERE booking_id = ? AND status = 'HELD'").run(svc.ref('RFD'), now(), x.id);
    return x;
  });
  svc.expireOffers(nb.id);
  svc.broadcast(nb);
  svc.pushCustomer(nb, 'No worker free right now', `Sorry, nobody nearby could take it. ₹${nb.escrow_total} is fully refunded. Try again in a little while.`);
}

function noShow(b, by) {
  const w = svc.getWorker(b.worker_id);
  const nb = svc.transition(b, S.SEARCHING, { worker_id: null, assigned_at: null, assigned_lat: null, assigned_lng: null, start_handshake: null, handshake_fails: 0, searching_since: now() });
  db.prepare("UPDATE job_offers SET status = 'RELEASED' WHERE booking_id = ? AND worker_id = ?").run(nb.id, w.id);
  const strikes = addStrike(w.id, nb.id, by === 'CUSTOMER' ? 'NO_SHOW_REPORTED' : 'NO_SHOW');
  sendPush('workers', w, { title: '⚠️ Job removed: you did not arrive', body: `Strike ${strikes} of ${RULES.STRIKES_TO_SUSPEND}. Tap "Can't come" early if you can't make it.`, channel: 'jobs', ttlSec: 86400, data: { type: 'strike' } });
  svc.broadcast(nb);
  svc.pushCustomer(nb, 'Finding you another worker', `${w.name} didn't arrive in time. Your money is still safe in escrow.`);
  svc.dispatch(nb);
  return nb;
}

// Customer: "Worker isn't coming" (only once they are clearly late).
export function reportNoShow(customerId, bookingId) {
  const b = svc.getBooking(bookingId);
  if (!b || b.customer_id !== customerId) fail(404, 'Booking not found');
  if (b.status !== S.ASSIGNED) fail(409, 'The worker has already arrived or left this job');
  const due = Date.parse(b.scheduled_at || b.assigned_at) + (b.scheduled_at ? 0 : RULES.CUSTOMER_LATE_MIN * 60e3);
  if (Date.now() < due) fail(409, b.scheduled_at ? 'You can report this once the booked time has started' : `You can report this ${RULES.CUSTOMER_LATE_MIN} minutes after the worker accepted`);
  return svc.viewFor(noShow(b, 'CUSTOMER'), 'customer');
}

// ---------- strikes ----------
export function addStrike(workerId, bookingId, reason) {
  db.prepare('INSERT INTO worker_strikes (worker_id, booking_id, reason, created_at) VALUES (?,?,?,?)').run(workerId, bookingId, reason, now());
  const n = db.prepare('SELECT COUNT(*) AS n FROM worker_strikes WHERE worker_id = ? AND created_at > ?').get(workerId, ago(RULES.STRIKE_WINDOW_DAYS * 1440)).n;
  if (n >= RULES.STRIKES_TO_SUSPEND) {
    db.prepare('UPDATE workers SET suspended_until = ?, is_online = 0 WHERE id = ?').run(ahead(RULES.SUSPEND_DAYS * 1440), workerId);
    sendPush('workers', svc.getWorker(workerId), { title: 'Account paused for 7 days', body: `${n} strikes in 30 days. Call Krewzo help if this is a mistake.`, channel: 'jobs', ttlSec: 7 * 86400, data: { type: 'suspended' } });
  }
  return n;
}
export const isSuspended = (w) => !!w?.suspended_until && Date.parse(w.suspended_until) > Date.now();

// ---------- problem reports / disputes ----------
const CATEGORIES = {
  customer: ['NOT_DONE', 'POOR_QUALITY', 'SAFETY', 'ASKED_EXTRA_MONEY', 'DAMAGE', 'OTHER'],
  worker: ['NOT_PAID_EXTRA_WORK', 'UNSAFE', 'ABUSIVE', 'WRONG_JOB', 'OTHER'],
};
const HOLD_STATUSES = [S.ARRIVED, S.IN_PROGRESS]; // payment not released yet: a customer report puts it on hold

export function reportProblem(role, userId, bookingId, { category, details }) {
  const b = svc.getBooking(bookingId);
  if (!b || (role === 'customer' ? b.customer_id : b.worker_id) !== userId) fail(404, 'Booking not found');
  if (!CATEGORIES[role].includes(category)) fail(400, 'Pick what went wrong');
  if (![S.ASSIGNED, S.ARRIVED, S.IN_PROGRESS, S.COMPLETED, S.PAID_OUT].includes(b.status)) fail(409, 'You can report a problem on an active or finished job');
  if (b.status === S.PAID_OUT && Date.now() - Date.parse(b.paid_out_at) > 3 * 864e5) fail(409, 'Reports can be made up to 3 days after the job');
  if (db.prepare("SELECT 1 FROM reports WHERE booking_id = ? AND reporter_role = ? AND status = 'OPEN'").get(b.id, role)) fail(409, 'You already reported this job. Krewzo will contact you.');
  const text = String(details || '').trim().slice(0, 1000);
  const hold = role === 'customer' && HOLD_STATUSES.includes(b.status);
  db.prepare('INSERT INTO reports (booking_id, reporter_role, reporter_id, category, details, payment_held, status, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(b.id, role, userId, category, text, hold ? 1 : 0, 'OPEN', now());
  if (hold) {
    db.prepare('UPDATE bookings SET disputed = 1 WHERE id = ?').run(b.id);
    sendPush('workers', svc.getWorker(b.worker_id), { title: 'Payment on hold', body: 'The customer reported a problem with this job. Krewzo will call you to sort it out.', channel: 'jobs', ttlSec: 86400, data: { type: 'dispute', booking_id: b.id } });
    svc.broadcast(svc.getBooking(b.id));
  }
  notifyOps(`⚠️ Problem reported by ${role}`, `${category.replace(/_/g, ' ').toLowerCase()} · job #${b.id}${hold ? ' · payment on hold' : ''}`, 'reports');
  return { ok: true, payment_held: hold };
}

export function listReports(status = 'OPEN') {
  return db.prepare(`SELECT r.*, b.status AS booking_status, b.trade_tag, b.duration, b.address, b.escrow_total, b.worker_payout, b.disputed,
      u.name AS customer_name, u.phone AS customer_phone, w.name AS worker_name, w.phone AS worker_phone
    FROM reports r JOIN bookings b ON b.id = r.booking_id JOIN users u ON u.id = b.customer_id LEFT JOIN workers w ON w.id = b.worker_id
    WHERE r.status = ? ORDER BY r.created_at DESC`).all(status);
}

// Ops decision. PAY_WORKER releases a held payment; REFUND returns it to the customer; CLOSE just closes.
export function resolveReport(reportId, { action, note, strike }) {
  const r = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  if (!r) fail(404, 'Report not found');
  if (r.status !== 'OPEN') fail(409, 'Already resolved');
  if (!['PAY_WORKER', 'REFUND', 'CLOSE'].includes(action)) fail(400, 'Pick an action');
  let b = svc.getBooking(r.booking_id);
  tx(() => {
    if (action === 'PAY_WORKER') {
      if (b.status === S.IN_PROGRESS) b = svc.transition(b, S.COMPLETED, { completed_at: now() });
      if (b.status !== S.COMPLETED) fail(409, 'Only work that has started can be paid');
      ({ b } = svc.releaseEscrow(b));
    } else if (action === 'REFUND') {
      if (![S.ARRIVED, S.IN_PROGRESS, S.COMPLETED].includes(b.status)) fail(409, 'This payment was already released or refunded');
      db.prepare("UPDATE bookings SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = 'DISPUTE' WHERE id = ?").run(now(), b.id);
      db.prepare("UPDATE escrow_ledger SET status = 'REFUNDED', tx_ref = ?, updated_at = ? WHERE booking_id = ? AND status = 'HELD'").run(svc.ref('RFD'), now(), b.id);
    }
    db.prepare("UPDATE reports SET status = 'RESOLVED', resolution = ?, note = ?, resolved_at = ? WHERE booking_id = ? AND status = 'OPEN'").run(action, note || null, now(), b.id);
    db.prepare('UPDATE bookings SET disputed = 0 WHERE id = ?').run(b.id);
  });
  if (strike && b.worker_id) addStrike(b.worker_id, b.id, 'DISPUTE');
  const nb = svc.getBooking(b.id);
  svc.broadcast(nb);
  if (action === 'REFUND') svc.pushCustomer(nb, 'Refund done', `₹${nb.escrow_total} is refunded for the job you reported.`);
  if (action === 'PAY_WORKER' && nb.worker_id) sendPush('workers', svc.getWorker(nb.worker_id), { title: 'Payment released', body: `₹${nb.worker_payout} sent to your UPI after review.`, channel: 'jobs', ttlSec: 86400, data: { type: 'paid' } });
  return { ok: true, booking: svc.viewFor(nb, 'customer') };
}

// ---------- SOS ----------
export function raiseSos(role, userId, { booking_id, lat, lng }) {
  const b = booking_id ? svc.getBooking(Number(booking_id)) : null;
  if (b && (role === 'customer' ? b.customer_id : b.worker_id) !== userId) fail(404, 'Booking not found');
  const ok = (v, m) => (Number.isFinite(Number(v)) && Math.abs(Number(v)) <= m ? Number(v) : null);
  db.prepare('INSERT INTO sos_alerts (booking_id, role, user_id, lat, lng, created_at) VALUES (?,?,?,?,?,?)').run(b?.id ?? null, role, userId, ok(lat, 90), ok(lng, 180), now());
  console.error(`SOS from ${role} ${userId} booking ${b?.id ?? '-'} at ${lat},${lng}`); // shows in the Render log stream too
  const who = role === 'customer' ? svc.getUser(userId) : svc.getWorker(userId);
  notifyOps('🚨 SOS: call now', `${role} ${who?.name || ''} · +91 ${who?.phone || '?'}${b ? ' · job #' + b.id : ''}`, 'sos', { urgent: true });
  return { ok: true };
}
export function listSos() {
  return db.prepare(`SELECT s.*, CASE s.role WHEN 'customer' THEN u.name ELSE w.name END AS name, CASE s.role WHEN 'customer' THEN u.phone ELSE w.phone END AS phone, b.address
    FROM sos_alerts s LEFT JOIN users u ON s.role = 'customer' AND u.id = s.user_id LEFT JOIN workers w ON s.role = 'worker' AND w.id = s.user_id
    LEFT JOIN bookings b ON b.id = s.booking_id WHERE s.handled_at IS NULL ORDER BY s.created_at DESC`).all();
}
export const handleSos = (id) => { db.prepare('UPDATE sos_alerts SET handled_at = ? WHERE id = ?').run(now(), id); return { ok: true }; };

// ---------- workers rate customers ----------
export function rateCustomer(workerId, bookingId, stars) {
  const b = svc.getBooking(bookingId);
  if (!b || b.worker_id !== workerId) fail(404, 'Job not found');
  if (b.status !== S.PAID_OUT) fail(409, 'You can rate the customer after you are paid');
  if (b.worker_rating) fail(409, 'Already rated');
  const s = Number(stars);
  if (!Number.isInteger(s) || s < 1 || s > 5) fail(400, 'Rating must be 1-5');
  tx(() => {
    db.prepare('UPDATE bookings SET worker_rating = ? WHERE id = ?').run(s, b.id);
    db.prepare('UPDATE users SET rating = ROUND((rating * (rating_count + 1) + ?) / (rating_count + 2), 2), rating_count = rating_count + 1 WHERE id = ?').run(s, b.customer_id);
  });
  return { ok: true };
}

// ---------- spam limits (called by createBookings) ----------
export function checkBookingLimits(customerId, workerCount) {
  const hour = db.prepare('SELECT COUNT(*) AS n FROM booking_groups WHERE customer_id = ? AND created_at > ?').get(customerId, ago(60)).n;
  if (hour >= RULES.BOOKINGS_PER_HOUR) fail(429, 'Too many bookings in the last hour. Please wait a little.', { code: 'RATE_LIMIT' });
  const searching = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND status = 'SEARCHING'").get(customerId).n;
  if (searching + workerCount > RULES.MAX_SEARCHING_TICKETS) fail(429, `You already have ${searching} workers being searched for. Wait for those first.`, { code: 'RATE_LIMIT' });
  const cancels = db.prepare("SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND status = 'CANCELLED' AND cancel_fee = 0 AND COALESCE(cancel_reason, '') = '' AND cancelled_at > ?").get(customerId, ago(1440)).n;
  if (cancels >= RULES.FREE_CANCELS_PER_DAY) fail(429, 'Too many cancelled bookings today. You can book again tomorrow, or call Krewzo help.', { code: 'RATE_LIMIT' });
}

// ---------- login limits (survive restarts) ----------
const MAX_PIN_TRIES = 5, PIN_LOCK_MS = 15 * 60e3, IP_WINDOW_MS = 15 * 60e3;
const IP_MAX = Number(process.env.AUTH_IP_MAX) || 40; // login attempts per network per 15 min
export function verifyPinLimited(key, ok) {
  const t = Date.now();
  const f = db.prepare('SELECT n, until FROM auth_limits WHERE key = ?').get(key);
  if (f?.until > t) fail(429, `Too many wrong PINs. Try again in ${Math.ceil((f.until - t) / 60e3)} min`);
  if (ok) { db.prepare('DELETE FROM auth_limits WHERE key = ?').run(key); return; }
  const n = f && !f.until ? f.n + 1 : 1; // first miss, or the previous lock has expired
  const until = n >= MAX_PIN_TRIES ? t + PIN_LOCK_MS : 0;
  db.prepare('INSERT INTO auth_limits (key, n, until) VALUES (?,?,?) ON CONFLICT (key) DO UPDATE SET n = excluded.n, until = excluded.until').run(key, n, until);
  const left = MAX_PIN_TRIES - n;
  fail(left ? 401 : 429, left ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left` : 'Too many wrong PINs. Try again in 15 min');
}
// Per network: slows down anyone trying lots of numbers (to find registered ones) or lots of PINs.
export function limitIp(ip) {
  const key = 'ip:' + ip, t = Date.now();
  const f = db.prepare('SELECT n, until FROM auth_limits WHERE key = ?').get(key); // `until` = window end here
  if (!f || f.until < t) { db.prepare('INSERT INTO auth_limits (key, n, until) VALUES (?,1,?) ON CONFLICT (key) DO UPDATE SET n = 1, until = excluded.until').run(key, t + IP_WINDOW_MS); return; }
  if (f.n >= IP_MAX) fail(429, 'Too many login attempts from this network. Try again in a few minutes.');
  db.prepare('UPDATE auth_limits SET n = n + 1 WHERE key = ?').run(key);
}
