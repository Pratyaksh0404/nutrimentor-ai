-- ============================================================
-- NutriMentor AI — add_tables.sql
-- Run: wrangler d1 execute nutrimentor-db --file=add_tables.sql --remote
--
-- EXISTING tables (DO NOT touch):
--   nutrients, items, item_nutrients, rda,
--   profiles, sessions, messages, meal_logs
-- ============================================================

-- ── user_facts: agent learns preferences/dislikes from conversation ──
CREATE TABLE IF NOT EXISTS user_facts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT    NOT NULL,
  fact_type   TEXT    NOT NULL,   -- dislike | preference | health_note | goal_update | allergy | lifestyle
  fact_key    TEXT    NOT NULL,
  fact_value  TEXT    NOT NULL,
  confidence  REAL    DEFAULT 1.0,
  source      TEXT    DEFAULT 'user',  -- 'conversation' | 'profile' | 'user'
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now'))
);

-- ── agent_actions: every agent request logged for observability ──
CREATE TABLE IF NOT EXISTS agent_actions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id     TEXT    NOT NULL,
  profile_id     TEXT,
  action_type    TEXT    NOT NULL,  -- request | tool_call | fact_extract | plan_generate
  action_data    TEXT,              -- JSON payload
  result_summary TEXT,              -- first 200 chars of response
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ── diet_plans: saved weekly/daily plans per user ──
CREATE TABLE IF NOT EXISTS diet_plans (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id     TEXT    NOT NULL,
  plan_name      TEXT,
  season         TEXT,
  goal           TEXT,
  calorie_target INTEGER,
  days           INTEGER DEFAULT 1,
  plan_data      TEXT    NOT NULL,  -- full JSON plan
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ── nutrition_scores: weekly 0-100 score computed from meal logs ──
CREATE TABLE IF NOT EXISTS nutrition_scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id   TEXT    NOT NULL,
  week_start   TEXT    NOT NULL,   -- ISO date of Monday
  score        INTEGER,
  breakdown    TEXT,               -- JSON: per-nutrient scores
  deficiencies TEXT,               -- JSON: list of low nutrients
  created_at   TEXT    DEFAULT (datetime('now'))
);

-- ── food_preferences: explicit likes / dislikes per food item ──
CREATE TABLE IF NOT EXISTS food_preferences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id  TEXT    NOT NULL,
  item_id     INTEGER REFERENCES items(id),
  preference  TEXT    NOT NULL,   -- 'like' | 'dislike' | 'avoid'
  reason      TEXT,
  created_at  TEXT    DEFAULT (datetime('now'))
);

-- ── ritu_journal: 6 seasonal guides with Ayurvedic context ──
CREATE TABLE IF NOT EXISTS ritu_journal (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  season         TEXT    NOT NULL UNIQUE,
  title          TEXT    NOT NULL,
  description    TEXT    NOT NULL,
  eat_more       TEXT    NOT NULL,
  avoid          TEXT    NOT NULL,
  ayurvedic_note TEXT,
  dosha          TEXT,
  created_at     TEXT    DEFAULT (datetime('now'))
);

-- ── Seed ritu_journal with all 6 seasons ──
INSERT OR IGNORE INTO ritu_journal
  (season, title, description, eat_more, avoid, ayurvedic_note, dosha)
VALUES
  ('spring',    'Vasanta Ritu',
   'Spring season — body transitions from cold to warm. Digestion improves. Time to detoxify.',
   'Bitter greens, light grains, honey, barley, ginger',
   'Heavy oils, cold foods, excess dairy, sweets',
   'Kapha dosha pacification time. Eat light, dry, and warm.',
   'Kapha'),

  ('summer',    'Grishma Ritu',
   'Hot season — body loses strength. Coolness and hydration are key priorities.',
   'Cooling fruits, coconut water, curd, rice, ghee in moderation',
   'Spicy, pungent, sour, salty foods, excessive exercise',
   'Pitta increases. Sweet, bitter, and astringent tastes pacify Pitta.',
   'Pitta'),

  ('monsoon',   'Varsha Ritu',
   'Rainy season — digestion is weakest. Eat freshly cooked, easy-to-digest foods.',
   'Light grains (moong, jowar), ginger, garlic, warm soups',
   'Raw salads, leafy vegetables, stale food, excess water',
   'All three doshas can be aggravated. Focus on digestive fire (Agni).',
   'Vata'),

  ('autumn',    'Sharad Ritu',
   'Post-monsoon — Pitta peaks as sun emerges. Balance heat with cooling, sweet foods.',
   'Bitter gourd, pomegranate, rice, milk, coconut',
   'Hot, spicy, sour foods, sesame, curd at night',
   'Pitta dominates. Bitter, sweet, and cooling foods help maintain balance.',
   'Pitta'),

  ('prewinter', 'Hemanta Ritu',
   'Early winter — digestive fire is strong. Body can handle richer, nourishing foods.',
   'Sesame, jaggery, dates, warm milk, ghee, root vegetables',
   'Cold, dry, and light foods. Avoid exposure to cold winds.',
   'Vata increases. Warm, unctuous, and heavy foods are beneficial.',
   'Vata'),

  ('winter',    'Shishira Ritu',
   'Deep winter — strongest digestive fire. Focus on nourishing, warming, energy-dense foods.',
   'Amla, sesame, dates, warm grains, ginger tea, nuts',
   'Cold drinks, raw foods, exposure to frost, skipping meals',
   'Kapha and Vata both present. Warm, oily, and nourishing foods are ideal.',
   'Kapha+Vata');

-- ── Indexes for query performance ──
CREATE INDEX IF NOT EXISTS idx_user_facts_profile       ON user_facts(profile_id, fact_type);
CREATE INDEX IF NOT EXISTS idx_agent_actions_session    ON agent_actions(session_id);
CREATE INDEX IF NOT EXISTS idx_diet_plans_profile       ON diet_plans(profile_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_scores_profile ON nutrition_scores(profile_id, week_start);
CREATE INDEX IF NOT EXISTS idx_food_preferences_profile ON food_preferences(profile_id);
CREATE INDEX IF NOT EXISTS idx_meal_logs_profile_date   ON meal_logs(profile_id, logged_date);
