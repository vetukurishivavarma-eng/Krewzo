// Krewzo Business subscription: plan (fee discount, wider worker search), team seats, monthly billing on credit,
// one monthly statement + GST invoice + attendance report. Payments are simulated like the rest of the app
// (UPI autopay for the plan, UPI for the monthly bill); swap in Razorpay/Cashfree subscriptions at launch.
import crypto from 'node:crypto';
import { BUSINESS_PLANS as PLANS, GSTIN_RE, GST_PCT, PLAN_DAYS, TRADE_TAGS, UPI_RE } from '@krewzo/shared';
import { db, now, tx } from './db.js';
import { ApiError, getUser } from './service.js';

const fail = (status, msg, extra) => { throw new ApiError(status, msg, extra); };
const ref = (p) => p + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
const addDays = (iso, d) => new Date(Date.parse(iso) + d * 864e5).toISOString();
const IST = 5.5 * 3600e3;
export const istMonth = (iso = now()) => new Date(Date.parse(iso) + IST).toISOString().slice(0, 7);
const monthStart = (m) => new Date(Date.parse(`${m}-01T00:00:00Z`) - IST).toISOString();
const nextMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
const GRACE_DAY = 7; // last month's bill must be paid by the 7th to keep monthly billing on

const getSub = (ownerId) => db.prepare('SELECT * FROM subscriptions WHERE owner_id = ?').get(ownerId);

