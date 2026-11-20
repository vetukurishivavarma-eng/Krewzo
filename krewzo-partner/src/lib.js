import { io } from 'socket.io-client';
import { LANGS, SAY } from './i18n.js';

// ---------- API ----------
const KEY = 'krewzo.partner.token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

export async function api(method, path, body) {
  const t = getToken();
  const r = await fetch('/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(t && { authorization: 'Bearer ' + t }) },
    body: body && JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || 'Network error'), { status: r.status, data });
  return data;
}

export const connectSocket = () => io({ auth: { token: getToken() }, transports: ['websocket', 'polling'] });

// ---------- sound + voice + touch ----------
let ctx;
function tone(freq, start, len, gain = 0.25) {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + len);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + len);
}
export const unlockAudio = () => { try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); ctx.resume(); } catch {} };
export const chime = () => { try { [880, 1175, 1568].forEach((f, i) => tone(f, i * 0.16, 0.5)); } catch {} };
export const successChime = () => { try { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.6, 0.3)); } catch {} };
export const errorBuzz = () => { try { tone(180, 0, 0.35, 0.35); tone(150, 0.35, 0.35, 0.35); } catch {} };
export const vibrate = (p = 200) => { try { navigator.vibrate?.(p); } catch {} };

// Speaks in the worker's language when the phone has that voice; otherwise falls back to English so it is never gibberish.
export function speak(lang, key, arg) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const want = LANGS.find((l) => l.id === lang)?.speech || 'en-IN';
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang.replace('_', '-').startsWith(want.slice(0, 2)));
    const useLang = voice ? lang : 'EN';
    const s = SAY[useLang][key];
    const u = new SpeechSynthesisUtterance(typeof s === 'function' ? s(arg) : s);
    u.lang = voice?.lang || 'en-IN';
    if (voice) u.voice = voice;
    u.rate = 0.9;
    synth.cancel();
    synth.speak(u);
  } catch {}
}

// Set VITE_HELPLINE to the real support number before launch.
export const HELPLINE = import.meta.env.VITE_HELPLINE || '18001234567';
