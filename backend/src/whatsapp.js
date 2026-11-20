// WhatsApp bridge for workers without the app (or without data). Same service calls, same state machine.
import { TRADE_TAGS } from '@krewzo/shared';
import { normPhone } from './auth.js';
import * as svc from './service.js';

const T = {
  EN: {
    help: 'Krewzo 🙏\n1 = ON duty\n2 = OFF duty\nACCEPT = take job\nSKIP = leave job\nARRIVED = I reached\nOTP 1234 = start / finish\n4 = my earnings\nSend 📍 location to update where you are.',
    on: '🟢 You are ON DUTY. Jobs within 3 km will come here.', off: '🔴 You are OFF DUTY.',
    needLoc: '📍 Please share your location first (tap 📎 → Location).', loc: '📍 Location saved.',
    offer: (o) => `🔔 NEW JOB ${TRADE_TAGS[o.trade_tag]?.icon || ''}\n💰 ₹${o.payout}\n📍 ${o.distance_km} km\n⏱ ${o.duration}\nReply ACCEPT or SKIP`,
    accepted: (b) => `✅ Job is yours. Go to: ${b.address}\nMap: https://maps.google.com/?q=${b.lat},${b.lng}\nAt the door ask the customer for the 4-digit code and send: OTP 1234`,
    noOffer: 'No open job for you right now.', skipped: 'OK, skipped.', arrived: '👍 Marked arrived. Ask the customer for the code.',
    started: '▶️ Work started. At the end, ask for the new code and send OTP ____.',
    paid: (r) => `🎉 ₹${r.amount} sent to your UPI ${r.upi_id || ''}. Ref ${r.tx_ref}`,
    bad: (left) => `❌ Wrong code. ${left} tries left.`, noJob: 'You have no active job.',
    earn: (h) => `💰 Today ₹${h.today_earnings} (${h.today_shifts} jobs). Total ₹${h.worker.total_earnings}.`,
    unknown: 'This number is not a Krewzo partner.',
  },
  TE: {
    help: 'Krewzo 🙏\n1 = డ్యూటీ ON\n2 = డ్యూటీ OFF\nACCEPT = పని తీసుకో\nSKIP = వదిలేయి\nARRIVED = చేరాను\nOTP 1234 = మొదలు / ముగింపు\n4 = నా సంపాదన\n📍 లొకేషన్ పంపండి.',
    on: '🟢 మీరు డ్యూటీలో ఉన్నారు. 3 కి.మీ లోపు పనులు ఇక్కడ వస్తాయి.', off: '🔴 డ్యూటీ ఆఫ్.',
    needLoc: '📍 ముందు మీ లొకేషన్ పంపండి (📎 → Location).', loc: '📍 లొకేషన్ సేవ్ అయింది.',
    offer: (o) => `🔔 కొత్త పని ${TRADE_TAGS[o.trade_tag]?.icon || ''}\n💰 ₹${o.payout}\n📍 ${o.distance_km} కి.మీ\n⏱ ${o.duration}\nACCEPT లేదా SKIP పంపండి`,
    accepted: (b) => `✅ పని మీది. ఇక్కడికి వెళ్ళండి: ${b.address}\nమ్యాప్: https://maps.google.com/?q=${b.lat},${b.lng}\nకస్టమర్ దగ్గర 4 అంకెల కోడ్ అడిగి పంపండి: OTP 1234`,
    noOffer: 'ఇప్పుడు మీకు పని లేదు.', skipped: 'సరే, వదిలేశాం.', arrived: '👍 చేరారు. కస్టమర్ దగ్గర కోడ్ అడగండి.',
    started: '▶️ పని మొదలైంది. చివర్లో కొత్త కోడ్ అడిగి OTP ____ పంపండి.',
    paid: (r) => `🎉 ₹${r.amount} మీ UPI ${r.upi_id || ''} కి పంపాం. Ref ${r.tx_ref}`,
    bad: (left) => `❌ కోడ్ తప్పు. ఇంకా ${left} సార్లు.`, noJob: 'మీకు ఇప్పుడు పని లేదు.',
    earn: (h) => `💰 ఈరోజు ₹${h.today_earnings} (${h.today_shifts} పనులు). మొత్తం ₹${h.worker.total_earnings}.`,
    unknown: 'ఈ నంబర్ Krewzo లో లేదు.',
  },
  HI: {
    help: 'Krewzo 🙏\n1 = ड्यूटी ON\n2 = ड्यूटी OFF\nACCEPT = काम लो\nSKIP = छोड़ो\nARRIVED = पहुँच गया\nOTP 1234 = शुरू / खत्म\n4 = मेरी कमाई\n📍 लोकेशन भेजें।',
    on: '🟢 आप ड्यूटी पर हैं। 3 किमी के अंदर के काम यहाँ आएँगे।', off: '🔴 ड्यूटी बंद।',
    needLoc: '📍 पहले अपनी लोकेशन भेजें (📎 → Location)।', loc: '📍 लोकेशन सेव हो गई।',
    offer: (o) => `🔔 नया काम ${TRADE_TAGS[o.trade_tag]?.icon || ''}\n💰 ₹${o.payout}\n📍 ${o.distance_km} किमी\n⏱ ${o.duration}\nACCEPT या SKIP भेजें`,
    accepted: (b) => `✅ काम आपका है। यहाँ जाएँ: ${b.address}\nमैप: https://maps.google.com/?q=${b.lat},${b.lng}\nग्राहक से 4 अंकों का कोड लेकर भेजें: OTP 1234`,
    noOffer: 'अभी आपके लिए कोई काम नहीं।', skipped: 'ठीक है, छोड़ दिया।', arrived: '👍 पहुँच गए। ग्राहक से कोड लें।',
    started: '▶️ काम शुरू। आखिर में नया कोड लेकर OTP ____ भेजें।',
    paid: (r) => `🎉 ₹${r.amount} आपके UPI ${r.upi_id || ''} पर भेजे। Ref ${r.tx_ref}`,
    bad: (left) => `❌ गलत कोड। ${left} बार और।`, noJob: 'अभी कोई चालू काम नहीं।',
    earn: (h) => `💰 आज ₹${h.today_earnings} (${h.today_shifts} काम)। कुल ₹${h.worker.total_earnings}।`,
    unknown: 'यह नंबर Krewzo पर नहीं है।',
  },
};

