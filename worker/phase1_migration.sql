-- ============================================================
-- NutriMentor AI — phase1_migration.sql (v2 — safe re-run)
-- Run: wrangler d1 execute nutrimentor-db --file=phase1_migration.sql --remote
-- ============================================================

-- ── 1. Recreate user_facts with UNIQUE constraint ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_facts_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT    NOT NULL,
  fact_type   TEXT    NOT NULL,
  fact_key    TEXT    NOT NULL,
  fact_value  TEXT    NOT NULL,
  confidence  REAL    DEFAULT 1.0,
  source      TEXT    DEFAULT 'user',
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(profile_id, fact_type, fact_key)
);

INSERT OR IGNORE INTO user_facts_new
  (id, profile_id, fact_type, fact_key, fact_value, confidence, source, created_at, updated_at)
SELECT id, profile_id, fact_type, fact_key, fact_value, confidence, source, created_at, updated_at
FROM user_facts;

DROP TABLE user_facts;
ALTER TABLE user_facts_new RENAME TO user_facts;

CREATE INDEX IF NOT EXISTS idx_user_facts_profile ON user_facts(profile_id, fact_type);

-- ── 2. Delete bad facts stored by buggy likes regex ──────────────────────────
DELETE FROM user_facts WHERE fact_type = 'preference' AND fact_key LIKE 'like %';
DELETE FROM user_facts WHERE fact_type = 'dislike' AND fact_key LIKE 'like %';
DELETE FROM user_facts WHERE fact_type = 'preference' AND fact_key LIKE 'to %';
DELETE FROM user_facts WHERE fact_type = 'preference' AND fact_key LIKE 'my %';

-- ── 3. session_id column — only add if not already present ───────────────────
-- Previous migration may have already added it, so we use a safe approach.
-- SQLite does not support IF NOT EXISTS for ALTER TABLE ADD COLUMN,
-- but the column was added in the previous run so we skip it here.
-- If this fails with "duplicate column" just ignore — the column exists already.

CREATE INDEX IF NOT EXISTS idx_meal_logs_session ON meal_logs(session_id, logged_date);