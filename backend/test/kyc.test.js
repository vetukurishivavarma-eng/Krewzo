// Worker ID check end to end, with Secure QRs built here in UIDAI's format and signed by a test key that stands
// in for UIDAI's certificate (installed via UIDAI_CERT_DIR). Own process: its own env + in-memory DB.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const uidai = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const forger = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krewzo-uidai-'));
fs.writeFileSync(path.join(certDir, 'uidai-test.pem'), uidai.publicKey.export({ type: 'spki', format: 'pem' }));
Object.assign(process.env, { KREWZO_DB: ':memory:', UIDAI_CERT_DIR: certDir, AUTO_KYC: '1', ADMIN_KEY: 'ops-test', UIDAI_STRICT: '1' });

const PHOTO = fs.readFileSync(new URL('./fixtures/face.jp2', import.meta.url));
const mobileHash = (mobile, last4) => {
  let h = mobile;
  for (let i = 0; i < Math.max(1, Number(last4.slice(-1))); i++) h = crypto.createHash('sha256').update(h).digest('hex');
  return Buffer.from(h, 'hex');
};
// Build a Secure QR exactly as UIDAI lays it out (V2: version first, mobile last-4 after VTC).
function secureQr({ version = 'V2', indicator = 2, last4 = '4321', name = 'Ravi Kumar', dob = '15-08-1992', gender = 'M', mobile, signer = uidai.privateKey }) {
  const fields = [...(version === 'V1' ? [] : [version]), String(indicator), last4 + '20261121103000123', name, dob, gender,
    'S/O Ramesh', 'Rangareddy', 'Near temple', '12-3/4', 'Madhapur', '500081', 'Madhapur', 'Telangana', 'Road 3', 'Serilingampally', 'Hyderabad',
    ...(version === 'V1' ? [] : [indicator >= 2 ? mobile.slice(-4) : ''])];
  const hashes = indicator === 3 ? [crypto.randomBytes(32), mobileHash(mobile, last4)] : indicator === 2 ? [mobileHash(mobile, last4)] : indicator === 1 ? [crypto.randomBytes(32)] : [];
  const signed = Buffer.concat([...fields.flatMap((f) => [Buffer.from(f, 'utf8'), Buffer.from([0xff])]), PHOTO, ...hashes]);
  const all = Buffer.concat([signed, crypto.sign('sha256', signed, signer)]);
  return BigInt('0x' + zlib.gzipSync(all).toString('hex')).toString(10);
}
const SELFIE = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(8000)]).toString('base64');

const { createApp } = await import('../src/app.js');
let server, base;
before(async () => { ({ server } = createApp()); await new Promise((r) => server.listen(0, r)); base = `http://localhost:${server.address().port}`; });
after(() => { server.close(); fs.rmSync(certDir, { recursive: true, force: true }); });

async function call(method, p, body, token, headers = {}) {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: 'Bearer ' + token }), ...headers }, body: body && JSON.stringify(body) });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, type, body: type.includes('json') ? await r.json() : null };
}
const join = async (phone, name) => (await call('POST', '/api/auth/worker', { phone, pin: '1234', name, skill_tier: 'TIER_1', trade_tags: ['HELPER'], language: 'EN' })).body.token;
const submit = (token, qr) => call('POST', '/api/workers/me/kyc', { qr, selfie: SELFIE, consent: true }, token);
const ops = (method, p, body) => call(method, p, body, null, { 'x-admin-key': 'ops-test' });

test('new partner starts unverified and cannot take jobs', async () => {
  const t = await join('9876500001', 'Ravi');
  assert.equal((await call('GET', '/api/workers/me/kyc', null, t)).body.status, 'NONE');
  assert.equal((await call('GET', '/api/workers/me/home', null, t)).body.worker.kyc_verified, false);
});

