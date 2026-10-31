import { q, exec } from './db.js';
import { hmac, randomToken, safeEqual } from './crypto.js';
import { HttpError, parseCookies } from './http.js';

export const COOKIE = 'nova_session';
const SESSION_TTL = 7 * 24 * 3600;
export const GITHUB_FRESH_SECONDS = 15 * 60;
const nowSec = () => Math.floor(Date.now() / 1000);

export function cookieString(request, name, value, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(env, via) {
  const id = randomToken(24);
  const t = nowSec();
  await exec(
    env,
    'INSERT INTO sessions(id, via, created_at, expires_at, github_auth_at) VALUES(?,?,?,?,?)',
    [id, via, t, t + SESSION_TTL, via === 'github' ? t : null]
  );
  await exec(env, 'DELETE FROM sessions WHERE expires_at<?', [t]);
  return `${id}.${await hmac(env.SESSION_SECRET, 'session:' + id)}`;
}

export async function getSession(request, env) {
  const raw = parseCookies(request)[COOKIE];
  if (!raw) return null;
  const [id, sig] = raw.split('.');
  if (!id || !sig) return null;
  if (!safeEqual(sig, await hmac(env.SESSION_SECRET, 'session:' + id))) return null;
  const rows = await q(
    env,
    'SELECT id, via, created_at, expires_at, github_auth_at FROM sessions WHERE id=? AND expires_at>?',
    [id, nowSec()]
  );
  return rows[0] || null;
}

export async function requireAdmin(request, env) {
  const s = await getSession(request, env);
  if (!s) throw new HttpError(401, 'unauthorized');
  return s;
}

export const githubFresh = (s) => !!s.github_auth_at && nowSec() - s.github_auth_at < GITHUB_FRESH_SECONDS;

export async function hasPassword(env) {
  const r = await q(env, 'SELECT password_hash FROM admin WHERE id=1');
  return !!(r[0] && r[0].password_hash);
}
