import crypto from 'node:crypto';
import {
  ACTIVE_STATUSES, BOOKING_STATUS as S, DISPATCH_RADIUS_KM, DURATIONS, GSTIN_RE, HANDSHAKE_MAX_FAILS,
  SKILL_TIERS, SLOTS, TRADE_TAGS, UPI_RE, canTransition, cancelFee, haversineKm, quotePrice,
} from '@krewzo/shared';
import { db, now, tx } from './db.js';
import { newHandshake, checkHandshake } from './handshake.js';
import { sendPush } from './push.js';
import { businessFor, checkMonthly } from './business.js';

export class ApiError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}
const fail = (status, msg, extra) => { throw new ApiError(status, msg, extra); };

// Realtime hooks, wired by app.js (Socket.io) and whatsapp.js.
const hooks = { emit: () => {}, isConnected: () => false, notifyWhatsApp: () => {} };
export const setHooks = (h) => Object.assign(hooks, h);

const ref = (p) => p + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();

// ---------- reads ----------
const parseBooking = (r) => r && {
  ...r,
  addons: JSON.parse(r.addons),
  start_handshake: r.start_handshake ? JSON.parse(r.start_handshake) : null,
  end_handshake: r.end_handshake ? JSON.parse(r.end_handshake) : null,
};
const parseWorker = (r) => r && { ...r, trade_tags: JSON.parse(r.trade_tags), is_online: !!r.is_online, kyc_verified: !!r.kyc_verified };
const parseUser = (r) => r && { ...r, addresses: JSON.parse(r.addresses) };

export const getBooking = (id) => parseBooking(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id));
export const getWorker = (id) => parseWorker(db.prepare('SELECT * FROM workers WHERE id = ?').get(id));
export const getWorkerByPhone = (p) => parseWorker(db.prepare('SELECT * FROM workers WHERE phone = ?').get(p));
export const getUser = (id) => parseUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
const getEscrow = (bookingId) => db.prepare('SELECT * FROM escrow_ledger WHERE booking_id = ?').get(bookingId);

export function publicWorker(w) {
  if (!w) return null;
  const { pin_hash, fcm_token, ...rest } = w;
  return { ...rest, push_ok: !!fcm_token }; // the token itself never leaves the server
}
export function publicUser(u) {
  if (!u) return null;
  const { pin_hash, fcm_token, ...rest } = u;
  return rest;
}

// Customers see the handshake codes; workers never do (they must get them from the customer in person).
export function viewFor(b, role) {
  if (!b) return null;
  const out = { ...b, escrow: getEscrow(b.id) };
  const w = b.worker_id ? getWorker(b.worker_id) : null;
  out.worker = w && { id: w.id, name: w.name, phone: w.phone, photo_url: w.photo_url, rating: w.rating, kyc_verified: w.kyc_verified, skill_tier: w.skill_tier, lat: w.lat, lng: w.lng,
    // UPI only after the job is paid out (for tips): wages must go through escrow, never direct.
    ...(b.status === S.PAID_OUT && { upi_id: w.upi_id }) };
  if (role === 'worker') {
    delete out.start_handshake; delete out.end_handshake;
    const c = getUser(b.customer_id);
    out.customer = { name: c.name, phone: ACTIVE_STATUSES.includes(b.status) ? c.phone : null };
  } else {
    for (const k of ['start_handshake', 'end_handshake']) if (out[k]) { const { signature, ...hs } = out[k]; out[k] = hs; }
  }
  return out;
}

function broadcast(b) {
  hooks.emit(`customer:${b.customer_id}`, 'booking:update', viewFor(b, 'customer'));
  if (b.worker_id) hooks.emit(`worker:${b.worker_id}`, 'booking:update', viewFor(b, 'worker'));
}

// Optimistic, state-machine-checked update. Throws if the booking moved under us.
function transition(b, to, patch = {}) {
  if (!canTransition(b.status, to)) fail(409, `Cannot go from ${b.status} to ${to}`);
  const cols = { ...patch, status: to };
  const keys = Object.keys(cols);
  const vals = keys.map((k) => (cols[k] !== null && typeof cols[k] === 'object' ? JSON.stringify(cols[k]) : cols[k]));
  const r = db.prepare(`UPDATE bookings SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND status = ?`).run(...vals, b.id, b.status);
  if (r.changes !== 1) fail(409, 'Booking changed, refresh and try again');
  return getBooking(b.id);
}

