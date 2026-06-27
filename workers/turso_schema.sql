-- Turso Database Schema Setup

CREATE TABLE IF NOT EXISTS visitor_presence (
  session_id TEXT PRIMARY KEY,
  pinged_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS guestbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  message TEXT,
  country TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT,
  endpoint TEXT,
  count INTEGER,
  last_hit TEXT,
  date TEXT
);
