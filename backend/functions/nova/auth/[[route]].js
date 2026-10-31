import { q, exec, tx } from '../../../lib/db.js';
import { hashPassword, verifyPassword, randomToken, safeEqual } from '../../../lib/crypto.js';
import {
  json, handle, HttpError, readJson, parseCookies, assertSameOrigin,
  ipHash, rateCheck, rateHit,
} from '../../../lib/http.js';
import {
  COOKIE, cookieString, createSession, getSession, requireAdmin, githubFresh, hasPassword,
} from '../../../lib/auth.js';

const OAUTH_COOKIE = 'nova_oauth';
const nowSec = () => Math.floor(Date.now() / 1000);

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

function githubLogin(request, env, url) {
  if (!env.GITHUB_CLIENT_ID) throw new HttpError(500, 'github login is not configured');
  const intent = url.searchParams.get('intent') === 'reset' ? 'reset' : 'login';
  const state = randomToken(16);
  const gh = new URL('https://github.com/login/oauth/authorize');
  gh.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  gh.searchParams.set('redirect_uri', `${url.origin}/nova/auth/callback`);
  gh.searchParams.set('state', state);
  gh.searchParams.set('allow_signup', 'false');
  return redirect(gh.toString(), [cookieString(request, OAUTH_COOKIE, `${state}.${intent}`, 600)]);
}

async function githubCallback(request, env, url) {
  const clearOauth = cookieString(request, OAUTH_COOKIE, '', 0);
  const fail = (reason) => redirect(`/nova/panel?error=${reason}`, [clearOauth]);

  const ih = await ipHash(env, request);
  await rateCheck(env, 'loginfail:' + ih, 5, 900);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const [cookieState, intent] = (parseCookies(request)[OAUTH_COOKIE] || '').split('.');
  if (!code || !state || !cookieState || !safeEqual(state, cookieState)) return fail('state');

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'supernova-site' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/nova/auth/callback`,
    }),
  });
  const accessToken = (await tokenRes.json().catch(() => ({})))?.access_token;
  if (!accessToken) return fail('github');

  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'supernova-site', Accept: 'application/vnd.github+json' },
  });
  const user = await userRes.json().catch(() => ({}));

  // numeric id, not login: logins can be renamed and re-claimed
  if (!env.GITHUB_ALLOWED_ID || String(user.id) !== String(env.GITHUB_ALLOWED_ID)) {
    await rateHit(env, 'loginfail:' + ih);
    return fail('denied');
  }

  const session = await createSession(env, 'github');
  const needsPassword = intent === 'reset' || !(await hasPassword(env));
  return redirect(needsPassword ? '/nova/dashboard?setpw=1' : '/nova/dashboard', [
    cookieString(request, COOKIE, session, 7 * 24 * 3600),
    clearOauth,
  ]);
}

async function passwordLogin(request, env) {
  const ih = await ipHash(env, request);
  await rateCheck(env, 'loginfail:' + ih, 5, 900);
  await rateCheck(env, 'loginfail:all', 30, 3600);

  const body = await readJson(request, 2000);
  const password = typeof body.password === 'string' ? body.password : '';
  const row = (await q(env, 'SELECT password_hash FROM admin WHERE id=1'))[0];

  let ok = false;
  if (row?.password_hash && password && password.length <= 256) {
    ok = await verifyPassword(password, row.password_hash);
  }
  if (!ok) {
    await rateHit(env, 'loginfail:' + ih);
    await rateHit(env, 'loginfail:all');
    throw new HttpError(401, 'invalid credentials');
  }

  const session = await createSession(env, 'password');
  return json({ ok: true }, 200, { 'Set-Cookie': cookieString(request, COOKIE, session, 7 * 24 * 3600) });
}

export const onRequest = handle(async ({ request, env }) => {
  if (!env.SESSION_SECRET || !env.TURSO_URL) throw new HttpError(500, 'server not configured');
  assertSameOrigin(request);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/nova\/auth/, '').replace(/\/+$/, '') || '/';
  const method = request.method;

  if (method === 'GET' && path === '/login') return githubLogin(request, env, url);
  if (method === 'GET' && path === '/callback') return githubCallback(request, env, url);
  if (method === 'POST' && path === '/password-login') return passwordLogin(request, env);

  if (method === 'GET' && path === '/session') {
    const s = await getSession(request, env);
    if (!s) return json({ authenticated: false, setup_needed: !(await hasPassword(env)) });
    return json({
      authenticated: true,
      via: s.via,
      github_fresh: githubFresh(s),
      has_password: await hasPassword(env),
      expires_at: s.expires_at,
    });
  }

  if (method === 'POST' && path === '/logout') {
    const s = await getSession(request, env);
    if (s) await exec(env, 'DELETE FROM sessions WHERE id=?', [s.id]);
    return json({ ok: true }, 200, { 'Set-Cookie': cookieString(request, COOKIE, '', 0) });
  }

  if (method === 'POST' && path === '/password') {
    const s = await requireAdmin(request, env);
    if (!githubFresh(s)) {
      throw new HttpError(403, 'verify with github again to change the password', { extra: { code: 'github_reauth_required' } });
    }
    const body = await readJson(request, 2000);
    const pw = body.password;
    if (typeof pw !== 'string' || pw.length < 12 || pw.length > 200) {
      throw new HttpError(400, 'password must be 12-200 characters');
    }
    const hash = await hashPassword(pw);
    await tx(env, [
      {
        sql: 'INSERT INTO admin(id, password_hash, password_set_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash, password_set_at=excluded.password_set_at',
        args: [hash, nowSec()],
      },
      { sql: 'DELETE FROM sessions WHERE id<>?', args: [s.id] },
    ]);
    return json({ ok: true });
  }

  if (method === 'POST' && path === '/revoke-others') {
    const s = await requireAdmin(request, env);
    const r = await exec(env, 'DELETE FROM sessions WHERE id<>?', [s.id]);
    return json({ ok: true, revoked: r.affected });
  }

  throw new HttpError(404, 'not found');
});
