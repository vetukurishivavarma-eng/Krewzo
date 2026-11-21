// Probation for new partners + the optional "Police verified" badge (own process, in-memory DB).
Object.assign(process.env, { KREWZO_DB: ':memory:', ADMIN_KEY: 'ops-test', AUTH_IP_MAX: '1000' });
import crypto from 'node:crypto';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCATION as L } from '@krewzo/shared';

const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db.js');
const svc = await import('../src/service.js');
let server, base;
after(() => server.close());

async function call(method, p, body, token, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }), ...headers }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const ops = (m, p, b) => call(m, p, b, null, { 'x-admin-key': 'ops-test' });
const tomorrow = () => new Date(Date.now() + 5.5 * 3600e3 + 864e5).toISOString().slice(0, 10);
const book = (t, extra) => call('POST', '/api/bookings', { duration: '2H', worker_count: 1, booking_mode: 'SCHEDULED', scheduled_date: tomorrow(), slot: 'MORNING',
  lat: L.lat, lng: L.lng, address: 'Plot 4, Madhapur', upi_id: 'pr@okhdfc', addons: [], insurance: false, ...extra }, t);
const offered = async (w, id) => (await call('GET', '/api/workers/me/home', null, w)).body.offers.some((o) => o.booking_id === id);

let w, wid, cust;
before(async () => {
  ({ server } = createApp()); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`;
  // a brand-new, ID-verified mason near the customer (demo workers are taken off duty so they don't interfere)
  w = (await call('POST', '/api/auth/worker', { phone: '9444400001', pin: '1234', name: 'New Mason', skill_tier: 'TIER_2', trade_tags: ['MASON', 'HELPER'] })).body.token;
  wid = db.prepare("SELECT id FROM workers WHERE phone = '9444400001'").get().id;
  db.prepare('UPDATE workers SET kyc_verified = 1 WHERE id = ?').run(wid);
  db.prepare("UPDATE workers SET is_online = 0 WHERE phone LIKE '900000000_'").run();
  await call('PATCH', '/api/workers/me', { is_online: true, lat: L.lat + 0.001, lng: L.lng }, w);
  cust = (await call('POST', '/api/auth/customer', { phone: '9444400009', pin: '1234', name: 'Probation Cust' })).body.token;
});

test('daytime is 7 am to 7 pm IST', () => {
  assert.equal(svc.isDaytime('2026-11-22T04:00:00Z'), true);  // 9:30 am IST
  assert.equal(svc.isDaytime('2026-11-22T15:00:00Z'), false); // 8:30 pm IST
  assert.equal(svc.isDaytime('2026-11-22T00:00:00Z'), false); // 5:30 am IST
});

test('a new partner only gets daytime General Helper jobs until 5 good jobs', async () => {
  const home = (await call('GET', '/api/workers/me/home', null, w)).body;
  assert.deepEqual([home.probation.on, home.probation.done, home.probation.needed], [true, 0, 5]);

  const skilled = (await book(cust, { skill_tier: 'TIER_2', trade_tag: 'MASON' })).body.tickets[0].id;
  assert.equal(await offered(w, skilled), false, 'no Semi-skilled job on probation');
  const helper = (await book(cust, { skill_tier: 'TIER_1', trade_tag: 'HELPER' })).body.tickets[0].id;
  assert.equal(await offered(w, helper), true, 'daytime helper job is fine');

  // 5 paid jobs rated well -> probation over, skilled work reaches them (separate customers: 6 bookings/hour limit)
  for (let i = 0; i < 5; i++) {
    const c = (await call('POST', '/api/auth/customer', { phone: `944440010${i}`, pin: '1234', name: 'Rater ' + i })).body.token;
    const id = (await book(c, { skill_tier: 'TIER_1', trade_tag: 'HELPER' })).body.tickets[0].id;
    db.prepare("UPDATE bookings SET status = 'PAID_OUT', worker_id = ?, paid_out_at = ?, customer_rating = 5 WHERE id = ?").run(wid, new Date().toISOString(), id);
  }
  const p = (await call('GET', '/api/workers/me/home', null, w)).body.probation;
  assert.equal(p.on, false);
  const later = (await book((await call('POST', '/api/auth/customer', { phone: '9444400010', pin: '1234', name: 'Cust Two' })).body.token, { skill_tier: 'TIER_2', trade_tag: 'MASON' })).body.tickets[0].id;
  assert.equal(await offered(w, later), true);
});

test('poor ratings keep a partner on probation', () => {
  db.prepare("UPDATE bookings SET customer_rating = 2 WHERE worker_id = ? AND status = 'PAID_OUT'").run(wid);
  assert.equal(svc.probation(wid).on, true);
  db.prepare("UPDATE bookings SET customer_rating = 5 WHERE worker_id = ? AND status = 'PAID_OUT'").run(wid);
});

test('police certificate: upload, ops approve, customers see the badge', async () => {
  const img = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(20000)]).toString('base64');
  assert.equal((await call('GET', '/api/workers/me/police', null, w)).body.status, 'NONE');
  assert.equal((await call('POST', '/api/workers/me/police', { image: 'nope' }, w)).status, 400);
  assert.equal((await call('POST', '/api/workers/me/police', { image: img }, w)).body.status, 'PENDING');

  const list = (await ops('GET', '/api/admin/police')).body;
  assert.equal(list[0].phone, '9444400001');
  assert.ok(list[0].image.startsWith('data:image/jpeg;base64,'));
  assert.equal((await ops('POST', `/api/admin/workers/${wid}/police`, { verified: true })).body.status, 'VERIFIED');

  // the worker's booking now shows the badge to the customer
  const rater = (await call('POST', '/api/auth/customer', { phone: '9444400100', pin: '1234' })).body.token;
  const t = (await call('GET', '/api/bookings', null, rater)).body.flatMap((x) => x.tickets).find((x) => x.worker?.id === wid);
  assert.equal(t.worker.police_verified, true);
  assert.equal(t.worker.new_worker, false);
  const home = (await call('GET', '/api/workers/me/home', null, w)).body;
  assert.equal(home.police.status, 'VERIFIED');
  assert.ok(Date.parse(home.police.valid_until) > Date.now() + 360 * 864e5, 'valid for a year');
});
