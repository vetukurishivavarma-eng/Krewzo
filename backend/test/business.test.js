// Krewzo Business subscription end to end (own process, in-memory DB).
process.env.KREWZO_DB = ':memory:';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LOCATION as L, quotePrice } from '@krewzo/shared';

const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db.js');
let server, base;
before(async () => { ({ server } = createApp()); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
after(() => server.close());

async function call(method, p, body, token) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }) }, body: body && JSON.stringify(body) });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, type, body: type.includes('json') ? await r.json() : await r.text() };
}
const customer = async (phone, name) => (await call('POST', '/api/auth/customer', { phone, pin: '1234', name })).body.token;
const book = (token, extra = {}) => call('POST', '/api/bookings', {
  skill_tier: 'TIER_1', trade_tag: 'LOADING', duration: '4H', worker_count: 1, booking_mode: 'INSTANT',
  lat: L.lat, lng: L.lng, address: 'Site 4, Madhapur', addons: [], insurance: true, ...extra,
}, token);
const GST = '36ABCDE1234F1Z5';
const IST = 5.5 * 3600e3;
const monthOf = (d) => new Date(d.getTime() + IST).toISOString().slice(0, 7);
const monthsAgo = (n) => { const d = new Date(Date.now() + IST); d.setUTCDate(15); d.setUTCMonth(d.getUTCMonth() - n); return new Date(d.getTime() - IST); };

let owner;
test('subscribe to Business Pro: charged with GST, platform fee waived, wider search, monthly billing', async () => {
  owner = await customer('9811100001', 'Vijay Constructions');
  assert.equal((await call('GET', '/api/business', null, owner)).body.business, null);
  assert.equal((await book(owner, { pay_mode: 'MONTHLY' })).status, 402, 'no plan, no monthly billing');
  assert.equal((await call('POST', '/api/business/subscribe', { plan: 'PRO', business_name: 'Vijay Constructions', gstin: 'BAD', upi_id: 'vijay@okhdfc' }, owner)).status, 400);

  const s = (await call('POST', '/api/business/subscribe', { plan: 'PRO', business_name: 'Vijay Constructions', gstin: GST, upi_id: 'vijay@okhdfc' }, owner)).body.business;
  assert.equal(s.plan, 'PRO');
  assert.equal(s.payments[0].amount, 2499);
  assert.equal(s.payments[0].gst_amount, 450);
  assert.equal((await call('GET', '/api/me', null, owner)).body.user.business.role, 'OWNER');

  const g = await book(owner, { pay_mode: 'MONTHLY' }); // no UPI needed
  assert.equal(g.status, 201, JSON.stringify(g.body));
  const t = g.body.tickets[0];
  const q = quotePrice({ skill_tier: 'TIER_1', duration: '4H', insurance: true, fee_discount: 1 });
  assert.equal(t.platform_fee, 0);
  assert.equal(t.escrow_total, q.total.escrow_total);
  assert.equal(g.body.account_type, 'BUSINESS');
  assert.equal(g.body.gstin, GST);
  assert.equal(db.prepare('SELECT dispatch_km FROM bookings WHERE id = ?').get(t.id).dispatch_km, 5);

  const st = (await call('GET', '/api/business/statement', null, owner)).body;
  assert.equal(st.totals.due, t.escrow_total);
  assert.equal(st.payable, false, 'the running month is billed on the 1st');
});

test('Starter halves the fee and enforces its credit limit and team seats', async () => {
  const b = (await call('POST', '/api/business/plan', { plan: 'STARTER' }, owner)).body.business;
  assert.equal(b.plan, 'STARTER');
  const t = (await book(owner, { pay_mode: 'MONTHLY' })).body.tickets[0];
  assert.equal(t.platform_fee, Math.round(Math.max(29, Math.round(598 * 0.1)) * 0.5));

  const big = await book(owner, { pay_mode: 'MONTHLY', skill_tier: 'TIER_3', trade_tag: 'ELECTRICIAN', duration: '8H', worker_count: 15 });
  assert.equal(big.status, 402);
  assert.equal(big.body.code, 'CREDIT_LIMIT');
  assert.equal((await book(owner, { skill_tier: 'TIER_3', trade_tag: 'ELECTRICIAN', duration: '8H', worker_count: 15, upi_id: 'vijay@okhdfc' })).status, 201, 'UPI still works over the limit');

  await customer('9811100002', 'Site Manager A');
  await customer('9811100003', 'Site Manager B');
  await customer('9811100004', 'Site Manager C');
  assert.equal((await call('POST', '/api/business/members', { phone: '9800000000' }, owner)).status, 404);
  assert.equal((await call('POST', '/api/business/members', { phone: '9811100002' }, owner)).status, 200);
  const two = (await call('POST', '/api/business/members', { phone: '9811100003' }, owner)).body.business;
  assert.equal(two.seats_used, 3, 'pending invites hold a seat');
  assert.equal(two.invited.length, 2);
  // Nobody joins without saying yes
  const a = (await call('POST', '/api/auth/customer', { phone: '9811100002', pin: '1234' })).body.token;
  assert.equal((await call('GET', '/api/me', null, a)).body.user.business, null);
  const inv = (await call('GET', '/api/business', null, a)).body.invites;
  assert.equal(inv[0].business_name, 'Vijay Constructions');
  assert.equal((await call('POST', `/api/business/invites/${inv[0].owner_id}/accept`, null, a)).body.business.role, 'MEMBER');
  const m2 = (await call('POST', '/api/auth/customer', { phone: '9811100003', pin: '1234' })).body.token;
  assert.equal((await call('POST', `/api/business/invites/${inv[0].owner_id}/decline`, null, m2)).body.business, null);
  assert.equal((await call('POST', '/api/business/members', { phone: '9811100004' }, owner)).status, 200, 'the declined seat is free again');
  assert.equal((await call('POST', '/api/business/members', { phone: '9811100003' }, owner)).status, 409, 'Starter = 3 people');
});