// ---------- customer: create + pay into escrow ----------
export function createBookings(customer, input) {
  const { skill_tier, trade_tag, duration, booking_mode, lat, lng, address, upi_id } = input;
  const worker_count = Number(input.worker_count ?? 1);
  if (!SKILL_TIERS[skill_tier]) fail(400, 'Pick a skill tier');
  if (!TRADE_TAGS[trade_tag] || TRADE_TAGS[trade_tag].tier !== skill_tier) fail(400, 'Pick a task for this tier');
  if (!DURATIONS[duration]) fail(400, 'Pick a duration');
  if (!['INSTANT', 'SCHEDULED'].includes(booking_mode)) fail(400, 'Pick instant or scheduled');
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) fail(400, 'Set the location pin');
  if (!address || String(address).trim().length < 3) fail(400, 'Enter the address');
  // Krewzo Business: plan discount, wider worker search, and the option to put the job on the monthly bill.
  const biz = businessFor(customer.id);
  const pay_mode = input.pay_mode === 'MONTHLY' ? 'MONTHLY' : 'UPI';
  if (pay_mode === 'MONTHLY' && !biz) fail(402, 'Monthly billing needs a Krewzo Business plan');
  if (pay_mode === 'UPI' && !UPI_RE.test(upi_id || '')) fail(400, 'Enter a valid UPI ID (name@bank)');

  let scheduled_at = null;
  if (booking_mode === 'SCHEDULED') {
    const slot = SLOTS[input.slot];
    if (!slot || !/^\d{4}-\d{2}-\d{2}$/.test(input.scheduled_date || '')) fail(400, 'Pick a date and slot');
    scheduled_at = new Date(`${input.scheduled_date}T${slot.time}:00+05:30`).toISOString();
    if (new Date(scheduled_at) <= new Date()) fail(400, 'That slot has already passed');
  }

  const account_type = biz || input.account_type === 'BUSINESS' ? 'BUSINESS' : 'PERSONAL';
  const gstin = biz ? biz.gstin : account_type === 'BUSINESS' ? String(input.gstin || '').toUpperCase().trim() : null;
  if (account_type === 'BUSINESS' && !GSTIN_RE.test(gstin)) fail(400, 'Enter a valid 15-character GSTIN');
  const business_name = biz ? biz.business_name : account_type === 'BUSINESS' ? String(input.business_name || '').trim() || customer.name : null;

  let q;
  try { q = quotePrice({ skill_tier, duration, worker_count, addons: input.addons || [], insurance: !!input.insurance, fee_discount: biz?.info.fee_off || 0 }); }
  catch (e) { fail(400, e.message); }
  if (pay_mode === 'MONTHLY') checkMonthly(biz, q.total.escrow_total);
  const payer = pay_mode === 'MONTHLY' ? 'monthly-bill' : upi_id;
  const dispatch_km = biz?.info.radius_km || DISPATCH_RADIUS_KM;

  // Simulated UPI collect: the payment succeeds and every rupee lands in escrow, one ledger row per worker ticket.
  const payment_ref = ref('PAY');
  const t = now();
  const ids = tx(() => {
    const g = db.prepare(`INSERT INTO booking_groups (customer_id, account_type, gstin, business_name, worker_count, amount_total, payer_upi, payment_ref, created_at, pay_mode, billed_to)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(customer.id, account_type, gstin, business_name, worker_count, q.total.escrow_total, payer, pay_mode === 'MONTHLY' ? ref('MBL') : payment_ref, t, pay_mode, biz?.owner_id ?? null);
    const groupId = Number(g.lastInsertRowid);
    const p = q.per_worker;
    const ins = db.prepare(`INSERT INTO bookings (group_id, customer_id, skill_tier, trade_tag, worker_count, booking_mode, scheduled_at, duration, lat, lng, address, addons,
      base_wage, addons_total, platform_fee, gst_amount, insurance_fee, worker_payout, escrow_total, status, created_at, dispatch_km)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const esc = db.prepare(`INSERT INTO escrow_ledger (booking_id, amount_held, worker_payout, platform_fee, status, tx_ref, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`);
    const out = [];
    for (let i = 0; i < worker_count; i++) {
      const r = ins.run(groupId, customer.id, skill_tier, trade_tag, worker_count, booking_mode, scheduled_at, duration, lat, lng, String(address).trim(),
        JSON.stringify(q.addons), p.base_wage, p.addons_total, p.platform_fee, p.gst_amount, p.insurance_fee, p.worker_payout, p.escrow_total, S.SEARCHING, t, dispatch_km);
      const id = Number(r.lastInsertRowid);
      esc.run(id, p.escrow_total, p.worker_payout, p.escrow_total - p.worker_payout, 'HELD', payment_ref, t, t);
      out.push(id);
    }
    // Remember the address and B2B details for next time.
    const label = String(input.address_label || 'Recent').slice(0, 30);
    const addresses = [{ label, lat, lng, address: String(address).trim() }, ...customer.addresses.filter((a) => a.label !== label)].slice(0, 5);
    db.prepare('UPDATE users SET account_type = ?, gstin = COALESCE(?, gstin), business_name = COALESCE(?, business_name), addresses = ? WHERE id = ?')
      .run(account_type, gstin, business_name, JSON.stringify(addresses), customer.id);
    return { groupId, out };
  });
  ids.out.forEach((id) => dispatch(getBooking(id)));
  return getGroup(customer.id, ids.groupId);
}

