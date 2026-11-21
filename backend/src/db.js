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

// Columns added after launch (SQLite has no ADD COLUMN IF NOT EXISTS).
for (const sql of ['ALTER TABLE workers ADD COLUMN fcm_token TEXT']) { try { db.exec(sql); } catch {} }

export const now = () => new Date().toISOString();

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
