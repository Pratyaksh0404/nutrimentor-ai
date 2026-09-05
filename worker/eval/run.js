#!/usr/bin/env node
/**
 * ── Eval Harness Runner ──────────────────────────────────────────────────────
 *
 * ONE-TIME SETUP (do this once, before the first run):
 *
 *   Seed a long-lived session token directly into KV for a dedicated eval
 *   profile — this sidesteps the Google OAuth flow entirely (can't automate
 *   clicking through Google's consent screen from a script), while using
 *   zero new backend code and zero new attack surface. This is a raw KV
 *   write with its own independent TTL, unrelated to the app's normal
 *   28-day session policy — pick a long TTL since this only needs
 *   refreshing occasionally, not every 28 days.
 *
 *   wrangler kv key put --binding=SESSIONS \
 *     "auth_session:eval-harness-token-do-not-share" \
 *     '{"profile_id":"eval-harness-profile","google_id":"eval-harness","email":"eval@internal","name":"Eval Harness"}' \
 *     --remote --ttl 31536000
 *
 *   (31536000 seconds = 365 days. Re-run this command yearly, or whenever
 *   you rotate it.)
 *
 * USAGE:
 *   EVAL_TOKEN=eval-harness-token-do-not-share node worker/eval/run.js
 *   WORKER_URL=https://your-custom-domain node worker/eval/run.js   (optional override)
 *
 * WHAT THIS DOES:
 *   1. Wipes the eval profile's facts clean (DELETE /facts/:id/all) so every
 *      run starts from the same known state — cases that set a fact
 *      (dislikes, preferences) don't leak into unrelated later cases.
 *   2. Runs each case in cases.json against the live worker, in order, with
 *      a small delay between calls (gentle on the shared Gemini quota, and
 *      keeps well under the 50-message/3hr rate limit for this profile —
 *      the whole suite is ~16 messages, so this is not a close call).
 *   3. Checks each turn's response against its declared checks.
 *   4. Prints a pass/fail table and writes full detail to results/ for any
 *      failure, so a fix can be traced without re-running.
 *
 * Exit code: 0 if everything passed, 1 if anything failed (usable as a
 * pre-deploy gate later, once this has proven reliable).
 */

const fs = require("fs");
const path = require("path");

const WORKER_URL = process.env.WORKER_URL || "https://nutrimentor-worker.nutrimentor.workers.dev";
const EVAL_TOKEN = process.env.EVAL_TOKEN;
const EVAL_PROFILE_ID = "eval-harness-profile"; // must match the profile_id seeded in KV above
const DELAY_MS_BETWEEN_CALLS = 3500; // was 800ms — too aggressive for a shared free-tier
// Gemini quota when a meaningful fraction of the suite deliberately targets the agent
// loop. Real usage never clusters this many agent-loop-triggering messages into under
// a minute; the harness was doing exactly that and likely rate-limiting itself.

if (!EVAL_TOKEN) {
  console.error("EVAL_TOKEN environment variable is required. See the setup instructions at the top of this file.");
  process.exit(1);
}

const CASES_FILE = path.join(__dirname, "cases.json");
const RESULTS_DIR = path.join(__dirname, "results");

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callAgent(message, sessionId) {
  const res = await fetch(`${WORKER_URL}/agent/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${EVAL_TOKEN}`,
    },
    body: JSON.stringify({
      message,
      context: { session_id: sessionId, profile_id: EVAL_PROFILE_ID },
    }),
  });
  const status = res.status;
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status, body };
}