export function getGroup(customerId, groupId) {
  const g = db.prepare('SELECT * FROM booking_groups WHERE id = ? AND customer_id = ?').get(groupId, customerId);
  if (!g) fail(404, 'Booking not found');
  const tickets = db.prepare('SELECT * FROM bookings WHERE group_id = ? ORDER BY id').all(groupId).map((r) => viewFor(parseBooking(r), 'customer'));
  return { ...g, tickets };
}

export function listGroups(customerId) {
  const groups = db.prepare('SELECT id FROM booking_groups WHERE customer_id = ? ORDER BY id DESC LIMIT 30').all(customerId);
  return groups.map((g) => getGroup(customerId, g.id));
}

// ---------- geo dispatch ----------
const isBusy = (workerId) => !!db.prepare(`SELECT 1 FROM bookings WHERE worker_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`).get(workerId, ...ACTIVE_STATUSES);

function eligible(w, b) {
  if (!w.is_online || !w.kyc_verified || w.lat == null) return null;
  if (SKILL_TIERS[w.skill_tier].rank < SKILL_TIERS[b.skill_tier].rank) return null;
  if (b.skill_tier !== 'TIER_1' && !w.trade_tags.includes(b.trade_tag)) return null;
  const d = haversineKm(w, b);
  return d <= (b.dispatch_km || DISPATCH_RADIUS_KM) ? d : null; // Business Pro searches wider
}

// Before accepting, the worker sees the customer's first name and locality only (full address after accept).
const area = (addr) => addr.split(',').map((x) => x.trim()).filter(Boolean).slice(-2).join(', ');
// An offer rings for 30 s; after that it counts as missed (same as skip: never re-offered, because every
// location ping re-runs dispatch and would ring the phone forever).
export const OFFER_TTL_S = Number(process.env.OFFER_TTL_S) || 30; // tests shorten it
const offerExpiry = (offeredAt) => new Date(Date.parse(offeredAt) + OFFER_TTL_S * 1000).toISOString();

export function offerView(b, distance_km, offeredAt = now()) {
  return {
    booking_id: b.id, payout: b.worker_payout, distance_km: Math.round(distance_km * 10) / 10, duration: b.duration,
    trade_tag: b.trade_tag, skill_tier: b.skill_tier, booking_mode: b.booking_mode, scheduled_at: b.scheduled_at, addons: b.addons,
    customer_name: (getUser(b.customer_id)?.name || '').split(' ')[0], area: area(b.address), expires_at: offerExpiry(offeredAt),
  };
}

// Data-only: the partner app's native service rings full-screen / shows the island itself, in the worker's language.
const offerPush = (o) => ({ dataOnly: true, data: { type: 'job_offer', ...o, addons: o.addons.join(','), scheduled_at: o.scheduled_at || '' } });

