-- Phase 5: Google Auth + persistent accounts
-- ──────────────────────────────────────────────────────────────────────────
-- Design decision: the app already has a fully working, deeply-integrated
-- identifier scheme — a string `profileId` (browser-generated UUID) used as
-- the key for KV profile storage, D1 user_facts.profile_id, meal_logs'
-- session_id column, and every query in the app. The pre-existing `profiles`
-- table (INTEGER PRIMARY KEY) was designed for a different, never-completed
-- auth model and is NOT used by anything live.
--
-- Rather than migrating the entire app to a second identifier scheme (a large,
-- risky refactor of already-stable code), this table maps a Google account to
-- the EXISTING string profileId. Signing in doesn't change how any existing
-- query works — it just makes a profileId resolvable from any device via
-- Google login, instead of only via one browser's localStorage.

CREATE TABLE IF NOT EXISTS auth_identities (
  google_id   TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  email       TEXT,
  name        TEXT,
  avatar_url  TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_profile ON auth_identities(profile_id);
