// Full loop over real HTTP + sockets: Book -> Accept -> START handshake -> END handshake -> escrow release,
// plus wrong-code lockout, cancel/refund, multi-worker tickets, WhatsApp bridge and credit passbook.
process.env.KREWZO_DB = ':memory:';
process.env.NBFC_API_KEY = 'nbfc-test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { DEFAULT_LOCATION as L, quotePrice } from '@krewzo/shared';

const { createApp } = await import('../src/app.js');
let server, base;
before(async () => {
  ({ server } = createApp());
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body, token) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}
const login = async (role, phone) => (await call('POST', `/api/auth/${role}`, { phone, pin: '1234' })).body.token;
const book = (token, extra = {}) => call('POST', '/api/bookings', {
  skill_tier: 'TIER_1', trade_tag: 'LOADING', duration: '4H', worker_count: 1, booking_mode: 'INSTANT',
  lat: L.lat, lng: L.lng, address: 'Plot 12, Madhapur', upi_id: 'demo@okhdfc', addons: ['TOOLKIT'], insurance: true, ...extra,
}, token);

test('pricing', () => {
  const q = quotePrice({ skill_tier: 'TIER_1', duration: '4H', worker_count: 3, addons: ['TOOLKIT'], insurance: true });
  assert.equal(q.per_worker.base_wage, 598);
  assert.equal(q.per_worker.worker_payout, 648);
  assert.equal(q.per_worker.platform_fee, 60);
  assert.equal(q.per_worker.escrow_total, 648 + 60 + 11 + 19);
  assert.equal(q.total.escrow_total, q.per_worker.escrow_total * 3);
});

test('book -> accept -> start -> end -> paid out', async () => {
  const cust = await login('customer', '9999999999');
  const ramu = await login('worker', '9000000001');
  const sock = ioc(base, { auth: { token: ramu }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', r));
  const offered = new Promise((r) => sock.on('job:offer', r));

  const g = await book(cust);
  assert.equal(g.status, 201, JSON.stringify(g.body));
  const id = g.body.tickets[0].id;
  assert.equal(g.body.tickets[0].status, 'SEARCHING');
  assert.equal(g.body.tickets[0].escrow.status, 'HELD');
  const offer = await offered;
  assert.equal(offer.booking_id, id);
  assert.equal(offer.payout, 648);
  assert.ok(offer.customer_name && !offer.customer_name.includes(' '), 'offer shows the customer first name only');
  assert.ok(offer.area && offer.area.length > 0);
  sock.close();

  // Lakshmi (also TIER_1, nearby) was offered too but loses the race.
  const laxmi = await login('worker', '9000000002');
  assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, ramu)).status, 200);
  assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, laxmi)).status, 409);

  // Worker view never leaks codes; customer view has them.
  const wv = (await call('GET', '/api/workers/me/home', null, ramu)).body.active;
  assert.equal(wv.start_handshake, undefined);
  let cv = (await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0];
  assert.equal(cv.status, 'ASSIGNED');
  const start = cv.start_handshake;

  // Wrong colour pin, then correct one (arrival is implied by verifying at the door).
  const bad = await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'COLOR_PIN', payload: { color_tag: start.color_tag, short_pin: start.short_pin === '10' ? '11' : '10' } }, ramu);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.attempts_left, 4);
  const ok = await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'COLOR_PIN', payload: { color_tag: start.color_tag, short_pin: start.short_pin } }, ramu);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.booking.status, 'IN_PROGRESS');

  cv = (await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0];
  const end = await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'QR', payload: { qr_token: cv.end_handshake.qr_token } }, ramu);
  assert.equal(end.status, 200, JSON.stringify(end.body));
  assert.equal(end.body.booking.status, 'PAID_OUT');
  assert.equal(end.body.receipt.amount, 648);
  assert.equal(end.body.booking.escrow.status, 'RELEASED_UPI');

  const home = (await call('GET', '/api/workers/me/home', null, ramu)).body;
  assert.equal(home.today_earnings, 648);
  assert.equal(home.worker.total_earnings, 648);
  const pb = (await call('GET', '/api/workers/me/passbook', null, ramu)).body;
  assert.equal(pb.shifts.length, 1);
  assert.equal(pb.shifts[0].end_method, 'QR');
  assert.equal((await call('POST', `/api/bookings/${id}/rate`, { stars: 5 }, cust)).status, 200);
});

test('five wrong codes rotate the handshake', async () => {
  const cust = await login('customer', '9999999999');
  const imran = await login('worker', '9000000004');
  const g = await book(cust, { skill_tier: 'TIER_3', trade_tag: 'ELECTRICIAN', addons: [] });
  const id = g.body.tickets[0].id;
  assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, imran)).status, 200);
  const before = (await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0].start_handshake.otp_code;
  const wrong = before === '0000' ? '1111' : '0000';
  let r;
  for (let i = 0; i < 5; i++) r = await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'OTP', payload: { otp_code: wrong } }, imran);
  assert.equal(r.body.rotated, true);
  const after = (await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0].start_handshake;
  assert.notEqual(after.issued_at, undefined);
  assert.equal((await call('POST', `/api/bookings/${id}/verify-handshake`, { method: 'OTP', payload: { otp_code: after.otp_code } }, imran)).body.booking.status, 'IN_PROGRESS');
});

