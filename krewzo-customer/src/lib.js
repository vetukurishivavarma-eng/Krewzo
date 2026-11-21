import { io } from 'socket.io-client';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

const KEY = 'krewzo.customer.token';
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
  if (!r.ok) throw Object.assign(new Error(data.error || 'Network error'), { status: r.status, data });
  return data;
}

export const connectSocket = () => io(getServer() || undefined, { auth: { token: getToken() }, transports: ['websocket', 'polling'] });

// ---------- push (worker accepted / can't come / arrived) ----------
const isNative = Capacitor.isNativePlatform();
// Ask once, register with Firebase, give the server our token. Tapping opens that booking.
export async function setupPush(onOpen) {
  if (!isNative) return;
  try {
    await PushNotifications.createChannel({ id: 'updates', name: 'Booking updates', importance: 4, visibility: 1, vibration: true });
    await PushNotifications.createChannel({ id: 'app_updates', name: 'App updates', importance: 3, visibility: 1 });
    let p = await PushNotifications.checkPermissions();
    if (p.receive.startsWith('prompt')) p = await PushNotifications.requestPermissions();
    if (p.receive !== 'granted') return;
    await PushNotifications.removeAllListeners();
    await PushNotifications.addListener('registration', async ({ value }) => {
      for (let i = 0; i < 6; i++) { // retry: the free server may be waking up
        try { await api('PATCH', '/me', { fcm_token: value }); return; } catch { await new Promise((r) => setTimeout(r, 5000 * (i + 1))); }
      }
    });
    await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const id = Number(a.notification?.data?.group_id);
      if (id) onOpen?.(id);
    });
    await PushNotifications.register();
  } catch {}
}
// Logging out: stop updates going to this phone.
export const clearPush = () => (isNative ? api('PATCH', '/me', { fcm_token: null }).catch(() => {}) : null);