function offer(w, b, d) {
  const prev = db.prepare('SELECT status FROM job_offers WHERE booking_id = ? AND worker_id = ?').get(b.id, w.id);
  if (prev && prev.status !== 'EXPIRED') return false; // never re-offer a job the worker skipped or dropped
  const at = now();
  db.prepare(`INSERT INTO job_offers (booking_id, worker_id, status, distance_km, created_at) VALUES (?,?,?,?,?)
    ON CONFLICT (booking_id, worker_id) DO UPDATE SET status = 'OFFERED', distance_km = excluded.distance_km, created_at = excluded.created_at`)
    .run(b.id, w.id, 'OFFERED', d, at);
  const o = offerView(b, d, at);
  setTimeout(() => missOffer(w.id, b.id, at), OFFER_TTL_S * 1000 + 1500).unref();
  hooks.emit(`worker:${w.id}`, 'job:offer', o);
  sendPush('workers', w, offerPush(o));
  if (!hooks.isConnected(w.id)) hooks.notifyWhatsApp(w, 'offer', o);
  return true;
}

// Offer one SEARCHING ticket to every eligible free worker within 3 km.
export function dispatch(b) {
  if (b.status !== S.SEARCHING) return 0;
  const workers = db.prepare('SELECT * FROM workers WHERE is_online = 1 AND kyc_verified = 1').all().map(parseWorker);
  let n = 0;
  for (const w of workers) {
    const d = eligible(w, b);
    if (d != null && !isBusy(w.id) && offer(w, b, d)) n++;
  }
  return n;
}

// A worker just became free (went online / finished / moved): show them open jobs nearby.
export function dispatchToWorker(workerId) {
  const w = getWorker(workerId);
  if (!w || isBusy(w.id)) return 0;
  const open = db.prepare("SELECT * FROM bookings WHERE status = 'SEARCHING' ORDER BY id").all().map(parseBooking);
  let n = 0;
  for (const b of open) { const d = eligible(w, b); if (d != null && offer(w, b, d)) n++; }
  return n;
}

const fresh = (offeredAt) => Date.now() < Date.parse(offerExpiry(offeredAt)) + 1500;

export function openOffers(workerId) {
  return db.prepare(`SELECT b.*, o.distance_km, o.created_at AS offered_at FROM job_offers o JOIN bookings b ON b.id = o.booking_id
    WHERE o.worker_id = ? AND o.status = 'OFFERED' AND b.status = 'SEARCHING' ORDER BY o.created_at DESC`).all(workerId)
    .filter((r) => fresh(r.offered_at)) // the timer below may not have fired yet (or the server restarted)
    .map((r) => offerView(parseBooking(r), r.distance_km, r.offered_at));
}

// Timer ran out: drop it on the worker's phone (app via socket, island / lock screen via push).
function missOffer(workerId, bookingId, offeredAt) {
  const r = db.prepare("UPDATE job_offers SET status = 'SKIPPED' WHERE booking_id = ? AND worker_id = ? AND status = 'OFFERED' AND created_at = ?").run(bookingId, workerId, offeredAt);
  if (!r.changes) return; // accepted, skipped or taken already
  hooks.emit(`worker:${workerId}`, 'job:taken', { booking_id: bookingId });
  sendPush('workers', getWorker(workerId), { dataOnly: true, ttlSec: 60, data: { type: 'job_taken', booking_id: bookingId } });
}

function expireOffers(bookingId, exceptWorker) {
  const others = db.prepare("SELECT worker_id FROM job_offers WHERE booking_id = ? AND status = 'OFFERED' AND worker_id != ?").all(bookingId, exceptWorker ?? -1);
  db.prepare("UPDATE job_offers SET status = 'EXPIRED' WHERE booking_id = ? AND status = 'OFFERED' AND worker_id != ?").run(bookingId, exceptWorker ?? -1);
  others.forEach((o) => {
    hooks.emit(`worker:${o.worker_id}`, 'job:taken', { booking_id: bookingId });
    sendPush('workers', getWorker(o.worker_id), { dataOnly: true, ttlSec: 60, data: { type: 'job_taken', booking_id: bookingId } }); // stop the ringing
  });
}

// ---------- worker actions ----------
function ownTicket(worker, id) {
  const b = getBooking(id);
  if (!b || b.worker_id !== worker.id) fail(404, 'Job not found');
  return b;
}

