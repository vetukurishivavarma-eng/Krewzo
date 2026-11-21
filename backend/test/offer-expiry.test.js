// An unanswered offer stops ringing everywhere after OFFER_TTL_S: the server drops it, tells the app (socket),
// and accepting late fails. Own file = own process, so the short TTL doesn't touch the main loop test.
process.env.KREWZO_DB = ':memory:';
process.env.OFFER_TTL_S = '1';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as ioc } from 'socket.io-client';
import { DEFAULT_LOCATION as L } from '@krewzo/shared';

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

test('missed offer is withdrawn after the timer and cannot be accepted late', async () => {
  const cust = await login('customer', '9999999999');
  const ramu = await login('worker', '9000000001');
  const sock = ioc(base, { auth: { token: ramu }, transports: ['websocket'] });
  await new Promise((r) => sock.on('connect', r));
  const offered = new Promise((r) => sock.on('job:offer', r));
  const withdrawn = new Promise((r) => sock.on('job:taken', r));

  const id = (await call('POST', '/api/bookings', {
    skill_tier: 'TIER_1', trade_tag: 'LOADING', duration: '2H', worker_count: 1, booking_mode: 'INSTANT',
    lat: L.lat, lng: L.lng, address: 'Plot 12, Madhapur', upi_id: 'demo@okhdfc', addons: [], insurance: true,
  }, cust)).body.tickets[0].id;

  const o = await offered;
  assert.equal(o.booking_id, id);
  assert.ok(Date.parse(o.expires_at) > Date.now(), 'offer carries its deadline');
  assert.equal((await call('GET', '/api/workers/me/home', null, ramu)).body.offers.length, 1);

  assert.equal((await withdrawn).booking_id, id); // ~2.5 s
  assert.equal((await call('GET', '/api/workers/me/home', null, ramu)).body.offers.length, 0);
  assert.equal((await call('POST', `/api/bookings/${id}/accept`, null, ramu)).status, 409);

  // and moving around (which re-runs dispatch) doesn't make it ring again
  let again = false;
  sock.on('job:offer', (x) => { if (x.booking_id === id) again = true; });
  await call('PATCH', '/api/workers/me', { lat: L.lat + 0.001, lng: L.lng }, ramu);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(again, false);
  sock.close();
});
