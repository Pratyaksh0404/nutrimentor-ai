// ── Phase 4.3: RAG admin routes ───────────────────────────────────────────────
// Mounted at /rag. Protected by a shared secret (RAG_ADMIN_KEY) since these
// endpoints write to the knowledge base — there's no role-based auth system
// yet, and a shared admin key is an appropriately lightweight protection for
// where the project is at, rather than over-building a permissions system
// for a single-admin content-management need.

import { Hono } from "hono";
import type { Env as MainEnv } from "./index";
import { ingestChunk, ingestChunksBulk, deleteChunk, searchKnowledgeBase, type KnowledgeChunk } from "./rag";

const ragApp = new Hono<{ Bindings: MainEnv }>();

function checkAdminKey(c: any): boolean {
  const provided = c.req.header("X-Admin-Key");
  return !!c.env.RAG_ADMIN_KEY && provided === c.env.RAG_ADMIN_KEY;
}

ragApp.post("/ingest", async (c) => {
  if (!checkAdminKey(c)) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<KnowledgeChunk>();
  if (!body.id || !body.content || !body.category) {
    return c.json({ error: "id, content, and category are required" }, 400);
  }
  await ingestChunk(c.env, body);
  return c.json({ ok: true, id: body.id });
});

ragApp.post("/ingest/bulk", async (c) => {
  if (!checkAdminKey(c)) return c.json({ error: "Unauthorized" }, 401);
  const body = await c.req.json<{ chunks: KnowledgeChunk[] }>();
  if (!Array.isArray(body.chunks) || body.chunks.length === 0) {
    return c.json({ error: "chunks array is required" }, 400);
  }
  const result = await ingestChunksBulk(c.env, body.chunks);
  return c.json(result);
});

ragApp.delete("/chunks/:id", async (c) => {
  if (!checkAdminKey(c)) return c.json({ error: "Unauthorized" }, 401);
  await deleteChunk(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

// Direct search — useful for testing retrieval quality independent of the
// agent loop, and for verifying corpus coverage as content is added.
ragApp.get("/search", async (c) => {
  if (!checkAdminKey(c)) return c.json({ error: "Unauthorized" }, 401);
  const q = c.req.query("q");
  if (!q) return c.json({ error: "q query param is required" }, 400);
  const topK = Number(c.req.query("topK")) || 3;
  const results = await searchKnowledgeBase(c.env, q, topK);
  return c.json({ query: q, results });
});

export default ragApp;