export function acceptJob(workerId, bookingId) {
  const w = getWorker(workerId);
  if (!w.kyc_verified) fail(403, 'KYC not verified yet');
  if (!w.is_online) fail(409, 'Go ON DUTY first');
  if (isBusy(w.id)) fail(409, 'Finish your current job first');
  const o = db.prepare('SELECT status, created_at FROM job_offers WHERE booking_id = ? AND worker_id = ?').get(bookingId, w.id);
  if (!o || o.status !== 'OFFERED' || !fresh(o.created_at)) fail(409, 'This job is no longer available');
  const b = tx(() => {
    const cur = getBooking(bookingId);
    if (!cur || cur.status !== S.SEARCHING) fail(409, 'Job already taken');
    const nb = transition(cur, S.ASSIGNED, { worker_id: w.id, assigned_at: now(), assigned_lat: w.lat, assigned_lng: w.lng, start_handshake: newHandshake(cur.id, 'START'), handshake_fails: 0 });
    db.prepare("UPDATE job_offers SET status = 'ACCEPTED' WHERE booking_id = ? AND worker_id = ?").run(cur.id, w.id);
    db.prepare("UPDATE job_offers SET status = 'EXPIRED' WHERE worker_id = ? AND status = 'OFFERED' AND booking_id != ?").run(w.id, cur.id);
    return nb;
  });
  expireOffers(b.id, w.id);
  broadcast(b);
  pushCustomer(b, `👷 ${w.name} is on the way`, 'Your worker accepted. Track them live in the app.');
  return viewFor(b, 'worker');
}

export function skipJob(workerId, bookingId) {
  db.prepare("UPDATE job_offers SET status = 'SKIPPED' WHERE booking_id = ? AND worker_id = ? AND status = 'OFFERED'").run(bookingId, workerId);
  return { ok: true };
}

export function releaseJob(workerId, bookingId) {
  const w = getWorker(workerId);
  const b = transition(ownTicket(w, bookingId), S.SEARCHING, { worker_id: null, assigned_at: null, start_handshake: null, handshake_fails: 0 });
  db.prepare("UPDATE job_offers SET status = 'RELEASED' WHERE booking_id = ? AND worker_id = ?").run(b.id, w.id);
  broadcast(b);
  pushCustomer(b, 'Finding you another worker', `${w.name} can't make it. Your money is still safe in escrow.`);
  dispatch(b);
  dispatchToWorker(w.id);
  return { ok: true };
}

export function markArrived(workerId, bookingId) {
  const w = getWorker(workerId);
  const b = transition(ownTicket(w, bookingId), S.ARRIVED, { arrived_at: now() });
  broadcast(b);
  pushCustomer(b, `📍 ${w.name} has arrived`, 'Open Krewzo and share the START code to begin.');
  return viewFor(b, 'worker');
}

// Unified handshake verification. START opens the shift; END completes it and releases escrow to the worker's UPI.
export function verifyHandshake(workerId, bookingId, method, payload) {
  const w = getWorker(workerId);
  let b = ownTicket(w, bookingId);
  if (!['QR', 'COLOR_PIN', 'OTP'].includes(method)) fail(400, 'Unknown verification method');
  // Scanning the customer's code at the door also proves arrival.
  if (b.status === S.ASSIGNED) b = transition(b, S.ARRIVED, { arrived_at: now() });
  const phase = b.status === S.ARRIVED ? 'START' : b.status === S.IN_PROGRESS ? 'END' : null;
  if (!phase) fail(409, 'Nothing to verify for this job');
  const key = phase === 'START' ? 'start_handshake' : 'end_handshake';
  const hs = b[key];

  if (!checkHandshake(hs, method, payload)) {
    const fails = b.handshake_fails + 1;
    if (fails >= HANDSHAKE_MAX_FAILS) {
      // Too many wrong guesses: rotate every code so guessing restarts from zero.
      db.prepare(`UPDATE bookings SET ${key} = ?, handshake_fails = 0 WHERE id = ?`).run(JSON.stringify(newHandshake(b.id, phase)), b.id);
      broadcast(getBooking(b.id));
      fail(400, 'Too many wrong tries. Ask the customer for the NEW code.', { attempts_left: HANDSHAKE_MAX_FAILS, rotated: true });
    }
    db.prepare('UPDATE bookings SET handshake_fails = ? WHERE id = ?').run(fails, b.id);
    broadcast(getBooking(b.id));
    fail(400, 'Code did not match', { attempts_left: HANDSHAKE_MAX_FAILS - fails });
  }

  const stamped = { ...hs, verified_at: now(), verified_method: method };
  let receipt = null;
  if (phase === 'START') {
    b = transition(b, S.IN_PROGRESS, { started_at: now(), start_handshake: stamped, end_handshake: newHandshake(b.id, 'END'), handshake_fails: 0 });
  } else {
    ({ b, receipt } = tx(() => {
      const done = transition(b, S.COMPLETED, { completed_at: now(), end_handshake: stamped, handshake_fails: 0 });
      return releaseEscrow(done);
    }));
    dispatchToWorker(w.id);
  }
  broadcast(b);
  return { booking: viewFor(b, 'worker'), phase, receipt };
}