async function resetEvalProfile() {
  await fetch(`${WORKER_URL}/facts/${EVAL_PROFILE_ID}/all`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${EVAL_TOKEN}` },
  }).catch(() => {}); // best-effort — a failed reset shouldn't block the run, just risks stale state
}

// ── Check evaluators ──────────────────────────────────────────────────────────

function runCheck(check, response) {
  const message = response.body?.message ?? "";
  const messageLower = message.toLowerCase();
  const taskType = response.body?.task_type ?? "";
  const toolsUsed = response.body?.tools_used ?? [];

  switch (check.type) {
    case "contains_any": {
      const hit = check.value.some(v => messageLower.includes(v.toLowerCase()));
      return { pass: hit, detail: hit ? null : `expected one of ${JSON.stringify(check.value)} in message` };
    }
    case "not_contains": {
      const hit = check.value.find(v => messageLower.includes(v.toLowerCase()));
      return { pass: !hit, detail: hit ? `found forbidden string: "${hit}"` : null };
    }
    case "tool_used": {
      const hit = check.value.some(v => toolsUsed.includes(v));
      return { pass: hit, detail: hit ? null : `expected one of ${JSON.stringify(check.value)} in tools_used=${JSON.stringify(toolsUsed)}` };
    }
    case "tool_not_used": {
      const hit = check.value.find(v => toolsUsed.includes(v));
      return { pass: !hit, detail: hit ? `forbidden tool used: "${hit}"` : null };
    }
    case "task_type_in": {
      const hit = check.value.includes(taskType);
      return { pass: hit, detail: hit ? null : `expected task_type in ${JSON.stringify(check.value)}, got "${taskType}"` };
    }
    case "task_type_not_in": {
      const hit = check.value.includes(taskType);
      return { pass: !hit, detail: hit ? `task_type "${taskType}" is in the forbidden list ${JSON.stringify(check.value)}` : null };
    }
    case "min_length": {
      const pass = message.length >= check.value;
      return { pass, detail: pass ? null : `message length ${message.length} < required ${check.value}` };
    }
    case "max_sentences": {
      const count = (message.match(/[.!?]+/g) || []).length;
      const pass = count <= check.value;
      return { pass, detail: pass ? null : `${count} sentences > max ${check.value}` };
    }
    case "field_contains": {
      // Dot-path into the response body (e.g. "plan_data.excluded_foods") —
      // for checking structured data instead of naive full-text matching,
      // which can't distinguish "X correctly excluded" from "X appeared by
      // mistake" when the confirmation text itself has to name X.
      const value = check.path.split(".").reduce((obj, key) => obj?.[key], response.body);
      const arr = Array.isArray(value) ? value : [];
      const hit = check.value.some(v => arr.some((item) => String(item).toLowerCase().includes(v.toLowerCase())));
      return { pass: hit, detail: hit ? null : `expected one of ${JSON.stringify(check.value)} in ${check.path}=${JSON.stringify(value)}` };
    }
    default:
      return { pass: false, detail: `unknown check type: ${check.type}` };
  }
}

// ── Main run ───────────────────────────────────────────────────────────────────

async function main() {
  const cases = JSON.parse(fs.readFileSync(CASES_FILE, "utf8"));
  console.log(`Running ${cases.length} eval cases against ${WORKER_URL}\n`);

  console.log("Resetting eval profile state...");
  await resetEvalProfile();

  const results = [];
  let passCount = 0, failCount = 0;

  for (const testCase of cases) {
    const sessionId = `eval-${testCase.id}-${Date.now()}`;
    let caseFailed = false;
    const turnResults = [];

    for (const turn of testCase.turns) {
      await sleep(DELAY_MS_BETWEEN_CALLS);
      const response = await callAgent(turn.message, sessionId);

      if (response.status === 401) {
        console.error(`\n❌ FATAL: got 401 Unauthorized. Is EVAL_TOKEN correct and actually seeded in KV? See setup instructions.`);
        process.exit(1);
      }
      if (response.status === 429) {
        console.error(`\n⚠️  Rate limited on case "${testCase.id}" — treating as a fail, not evaluating content checks against the error body.`);
        turnResults.push({ message: turn.message, response: response.body, checks: [{ type: "rate_limited", pass: false, detail: "Got HTTP 429 instead of a real response — this case did not actually run." }] });
        caseFailed = true;
        continue;
      }

      const checks = (turn.checks || []).map(check => ({ ...check, ...runCheck(check, response) }));
      const turnPassed = checks.every(c => c.pass);
      if (!turnPassed) caseFailed = true;

      turnResults.push({ message: turn.message, response: response.body, checks });
    }

    if (caseFailed) failCount++; else passCount++;
    results.push({ id: testCase.id, description: testCase.description, passed: !caseFailed, turns: turnResults });

    const icon = caseFailed ? "❌" : "✅";
    console.log(`${icon} ${testCase.id}${caseFailed ? "  — " + testCase.description : ""}`);
    if (caseFailed) {
      for (const t of turnResults) {
        for (const c of t.checks) {
          if (!c.pass) console.log(`     "${t.message}" → ${c.type}: ${c.detail}`);
        }
      }
    }
  }

  console.log(`\n${passCount}/${cases.length} passed, ${failCount} failed.\n`);

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const resultsFile = path.join(RESULTS_DIR, `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`Full results written to ${resultsFile}`);

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Eval run crashed:", err);
  process.exit(1);
});
