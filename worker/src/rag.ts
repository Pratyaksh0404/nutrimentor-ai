// ── Phase 4.3: RAG knowledge layer ────────────────────────────────────────────
//
// Real retrieval-augmented generation, built entirely on Cloudflare's own
// stack — no external vector DB dependency (learned the hard way, earlier in
// this project, that external API dependencies are the thing most likely to
// become a reliability problem under load):
//
//   - Cloudflare Vectorize:  the vector index (semantic similarity search)
//   - Cloudflare Workers AI: the embedding model (@cf/baai/bge-base-en-v1.5,
//     768 dimensions) — a different, much simpler task than text generation,
//     so the earlier bad experience with Workers AI for generation doesn't
//     apply here.
//   - D1:                    the actual chunk text + metadata, hydrated by
//     the ids Vectorize returns from a query.
//
// Both Vectorize and Workers AI genuinely have free-tier allowances on the
// Workers Free plan (verified directly against Cloudflare's own pricing
// docs before building this, not assumed) — at the scale of a curated,
// hand-authored knowledge base (hundreds of chunks, not millions), this
// stays comfortably within the free allowance.

export interface Env {
  DB: D1Database;
  AI: Ai;
  VECTOR_INDEX: VectorizeIndex;
}

// Upgraded from bge-base to bge-large: same API shape, meaningfully higher
// retrieval accuracy on standard benchmarks (MTEB), still free on Workers AI.
// The tradeoff is dimension count (1024 vs 768) — costs a bit more of the
// free Vectorize allowance per vector, but at this corpus's scale (hundreds
// of chunks, not millions) that's immaterial against the 5M-dimension free
// tier. Changing this requires recreating the Vectorize index at the new
// dimension count — see phase4_3_rag_migration notes.
const EMBEDDING_MODEL = "@cf/baai/bge-large-en-v1.5";
const EMBEDDING_DIMENSIONS = 1024;

export interface KnowledgeChunk {
  id: string;
  content: string;
  category: string;
  source?: string;
}

// ── Embedding ──────────────────────────────────────────────────────────────────

async function embed(env: Env, text: string): Promise<number[]> {
  const result = await env.AI.run(EMBEDDING_MODEL, { text }) as any;
  const values = result?.data?.[0];
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("Embedding model returned an unexpected shape");
  }
  return values;
}

// Batch variant — embeds multiple chunks in one Workers AI call where
// possible (the model accepts an array of strings), reducing call count
// during bulk ingestion.
async function embedBatch(env: Env, texts: string[]): Promise<number[][]> {
  const result = await env.AI.run(EMBEDDING_MODEL, { text: texts }) as any;
  const data = result?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error("Embedding model returned an unexpected batch shape");
  }
  return data;
}

// ── Ingestion ──────────────────────────────────────────────────────────────────

export async function ingestChunk(env: Env, chunk: KnowledgeChunk): Promise<void> {
  const vector = await embed(env, chunk.content);

  await env.DB.prepare(
    `INSERT INTO knowledge_chunks (id, content, category, source, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       content = excluded.content, category = excluded.category, source = excluded.source,
       updated_at = datetime('now')`
  ).bind(chunk.id, chunk.content, chunk.category, chunk.source ?? null).run();

  await env.VECTOR_INDEX.upsert([{ id: chunk.id, values: vector, metadata: { category: chunk.category } }]);
}

// Bulk variant for seeding the starter corpus — batches the embedding calls
// (much fewer Workers AI requests than one-at-a-time) while still writing
// each chunk's D1 row and Vectorize upsert individually (D1 batch insert and
// Vectorize batch upsert both used where the API allows).
export async function ingestChunksBulk(env: Env, chunks: KnowledgeChunk[]): Promise<{ ingested: number; failed: string[] }> {
  const BATCH_SIZE = 20; // keep each Workers AI embedding call reasonably sized
  let ingested = 0;
  const failed: string[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    try {
      const vectors = await embedBatch(env, batch.map(c => c.content));

      const vectorizeEntries = batch.map((c, idx) => ({
        id: c.id, values: vectors[idx], metadata: { category: c.category },
      }));
      await env.VECTOR_INDEX.upsert(vectorizeEntries);

      // D1 batch insert
      const stmts = batch.map((c, idx) =>
        env.DB.prepare(
          `INSERT INTO knowledge_chunks (id, content, category, source, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             content = excluded.content, category = excluded.category, source = excluded.source,
             updated_at = datetime('now')`
        ).bind(c.id, c.content, c.category, c.source ?? null)
      );
      await env.DB.batch(stmts);
      ingested += batch.length;
    } catch (err) {
      console.error("Bulk ingest batch failed:", err);
      failed.push(...batch.map(c => c.id));
    }
  }

  return { ingested, failed };
}

export async function deleteChunk(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM knowledge_chunks WHERE id = ?1`).bind(id).run();
  await env.VECTOR_INDEX.deleteByIds([id]);
}

// ── Retrieval ──────────────────────────────────────────────────────────────────

export interface RetrievedChunk {
  content: string;
  category: string;
  source: string | null;
  score: number;
}

// Minimum similarity score to actually use a match — below this, the closest
// result still isn't a real answer to the question, and returning it would
// let the model ground a wrong answer in irrelevant context. Cosine
// similarity scores from Vectorize range roughly 0-1; 0.5 is a reasonably
// conservative floor for a small, topically-narrow corpus (better to say
// "nothing found" than to force a weak match into the answer).
const MIN_RELEVANCE_SCORE = 0.5;

export async function searchKnowledgeBase(env: Env, query: string, topK = 3): Promise<RetrievedChunk[]> {
  const queryVector = await embed(env, query);
  const result = await env.VECTOR_INDEX.query(queryVector, { topK });

  const relevantMatches = (result.matches ?? []).filter(m => m.score >= MIN_RELEVANCE_SCORE);
  if (relevantMatches.length === 0) return [];

  const ids = relevantMatches.map(m => m.id);
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const rows = await env.DB.prepare(
    `SELECT id, content, category, source FROM knowledge_chunks WHERE id IN (${placeholders})`
  ).bind(...ids).all();

  const byId = new Map((rows.results as any[]).map(r => [r.id, r]));
  return relevantMatches
    .map(m => {
      const row = byId.get(m.id);
      if (!row) return null;
      return { content: row.content, category: row.category, source: row.source ?? null, score: m.score };
    })
    .filter((x): x is RetrievedChunk => x !== null);
}
