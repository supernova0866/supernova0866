import { tx, q } from '../lib/db.js';

export const statements = [
  `CREATE TABLE IF NOT EXISTS config (
     key        TEXT PRIMARY KEY,
     value      TEXT NOT NULL,
     updated_at INTEGER NOT NULL DEFAULT (unixepoch())
   )`,

  `CREATE TABLE IF NOT EXISTS admin (
     id              INTEGER PRIMARY KEY CHECK (id = 1),
     password_hash   TEXT,
     password_set_at INTEGER
   )`,

  `CREATE TABLE IF NOT EXISTS sessions (
     id             TEXT PRIMARY KEY,
     via            TEXT NOT NULL CHECK (via IN ('password','github')),
     created_at     INTEGER NOT NULL,
     expires_at     INTEGER NOT NULL,
     github_auth_at INTEGER
   )`,

  `CREATE TABLE IF NOT EXISTS projects (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     name        TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     stack       TEXT NOT NULL DEFAULT '[]',
     link        TEXT NOT NULL DEFAULT '',
     pinned      INTEGER NOT NULL DEFAULT 0,
     sort_order  INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS socials (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     platform   TEXT NOT NULL,
     handle     TEXT NOT NULL,
     url        TEXT NOT NULL DEFAULT '',
     sort_order INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS guestbook (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     name       TEXT NOT NULL,
     message    TEXT NOT NULL,
     country    TEXT,
     created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
   )`,

  `CREATE TABLE IF NOT EXISTS questions (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     question    TEXT NOT NULL,
     answer      TEXT,
     answered    INTEGER NOT NULL DEFAULT 0,
     created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
     answered_at TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS visitors (
     session_id TEXT PRIMARY KEY,
     country    TEXT,
     city       TEXT,
     region     TEXT,
     timezone   TEXT,
     lat        REAL,
     lon        REAL,
     visited_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
   )`,

  `CREATE TABLE IF NOT EXISTS presence (
     session_id TEXT PRIMARY KEY,
     last_seen  INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_presence_seen ON presence(last_seen)`,

  `CREATE TABLE IF NOT EXISTS oblitus_found (
     id       INTEGER PRIMARY KEY AUTOINCREMENT,
     ip_hash  TEXT NOT NULL UNIQUE,
     found_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
   )`,

  `CREATE TABLE IF NOT EXISTS rate_events (
     bucket TEXT NOT NULL,
     at     INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_rate_bucket ON rate_events(bucket, at)`,

  `CREATE TABLE IF NOT EXISTS cache (
     key        TEXT PRIMARY KEY,
     value      TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   )`,

  `CREATE TABLE IF NOT EXISTS usage (
     month TEXT NOT NULL,
     key   TEXT NOT NULL,
     count INTEGER NOT NULL DEFAULT 0,
     PRIMARY KEY (month, key)
   )`,

  `INSERT OR IGNORE INTO admin (id, password_hash) VALUES (1, NULL)`,
];

export const defaultConfig = {
  'hero:status_text': 'do not disturb',
  'hero:status_subtext': 'probably doing nothing.\nor maybe something',
  'hero:location': '',
  'now:listening': 'nothing playing on spotify at the moment.',
  'now:listening_meta': 'on repeat',
  'now:project_name': '',
  'now:project_desc': '',
  'now:project_url': '',
  'now:project_status': 'in progress',
  'about:body':
    "hey, i'm {highlight:nova} — a student who spends too much time on the internet and not enough time sleeping. " +
    "i build things to understand them, and i'm convinced the best way to learn something is to make it break.\n" +
    '{divider}\n' +
    "right now i'm exploring {bold:your interests here}, dabbling in {bold:another interest}, and occasionally " +
    'touching grass. i care a lot about {highlight:something you value} and try to bring that into whatever i make.',
  'about:tags': 'web dev, open source, design, linux, coffee',
  'discord:id': '',
  'discord:fallback': 'got no activity running rn',
  'lastfm:username': '',
  'sys:status': 'do not disturb',
  'sys:status_at': new Date().toISOString(),
};

export function allStatements() {
  return [
    ...statements.map((sql) => ({ sql })),
    ...Object.entries(defaultConfig).map(([k, v]) => ({
      sql: 'INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)',
      args: [k, v],
    })),
  ];
}

export async function migrate(env) {
  await tx(env, allStatements());
  const rows = await q(env, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  return rows.map((r) => r.name);
}

const literal = (v) => `'${String(v).replace(/'/g, "''")}'`;

function toSql({ sql, args = [] }) {
  let i = 0;
  const text = sql.replace(/\?/g, () => literal(args[i++]));
  return text.trim().replace(/;?$/, ';');
}

async function loadEnv() {
  const { existsSync, readFileSync } = await import('node:fs');
  const env = {};
  const file = new URL('../.dev.vars', import.meta.url);
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      env[m[1]] = m[2].replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...env, ...process.env };
}

async function main() {
  if (process.argv.includes('--print')) {
    console.log(allStatements().map(toSql).join('\n\n'));
    return;
  }
  const env = await loadEnv();
  for (const k of ['TURSO_URL', 'TURSO_AUTH_TOKEN']) {
    if (!env[k]) {
      console.error(`missing ${k}: set it in the environment or in backend/.dev.vars`);
      process.exit(1);
    }
  }
  const tables = await migrate(env);
  const host = new URL(env.TURSO_URL.replace(/^libsql:/, 'https:')).host;
  console.log(`schema applied to ${host}`);
  console.log(`tables (${tables.length}): ${tables.join(', ')}`);
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  import('node:url')
    .then(({ pathToFileURL }) => (import.meta.url === pathToFileURL(process.argv[1]).href ? main() : undefined))
    .catch((e) => {
      console.error('schema failed:', e.message);
      process.exit(1);
    });
}
