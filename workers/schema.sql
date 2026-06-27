-- D1 Database Schema Setup for Cloudflare Workers

CREATE TABLE IF NOT EXISTS oblitus_visitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  country TEXT,
  city TEXT,
  region TEXT,
  timezone TEXT,
  visited_at TEXT
);

CREATE TABLE IF NOT EXISTS ask_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT,
  answer TEXT,
  answered INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS site_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Seed initial site configuration
INSERT OR IGNORE INTO site_config (key, value) VALUES
  ('hero:status_text', 'do not disturb'),
  ('hero:status_subtext', 'probably doing nothing.\nor maybe something'),
  ('now:project_name', ''),
  ('now:project_desc', ''),
  ('now:project_url', ''),
  ('now:project_status', 'in progress'),
  ('now:listening', 'artist or album you can''t stop playing'),
  ('now:listening_meta', 'on repeat'),
  ('about:body', 'hey, i''m {highlight:nova} — a student who spends too much time on the internet and not enough time sleeping. i build things to understand them, and i''m convinced the best way to learn something is to make it break.\n{divider}\nright now i''m exploring {bold:your interests here}, dabbling in {bold:another interest}, and occasionally touching grass. i care a lot about {highlight:something you value} and try to bring that into whatever i make.'),
  ('about:tags', 'web dev, open source, design, linux, coffee, your tag, your tag'),
  ('discord:id', 'your-handle'),
  ('lastfm:username', 'your-username');