// COMPLETED -> PAID_OUT. Must run inside a transaction.
function releaseEscrow(b) {
  const e = getEscrow(b.id);
  if (!e || e.status !== 'HELD') fail(409, 'Escrow is not held');
  const tx_ref = ref('UPI');
  const t = now();
  db.prepare("UPDATE escrow_ledger SET status = 'RELEASED_UPI', tx_ref = ?, updated_at = ? WHERE id = ? AND status = 'HELD'").run(tx_ref, t, e.id);
  db.prepare('UPDATE workers SET total_earnings = total_earnings + ? WHERE id = ?').run(e.worker_payout, b.worker_id);
  const paid = transition(b, S.PAID_OUT, { paid_out_at: t });
  const w = getWorker(b.worker_id);
  return { b: paid, receipt: { booking_id: b.id, amount: e.worker_payout, upi_id: w.upi_id, tx_ref, released_at: t } };
}

// ---------- customer actions ----------
// How far the worker has come toward the customer since accepting (km). Only for a worker on the way.
function travelledKm(b) {
  if (b.status !== S.ASSIGNED || b.assigned_lat == null) return 0;
  const w = getWorker(b.worker_id);
  if (w?.lat == null) return 0;
  const start = haversineKm({ lat: b.assigned_lat, lng: b.assigned_lng }, b);
  return Math.max(0, start - haversineKm(w, b));
}

function ownBooking(customerId, bookingId) {
  const b = getBooking(bookingId);
  if (!b || b.customer_id !== customerId) fail(404, 'Booking not found');
  return b;
}

// Shown to the customer before they confirm, so a travel fee is never a surprise.
export function cancelQuote(customerId, bookingId) {
  const b = ownBooking(customerId, bookingId);
  const km = Math.round(travelledKm(b) * 10) / 10;
  const fee = Math.min(cancelFee(km), b.escrow_total);
  return { km, fee, refund: b.escrow_total - fee, worker_name: b.worker_id ? getWorker(b.worker_id).name : null };
}

export function cancelBooking(customerId, bookingId) {
  const cur = ownBooking(customerId, bookingId);
  const { fee } = cancelQuote(customerId, bookingId);
  const b = tx(() => {
    const nb = transition(cur, S.CANCELLED, { cancelled_at: now(), cancel_fee: fee, cancel_fee_ref: fee ? ref('PAY') : null });
    db.prepare("UPDATE escrow_ledger SET status = 'REFUNDED', tx_ref = ?, updated_at = ? WHERE booking_id = ? AND status = 'HELD'").run(ref('RFD'), now(), nb.id);
    if (fee) db.prepare('UPDATE workers SET total_earnings = total_earnings + ? WHERE id = ?').run(fee, cur.worker_id);
    return nb;
  });
  expireOffers(b.id);
  broadcast(b);
  if (cur.worker_id) {
    pushCancelled(getWorker(cur.worker_id), b);
    dispatchToWorker(cur.worker_id);
  }
  return viewFor(b, 'customer');
}

export function rateWorker(customerId, bookingId, stars) {
  const b = getBooking(bookingId);
  if (!b || b.customer_id !== customerId) fail(404, 'Booking not found');
  if (b.status !== S.PAID_OUT) fail(409, 'You can rate after the shift is paid');
  if (b.customer_rating) fail(409, 'Already rated');
  const s = Number(stars);
  if (!Number.isInteger(s) || s < 1 || s > 5) fail(400, 'Rating must be 1-5');
  tx(() => {
    db.prepare('UPDATE bookings SET customer_rating = ? WHERE id = ?').run(s, b.id);
    db.prepare('UPDATE workers SET rating = ROUND((rating * (rating_count + 1) + ?) / (rating_count + 2), 2), rating_count = rating_count + 1 WHERE id = ?').run(s, b.worker_id);
  });
  return viewFor(getBooking(b.id), 'customer');
}

