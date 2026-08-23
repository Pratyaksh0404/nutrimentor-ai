-- Phase 4.3: RAG knowledge layer
-- ──────────────────────────────────────────────────────────────────────────
-- Vectors live in Cloudflare Vectorize (semantic search index). This table
-- holds the actual chunk text and metadata, keyed by the same id used in
-- Vectorize — Vectorize returns matching ids on query, this table hydrates
-- them into real content to feed the agent loop.

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          TEXT PRIMARY KEY,   -- same id used as the Vectorize vector id
  content     TEXT NOT NULL,
  category    TEXT NOT NULL,      -- e.g. 'food_general', 'condition', 'combination', 'ayurveda'
  source      TEXT,               -- attribution / provenance note
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_category ON knowledge_chunks(category);