test('edited / home-made QR fails the UIDAI signature check', async () => {
  const t = await join('9876500002', 'Ravi');
  const r = await submit(t, secureQr({ mobile: '9876500002', signer: forger.privateKey }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'BAD_SIGNATURE');

  // Not strict (until real cards are confirmed): a failed signature goes to ops review, never auto-approved.
  process.env.UIDAI_STRICT = '';
  const soft = await submit(t, secureQr({ mobile: '9876500002', last4: '1110', signer: forger.privateKey }));
  process.env.UIDAI_STRICT = '1';
  assert.equal(soft.body.status, 'PENDING');
  assert.ok(soft.body.flags.includes('SIGNATURE_FAILED'));
});

test('Aadhaar mobile must match the registered phone', async () => {
  const t = await join('9876500003', 'Ravi');
  const r = await submit(t, secureQr({ mobile: '9000011111' }));
  assert.equal(r.body.code, 'MOBILE_MISMATCH');
  // V1 (2019) QR has no mobile last-4: the hash alone must catch it too
  assert.equal((await submit(t, secureQr({ version: 'V1', indicator: 3, mobile: '9000011111' }))).body.code, 'MOBILE_MISMATCH');
});

test('valid signed QR + matching mobile + selfie verifies the partner; customers can see the photo', async () => {
  const t = await join('9876500004', 'Ravi');
  const r = await submit(t, secureQr({ version: 'V1', indicator: 3, last4: '5557', mobile: '9876500004' }));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, 'VERIFIED');
  assert.equal(r.body.aadhaar_last4, '5557');
  assert.equal(r.body.name, 'Ravi Kumar');
  const w = (await call('GET', '/api/workers/me/home', null, t)).body.worker;
  assert.equal(w.kyc_verified, true);
  assert.equal((await fetch(`${base}/api/workers/${w.id}/photo`)).status, 404, 'no guessable photo links');
  const photo = await fetch(`${base}/api/photos/${w.photo_token}`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/jpeg');
});

test('the same Aadhaar cannot be used on a second account', async () => {
  const a = await join('9876500005', 'Suma');
  assert.equal((await submit(a, secureQr({ name: 'Suma Devi', gender: 'F', last4: '7770', mobile: '9876500005' }))).body.status, 'VERIFIED');
  const b = await join('9876500006', 'Suma');
  const r = await submit(b, secureQr({ name: 'Suma Devi', gender: 'F', last4: '7770', mobile: '9876500006' }));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DUPLICATE');
});

test('under-18 and old unsigned QRs are refused', async () => {
  const t = await join('9876500007', 'Kiran');
  assert.equal((await submit(t, secureQr({ name: 'Kiran', dob: '01-01-2012', mobile: '9876500007' }))).body.code, 'UNDER_18');
  assert.equal((await submit(t, '<?xml version="1.0"?><PrintLetterBarcodeData uid="123412341234" name="Kiran"/>')).body.code, 'OLD_QR');
  assert.equal((await submit(t, 'https://example.com')).body.code, 'NOT_AADHAAR');
});

test('no mobile in the QR goes to ops review; reject + block stops that Aadhaar for good', async () => {
  const t = await join('9876500008', 'Mohan');
  const r = await submit(t, secureQr({ version: 'V1', indicator: 0, name: 'Mohan Rao', last4: '2468' }));
  assert.equal(r.body.status, 'PENDING');
  assert.deepEqual(r.body.flags, ['NO_MOBILE_IN_QR']);

  assert.equal((await call('GET', '/api/admin/kyc')).status, 401);
  const list = (await ops('GET', '/api/admin/kyc')).body;
  const row = list.find((k) => k.phone === '9876500008');
  assert.ok(row.aadhaar_photo.startsWith('data:image/bmp;base64,'), 'Aadhaar JPEG 2000 photo decoded for ops');
  assert.ok(row.selfie.startsWith('data:image/jpeg;base64,'));
  assert.equal(row.sig_ok, true);

  const w = (await ops('POST', `/api/admin/workers/${row.worker_id}/kyc`, { verified: false, block: true, note: 'fake' })).body;
  assert.equal(w.kyc_verified, false);
  const again = await submit(t, secureQr({ version: 'V1', indicator: 0, name: 'Mohan Rao', last4: '2468' }));
  assert.equal(again.status, 403);
  assert.equal(again.body.code, 'BLOCKED');
});

test('admin page is served', async () => {
  const r = await fetch(base + '/admin');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Krewzo ops/);
});

test('ops can send an old auto-approved partner back through the ID check', async () => {
  const t = await join('9876500009', 'Old Partner');
  const r = await ops('POST', '/api/admin/kyc/reset', { phone: '9876500009' });
  assert.equal(r.status, 200);
  assert.equal(r.body.kyc_verified, false);
  assert.equal((await call('GET', '/api/workers/me/kyc', null, t)).body.status, 'NONE');
});
