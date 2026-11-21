// Trust & safety end to end (own process + in-memory DB): no-worker timeout, no-shows + strikes, payment hold
// on a reported job, SOS, workers rating customers, booking spam limits, login limits.
Object.assign(process.env, { KREWZO_DB: ':memory:', ADMIN_KEY: 'ops-test', AUTH_IP_MAX: '1000' });
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCATION as L } from '@krewzo/shared';

const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db.js');
const safety = await import('../src/safety.js');
let server, base;
before(async () => { ({ server } = createApp()); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

async function call(method, p, body, token, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }), ...headers }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const customer = async (phone) => (await call('POST', '/api/auth/customer', { phone, pin: '1234', name: 'Test ' + phone.slice(-3) })).body.token;
const worker = async (phone) => (await call('POST', '/api/auth/worker', { phone, pin: '1234' })).body.token;
const book = (t, extra = {}) => call('POST', '/api/bookings', { skill_tier: 'TIER_1', trade_tag: 'LOADING', duration: '2H', worker_count: 1, booking_mode: 'INSTANT', lat: L.lat, lng: L.lng, address: 'Plot 9, Madhapur', upi_id: 'me@okhdfc', addons: [], insurance: false, ...extra }, t);
const minsAgo = (m) => new Date(Date.now() - m * 60e3).toISOString();
const ops = (method, p, body) => call(method, p, body, null, { 'x-admin-key': 'ops-test' });
const group = async (t, id) => (await call('GET', '/api/bookings', null, t)).body.flatMap((g) => g.tickets).find((x) => x.id === id);

test('nobody takes the job: cancelled with a full refund after 15 minutes', async () => {
  const c = await customer('9666600001');
  const id = (await book(c)).body.tickets[0].id;
  safety.sweep();
  assert.equal((await group(c, id)).status, 'SEARCHING', 'still searching before 15 min');
  db.prepare('UPDATE bookings SET searching_since = ? WHERE id = ?').run(minsAgo(16), id);
  safety.sweep();
  const t = await group(c, id);
  assert.equal(t.status, 'CANCELLED');
  assert.equal(t.cancel_reason, 'NO_WORKER');
  assert.equal(t.escrow.status, 'REFUNDED');
});

test('worker no-show: customer can report it once late; 3 strikes pause the account', async () => {
  const c = await customer('9666600002');
  const w = await worker('9000000001');
  const accept = async () => {
    const id = (await book(c)).body.tickets[0].id;
    assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, w)).status, 200);
    return id;
  };
  let id = await accept();
  assert.equal((await call('POST', `/api/bookings/${id}/no-show`, null, c)).status, 409, 'too early to report');
  db.prepare('UPDATE bookings SET assigned_at = ? WHERE id = ?').run(minsAgo(31), id);
  const r = await call('POST', `/api/bookings/${id}/no-show`, null, c);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'SEARCHING', 'back to finding another worker');

  id = await accept(); // strike 2: automatic, 45 min without arriving
  db.prepare('UPDATE bookings SET assigned_at = ? WHERE id = ?').run(minsAgo(46), id);
  safety.sweep();
  assert.equal((await group(c, id)).status, 'SEARCHING');

  id = await accept();
  db.prepare('UPDATE bookings SET assigned_at = ? WHERE id = ?').run(minsAgo(46), id);
  safety.sweep();
  const home = (await call('GET', '/api/workers/me/home', null, w)).body;
  assert.equal(home.worker.is_online, false, 'paused worker is taken off duty');
  assert.ok(Date.parse(home.worker.suspended_until) > Date.now());
  assert.equal((await call('PATCH', '/api/workers/me', { is_online: true }, w)).status, 403);
});

async function startedJob(c, w) {
  const id = (await book(c)).body.tickets[0].id;
  assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, w)).status, 200);
  const code = (await group(c, id)).start_handshake.otp_code;
  assert.equal((await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'OTP', payload: { otp_code: code } }, w)).body.booking.status, 'IN_PROGRESS');
  db.prepare('UPDATE bookings SET started_at = ? WHERE id = ?').run(minsAgo(30), id);
  return id;
}

