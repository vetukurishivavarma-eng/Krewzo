import { io } from 'socket.io-client';

const KEY = 'krewzo.customer.token';
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
  if (!r.ok) throw Object.assign(new Error(data.error || 'Network error'), { status: r.status, data });
  return data;
}

export const connectSocket = () => io({ auth: { token: getToken() }, transports: ['websocket', 'polling'] });