function charge(ownerId, planId, start, amount = PLANS[planId].price) {
  const end = addDays(start, PLAN_DAYS);
  db.prepare('INSERT INTO subscription_payments (owner_id, plan, amount, gst_amount, period_start, period_end, tx_ref, created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(ownerId, planId, amount, Math.round(amount * GST_PCT), start, end, ref('SUB'), now());
  return end;
}

// Renewal happens lazily whenever the plan is looked at (no scheduler on the free server): simulated UPI autopay
// for each period that has ended; a cancelled plan simply expires at the end of its paid period.
function current(ownerId) {
  const s = getSub(ownerId);
  if (!s || s.status === 'EXPIRED') return null;
  let renews = s.renews_at;
  while (Date.parse(renews) <= Date.now()) {
    if (s.status === 'CANCELLED') { db.prepare("UPDATE subscriptions SET status = 'EXPIRED' WHERE owner_id = ?").run(ownerId); return null; }
    renews = charge(ownerId, s.plan, renews);
  }
  if (renews !== s.renews_at) db.prepare('UPDATE subscriptions SET renews_at = ? WHERE owner_id = ?').run(renews, ownerId);
  return { ...s, renews_at: renews };
}

// The plan a customer books under: their own, or the business that added them to its team.
export function businessFor(userId) {
  const u = getUser(userId);
  if (!u) return null;
  const ownerId = u.business_owner_id || u.id;
  const s = current(ownerId);
  if (!s) return null;
  return { ...s, owner_id: ownerId, role: ownerId === u.id ? 'OWNER' : 'MEMBER', info: PLANS[s.plan] };
}

// Money put on the monthly bill for a month: live jobs at their escrow total, cancelled ones at their travel fee.
function monthCharges(ownerId, month) {
  return db.prepare(`SELECT COALESCE(SUM(CASE WHEN b.status = 'CANCELLED' THEN b.cancel_fee ELSE b.escrow_total END), 0) AS s
    FROM bookings b JOIN booking_groups g ON g.id = b.group_id
    WHERE g.billed_to = ? AND g.pay_mode = 'MONTHLY' AND b.created_at >= ? AND b.created_at < ?`).get(ownerId, monthStart(month), monthStart(nextMonth(month))).s;
}

function unpaidMonths(ownerId) {
  const cur = istMonth();
  const months = db.prepare(`SELECT DISTINCT g.created_at FROM booking_groups g WHERE g.billed_to = ? AND g.pay_mode = 'MONTHLY'`).all(ownerId)
    .map((r) => istMonth(r.created_at)).filter((m, i, a) => m < cur && a.indexOf(m) === i);
  return months.filter((m) => !db.prepare('SELECT 1 FROM monthly_bills WHERE owner_id = ? AND month = ?').get(ownerId, m) && monthCharges(ownerId, m) > 0).sort();
}

// Called by createBookings before a job goes on the monthly bill.
export function checkMonthly(biz, amount) {
  const overdue = unpaidMonths(biz.owner_id);
  const day = Number(new Date(Date.now() + IST).toISOString().slice(8, 10));
  if (overdue.length && (overdue.length > 1 || day > GRACE_DAY)) fail(402, `Pay the ${overdue[0]} bill to keep booking on monthly billing`, { code: 'BILL_OVERDUE' });
  const used = monthCharges(biz.owner_id, istMonth());
  if (used + amount > biz.info.credit) fail(402, `Monthly credit limit reached (${biz.info.credit.toLocaleString('en-IN')} per month). Pay by UPI or upgrade your plan.`, { code: 'CREDIT_LIMIT' });
}

// ---------- owner actions ----------
function ownerOnly(userId) {
  const biz = businessFor(userId);
  if (!biz) fail(404, 'No active Krewzo Business plan');
  if (biz.role !== 'OWNER') fail(403, 'Only the account owner can change the plan');
  return biz;
}

export function subscribe(userId, { plan, business_name, gstin, upi_id }) {
  const u = getUser(userId);
  if (!PLANS[plan]) fail(400, 'Pick a plan');
  if (u.business_owner_id && businessFor(userId)?.role === 'MEMBER') fail(409, 'You are on another business team. Ask its owner to remove you first.');
  if (current(u.id)) fail(409, 'You already have a plan. Change or cancel it instead.');
  const name = String(business_name || '').trim();
  const g = String(gstin || '').toUpperCase().trim();
  if (name.length < 2) fail(400, 'Enter the business name');
  if (!GSTIN_RE.test(g)) fail(400, 'Enter a valid 15-character GSTIN');
  if (!UPI_RE.test(upi_id || '')) fail(400, 'Enter the UPI ID for autopay (name@bank)');
  tx(() => {
    const t = now();
    const end = charge(u.id, plan, t);
    db.prepare(`INSERT INTO subscriptions (owner_id, plan, status, business_name, gstin, payer_upi, started_at, renews_at, cancelled_at) VALUES (?,?,?,?,?,?,?,?,NULL)
      ON CONFLICT (owner_id) DO UPDATE SET plan = excluded.plan, status = 'ACTIVE', business_name = excluded.business_name, gstin = excluded.gstin,
        payer_upi = excluded.payer_upi, started_at = excluded.started_at, renews_at = excluded.renews_at, cancelled_at = NULL`)
      .run(u.id, plan, 'ACTIVE', name, g, upi_id, t, end);
    db.prepare("UPDATE users SET account_type = 'BUSINESS', gstin = ?, business_name = ?, business_owner_id = NULL WHERE id = ?").run(g, name, u.id);
  });
  return overview(userId);
}

// Switching starts a new 30-day period today; unused days of the old plan count toward the new price.
export function changePlan(userId, plan) {
  const biz = ownerOnly(userId);
  if (!PLANS[plan]) fail(400, 'Pick a plan');
  if (plan === biz.plan) return overview(userId);
  if (teamSize(biz.owner_id) > PLANS[plan].seats) fail(409, `${PLANS[plan].name} allows ${PLANS[plan].seats} people. Remove team members first.`);
  const left = Math.max(0, Date.parse(biz.renews_at) - Date.now()) / (PLAN_DAYS * 864e5);
  const credit = Math.round(PLANS[biz.plan].price * left);
  tx(() => {
    const end = charge(biz.owner_id, plan, now(), Math.max(0, PLANS[plan].price - credit));
    db.prepare("UPDATE subscriptions SET plan = ?, status = 'ACTIVE', renews_at = ?, cancelled_at = NULL WHERE owner_id = ?").run(plan, end, biz.owner_id);
  });
  return overview(userId);
}

export function cancel(userId) {
  const biz = ownerOnly(userId);
  db.prepare("UPDATE subscriptions SET status = 'CANCELLED', cancelled_at = ? WHERE owner_id = ?").run(now(), biz.owner_id);
  return overview(userId);
}

export function resume(userId) {
  const biz = ownerOnly(userId);
  db.prepare("UPDATE subscriptions SET status = 'ACTIVE', cancelled_at = NULL WHERE owner_id = ?").run(biz.owner_id);
  return overview(userId);
}

// ---------- team ----------
const teamSize = (ownerId) => 1 + db.prepare('SELECT COUNT(*) AS n FROM users WHERE business_owner_id = ?').get(ownerId).n;

export function addMember(userId, phone) {
  const biz = ownerOnly(userId);
  const p = String(phone || '').replace(/\D/g, '').slice(-10);
  const m = db.prepare('SELECT * FROM users WHERE phone = ?').get(p);
  if (!m) fail(404, 'No Krewzo customer with that number. Ask them to sign up in the Krewzo app first.');
  if (m.id === biz.owner_id) fail(400, "That's your own number");
  if (m.business_owner_id && m.business_owner_id !== biz.owner_id) fail(409, 'That person is already on another business team');
  if (current(m.id)) fail(409, 'That person has their own Business plan');
  if (m.business_owner_id !== biz.owner_id && teamSize(biz.owner_id) >= biz.info.seats) fail(409, `${biz.info.name} allows ${biz.info.seats} people. Upgrade to add more.`);
  db.prepare('UPDATE users SET business_owner_id = ? WHERE id = ?').run(biz.owner_id, m.id);
  return overview(userId);
}

export function removeMember(userId, memberId) {
  const biz = ownerOnly(userId);
  db.prepare('UPDATE users SET business_owner_id = NULL WHERE id = ? AND business_owner_id = ?').run(memberId, biz.owner_id);
  return overview(userId);
}

// ---------- monthly bill ----------
export function statement(userId, month = istMonth()) {
  const biz = businessFor(userId);
  if (!biz) fail(404, 'No active Krewzo Business plan');
  if (!/^\d{4}-\d{2}$/.test(month)) fail(400, 'Bad month');
  const rows = db.prepare(`SELECT b.*, g.pay_mode, u.name AS booked_by, w.name AS worker_name
    FROM bookings b JOIN booking_groups g ON g.id = b.group_id JOIN users u ON u.id = b.customer_id LEFT JOIN workers w ON w.id = b.worker_id
    WHERE g.billed_to = ? AND b.created_at >= ? AND b.created_at < ? ORDER BY b.created_at`).all(biz.owner_id, monthStart(month), monthStart(nextMonth(month)))
    .map((b) => {
      const cancelled = b.status === 'CANCELLED';
      return {
        id: b.id, date: b.created_at, booked_by: b.booked_by, task: TRADE_TAGS[b.trade_tag]?.label, duration: b.duration, address: b.address,
        worker: b.worker_name, status: b.status, pay_mode: b.pay_mode, started_at: b.started_at, completed_at: b.completed_at,
        wages: cancelled ? 0 : b.base_wage + b.addons_total, platform_fee: cancelled ? 0 : b.platform_fee, gst: cancelled ? 0 : b.gst_amount,
        insurance: cancelled ? 0 : b.insurance_fee, travel_fee: cancelled ? b.cancel_fee : 0, total: cancelled ? b.cancel_fee : b.escrow_total,
      };
    });
  const monthly = rows.filter((r) => r.pay_mode === 'MONTHLY');
  const sum = (k, list = monthly) => list.reduce((s, r) => s + r[k], 0);
  const bill = db.prepare('SELECT * FROM monthly_bills WHERE owner_id = ? AND month = ?').get(biz.owner_id, month);
  return {
    month, business_name: biz.business_name, gstin: biz.gstin, plan: biz.info.name, rows,
    totals: { wages: sum('wages'), platform_fee: sum('platform_fee'), gst: sum('gst'), insurance: sum('insurance'), travel_fee: sum('travel_fee'), due: sum('total') },
    paid: bill ? { amount: bill.amount, tx_ref: bill.tx_ref, paid_at: bill.paid_at } : null,
    payable: !bill && month < istMonth() && sum('total') > 0,
  };
}

export function payBill(userId, month) {
  const biz = ownerOnly(userId);
  const st = statement(userId, month);
  if (st.paid) fail(409, 'Already paid');
  if (month >= istMonth()) fail(400, 'This month is still running. Its bill is ready on the 1st.');
  if (!st.totals.due) fail(400, 'Nothing to pay for that month');
  db.prepare('INSERT INTO monthly_bills (owner_id, month, amount, tx_ref, paid_at) VALUES (?,?,?,?,?)').run(biz.owner_id, month, st.totals.due, ref('BILL'), now());
  return statement(userId, month);
}

// Attendance: one row per worker-shift, for the business's own records / payroll.
export function attendanceCsv(userId, month) {
  const st = statement(userId, month);
  const t = (iso) => (iso ? new Date(Date.parse(iso) + IST).toISOString().replace('T', ' ').slice(0, 16) : '');
  const hours = (r) => (r.started_at && r.completed_at ? ((Date.parse(r.completed_at) - Date.parse(r.started_at)) / 3600e3).toFixed(2) : '');
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Date', 'Booked by', 'Task', 'Duration', 'Site address', 'Worker', 'Status', 'Start (IST)', 'End (IST)', 'Hours worked', 'Paid via', 'Amount (Rs)'];
  const lines = st.rows.map((r) => [t(r.date).slice(0, 10), r.booked_by, r.task, r.duration, r.address, r.worker, r.status, t(r.started_at), t(r.completed_at), hours(r), r.pay_mode === 'MONTHLY' ? 'Monthly bill' : 'UPI', r.total]);
  return '﻿' + [head, ...lines].map((l) => l.map(cell).join(',')).join('\r\n') + '\r\n'; // BOM so Excel reads ₹/Telugu names
}

// ---------- read ----------
export function overview(userId) {
  const plans = Object.values(PLANS);
  const biz = businessFor(userId);
  if (!biz) return { business: null, plans };
  const owner = biz.role === 'OWNER';
  const month = istMonth();
  return {
    plans,
    business: {
      role: biz.role, plan: biz.plan, plan_name: biz.info.name, status: biz.status, renews_at: biz.renews_at,
      business_name: biz.business_name, gstin: biz.gstin, fee_off: biz.info.fee_off, radius_km: biz.info.radius_km,
      seats: biz.info.seats, seats_used: teamSize(biz.owner_id), month, credit_limit: biz.info.credit, credit_used: monthCharges(biz.owner_id, month),
      overdue: unpaidMonths(biz.owner_id),
      ...(owner && {
        members: db.prepare('SELECT id, name, phone FROM users WHERE business_owner_id = ? ORDER BY name').all(biz.owner_id),
        payments: db.prepare('SELECT plan, amount, gst_amount, period_start, period_end, tx_ref FROM subscription_payments WHERE owner_id = ? ORDER BY id DESC LIMIT 6').all(biz.owner_id),
      }),
    },
  };
}
