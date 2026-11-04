import { q, exec, batch, tx } from '../../lib/db.js';
import { json, handle, HttpError, readJson, assertSameOrigin, ipHash, rateLimit } from '../../lib/http.js';
import { getSession, requireAdmin } from '../../lib/auth.js';
import { str, optStr, cleanUrl, safeJson } from '../../lib/validate.js';
import { githubStats, emptyStats, nowPlaying } from '../../lib/external.js';

const nowSec = () => Math.floor(Date.now() / 1000);
const PRESENCE_WINDOW = 300;
const STATUSES = ['online', 'idle', 'do not disturb', 'offline'];
const FUN_CLOCKS = ['escape', 'nonexistent', 'nan', 'none', 'circle', 'beats', 'mars', 'glitch'];

const validZone = (v) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return v.length > 0;
  } catch {
    return false;
  }
};

const CLOCK_RULES = {
  'clock:mode': (v) => ['timezone', 'fun', 'custom'].includes(v),
  'clock:zone': validZone,
  'clock:fun': (v) => FUN_CLOCKS.includes(v),
  'clock:custom_text': (v) => v.length <= 16,
  'clock:custom_subtext': (v) => v.length <= 60,
};

const UPSERT_CONFIG =
  'INSERT INTO config(key, value, updated_at) VALUES(?,?,unixepoch()) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at';

const routes = [];
function route(method, pattern, fn) {
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, '(?<$1>[^/]+)') + '/?$');
  routes.push({ method, re, fn });
}

const intId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'bad id');
  return n;
};

async function reorder(env, table, body) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  if (!ids.length || ids.length > 200 || ids.some((n) => !Number.isInteger(n))) {
    throw new HttpError(400, 'ids must be a list of integers');
  }
  await tx(env, ids.map((id, i) => ({ sql: `UPDATE ${table} SET sort_order=? WHERE id=?`, args: [i + 1, id] })));
  return json({ ok: true });
}

route('GET', '/config', async ({ env }) => {
  const rows = await q(env, "SELECT key, value FROM config WHERE key NOT LIKE 'sys:%'");
  return json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
});

route('POST', '/config', async ({ request, env }) => {
  await requireAdmin(request, env);
  const body = await readJson(request, 40000);
  const stmts = [];
  for (const [k, v] of Object.entries(body)) {
    if (!/^(hero|now|about|discord|lastfm|card|clock):[a-z_]{1,40}$/.test(k)) throw new HttpError(400, `unknown setting: ${k}`);
    if (typeof v !== 'string' || v.length > (k === 'about:body' ? 8000 : 500)) {
      throw new HttpError(400, `invalid value for ${k}`);
    }
    if (k.startsWith('clock:') && !(CLOCK_RULES[k] && CLOCK_RULES[k](v))) throw new HttpError(400, `invalid value for ${k}`);
    stmts.push({ sql: UPSERT_CONFIG, args: [k, v] });
  }
  if (stmts.length) await tx(env, stmts);
  return json({ ok: true, saved: stmts.length });
});

route('GET', '/status', async ({ env }) => {
  const rows = await q(env, "SELECT key, value FROM config WHERE key IN ('sys:status','sys:status_at')");
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return json({ status: m['sys:status'] || 'do not disturb', last_seen: m['sys:status_at'] || null });
});

route('POST', '/status/heartbeat', async ({ request, env }) => {
  await requireAdmin(request, env);
  const body = await readJson(request, 500);
  if (!STATUSES.includes(body.status)) throw new HttpError(400, 'invalid status');
  await tx(env, [
    { sql: UPSERT_CONFIG, args: ['sys:status', body.status] },
    { sql: UPSERT_CONFIG, args: ['sys:status_at', new Date().toISOString()] },
  ]);
  return json({ ok: true, status: body.status });
});

const mapProject = (r) => ({
  id: r.id, name: r.name, desc: r.description, stack: safeJson(r.stack), link: r.link, pinned: !!r.pinned,
});

function projectInput(b) {
  const stack = Array.isArray(b.stack) ? b.stack : [];
  if (stack.length > 12) throw new HttpError(400, 'at most 12 stack tags');
  return {
    name: str(b.name, 'name', 1, 80),
    desc: optStr(b.desc, 'description', 300),
    stack: stack.map((s) => str(String(s), 'stack tag', 1, 24)),
    link: cleanUrl(b.link, 'link'),
    pinned: b.pinned ? 1 : 0,
  };
}

route('GET', '/projects', async ({ env }) => {
  const rows = await q(env, 'SELECT id, name, description, stack, link, pinned FROM projects ORDER BY pinned DESC, sort_order ASC, id ASC');
  return json(rows.map(mapProject));
});

