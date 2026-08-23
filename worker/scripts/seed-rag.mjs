// Seeds the RAG knowledge base from rag_seed_corpus.json.
//
// Usage:
//   node scripts/seed-rag.mjs <worker-url> <admin-key>
//
// Example:
//   node scripts/seed-rag.mjs https://nutrimentor-worker.nutrimentor.workers.dev my-secret-key
//
// Run from the worker/ directory (paths are relative to it).

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , workerUrl, adminKey] = process.argv;

if (!workerUrl || !adminKey) {
  console.error("Usage: node scripts/seed-rag.mjs <worker-url> <admin-key>");
  process.exit(1);
}

const corpusPath = join(__dirname, "..", "rag_seed_corpus.json");
const corpus = JSON.parse(readFileSync(corpusPath, "utf-8"));

console.log(`Seeding ${corpus.chunks.length} chunks to ${workerUrl}/rag/ingest/bulk ...`);

const res = await fetch(`${workerUrl}/rag/ingest/bulk`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Admin-Key": adminKey,
  },
  body: JSON.stringify(corpus),
});

if (!res.ok) {
  console.error(`Failed: ${res.status} ${res.statusText}`);
  console.error(await res.text().catch(() => ""));
  process.exit(1);
}

const result = await res.json();
console.log(`Ingested: ${result.ingested}`);
if (result.failed?.length) {
  console.error(`Failed chunk ids: ${result.failed.join(", ")}`);
  process.exit(1);
}
console.log("Done.");
