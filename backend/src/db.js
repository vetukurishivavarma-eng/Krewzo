import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const file = process.env.KREWZO_DB || path.join(import.meta.dirname, '..', 'data', 'krewzo.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'PERSONAL' CHECK (account_type IN ('PERSONAL','BUSINESS')),
  gstin TEXT,
  business_name TEXT,
  addresses TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  photo_url TEXT,
  kyc_verified INTEGER NOT NULL DEFAULT 0,
  skill_tier TEXT NOT NULL CHECK (skill_tier IN ('TIER_1','TIER_2','TIER_3')),
  trade_tags TEXT NOT NULL DEFAULT '[]',
  is_online INTEGER NOT NULL DEFAULT 0,
  lat REAL,
  lng REAL,
  rating REAL NOT NULL DEFAULT 5,
  rating_count INTEGER NOT NULL DEFAULT 0,
  total_earnings INTEGER NOT NULL DEFAULT 0,
  upi_id TEXT,
  language TEXT NOT NULL DEFAULT 'EN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS booking_groups (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id),
  account_type TEXT NOT NULL,
  gstin TEXT,
  business_name TEXT,
  worker_count INTEGER NOT NULL,
  amount_total INTEGER NOT NULL,
  payer_upi TEXT NOT NULL,
  payment_ref TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES booking_groups(id),
  customer_id INTEGER NOT NULL REFERENCES users(id),
  worker_id INTEGER REFERENCES workers(id),
  skill_tier TEXT NOT NULL,
  trade_tag TEXT NOT NULL,
  worker_count INTEGER NOT NULL,
  booking_mode TEXT NOT NULL CHECK (booking_mode IN ('INSTANT','SCHEDULED')),
  scheduled_at TEXT,
  duration TEXT NOT NULL CHECK (duration IN ('2H','4H','8H')),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  address TEXT NOT NULL,
  addons TEXT NOT NULL DEFAULT '[]',
  base_wage INTEGER NOT NULL,
  addons_total INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  gst_amount INTEGER NOT NULL,
  insurance_fee INTEGER NOT NULL,
  worker_payout INTEGER NOT NULL,
  escrow_total INTEGER NOT NULL,
  start_handshake TEXT,
  end_handshake TEXT,
  handshake_fails INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('SEARCHING','ASSIGNED','ARRIVED','IN_PROGRESS','COMPLETED','PAID_OUT','CANCELLED')),
  customer_rating INTEGER,
  created_at TEXT NOT NULL,
  assigned_at TEXT, arrived_at TEXT, started_at TEXT, completed_at TEXT, paid_out_at TEXT, cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS bookings_worker ON bookings(worker_id, status);

