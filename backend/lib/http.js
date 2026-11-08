import { hmac } from './crypto.js';
import { q, exec } from './db.js';

export class HttpError extends Error {
  constructor(status, message, opts = {}) {
    super(message);
    this.status = status;
    this.headers = opts.headers || {};
    this.extra = opts.extra || {};
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export const handle = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status, e.headers);
    console.error(e);
    return json({ error: 'internal error' }, 500);
  }
};

export async function readJson(request, max = 32768) {
  const text = await request.text();
  if (text.length > max) throw new HttpError(413, 'payload too large');
  let v;
  try { v = JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'invalid json'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'expected a json object');
  return v;
}

export function parseCookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export const getIp = (request) => request.headers.get('CF-Connecting-IP') || 'unknown';

export async function ipHash(env, request) {
  return (await hmac(env.SESSION_SECRET, 'ip:' + getIp(request))).slice(0, 24);
}

export function ipBucket(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  if (!ip.includes(':')) return ip;
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1); // ::ffff:1.2.3.4 (v4-mapped)
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h;
  return groups.slice(0, 4).map((g) => g.toLowerCase().padStart(4, '0')).join(':');
}

export async function visitorId(env, request) {
  return (await hmac(env.SESSION_SECRET, 'visitor:' + ipBucket(getIp(request)))).slice(0, 24);
}

export function assertSameOrigin(request) {
  const m = request.method;
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return;
  const origin = request.headers.get('Origin');
  if (origin) {
    if (origin !== new URL(request.url).origin) throw new HttpError(403, 'cross-origin request blocked');
    return;
  }
  const site = request.headers.get('Sec-Fetch-Site');
  if (site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'cross-origin request blocked');
}

const nowSec = () => Math.floor(Date.now() / 1000);

export async function rateCheck(env, bucket, limit, windowSec) {
  const [{ n }] = await q(env, 'SELECT COUNT(*) AS n FROM rate_events WHERE bucket=? AND at>?', [bucket, nowSec() - windowSec]);
  if (n >= limit) {
    throw new HttpError(429, 'too many attempts, try again later', { headers: { 'Retry-After': String(windowSec) } });
  }
}

export async function rateHit(env, bucket) {
  await exec(env, 'INSERT INTO rate_events(bucket, at) VALUES(?, ?)', [bucket, nowSec()]);
  if (Math.random() < 0.02) await exec(env, 'DELETE FROM rate_events WHERE at<?', [nowSec() - 86400]);
}

export async function rateLimit(env, bucket, limit, windowSec) {
  await rateCheck(env, bucket, limit, windowSec);
  await rateHit(env, bucket);
}