test('team members book on the business plan; the bill shows who booked', async () => {
  const m = (await call('POST', '/api/auth/customer', { phone: '9811100002', pin: '1234' })).body.token;
  const me = (await call('GET', '/api/me', null, m)).body.user.business;
  assert.equal(me.role, 'MEMBER');
  assert.equal(me.business_name, 'Vijay Constructions');
  assert.equal((await call('POST', '/api/business/cancel', null, m)).status, 403, 'only the owner manages the plan');
  assert.equal((await book(m, { pay_mode: 'MONTHLY' })).status, 201);
  const st = (await call('GET', '/api/business/statement', null, owner)).body;
  assert.ok(st.rows.some((r) => r.booked_by === 'Site Manager A' && r.pay_mode === 'MONTHLY'));

  const csv = await call('GET', '/api/business/attendance.csv', null, owner);
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.body, /"Date","Booked by"/);
  assert.match(csv.body, /Site Manager A/);
  const inv = await call('GET', '/api/business/invoice', null, owner);
  assert.match(inv.body, /Tax invoice/);
  assert.match(inv.body, new RegExp(GST));
});

test('unpaid past bills stop monthly billing until paid', async () => {
  // Move this owner's monthly jobs into the two previous months.
  const ids = db.prepare("SELECT id FROM booking_groups WHERE billed_to IS NOT NULL AND pay_mode = 'MONTHLY'").all().map((r) => r.id);
  ids.forEach((id, i) => {
    const at = monthsAgo(i % 2 ? 2 : 1).toISOString();
    db.prepare('UPDATE booking_groups SET created_at = ? WHERE id = ?').run(at, id);
    db.prepare('UPDATE bookings SET created_at = ? WHERE group_id = ?').run(at, id);
  });
  const ov = (await call('GET', '/api/business', null, owner)).body.business;
  assert.equal(ov.overdue.length, 2);
  const blocked = await book(owner, { pay_mode: 'MONTHLY' });
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.code, 'BILL_OVERDUE');

  for (const month of ov.overdue) {
    const st = (await call('GET', `/api/business/statement?month=${month}`, null, owner)).body;
    assert.equal(st.payable, true);
    const paid = (await call('POST', '/api/business/statement/pay', { month }, owner)).body;
    assert.equal(paid.paid.amount, st.totals.due);
  }
  assert.equal((await call('POST', '/api/business/statement/pay', { month: monthOf(new Date()) }, owner)).status, 400, "the running month can't be paid yet");
  assert.equal((await book(owner, { pay_mode: 'MONTHLY' })).status, 201);
});

test('plan renews itself each period; a cancelled plan ends at the end of the paid period', async () => {
  const before = (await call('GET', '/api/business', null, owner)).body.business;
  db.prepare('UPDATE subscriptions SET renews_at = ? WHERE owner_id = (SELECT id FROM users WHERE phone = ?)').run(new Date(Date.now() - 1000).toISOString(), '9811100001');
  const renewed = (await call('GET', '/api/business', null, owner)).body.business;
  assert.ok(Date.parse(renewed.renews_at) > Date.now());
  assert.equal(renewed.payments.length, before.payments.length + 1);

  assert.equal((await call('POST', '/api/business/cancel', null, owner)).body.business.status, 'CANCELLED');
  assert.equal((await call('GET', '/api/business', null, owner)).body.business.plan, 'STARTER', 'still active until the period ends');
  db.prepare('UPDATE subscriptions SET renews_at = ? WHERE owner_id = (SELECT id FROM users WHERE phone = ?)').run(new Date(Date.now() - 1000).toISOString(), '9811100001');
  assert.equal((await call('GET', '/api/business', null, owner)).body.business, null);
  const m = (await call('POST', '/api/auth/customer', { phone: '9811100002', pin: '1234' })).body.token;
  assert.equal((await book(m, { pay_mode: 'MONTHLY' })).status, 402, 'team loses monthly billing too');
});