test('a problem reported during the job holds the payment until ops decide', async () => {
  const c = await customer('9666600003');
  const w = await worker('9000000002');
  const id = await startedJob(c, w);
  assert.equal((await call('POST', `/api/bookings/${id}/report`, { category: 'NOPE' }, c)).status, 400);
  const rep = await call('POST', `/api/bookings/${id}/report`, { category: 'ASKED_EXTRA_MONEY', details: 'Asked for 500 cash' }, c);
  assert.equal(rep.body.payment_held, true);
  const end = (await group(c, id)).end_handshake.otp_code;
  const tryEnd = await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'OTP', payload: { otp_code: end } }, w);
  assert.equal(tryEnd.status, 423);
  assert.equal(tryEnd.body.code, 'DISPUTED');

  const list = (await ops('GET', '/api/admin/reports')).body;
  const r = list.find((x) => x.booking_id === id);
  assert.equal(r.category, 'ASKED_EXTRA_MONEY');
  const res = await ops('POST', `/api/admin/reports/${r.id}/resolve`, { action: 'REFUND', strike: true, note: 'confirmed by call' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const t = await group(c, id);
  assert.equal(t.status, 'CANCELLED');
  assert.equal(t.escrow.status, 'REFUNDED');
});

test('ops can also release a held payment to the worker', async () => {
  const c = await customer('9666600004');
  const w = await worker('9000000005');
  const id = await startedJob(c, w);
  await call('POST', `/api/bookings/${id}/report`, { category: 'POOR_QUALITY' }, c);
  const r = (await ops('GET', '/api/admin/reports')).body.find((x) => x.booking_id === id);
  await ops('POST', `/api/admin/reports/${r.id}/resolve`, { action: 'PAY_WORKER' });
  const t = await group(c, id);
  assert.equal(t.status, 'PAID_OUT');
  assert.equal(t.escrow.status, 'RELEASED_UPI');

  // and the worker rates the customer; future offers show that rating
  assert.equal((await call('POST', `/api/bookings/${id}/rate-customer`, { stars: 2 }, w)).status, 200);
  assert.equal((await call('POST', `/api/bookings/${id}/rate-customer`, { stars: 5 }, w)).status, 409, 'once only');
  const u = db.prepare("SELECT rating, rating_count FROM users WHERE phone = '9666600004'").get();
  assert.equal(u.rating_count, 1);
  assert.ok(u.rating < 5);
});

test('SOS reaches the ops screen with the location', async () => {
  const c = await customer('9666600005');
  assert.equal((await call('POST', '/api/sos', { lat: 17.45, lng: 78.39 }, c)).status, 200);
  const s = (await ops('GET', '/api/admin/sos')).body;
  assert.equal(s[0].phone, '9666600005');
  assert.equal(s[0].lat, 17.45);
  await ops('POST', `/api/admin/sos/${s[0].id}/handled`);
  assert.equal((await ops('GET', '/api/admin/sos')).body.length, 0);
});

test('booking spam is limited', async () => {
  const c = await customer('9666600006');
  for (let i = 0; i < safety.RULES.BOOKINGS_PER_HOUR; i++) assert.equal((await book(c)).status, 201);
  const r = await book(c);
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'RATE_LIMIT');
});

test('PIN lockout is stored in the database (survives restarts)', async () => {
  await customer('9666600007');
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/customer', { phone: '9666600007', pin: '0000' });
  const row = db.prepare("SELECT until FROM auth_limits WHERE key = 'customer:9666600007'").get();
  assert.ok(row.until > Date.now());
  assert.equal((await call('POST', '/api/auth/customer', { phone: '9666600007', pin: '1234' })).status, 429, 'right PIN still locked');
});

test('one network cannot try endless logins (finding registered numbers / guessing PINs)', () => {
  for (let i = 0; i < 1000; i++) safety.limitIp('203.0.113.7');
  assert.throws(() => safety.limitIp('203.0.113.7'), /Too many login attempts/);
  assert.doesNotThrow(() => safety.limitIp('198.51.100.1'), 'other networks unaffected');
});
