import { io } from 'socket.io-client';

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