// The worker may already be on the way (often with Maps in front), so tell them loudly, in their language.
const CANCEL_TEXT = {
  EN: ["❌ Job cancelled, don't go", (n) => `${n} cancelled the booking.`, (f) => ` ₹${f} travel pay sent to your UPI.`],
  TE: ['❌ పని రద్దు అయింది, వెళ్ళకండి', (n) => `${n} బుకింగ్ రద్దు చేశారు.`, (f) => ` ప్రయాణానికి ₹${f} మీ UPI కి పంపాం.`],
  HI: ['❌ काम रद्द हो गया, मत जाइए', (n) => `${n} ने बुकिंग रद्द कर दी।`, (f) => ` सफ़र के ₹${f} आपके UPI पर भेजे।`],
};
function pushCancelled(w, b) {
  const [title, body, paid] = CANCEL_TEXT[w.language] || CANCEL_TEXT.EN;
  const name = (getUser(b.customer_id)?.name || 'Customer').split(' ')[0];
  sendPush('workers', w, { title, body: body(name) + (b.cancel_fee ? paid(b.cancel_fee) : ''), channel: 'jobs', ttlSec: 3600, data: { type: 'job_cancelled', booking_id: b.id, cancel_fee: b.cancel_fee } });
}

// ---------- push tokens ----------
// One phone = one account per app: if another account last used this phone, stop pushing to it.
export function setPushToken(table, id, token) {
  if (token !== null && !(typeof token === 'string' && token.length > 0 && token.length < 4096)) fail(400, 'Bad push token');
  if (token) db.prepare(`UPDATE ${table} SET fcm_token = NULL WHERE fcm_token = ? AND id != ?`).run(token, id);
  db.prepare(`UPDATE ${table} SET fcm_token = ? WHERE id = ?`).run(token, id);
}

// Customer pushes for the moments they're not watching the app (start/end/cancel happen with them present).
function pushCustomer(b, title, body) {
  sendPush('users', getUser(b.customer_id), { title, body, channel: 'updates', ttlSec: 900, data: { group_id: b.group_id } });
}

// ---------- worker state ----------
export function setWorkerStatus(workerId, { is_online, lat, lng, language, fcm_token }) {
  const w = getWorker(workerId);
  if (fcm_token !== undefined) setPushToken('workers', w.id, fcm_token);
  if (lat != null || lng != null) {
    if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) fail(400, 'Bad location');
    db.prepare('UPDATE workers SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, w.id);
  }
  if (language) {
    if (!['EN', 'TE', 'HI'].includes(language)) fail(400, 'Bad language');
    db.prepare('UPDATE workers SET language = ? WHERE id = ?').run(language, w.id);
  }
  if (is_online != null) db.prepare('UPDATE workers SET is_online = ? WHERE id = ?').run(is_online ? 1 : 0, w.id);
  const nw = getWorker(w.id);
  if (nw.is_online) dispatchToWorker(nw.id);
  // Live tracking: the customer sees the worker only while they're on the way (stops at ARRIVED, for privacy).
  if (lat != null) {
    const act = activeJob(nw.id);
    if (act?.status === S.ASSIGNED) hooks.emit(`customer:${act.customer_id}`, 'worker:location', { booking_id: act.id, lat, lng });
  }
  return publicWorker(nw);
}

export function activeJob(workerId) {
  return parseBooking(db.prepare(`SELECT * FROM bookings WHERE worker_id = ? AND status IN (${ACTIVE_STATUSES.map(() => '?').join(',')}) ORDER BY id DESC`).get(workerId, ...ACTIVE_STATUSES));
}

function istDayStart() {
  const ist = new Date(Date.now() + 5.5 * 3600e3);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600e3).toISOString();
}

