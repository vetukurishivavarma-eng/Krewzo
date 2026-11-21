import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import { Server } from 'socket.io';
import { SKILL_TIERS, TRADE_TAGS, rupees } from '@krewzo/shared';
import { db, now } from './db.js';
import { checkPin, hashPin, normPhone, readToken, signToken, validPhone, validPin, safeEqual } from './auth.js';
import * as svc from './service.js';
import { extractMessages, handleMessage, notifyWhatsApp, sendWhatsApp } from './whatsapp.js';
import { seedIfEmpty } from './seed.js';

// Wrong-PIN lockout: 5 misses locks that phone+role for 15 min (a 4-digit PIN is only 10,000 guesses).
// ponytail: in-memory, so it resets on restart and isn't shared across instances; move to the DB if we scale out.
const MAX_PIN_TRIES = 5, PIN_LOCK_MS = 15 * 60e3;
const pinFails = new Map(); // 'worker:9xxxxxxxxx' -> { n, until }
function verifyPin(key, pin, hash) {
  const nowMs = Date.now();
  let f = pinFails.get(key);
  if (f?.until > nowMs) throw new svc.ApiError(429, `Too many wrong PINs. Try again in ${Math.ceil((f.until - nowMs) / 60e3)} min`);
  if (checkPin(pin, hash)) { pinFails.delete(key); return; }
  if (!f || f.until) f = { n: 0, until: 0 }; // first miss, or the previous lock has expired
  f.n += 1;
  if (f.n >= MAX_PIN_TRIES) f.until = nowMs + PIN_LOCK_MS;
  pinFails.set(key, f);
  const left = MAX_PIN_TRIES - f.n;
  throw new svc.ApiError(left ? 401 : 429, left ? `Wrong PIN. ${left} ${left === 1 ? 'try' : 'tries'} left` : 'Too many wrong PINs. Try again in 15 min');
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
  app.use(express.json({ limit: '100kb', verify: (req, _res, buf) => { req.rawBody = buf; } }));

  const auth = (role) => (req, _res, next) => {
    const t = readToken((req.headers.authorization || '').replace(/^Bearer /, '') || req.query.token);
    if (!t || (role && t.role !== role)) throw new svc.ApiError(401, 'Please log in again');
    // A valid token can outlive its account (e.g. the demo DB was reset), so the apps must be sent back to login.
    const table = { customer: 'users', worker: 'workers' }[t.role];
    if (!table || !db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(t.id)) throw new svc.ApiError(401, 'Please log in again');
    req.auth = t;
    next();
  };

  // ---------- auth ----------
  app.post('/api/auth/customer', (req, res) => {
    const phone = normPhone(req.body.phone);
    const { pin, name } = req.body;
    if (!validPhone(phone)) throw new svc.ApiError(400, 'Enter a 10-digit mobile number');
    if (!validPin(pin)) throw new svc.ApiError(400, 'PIN must be 4 digits');
    let u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (u) verifyPin('customer:' + phone, pin, u.pin_hash);
    if (!u) {
      if (!name || String(name).trim().length < 2) throw new svc.ApiError(400, 'New here? Enter your name');
      const r = db.prepare('INSERT INTO users (phone, name, pin_hash, created_at) VALUES (?,?,?,?)').run(phone, String(name).trim(), hashPin(pin), now());
      u = { id: Number(r.lastInsertRowid) };
    }
    res.json({ token: signToken('customer', u.id), user: svc.publicUser(svc.getUser(u.id)) });
  });

  app.post('/api/auth/worker', (req, res) => {
    const phone = normPhone(req.body.phone);
    const { pin } = req.body;
    if (!validPhone(phone)) throw new svc.ApiError(400, 'Enter a 10-digit mobile number');
    if (!validPin(pin)) throw new svc.ApiError(400, 'PIN must be 4 digits');
    let w = svc.getWorkerByPhone(phone);
    if (w) verifyPin('worker:' + phone, pin, w.pin_hash);
    if (!w) {
      const { name, skill_tier, trade_tags = [], upi_id, language = 'EN' } = req.body;
      if (!name) return res.status(404).json({ error: 'NEW_WORKER', message: 'New partner — tell us your name and work' });
      if (!SKILL_TIERS[skill_tier]) throw new svc.ApiError(400, 'Pick your work level');
      const tags = trade_tags.filter((t) => TRADE_TAGS[t]);
      if (!tags.length) throw new svc.ApiError(400, 'Pick at least one work type');
      const r = db.prepare('INSERT INTO workers (phone, name, pin_hash, kyc_verified, skill_tier, trade_tags, upi_id, language, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        // AUTO_KYC=1 is for testing only: new partners skip the ops ID check. Remove it before launch.
        .run(phone, String(name).trim(), hashPin(pin), process.env.AUTO_KYC === '1' ? 1 : 0, skill_tier, JSON.stringify(tags), upi_id || `${phone}@upi`, ['EN', 'TE', 'HI'].includes(language) ? language : 'EN', now());
      w = svc.getWorker(Number(r.lastInsertRowid));
    }
    res.json({ token: signToken('worker', w.id), worker: svc.publicWorker(w) });
  });

  app.get('/api/me', auth(), (req, res) => {
    res.json(req.auth.role === 'customer' ? { user: svc.publicUser(svc.getUser(req.auth.id)) } : { worker: svc.publicWorker(svc.getWorker(req.auth.id)) });
  });

  // ---------- customer ----------
  app.patch('/api/me', auth('customer'), (req, res) => { svc.setPushToken('users', req.auth.id, req.body.fcm_token ?? null); res.json({ ok: true }); });
  app.post('/api/bookings', auth('customer'), (req, res) => res.status(201).json(svc.createBookings(svc.getUser(req.auth.id), req.body)));
  app.get('/api/bookings', auth('customer'), (req, res) => res.json(svc.listGroups(req.auth.id)));
  app.get('/api/groups/:gid', auth('customer'), (req, res) => res.json(svc.getGroup(req.auth.id, Number(req.params.gid))));
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

  // Ops: mark a newly registered worker's KYC as verified.
  app.post('/api/admin/workers/:id/kyc', (req, res) => {
    const key = process.env.ADMIN_KEY;
    if (!key || !safeEqual(req.headers['x-admin-key'] || '', key)) throw new svc.ApiError(401, 'Admin key required');
    db.prepare('UPDATE workers SET kyc_verified = ? WHERE id = ?').run(req.body.verified === false ? 0 : 1, Number(req.params.id));
    res.json(svc.publicWorker(svc.getWorker(Number(req.params.id))));
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