CREATE TABLE IF NOT EXISTS escrow_ledger (
  id INTEGER PRIMARY KEY,
  booking_id INTEGER UNIQUE NOT NULL REFERENCES bookings(id),
  amount_held INTEGER NOT NULL,
  worker_payout INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL, -- everything the platform keeps: fee + GST + insurance
  status TEXT NOT NULL CHECK (status IN ('HELD','RELEASED_UPI','REFUNDED')),
  tx_ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_offers (
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  status TEXT NOT NULL CHECK (status IN ('OFFERED','SKIPPED','ACCEPTED','EXPIRED','RELEASED')),
  distance_km REAL NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (booking_id, worker_id)
);
`);

// Worker ID check (Aadhaar Secure QR + selfie). We keep only the last 4 Aadhaar digits, never the full number.
db.exec(`
CREATE TABLE IF NOT EXISTS kyc_submissions (
  worker_id INTEGER PRIMARY KEY REFERENCES workers(id),
  status TEXT NOT NULL CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  identity_hash TEXT NOT NULL,
  aadhaar_last4 TEXT NOT NULL,
  name TEXT NOT NULL, dob TEXT, gender TEXT, area TEXT, qr_version TEXT,
  sig_ok INTEGER NOT NULL,              -- 1 = UIDAI signature verified, -1 = no UIDAI certificate installed yet
  photo BLOB, selfie BLOB NOT NULL,
  flags TEXT NOT NULL DEFAULT '[]',
  submitted_at TEXT NOT NULL, reviewed_at TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS kyc_identity ON kyc_submissions(identity_hash);
CREATE TABLE IF NOT EXISTS subscriptions (
  owner_id INTEGER PRIMARY KEY REFERENCES users(id),
  plan TEXT NOT NULL CHECK (plan IN ('STARTER','PRO')),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','CANCELLED','EXPIRED')), -- CANCELLED = runs until renews_at, then EXPIRED
  business_name TEXT NOT NULL, gstin TEXT NOT NULL, payer_upi TEXT NOT NULL,
  started_at TEXT NOT NULL, renews_at TEXT NOT NULL, cancelled_at TEXT
);
CREATE TABLE IF NOT EXISTS subscription_payments (
  id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id), plan TEXT NOT NULL,
  amount INTEGER NOT NULL, gst_amount INTEGER NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, tx_ref TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS monthly_bills (
  owner_id INTEGER NOT NULL REFERENCES users(id), month TEXT NOT NULL, amount INTEGER NOT NULL, tx_ref TEXT NOT NULL, paid_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, month)
);
CREATE TABLE IF NOT EXISTS worker_strikes (id INTEGER PRIMARY KEY, worker_id INTEGER NOT NULL REFERENCES workers(id), booking_id INTEGER, reason TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY, booking_id INTEGER NOT NULL REFERENCES bookings(id), reporter_role TEXT NOT NULL CHECK (reporter_role IN ('customer','worker')),
  reporter_id INTEGER NOT NULL, category TEXT NOT NULL, details TEXT, payment_held INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('OPEN','RESOLVED')), resolution TEXT, note TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS sos_alerts (id INTEGER PRIMARY KEY, booking_id INTEGER, role TEXT NOT NULL, user_id INTEGER NOT NULL, lat REAL, lng REAL, created_at TEXT NOT NULL, handled_at TEXT);
CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS team_invites (owner_id INTEGER NOT NULL REFERENCES users(id), member_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, PRIMARY KEY (owner_id, member_id));
CREATE TABLE IF NOT EXISTS kyc_blocklist (identity_hash TEXT PRIMARY KEY, reason TEXT, created_at TEXT NOT NULL);
`);

// Columns added after launch (SQLite has no ADD COLUMN IF NOT EXISTS).
for (const sql of [
  'ALTER TABLE workers ADD COLUMN fcm_token TEXT', 'ALTER TABLE users ADD COLUMN fcm_token TEXT',
  // where the worker was when they accepted, and what a late cancel paid them for the trip
  'ALTER TABLE bookings ADD COLUMN assigned_lat REAL', 'ALTER TABLE bookings ADD COLUMN assigned_lng REAL',
  'ALTER TABLE bookings ADD COLUMN cancel_fee INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE bookings ADD COLUMN cancel_fee_ref TEXT',
  // Krewzo Business: team members book on the owner's plan; MONTHLY groups go on the owner's monthly bill
  'ALTER TABLE users ADD COLUMN business_owner_id INTEGER', 'ALTER TABLE bookings ADD COLUMN dispatch_km REAL',
  "ALTER TABLE booking_groups ADD COLUMN pay_mode TEXT NOT NULL DEFAULT 'UPI'", 'ALTER TABLE booking_groups ADD COLUMN billed_to INTEGER',
  // wrong start/finish codes across rotations, and the lock that only the customer can lift
  'ALTER TABLE bookings ADD COLUMN handshake_total INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE bookings ADD COLUMN handshake_locked INTEGER NOT NULL DEFAULT 0',
  // unguessable link to a verified worker's selfie (was /api/workers/<id>/photo, easy to scrape)
  'ALTER TABLE workers ADD COLUMN photo_token TEXT',
  // trust & safety (safety.js)
  'ALTER TABLE bookings ADD COLUMN searching_since TEXT', 'ALTER TABLE bookings ADD COLUMN cancel_reason TEXT',
  'ALTER TABLE bookings ADD COLUMN disputed INTEGER NOT NULL DEFAULT 0', 'ALTER TABLE bookings ADD COLUMN worker_rating INTEGER',
  'ALTER TABLE workers ADD COLUMN suspended_until TEXT',
  'ALTER TABLE users ADD COLUMN rating REAL NOT NULL DEFAULT 5', 'ALTER TABLE users ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0',
]) { try { db.exec(sql); } catch {} }

export const now = () => new Date().toISOString();

// Old selfie links were /api/workers/<id>/photo (guessable): give every verified worker a random token instead.
for (const w of db.prepare("SELECT id FROM workers WHERE photo_url LIKE '/api/workers/%/photo'").all()) {
  db.prepare('UPDATE workers SET photo_url = NULL, photo_token = ? WHERE id = ?').run(crypto.randomBytes(18).toString('base64url'), w.id);
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function setting(key, make) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (row) return row.value;
  const value = make();
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  return value;
}
export const SECRET = process.env.KREWZO_SECRET || setting('secret', () => crypto.randomBytes(32).toString('hex'));
