// Demo data: 5 KYC-verified, on-duty workers within ~2 km of the default pin, plus one demo customer.
// All PINs are 1234.
import { DEFAULT_LOCATION as L } from '@krewzo/shared';
import { db, now } from './db.js';
import { hashPin } from './auth.js';

const WORKERS = [
  ['9000000001', 'Ramu', 'TIER_1', ['HELPER', 'LOADING'], 0.004, 0.003, 'TE'],
  ['9000000002', 'Lakshmi', 'TIER_1', ['CLEANING', 'GARDEN'], -0.006, 0.002, 'TE'],
  ['9000000003', 'Suresh', 'TIER_2', ['MASON', 'PAINTER', 'HELPER'], 0.002, -0.008, 'TE'],
  ['9000000004', 'Imran', 'TIER_3', ['ELECTRICIAN', 'PLUMBER'], -0.003, -0.005, 'HI'],
  ['9000000005', 'Venkatesh', 'TIER_3', ['CARPENTER', 'PAINTER'], 0.009, 0.006, 'EN'],
];

export function seed() {
  const pin = hashPin('1234');
  const ins = db.prepare(`INSERT OR IGNORE INTO workers (phone, name, pin_hash, kyc_verified, skill_tier, trade_tags, is_online, lat, lng, rating, rating_count, upi_id, language, created_at)
    VALUES (?,?,?,1,?,?,1,?,?,?,?,?,?,?)`);
  WORKERS.forEach(([phone, name, tier, tags, dLat, dLng, lang], i) =>
    ins.run(phone, name, pin, tier, JSON.stringify(tags), L.lat + dLat, L.lng + dLng, 4.6 + (i % 4) / 10, 10 + i * 7, `${name.toLowerCase()}@okaxis`, lang, now()));
  db.prepare('INSERT OR IGNORE INTO users (phone, name, pin_hash, created_at) VALUES (?,?,?,?)').run('9999999999', 'Demo Customer', pin, now());
  db.prepare("UPDATE workers SET probation_waived = 1 WHERE phone LIKE '900000000_'").run(); // demo = experienced, no probation
}

export function seedIfEmpty() {
  if (!db.prepare('SELECT 1 FROM workers LIMIT 1').get()) seed();
}

if (process.argv[1]?.endsWith('seed.js')) {
  seed();
  db.prepare("UPDATE workers SET is_online = 1 WHERE phone LIKE '900000000_'").run();
  console.log('Seeded 5 workers (9000000001-5) + customer 9999999999. PIN 1234 for all.');
}