export function workerHome(workerId) {
  const w = getWorker(workerId);
  const day = istDayStart();
  const today = db.prepare(`SELECT COALESCE(SUM(CASE WHEN status = 'PAID_OUT' THEN worker_payout ELSE cancel_fee END),0) AS s,
    COUNT(CASE WHEN status = 'PAID_OUT' THEN 1 END) AS n FROM bookings
    WHERE worker_id = ? AND ((status = 'PAID_OUT' AND paid_out_at >= ?) OR (status = 'CANCELLED' AND cancel_fee > 0 AND cancelled_at >= ?))`).get(w.id, day, day);
  const act = activeJob(w.id);
  return { worker: publicWorker(w), today_earnings: today.s, today_shifts: today.n, active: act ? viewFor(act, 'worker') : null, offers: act ? [] : openOffers(w.id) };
}

export function passbook(workerId) {
  const w = getWorker(workerId);
  const shifts = db.prepare(`SELECT b.id, b.trade_tag, b.skill_tier, b.duration, b.address, b.worker_payout, b.started_at, b.paid_out_at, b.customer_rating,
      b.start_handshake, b.end_handshake, e.tx_ref
    FROM bookings b JOIN escrow_ledger e ON e.booking_id = b.id WHERE b.worker_id = ? AND b.status = 'PAID_OUT' ORDER BY b.paid_out_at DESC LIMIT 200`).all(w.id)
    .map((r) => ({ ...r, start_method: JSON.parse(r.start_handshake).verified_method, end_method: JSON.parse(r.end_handshake).verified_method, start_handshake: undefined, end_handshake: undefined }));
  return { worker: publicWorker(w), total_earnings: w.total_earnings, shifts, credit: creditPassbook(w.id) };
}

// ---------- NBFC credit passbook ----------
export function creditPassbook(workerId) {
  const w = getWorker(workerId);
  if (!w) fail(404, 'Worker not found');
  const since = new Date(Date.now() - 90 * 86400e3).toISOString();
  const paid = db.prepare("SELECT worker_payout, paid_out_at, arrived_at, assigned_at, booking_mode, scheduled_at FROM bookings WHERE worker_id = ? AND status = 'PAID_OUT'").all(w.id);
  const dropped = db.prepare("SELECT COUNT(*) AS n FROM job_offers WHERE worker_id = ? AND status = 'RELEASED'").get(w.id).n;

  // 13 weekly buckets over the last 90 days.
  const weeks = Array(13).fill(0);
  let earnings90 = 0;
  for (const p of paid) {
    if (p.paid_out_at < since) continue;
    earnings90 += p.worker_payout;
    const idx = Math.min(12, Math.floor((Date.now() - Date.parse(p.paid_out_at)) / (7 * 86400e3)));
    weeks[idx] += p.worker_payout;
  }
  const activeWeeks = weeks.filter((x) => x > 0).length;
  const mean = earnings90 / 13;
  const sd = Math.sqrt(weeks.reduce((s, x) => s + (x - mean) ** 2, 0) / 13);
  const cv = mean > 0 ? sd / mean : 1;
  const consistency = Math.round(Math.max(0, Math.min(1, (activeWeeks / 13) * (1 - Math.min(cv, 1) / 2))) * 100) / 100;

  // On time = arrived within 45 min of accepting (instant) or by slot + 15 min (scheduled).
  const onTime = paid.filter((p) => {
    if (!p.arrived_at) return false;
    const due = p.booking_mode === 'SCHEDULED' ? Date.parse(p.scheduled_at) + 15 * 60e3 : Date.parse(p.assigned_at) + 45 * 60e3;
    return Date.parse(p.arrived_at) <= due;
  }).length;
  const accepted = paid.length + dropped;
  const on_time_completion_rate = accepted ? Math.round((onTime / accepted) * 100) / 100 : 0;

  const score = Math.round(300 + 600 * (0.4 * Math.min(paid.length / 60, 1) + 0.3 * consistency + 0.3 * on_time_completion_rate));
  const monthly = earnings90 / 3;
  const eligible = paid.length >= 20 && score >= 650 && w.kyc_verified;
  return {
    worker_id: w.id, kyc_verified: w.kyc_verified, verified_shift_count: paid.length, earnings_90d: earnings90, weekly_earnings_90d: weeks.reverse(),
    active_weeks_90d: activeWeeks, earnings_consistency: consistency, on_time_completion_rate, dropped_jobs: dropped, rating: w.rating,
    krewzo_score: score, loan_eligible: !!eligible, suggested_limit: eligible ? Math.min(50000, Math.floor((monthly * 1.5) / 500) * 500) : 0,
    generated_at: now(),
  };
}
