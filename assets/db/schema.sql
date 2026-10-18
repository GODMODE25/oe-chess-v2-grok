-- OE Chess local schema. The browser build stores the same entities in IndexedDB.
-- Version this file with the app. Take a backup before applying a destructive migration.

PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS profile (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_success_day TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS openings (
  id TEXT PRIMARY KEY,
  eco TEXT,
  name TEXT NOT NULL,
  family TEXT,
  pgn TEXT,
  moves TEXT NOT NULL,
  note TEXT,
  tags TEXT,
  source TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS opening_reviews (
  id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL,
  side TEXT NOT NULL,
  status TEXT NOT NULL,
  ease REAL NOT NULL,
  interval_days REAL NOT NULL,
  due_at INTEGER NOT NULL,
  reps INTEGER NOT NULL,
  lapses INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS endgames (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  fen TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  user_side TEXT NOT NULL,
  objective TEXT NOT NULL,
  notes TEXT,
  payload TEXT NOT NULL,
  source TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS endgame_attempts (
  id TEXT PRIMARY KEY,
  endgame_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  success INTEGER,
  moves INTEGER NOT NULL,
  hints INTEGER NOT NULL,
  time_ms INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  pgn TEXT NOT NULL,
  start_fen TEXT NOT NULL,
  result TEXT,
  finished INTEGER NOT NULL,
  payload TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_synced_at INTEGER,
  dirty INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  at INTEGER NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL
);
