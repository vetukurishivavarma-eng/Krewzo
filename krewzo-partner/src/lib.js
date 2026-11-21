import { io } from 'socket.io-client';
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { LANGS, SAY } from './i18n.js';

// ---------- API ----------
const KEY = 'krewzo.partner.token';
export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch {} };

// APK has no same-origin backend: server URL is baked at build (VITE_API_URL) or set on the login screen.
const SKEY = 'krewzo.server';
export const getServer = () => { try { return localStorage.getItem(SKEY) || import.meta.env.VITE_API_URL || ''; } catch { return import.meta.env.VITE_API_URL || ''; } };
export const setServer = (u) => { try { u ? localStorage.setItem(SKEY, u.trim().replace(/\/+$/, '')) : localStorage.removeItem(SKEY); } catch {} };

export async function api(method, path, body) {
  const t = getToken();
  const r = await fetch(getServer() + '/api' + path, {
    method,
    headers: { 'content-type': 'application/json', ...(t && { authorization: 'Bearer ' + t }) },
    body: body && JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.message || data.error || 'Network error'), { status: r.status, data });
  return data;
}

// ---------- live trip tracking ----------
// From accept until "I've arrived", stream the worker's position to the customer, even while Google Maps is in front.
// Native HTTP on purpose: Android throttles WebView requests after ~5 min in the background.
const BgGeo = registerPlugin('BackgroundGeolocation');
export const isNative = Capacitor.isNativePlatform();
export async function startTrip(onError) {
  if (!isNative) return null; // browser dev: Main's watchPosition covers it
  return BgGeo.addWatcher({
    backgroundTitle: 'Krewzo: heading to job',
    backgroundMessage: 'Sharing your location with the customer until you arrive',
    requestPermissions: true, stale: false, distanceFilter: 15,
  }, (loc, err) => {
    if (err) return onError?.(err);
    CapacitorHttp.request({
      method: 'PATCH', url: getServer() + '/api/workers/me',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + getToken() },
      data: { lat: loc.latitude, lng: loc.longitude },
    }).catch(() => {});
  });
}
export const stopTrip = (id) => { if (id) BgGeo.removeWatcher({ id }).catch(() => {}); };

export const connectSocket = () => io(getServer() || undefined, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });

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