route('POST', '/projects', async ({ request, env }) => {
  await requireAdmin(request, env);
  const p = projectInput(await readJson(request));
  const r = await exec(
    env,
    'INSERT INTO projects(name, description, stack, link, pinned, sort_order) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM projects))',
    [p.name, p.desc, JSON.stringify(p.stack), p.link, p.pinned]
  );
  return json({ ok: true, id: r.lastId }, 201);
});

route('PUT', '/projects/reorder', async ({ request, env }) => {
  await requireAdmin(request, env);
  return reorder(env, 'projects', await readJson(request));
});

route('PUT', '/projects/:id', async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const p = projectInput(await readJson(request));
  const r = await exec(
    env,
    'UPDATE projects SET name=?, description=?, stack=?, link=?, pinned=? WHERE id=?',
    [p.name, p.desc, JSON.stringify(p.stack), p.link, p.pinned, intId(params.id)]
  );
  if (!r.affected) throw new HttpError(404, 'project not found');
  return json({ ok: true });
});

route('DELETE', '/projects/:id', async ({ request, env, params }) => {
  await requireAdmin(request, env);
  await exec(env, 'DELETE FROM projects WHERE id=?', [intId(params.id)]);
  return json({ ok: true });
});

function socialInput(b) {
  return {
    platform: str(b.platform, 'platform', 1, 40),
    handle: str(b.handle, 'handle', 1, 80),
    url: cleanUrl(b.url, 'url'),
  };
}

route('GET', '/socials', async ({ env }) => {
  return json(await q(env, 'SELECT id, platform, handle, url FROM socials ORDER BY sort_order ASC, id ASC'));
});

route('POST', '/socials', async ({ request, env }) => {
  await requireAdmin(request, env);
  const s = socialInput(await readJson(request));
  const r = await exec(
    env,
    'INSERT INTO socials(platform, handle, url, sort_order) VALUES(?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM socials))',
    [s.platform, s.handle, s.url]
  );
  return json({ ok: true, id: r.lastId }, 201);
});

route('PUT', '/socials/reorder', async ({ request, env }) => {
  await requireAdmin(request, env);
  return reorder(env, 'socials', await readJson(request));
});

route('PUT', '/socials/:id', async ({ request, env, params }) => {
  await requireAdmin(request, env);
  const s = socialInput(await readJson(request));
  const r = await exec(env, 'UPDATE socials SET platform=?, handle=?, url=? WHERE id=?', [s.platform, s.handle, s.url, intId(params.id)]);
  if (!r.affected) throw new HttpError(404, 'social not found');
  return json({ ok: true });
});

route('DELETE', '/socials/:id', async ({ request, env, params }) => {
  await requireAdmin(request, env);
  await exec(env, 'DELETE FROM socials WHERE id=?', [intId(params.id)]);
  return json({ ok: true });
});

route('GET', '/guestbook', async ({ env }) => {
  return json(await q(env, 'SELECT id, name, message, country, created_at FROM guestbook ORDER BY id DESC LIMIT 100'));
});

route('POST', '/guestbook', async ({ request, env }) => {
  const body = await readJson(request, 2000);
  const name = str(body.name, 'name', 1, 40);
  const message = str(body.message, 'message', 1, 500);
  await rateLimit(env, 'gb:' + (await ipHash(env, request)), 3, 600);
  await exec(env, 'INSERT INTO guestbook(name, message, country) VALUES(?,?,?)', [name, message, request.cf?.country || null]);
  return json({ ok: true }, 201);
});

route('DELETE', '/guestbook/:id', async ({ request, env, params }) => {
  await requireAdmin(request, env);
  await exec(env, 'DELETE FROM guestbook WHERE id=?', [intId(params.id)]);
  return json({ ok: true });
});

route('GET', '/ask', async ({ request, env }) => {
  const admin = await getSession(request, env);
  const where = admin ? '' : 'WHERE answered=1';
  return json(await q(env, `SELECT id, question, answer, answered, created_at FROM questions ${where} ORDER BY id DESC LIMIT 200`));
});

route('POST', '/ask', async ({ request, env }) => {
  const body = await readJson(request, 2000);
  const question = str(body.question, 'question', 3, 300);
  await rateLimit(env, 'ask:' + (await ipHash(env, request)), 5, 3600);
  await exec(env, 'INSERT INTO questions(question) VALUES(?)', [question]);
  return json({ ok: true }, 201);
});

route('POST', '/ask/answer', async ({ request, env }) => {
  await requireAdmin(request, env);
  const body = await readJson(request, 3000);
  const answer = str(body.answer, 'answer', 1, 1000);
  const r = await exec(
    env,
    "UPDATE questions SET answer=?, answered=1, answered_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?",
    [answer, intId(body.id)]
  );
  if (!r.affected) throw new HttpError(404, 'question not found');
  return json({ ok: true });
});