test('multi-worker booking creates tickets; cancel refunds', async () => {
  const cust = await login('customer', '9999999999');
  const g = await book(cust, { worker_count: 3, account_type: 'BUSINESS', gstin: '36ABCDE1234F1Z5', business_name: 'Sai Constructions' });
  assert.equal(g.status, 201, JSON.stringify(g.body));
  assert.equal(g.body.tickets.length, 3);
  const c = await call('POST', `/api/bookings/${g.body.tickets[2].id}/cancel`, null, cust);
  assert.equal(c.body.status, 'CANCELLED');
  assert.equal(c.body.escrow.status, 'REFUNDED');
  const inv = await fetch(`${base}/api/groups/${g.body.id}/invoice?token=${cust}`);
  assert.match(await inv.text(), /36ABCDE1234F1Z5/);
  assert.equal((await book(cust, { account_type: 'BUSINESS', gstin: 'BAD' })).status, 400);
  for (const t of g.body.tickets.slice(0, 2)) await call('POST', `/api/bookings/${t.id}/cancel`, null, cust);
});

test('whatsapp bridge runs the same loop', async () => {
  const cust = await login('customer', '9999999999');
  const wa = async (text) => (await call('POST', '/webhooks/whatsapp', { from: '919000000003', text })).body.replies[0].reply;
  assert.match(await wa('2'), /🔴/);
  assert.match(await wa('1'), /🟢/);
  const g = await book(cust, { skill_tier: 'TIER_2', trade_tag: 'PAINTER', addons: [] });
  assert.match(await wa('ACCEPT'), /maps\.google/);
  const s = (await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0].start_handshake;
  await wa(`OTP ${s.otp_code}`);
  const e = (await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0];
  assert.equal(e.status, 'IN_PROGRESS');
  assert.match(await wa(e.end_handshake.otp_code), /₹/);
  assert.equal((await call('GET', `/api/groups/${g.body.id}`, null, cust)).body.tickets[0].status, 'PAID_OUT');
});

test('credit passbook needs NBFC key', async () => {
  assert.equal((await fetch(`${base}/api/workers/1/credit-passbook`)).status, 401);
  const r = await fetch(`${base}/api/workers/1/credit-passbook`, { headers: { 'x-api-key': 'nbfc-test' } });
  const c = await r.json();
  assert.equal(c.verified_shift_count, 1);
  assert.equal(c.on_time_completion_rate, 1);
  assert.ok(c.krewzo_score > 300);
});

test('five wrong PINs lock the login, even with the right PIN', async () => {
  const wrong = () => call('POST', '/api/auth/worker', { phone: '9000000005', pin: '0000' });
  for (let i = 4; i >= 1; i--) assert.match((await wrong()).body.error, new RegExp(`${i} tr`));
  assert.equal((await wrong()).status, 429);
  const right = await call('POST', '/api/auth/worker', { phone: '9000000005', pin: '1234' });
  assert.equal(right.status, 429);
  assert.equal((await call('POST', '/api/auth/customer', { phone: '9999999999', pin: '1234' })).status, 200); // other accounts unaffected
});

test('token for a deleted account gets 401 so the app returns to login', async () => {
  const { signToken } = await import('../src/auth.js');
  assert.equal((await call('GET', '/api/workers/me/home', null, signToken('worker', 99999))).status, 401);
  assert.equal((await call('GET', '/api/me', null, signToken('customer', 99999))).status, 401);
});

test('customer sees live worker location only until the worker arrives', async () => {
  const cust = await login('customer', '9999999999');
  const w = await login('worker', '9000000003');
  const id = (await book(cust)).body.tickets[0].id;
  assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, w)).status, 200);

  const sock = ioc(base, { auth: { token: cust }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', r));
  const seen = [];
  sock.on('worker:location', (e) => seen.push(e));
  const move = (lat) => call('PATCH', '/api/workers/me', { lat, lng: L.lng }, w);
  const settle = () => new Promise((r) => setTimeout(r, 200));

  await move(L.lat + 0.01); await settle();
  assert.deepEqual(seen.map((e) => [e.booking_id, e.lat]), [[id, L.lat + 0.01]]);

  assert.equal((await call('POST', `/api/bookings/${id}/arrive`, null, w)).status, 200);
  await move(L.lat + 0.02); await settle();
  assert.equal(seen.length, 1); // stopped at arrival
  sock.close();
});

test('push token is stored per phone and never returned by the API', async () => {
  const a = await login('worker', '9000000001'), b = await login('worker', '9000000002');
  const r = await call('PATCH', '/api/workers/me', { fcm_token: 'phone-token-1' }, a);
  assert.equal(r.status, 200);
  assert.equal('fcm_token' in r.body, false);
  assert.equal('fcm_token' in (await call('GET', '/api/workers/me/home', null, a)).body.worker, false);
  const { db } = await import('../src/db.js');
  await call('PATCH', '/api/workers/me', { fcm_token: 'phone-token-1' }, b); // same phone, other account
  assert.deepEqual(db.prepare("SELECT phone FROM workers WHERE fcm_token = 'phone-token-1'").all().map((x) => x.phone), ['9000000002']);
  assert.equal((await call('PATCH', '/api/workers/me', { fcm_token: 42 }, b)).status, 400);
});

test('customer push token is stored and never returned by the API', async () => {
  const c = await login('customer', '9999999999');
  assert.equal((await call('PATCH', '/api/me', { fcm_token: 'cust-phone-1' }, c)).status, 200);
  assert.equal('fcm_token' in (await call('GET', '/api/me', null, c)).body.user, false);
  const { db } = await import('../src/db.js');
  assert.equal(db.prepare("SELECT fcm_token FROM users WHERE phone = '9999999999'").get().fcm_token, 'cust-phone-1');
  assert.equal((await call('PATCH', '/api/me', { fcm_token: null }, c)).status, 200);
  assert.equal(db.prepare("SELECT fcm_token FROM users WHERE phone = '9999999999'").get().fcm_token, null);
});
