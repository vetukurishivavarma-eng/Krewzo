// Ops team accounts: setup code -> 6-digit PIN, staying logged in, ops actions from the app, and notifications.
Object.assign(process.env, { KREWZO_DB: ':memory:', ADMIN_KEY: 'owner-key', AUTH_IP_MAX: '1000' });
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCATION as L } from '@krewzo/shared';

const { createApp } = await import('../src/app.js');
const ops = await import('../src/ops.js');
let server, base;
before(async () => { ({ server } = createApp()); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

async function call(method, p, body, token, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }), ...headers }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const owner = (method, p, body) => call(method, p, body, null, { 'x-admin-key': 'owner-key' });

let opsToken;
test('owner adds an ops account; first login needs the setup code, then a 6-digit PIN', async () => {
  const add = await owner('POST', '/api/admin/ops-accounts', { phone: '9555500001', name: 'Priya Ops' });
  assert.equal(add.status, 200);
  assert.match(add.body.setup_code, /^\d{6}$/);
  assert.equal((await call('POST', '/api/admin/ops-accounts', { phone: '9555500002', name: 'X' })).status, 401, 'only the owner manages accounts');

  const noCode = await call('POST', '/api/auth/ops', { phone: '9555500001', pin: '246810' });
  assert.equal(noCode.body.code, 'SETUP_REQUIRED');
  assert.equal((await call('POST', '/api/auth/ops', { phone: '9555500001', pin: '246810', setup_code: '000000' === add.body.setup_code ? '111111' : '000000' })).status, 401);
  assert.equal((await call('POST', '/api/auth/ops', { phone: '9555500001', pin: '1234', setup_code: add.body.setup_code })).status, 400, 'ops PIN is 6 digits');
  const first = await call('POST', '/api/auth/ops', { phone: '9555500001', pin: '246810', setup_code: add.body.setup_code });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.admin.active, true);

  const again = await call('POST', '/api/auth/ops', { phone: '9555500001', pin: '246810' });
  assert.equal(again.status, 200, 'setup code no longer needed');
  opsToken = again.body.token;
  assert.equal((await call('POST', '/api/auth/ops', { phone: '9999900000', pin: '246810' })).status, 401, 'unknown numbers look like a wrong PIN');
});

test('ops login stays alive: every open hands back a fresh token', async () => {
  const me = await call('GET', '/api/ops/me', null, opsToken);
  assert.equal(me.body.admin.name, 'Priya Ops');
  const exp = (t) => JSON.parse(Buffer.from(t.split('.')[0], 'base64url').toString()).exp;
  assert.ok(exp(me.body.token) >= exp(opsToken));
  assert.ok(exp(me.body.token) - Date.now() > 50 * 864e5, 'about 60 days, renewed on each open');
});

test('ops account can use the ops screens; customers and workers cannot', async () => {
  assert.equal((await call('GET', '/api/admin/kyc', null, opsToken)).status, 200);
  assert.equal((await call('GET', '/api/admin/reports', null, opsToken)).status, 200);
  assert.equal((await call('GET', '/api/admin/sos', null, opsToken)).status, 200);
  assert.equal((await call('GET', '/api/admin/ops-accounts', null, opsToken)).status, 401, 'but cannot manage the team');
  const cust = (await call('POST', '/api/auth/customer', { phone: '9555500009', pin: '1234', name: 'Cust' })).body.token;
  assert.equal((await call('GET', '/api/admin/kyc', null, cust)).status, 401);
});

test('new reports and SOS notify the ops team (SOS as urgent)', async () => {
  const cust = (await call('POST', '/api/auth/customer', { phone: '9555500010', pin: '1234', name: 'Cust B' })).body.token;
  await call('POST', '/api/sos', { lat: 17.4, lng: 78.4 }, cust);
  assert.equal(ops.lastNotice.tab, 'sos');
  assert.equal(ops.lastNotice.urgent, true);
  assert.match(ops.lastNotice.body, /9555500010/);

  const w = (await call('POST', '/api/auth/worker', { phone: '9000000001', pin: '1234' })).body.token;
  const id = (await call('POST', '/api/bookings', { skill_tier: 'TIER_1', trade_tag: 'LOADING', duration: '2H', worker_count: 1, booking_mode: 'INSTANT', lat: L.lat, lng: L.lng, address: 'Plot 2', upi_id: 'custb@okhdfc', addons: [], insurance: false }, cust)).body.tickets[0].id;
  await call('POST', `/api/bookings/${id}/accept`, null, w);
  await call('POST', `/api/bookings/${id}/report`, { category: 'ABUSIVE' }, w);
  assert.equal(ops.lastNotice.tab, 'reports');
});

test('removing an ops account ends its access at once', async () => {
  const id = (await owner('GET', '/api/admin/ops-accounts')).body[0].id;
  await owner('DELETE', `/api/admin/ops-accounts/${id}`);
  assert.equal((await call('GET', '/api/admin/kyc', null, opsToken)).status, 401);
  assert.equal((await call('GET', '/api/ops/me', null, opsToken)).status, 401);
});