route('DELETE', '/ask/:id', async ({ request, env, params }) => {
  await requireAdmin(request, env);
  await exec(env, 'DELETE FROM questions WHERE id=?', [intId(params.id)]);
  return json({ ok: true });
});

// ~11 km precision on purpose: the visitor map is public
const round1 = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

route('POST', '/visitors/ping', async ({ request, env }) => {
  const body = await readJson(request, 500);
  const sid = typeof body.session_id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body.session_id) ? body.session_id : null;
  if (!sid) throw new HttpError(400, 'bad session_id');
  await rateLimit(env, 'ping:' + (await ipHash(env, request)), 120, 3600);

  const cf = request.cf || {};
  const t = nowSec();
  const res = await batch(env, [
    { sql: 'INSERT INTO presence(session_id, last_seen) VALUES(?,?) ON CONFLICT(session_id) DO UPDATE SET last_seen=excluded.last_seen', args: [sid, t] },
    {
      sql: 'INSERT OR IGNORE INTO visitors(session_id, country, city, region, timezone, lat, lon) VALUES(?,?,?,?,?,?,?)',
      args: [sid, cf.country || null, cf.city || null, cf.region || null, cf.timezone || null, round1(cf.latitude), round1(cf.longitude)],
    },
    { sql: 'SELECT COUNT(*) AS n FROM presence WHERE last_seen>?', args: [t - PRESENCE_WINDOW] },
  ]);
  if (Math.random() < 0.02) await exec(env, 'DELETE FROM presence WHERE last_seen<?', [t - 86400]);
  return json({ live_count: Math.max(1, res[2].rows[0].n) });
});

route('GET', '/visitors/geo', async ({ env }) => {
  return json(await q(env, 'SELECT country, city, region, timezone, lat, lon, visited_at FROM visitors ORDER BY visited_at DESC LIMIT 200'));
});

route('POST', '/oblitus/found', async ({ request, env }) => {
  const ih = await ipHash(env, request);
  await exec(env, 'INSERT OR IGNORE INTO oblitus_found(ip_hash) VALUES(?)', [ih]);
  const [{ id }] = await q(env, 'SELECT id FROM oblitus_found WHERE ip_hash=?', [ih]);
  const [{ n }] = await q(env, 'SELECT COUNT(*) AS n FROM oblitus_found WHERE id<=?', [id]);
  const [{ x }] = await q(env, 'SELECT COUNT(*) AS x FROM visitors');
  return json({ n, x: Math.max(x, n) });
});

route('GET', '/oblitus/count', async ({ env }) => {
  const [{ x }] = await q(env, 'SELECT COUNT(*) AS x FROM visitors');
  const [{ n }] = await q(env, 'SELECT COUNT(*) AS n FROM oblitus_found');
  return json({ x: Math.max(x, n) });
});

route('GET', '/stats', async ({ env }) => {
  try {
    return json(await githubStats(env));
  } catch (e) {
    console.error('stats failed', e);
    return json(emptyStats());
  }
});

route('GET', '/now/playing', async ({ env }) => {
  try {
    const [row] = await q(env, "SELECT value FROM config WHERE key='lastfm:username'");
    return json(await nowPlaying(env, row?.value || ''));
  } catch (e) {
    console.error('now playing failed', e);
    return json({ isPlaying: false });
  }
});

route('GET', '/usage', async ({ request, env }) => {
  await requireAdmin(request, env);
  const month = new Date().toISOString().slice(0, 7);
  const calls = await q(env, 'SELECT key, count FROM usage WHERE month=?', [month]);
  const tables = ['guestbook', 'questions', 'visitors', 'projects', 'socials', 'sessions'];
  const res = await batch(env, tables.map((t) => ({ sql: `SELECT COUNT(*) AS n FROM ${t}` })));
  return json({
    month,
    api_calls: Object.fromEntries(calls.map((c) => [c.key, c.count])),
    rows: Object.fromEntries(tables.map((t, i) => [t, res[i].rows[0].n])),
  });
});

export const onRequest = handle(async (ctx) => {
  const { request, env } = ctx;
  if (!env.SESSION_SECRET || !env.TURSO_URL) throw new HttpError(500, 'server not configured');
  assertSameOrigin(request);

  const path = new URL(request.url).pathname.replace(/^\/api/, '') || '/';
  let pathMatched = false;
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== request.method) continue;
    return r.fn({ ...ctx, params: m.groups || {} });
  }
  throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method not allowed' : 'not found');
});