export async function sendWhatsApp(phone, text) {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) { console.log(`[whatsapp -> ${phone}] ${text.replace(/\n/g, ' | ')}`); return; }
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: '91' + phone, type: 'text', text: { body: text } }),
    });
    if (!r.ok) console.error('[whatsapp] send failed', r.status, await r.text());
  } catch (e) { console.error('[whatsapp] send failed', e.message); }
}

export function notifyWhatsApp(worker, kind, data) {
  if (kind === 'offer') sendWhatsApp(worker.phone, (T[worker.language] || T.EN).offer(data));
}

// Returns the reply text. Throws nothing: every error becomes a friendly message.
export function handleMessage(from, msg) {
  const w = svc.getWorkerByPhone(normPhone(from));
  if (!w) return T.EN.unknown;
  const t = T[w.language] || T.EN;
  try {
    if (msg.location) {
      svc.setWorkerStatus(w.id, { lat: Number(msg.location.latitude), lng: Number(msg.location.longitude) });
      return t.loc;
    }
    const text = String(msg.text || '').trim().toUpperCase();
    const otp = text.match(/^(?:OTP\s*)?(\d{4})$/);
    if (text === '1' || text === 'ON') {
      if (w.lat == null) return t.needLoc;
      svc.setWorkerStatus(w.id, { is_online: true });
      return t.on;
    }
    if (text === '2' || text === 'OFF') { svc.setWorkerStatus(w.id, { is_online: false }); return t.off; }
    if (text === '4' || text === 'EARN') return t.earn(svc.workerHome(w.id));
    if (text === 'ACCEPT' || text === 'YES') {
      const [o] = svc.openOffers(w.id);
      if (!o) return t.noOffer;
      return t.accepted(svc.acceptJob(w.id, o.booking_id));
    }
    if (text === 'SKIP' || text === 'NO') {
      const [o] = svc.openOffers(w.id);
      if (!o) return t.noOffer;
      svc.skipJob(w.id, o.booking_id);
      const next = svc.openOffers(w.id)[0];
      return next ? t.skipped + '\n\n' + t.offer(next) : t.skipped;
    }
    if (text === 'ARRIVED' || text === '3') {
      const a = svc.activeJob(w.id);
      if (!a) return t.noJob;
      svc.markArrived(w.id, a.id);
      return t.arrived;
    }
    if (otp) {
      const a = svc.activeJob(w.id);
      if (!a) return t.noJob;
      const r = svc.verifyHandshake(w.id, a.id, 'OTP', { otp_code: otp[1] });
      return r.phase === 'START' ? t.started : t.paid(r.receipt);
    }
    return t.help;
  } catch (e) {
    if (e.extra?.attempts_left != null && !e.extra.rotated) return t.bad(e.extra.attempts_left);
    return '⚠️ ' + e.message;
  }
}

// Accepts Meta Cloud API webhooks and a simple {from, text} shape (for Twilio-style relays and testing).
export function extractMessages(body) {
  if (body?.from) return [{ from: body.from, text: body.text, location: body.location }];
  const out = [];
  for (const entry of body?.entry || []) for (const ch of entry.changes || []) for (const m of ch.value?.messages || []) {
    out.push({ from: m.from, text: m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title, location: m.location });
  }
  return out;
}
