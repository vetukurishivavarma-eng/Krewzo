import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import { SKILL_TIERS, TRADE_TAGS, rupees } from '@krewzo/shared';
import { db, now, SECRET } from './db.js';
import { checkPin, hashPin, normPhone, readToken, signToken, validPhone, validPin, safeEqual } from './auth.js';
import * as svc from './service.js';
import { extractMessages, handleMessage, notifyWhatsApp, sendWhatsApp } from './whatsapp.js';
import { seedIfEmpty } from './seed.js';
import { announceNewReleases } from './releases.js';
import * as kyc from './kyc.js';
import * as biz from './business.js';
import * as safety from './safety.js';
import { ADMIN_PAGE } from './admin-page.js';

// Wrong-PIN lockout and per-network login limits live in safety.js (stored in the DB, so restarts don't reset them).

// The phone's real address. On Render the TCP peer is an internal proxy (10.x), so read what the edge
// proxies add: Cloudflare's CF-Connecting-IP / True-Client-IP first, else the first X-Forwarded-For entry.
// Verified live 2026-11-21: Render passes CF-Connecting-IP (set by Cloudflare, not fakeable by the caller).
// The X-Forwarded-For fallback is only for local dev / other hosts.
export function clientIp(req) {
  const h = req.headers;
  const xff = String(h['x-forwarded-for'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  return String(h['cf-connecting-ip'] || h['true-client-ip'] || xff[0] || req.socket.remoteAddress || 'unknown');
}

// ?dl=<id>.<expiry>.<hmac> from /api/download-link: valid 5 minutes, for that exact file path, customer role only.
function readDownload(req) {
  const m = /^(\d+)\.(\d+)\.([\w-]+)$/.exec(String(req.query.dl || ''));
  if (!m || Number(m[2]) < Date.now()) return null;
  const want = crypto.createHmac('sha256', SECRET).update(`customer|${m[1]}|${req.path}|${m[2]}`).digest('base64url');
  return safeEqual(m[3], want) ? { role: 'customer', id: Number(m[1]) } : null;
}

export function createApp() {
  seedIfEmpty();
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true } });

  // APKs load from https://localhost (Capacitor), so the API must allow cross-origin calls. Auth is a bearer token, not cookies.
  app.use((req, res, next) => {
    res.set({ 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE' });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  const json = (limit) => express.json({ limit, verify: (req, _res, buf) => { req.rawBody = buf; } });
  const small = json('100kb'), large = json('1mb'); // only the ID check carries a selfie photo
  app.use((req, res, next) => (req.path === '/api/workers/me/kyc' ? large : small)(req, res, next));

  const auth = (role) => (req, _res, next) => {
    // Login tokens only travel in the Authorization header; file downloads use short-lived signed links (?dl=).
    const t = readToken((req.headers.authorization || '').replace(/^Bearer /, '')) || readDownload(req);
    if (!t || (role && t.role !== role)) throw new svc.ApiError(401, 'Please log in again');
    // A valid token can outlive its account (e.g. the demo DB was reset), so the apps must be sent back to login.
    const table = { customer: 'users', worker: 'workers' }[t.role];
    if (!table || !db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(t.id)) throw new svc.ApiError(401, 'Please log in again');
    req.auth = t;
    next();
  };

  // ---------- auth ----------
  app.post('/api/auth/customer', (req, res) => {
    safety.limitIp(clientIp(req));
    const phone = normPhone(req.body.phone);
    const { pin, name } = req.body;
    if (!validPhone(phone)) throw new svc.ApiError(400, 'Enter a 10-digit mobile number');
    if (!validPin(pin)) throw new svc.ApiError(400, 'PIN must be 4 digits');
    let u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (u) safety.verifyPinLimited('customer:' + phone, checkPin(pin, u.pin_hash));
    if (!u) {
      if (!name || String(name).trim().length < 2) throw new svc.ApiError(400, 'New here? Enter your name');
      const r = db.prepare('INSERT INTO users (phone, name, pin_hash, created_at) VALUES (?,?,?,?)').run(phone, String(name).trim(), hashPin(pin), now());
      u = { id: Number(r.lastInsertRowid) };
    }
    res.json({ token: signToken('customer', u.id), user: svc.publicUser(svc.getUser(u.id)) });
  });

  app.post('/api/auth/worker', (req, res) => {
    safety.limitIp(clientIp(req));
    const phone = normPhone(req.body.phone);
    const { pin } = req.body;
    if (!validPhone(phone)) throw new svc.ApiError(400, 'Enter a 10-digit mobile number');
    if (!validPin(pin)) throw new svc.ApiError(400, 'PIN must be 4 digits');
    let w = svc.getWorkerByPhone(phone);
    if (w) safety.verifyPinLimited('worker:' + phone, checkPin(pin, w.pin_hash));
    if (!w) {
      const { name, skill_tier, trade_tags = [], upi_id, language = 'EN' } = req.body;
      if (!name) return res.status(404).json({ error: 'NEW_WORKER', message: 'New partner — tell us your name and work' });
      if (!SKILL_TIERS[skill_tier]) throw new svc.ApiError(400, 'Pick your work level');
      const tags = trade_tags.filter((t) => TRADE_TAGS[t]);
      if (!tags.length) throw new svc.ApiError(400, 'Pick at least one work type');
      const r = db.prepare('INSERT INTO workers (phone, name, pin_hash, kyc_verified, skill_tier, trade_tags, upi_id, language, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        // New partners start unverified: the Aadhaar check (kyc.js) approves them.
        .run(phone, String(name).trim(), hashPin(pin), 0, skill_tier, JSON.stringify(tags), upi_id || `${phone}@upi`, ['EN', 'TE', 'HI'].includes(language) ? language : 'EN', now());
      w = svc.getWorker(Number(r.lastInsertRowid));
    }
    res.json({ token: signToken('worker', w.id), worker: svc.publicWorker(w) });
  });

  app.get('/api/me', auth(), (req, res) => {
    res.json(req.auth.role === 'customer' ? { user: { ...svc.publicUser(svc.getUser(req.auth.id)), business: biz.overview(req.auth.id).business } } : { worker: svc.publicWorker(svc.getWorker(req.auth.id)) });
  });

  // ---------- customer ----------
  app.patch('/api/me', auth('customer'), (req, res) => { svc.setPushToken('users', req.auth.id, req.body.fcm_token ?? null); res.json({ ok: true }); });
  app.post('/api/bookings', auth('customer'), (req, res) => res.status(201).json(svc.createBookings(svc.getUser(req.auth.id), req.body)));
  app.get('/api/bookings', auth('customer'), (req, res) => res.json(svc.listGroups(req.auth.id)));
  app.get('/api/groups/:gid', auth('customer'), (req, res) => res.json(svc.getGroup(req.auth.id, Number(req.params.gid))));
  app.get('/api/bookings/:id/cancel-quote', auth('customer'), (req, res) => res.json(svc.cancelQuote(req.auth.id, Number(req.params.id))));
  // ---------- trust & safety ----------
  app.post('/api/bookings/:id/no-show', auth('customer'), (req, res) => res.json(safety.reportNoShow(req.auth.id, Number(req.params.id))));
  app.post('/api/bookings/:id/report', auth(), (req, res) => res.json(safety.reportProblem(req.auth.role, req.auth.id, Number(req.params.id), req.body || {})));
  app.post('/api/bookings/:id/rate-customer', auth('worker'), (req, res) => res.json(safety.rateCustomer(req.auth.id, Number(req.params.id), req.body?.stars)));
  app.post('/api/sos', auth(), (req, res) => res.json(safety.raiseSos(req.auth.role, req.auth.id, req.body || {})));
  app.post('/api/bookings/:id/new-code', auth('customer'), (req, res) => res.json(svc.newCode(req.auth.id, Number(req.params.id))));
  // One-time-ish download link (5 min, this file only) so invoices / CSVs can open in the browser without the login token in the URL.
  app.post('/api/download-link', auth('customer'), (req, res) => {
    const path = String(req.body?.path || '');
    if (!/^\/api\/(groups\/\d+\/invoice|business\/(invoice|attendance\.csv))(\?[\w=&.-]*)?$/.test(path)) throw new svc.ApiError(400, 'Not a downloadable file');
    const exp = Date.now() + 5 * 60e3;
    const pathname = path.split('?')[0];
    const sig = crypto.createHmac('sha256', SECRET).update(`${req.auth.role}|${req.auth.id}|${pathname}|${exp}`).digest('base64url');
    res.json({ url: `${path}${path.includes('?') ? '&' : '?'}dl=${req.auth.id}.${exp}.${sig}` });
  });
  app.post('/api/bookings/:id/cancel', auth('customer'), (req, res) => res.json(svc.cancelBooking(req.auth.id, Number(req.params.id))));
  app.post('/api/bookings/:id/rate', auth('customer'), (req, res) => res.json(svc.rateWorker(req.auth.id, Number(req.params.id), req.body.stars)));
  app.get('/api/groups/:gid/invoice', auth('customer'), (req, res) => res.type('html').send(invoiceHtml(svc.getGroup(req.auth.id, Number(req.params.gid)), svc.getUser(req.auth.id))));

  // ---------- worker ----------
  const W = auth('worker');
  app.get('/api/workers/me/home', W, (req, res) => res.json(svc.workerHome(req.auth.id)));
  app.patch('/api/workers/me', W, (req, res) => res.json(svc.setWorkerStatus(req.auth.id, req.body)));
  app.get('/api/workers/me/passbook', W, (req, res) => res.json(svc.passbook(req.auth.id)));
  app.post('/api/bookings/:id/accept', W, (req, res) => res.json(svc.acceptJob(req.auth.id, Number(req.params.id))));
  app.post('/api/bookings/:id/skip', W, (req, res) => res.json(svc.skipJob(req.auth.id, Number(req.params.id))));
  app.post('/api/bookings/:id/release', W, (req, res) => res.json(svc.releaseJob(req.auth.id, Number(req.params.id))));
  app.post('/api/bookings/:id/arrive', W, (req, res) => res.json(svc.markArrived(req.auth.id, Number(req.params.id))));
  app.post('/api/bookings/:id/verify-handshake', W, (req, res) => res.json(svc.verifyHandshake(req.auth.id, Number(req.params.id), req.body.method, req.body.payload)));

  // NBFC partners call with x-api-key; a worker can always see their own.
  app.get('/api/workers/:id/credit-passbook', (req, res) => {
    const id = Number(req.params.id);
    const key = process.env.NBFC_API_KEY;
    const t = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    const self = t?.role === 'worker' && t.id === id;
    if (!self && !(key && safeEqual(req.headers['x-api-key'] || '', key))) throw new svc.ApiError(401, 'NBFC API key required');
    res.json(svc.creditPassbook(id));
  });

  // The release script calls this after publishing: push "new version ready" to every phone. Public on purpose:
  // it only re-reads GitHub releases (throttled), so calling it can't do anything but announce a real release.
  // Echoes only the caller's own address (used to check what the hosting proxies pass through).
  app.get('/api/whoami', (req, res) => res.json({ ip: clientIp(req), via: req.headers['cf-connecting-ip'] ? 'cf-connecting-ip' : req.headers['true-client-ip'] ? 'true-client-ip' : req.headers['x-forwarded-for'] ? 'x-forwarded-for' : 'socket' }));
  app.post('/api/releases/check', async (req, res) => res.json({ sent: await announceNewReleases(req.body?.tag) }));

  // ---------- Krewzo Business subscription ----------
  const C = auth('customer');
  app.get('/api/business', C, (req, res) => res.json(biz.overview(req.auth.id)));
  app.post('/api/business/subscribe', C, (req, res) => res.json(biz.subscribe(req.auth.id, req.body || {})));
  app.post('/api/business/plan', C, (req, res) => res.json(biz.changePlan(req.auth.id, req.body?.plan)));
  app.post('/api/business/cancel', C, (req, res) => res.json(biz.cancel(req.auth.id)));
  app.post('/api/business/resume', C, (req, res) => res.json(biz.resume(req.auth.id)));
  app.post('/api/business/members', C, (req, res) => res.json(biz.addMember(req.auth.id, req.body?.phone)));
  app.delete('/api/business/members/:id', C, (req, res) => res.json(biz.removeMember(req.auth.id, Number(req.params.id))));
  app.post('/api/business/invites/:ownerId/accept', C, (req, res) => res.json(biz.answerInvite(req.auth.id, Number(req.params.ownerId), true)));
  app.post('/api/business/invites/:ownerId/decline', C, (req, res) => res.json(biz.answerInvite(req.auth.id, Number(req.params.ownerId), false)));
  app.post('/api/business/leave', C, (req, res) => res.json(biz.leaveTeam(req.auth.id)));
  app.get('/api/business/statement', C, (req, res) => res.json(biz.statement(req.auth.id, req.query.month || undefined)));
  app.post('/api/business/statement/pay', C, (req, res) => res.json(biz.payBill(req.auth.id, req.body?.month)));
  app.get('/api/business/attendance.csv', C, (req, res) => {
    const month = req.query.month || biz.istMonth();
    res.set('content-disposition', `attachment; filename="krewzo-attendance-${month}.csv"`).type('text/csv').send(biz.attendanceCsv(req.auth.id, month));
  });
  app.get('/api/business/invoice', C, (req, res) => res.type('html').send(monthlyInvoiceHtml(biz.statement(req.auth.id, req.query.month || undefined))));

  // ---------- worker ID check (Aadhaar Secure QR + selfie) ----------
  app.get('/api/workers/me/kyc', W, (req, res) => res.json(kyc.kycStatus(req.auth.id)));
  app.post('/api/workers/me/kyc', W, (req, res) => res.json(kyc.submitKyc(req.auth.id, req.body || {})));
  app.get('/api/photos/:token', (req, res) => {
    const img = kyc.workerPhoto(req.params.token);
    if (!img) return res.sendStatus(404);
    res.set('cache-control', 'public, max-age=3600').type('image/jpeg').send(Buffer.from(img));
  });

  // ---------- ops ----------
  const admin = (req) => {
    const key = process.env.ADMIN_KEY;
    if (!key || !safeEqual(req.headers['x-admin-key'] || '', key)) throw new svc.ApiError(401, 'Admin key required');
  };
  app.get('/admin', (req, res) => res.type('html').send(ADMIN_PAGE));
  app.get('/api/admin/kyc', (req, res) => { admin(req); res.json(kyc.listKyc(['PENDING', 'VERIFIED', 'REJECTED'].includes(req.query.status) ? req.query.status : 'PENDING')); });
  app.get('/api/admin/reports', (req, res) => { admin(req); res.json(safety.listReports(req.query.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN')); });
  app.post('/api/admin/reports/:id/resolve', (req, res) => { admin(req); res.json(safety.resolveReport(Number(req.params.id), req.body || {})); });
  app.get('/api/admin/sos', (req, res) => { admin(req); res.json(safety.listSos()); });
  app.post('/api/admin/sos/:id/handled', (req, res) => { admin(req); res.json(safety.handleSos(Number(req.params.id))); });
  app.post('/api/admin/kyc/reset', (req, res) => { admin(req); res.json(kyc.resetKyc(req.body.phone)); });
  app.post('/api/admin/workers/:id/kyc', (req, res) => {
    admin(req);
    res.json(kyc.reviewKyc(Number(req.params.id), { verified: req.body.verified !== false, note: req.body.note, block: !!req.body.block }));
  });

  // ---------- WhatsApp bridge ----------
  app.get('/webhooks/whatsapp', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.WHATSAPP_VERIFY_TOKEN) return res.send(req.query['hub.challenge']);
    res.sendStatus(403);
  });
  app.post('/webhooks/whatsapp', (req, res) => {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (secret) {
      const sig = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
      if (!safeEqual(req.headers['x-hub-signature-256'] || '', sig)) return res.sendStatus(401);
    }
    const replies = extractMessages(req.body).map((m) => {
      const reply = handleMessage(m.from, m);
      if (!req.body.from) sendWhatsApp(normPhone(m.from), reply); // Meta flow: answer via API; simple flow: answer inline
      return { to: m.from, reply };
    });
    res.json({ ok: true, replies });
  });

  app.use('/api', (_req, _res, next) => next(new svc.ApiError(404, 'Not found')));
  app.use((err, _req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status === 500) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Something went wrong' : err.message, ...(err.extra || {}) });
  });

  // ---------- realtime ----------
  const online = new Map(); // workerId -> socket count
  io.use((socket, next) => {
    const t = readToken(socket.handshake.auth?.token);
    if (!t) return next(new Error('unauthorized'));
    socket.data.auth = t;
    next();
  });
  io.on('connection', (socket) => {
    const { role, id } = socket.data.auth;
    socket.join(`${role}:${id}`);
    if (role === 'worker') {
      online.set(id, (online.get(id) || 0) + 1);
      socket.on('disconnect', () => online.set(id, online.get(id) - 1));
    }
  });

  svc.setHooks({
    emit: (room, ev, data) => io.to(room).emit(ev, data),
    isConnected: (workerId) => (online.get(workerId) || 0) > 0,
    notifyWhatsApp,
  });

  return { app, server, io };
}

// One GST tax invoice per month for a Business plan: Krewzo's fees are the taxable supply; wages are pass-through.
function monthlyInvoiceHtml(st) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const r = (n) => '&#8377;' + Number(n).toLocaleString('en-IN');
  const T = st.totals;
  const rows = st.rows.filter((x) => x.pay_mode === 'MONTHLY').map((x) => `<tr><td>${esc(x.date.slice(0, 10))}</td><td>${esc(x.task)} &middot; ${esc(x.duration)}</td><td>${esc(x.worker || '-')}</td><td>${esc(x.booked_by)}</td><td>${esc(x.status)}</td><td class="n">${r(x.total)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Krewzo invoice ${esc(st.month)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#15130f;max-width:820px;margin:0 auto;padding:24px 16px}h1{margin:0 0 4px;font-size:24px}.m{color:#6f6a62}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:7px 6px;border-bottom:1px solid #e6dfd4;text-align:left;vertical-align:top}.n{text-align:right;white-space:nowrap}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6f6a62}.tot td{font-weight:700;border-top:2px solid #15130f}.box{display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;margin-top:16px}.wrap{overflow-x:auto}</style></head><body>
<h1>Tax invoice &middot; ${esc(st.month)}</h1><div class="m">Krewzo &middot; ${esc(st.plan)} &middot; ${st.paid ? `Paid ${esc(st.paid.paid_at.slice(0, 10))} (ref ${esc(st.paid.tx_ref)})` : 'Not paid yet'}</div>
<div class="box"><div><b>Billed to</b><br>${esc(st.business_name)}<br>GSTIN ${esc(st.gstin)}</div><div><b>Invoice no.</b><br>KRZ-${esc(st.month.replace('-', ''))}-${esc(st.gstin.slice(-5))}</div></div>
<table><tr><th>Item</th><th class="n">Amount</th></tr>
<tr><td>Platform fees (SAC 998519)</td><td class="n">${r(T.platform_fee)}</td></tr>
<tr><td>GST 18% on platform fees</td><td class="n">${r(T.gst)}</td></tr>
<tr><td>Shift insurance</td><td class="n">${r(T.insurance)}</td></tr>
<tr><td>Worker wages and tool add-ons (pass-through, paid to workers)</td><td class="n">${r(T.wages)}</td></tr>
${T.travel_fee ? `<tr><td>Travel fees for late cancellations (paid to workers)</td><td class="n">${r(T.travel_fee)}</td></tr>` : ''}
<tr class="tot"><td>Total for the month</td><td class="n">${r(T.due)}</td></tr></table>
<h2 style="font-size:16px;margin-top:28px">Jobs on this bill</h2><div class="wrap"><table><tr><th>Date</th><th>Job</th><th>Worker</th><th>Booked by</th><th>Status</th><th class="n">Amount</th></tr>${rows || '<tr><td colspan="6" class="m">No jobs on monthly billing this month.</td></tr>'}</table></div>
</body></html>`;
}

function invoiceHtml(g, user) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const t = g.tickets[0];
  const sum = (k) => g.tickets.filter((x) => x.status !== 'CANCELLED').reduce((s, x) => s + x[k], 0);
  const live = g.tickets.filter((x) => x.status !== 'CANCELLED').length;
  const rows = [
    [`Worker wages — ${SKILL_TIERS[t.skill_tier].label}, ${t.duration} × ${live} (pass-through, paid to workers)`, sum('base_wage')],
    ...(sum('addons_total') ? [['Tool add-ons (paid to workers)', sum('addons_total')]] : []),
    ['Krewzo platform fee (SAC 998519)', sum('platform_fee')],
    ['IGST @18% on platform fee', sum('gst_amount')],
    ...(sum('insurance_fee') ? [['Shift insurance', sum('insurance_fee')]] : []),
  ];
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice KRZ-${g.id}</title>
<style>body{font:14px system-ui;max-width:720px;margin:32px auto;color:#111;padding:0 16px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}td:last-child,th:last-child{text-align:right}h1{margin:0}.m{color:#666}button{margin-top:24px;padding:10px 18px}@media print{button{display:none}}</style></head><body>
<h1>Tax Invoice</h1><p class="m">Krewzo Technologies · Invoice KRZ-${g.id} · ${new Date(g.created_at).toLocaleDateString('en-IN')}</p>
<p><b>Billed to:</b> ${esc(g.business_name || user.name)}<br>${g.gstin ? 'GSTIN: ' + esc(g.gstin) + '<br>' : ''}Phone: ${esc(user.phone)}<br>Site: ${esc(t.address)}</p>
<table><tr><th>Description</th><th>Amount</th></tr>${rows.map(([d, a]) => `<tr><td>${esc(d)}</td><td>${rupees(a)}</td></tr>`).join('')}
<tr><th>Total</th><th>${rupees(rows.reduce((s, r) => s + r[1], 0))}</th></tr></table>
<p class="m">Payment ref ${esc(g.payment_ref)} via UPI ${esc(g.payer_upi)}. Worker wages are collected in escrow and released to each worker's UPI on verified completion.${g.tickets.length > live ? ` ${g.tickets.length - live} cancelled ticket(s) refunded.` : ''}</p>
<button onclick="print()">Download / Print PDF</button></body></html>`;
}
