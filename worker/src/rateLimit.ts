// ── Rate limiting (2026-08-23) ────────────────────────────────────────────────
//
// Protects the shared Gemini free-tier quota the same way ChatGPT/Claude
// protect theirs: a per-user message cap on a rolling window, not a global
// kill switch. Applied specifically to /agent/message — the one endpoint
// that can reach Gemini — not the rest of the API, since deterministic
// routes (profile, facts, meals) don't touch the scarce shared resource.
//
// Storage: KV (the same SESSIONS binding already used everywhere else — no
// new binding needed). This is a fixed window, not a true sliding window:
// the window start is stored explicitly and compared on each request, so a
// user's count actually resets to zero after the window elapses, rather
// than the window silently extending forever the way a naive
// "just re-PUT with the same TTL" approach would (KV's put() always resets
// TTL to what you pass, so relying on TTL alone for a sliding reset doesn't
// work — hence storing windowStart and comparing it in application logic).
//
// Known limitation, accepted deliberately: KV reads/writes aren't atomic,
// so truly concurrent requests from the same profile could under-count by
// one or two messages in rare cases. For this project's scale, that's a
// fine tradeoff against pulling in Durable Objects for a precise atomic
// counter — revisit only if real traffic ever makes this matter.

const RATE_LIMIT_WINDOW_SECONDS = 3 * 60 * 60; // 3 hours
const RATE_LIMIT_MAX_MESSAGES = 50;            // per profile, per window

interface RateLimitState {
  count: number;
  windowStart: number; // ms since epoch
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

async function checkAndIncrementRateLimit(
  kv: KVNamespace,
  profileId: string
): Promise<RateLimitResult> {
  const key = `ratelimit:agent_message:${profileId}`;
  const now = Date.now();

  let state: RateLimitState = { count: 0, windowStart: now };

  const raw = await kv.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RateLimitState;
      const elapsedSeconds = (now - parsed.windowStart) / 1000;
      if (elapsedSeconds < RATE_LIMIT_WINDOW_SECONDS) {
        state = parsed; // still within the current window — keep counting
      }
      // else: window has elapsed, fall through with the fresh state above
    } catch {
      // corrupted/unexpected value — treat as a fresh window rather than fail closed
    }
  }

  if (state.count >= RATE_LIMIT_MAX_MESSAGES) {
    const retryAfterSeconds = Math.max(
      1,
      Math.round(RATE_LIMIT_WINDOW_SECONDS - (now - state.windowStart) / 1000)
    );
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  const nextState: RateLimitState = { count: state.count + 1, windowStart: state.windowStart };
  await kv.put(key, JSON.stringify(nextState), {
    // A little past the logical window, purely so KV eventually garbage-
    // collects the key if the profile goes inactive — the actual reset
    // logic above doesn't depend on this.
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS + 300,
  });

  return { allowed: true, remaining: RATE_LIMIT_MAX_MESSAGES - nextState.count };
}

// The eval harness reuses one fixed profile across every run (see worker/eval/),
// and gets re-run repeatedly during active development — a real user would
// never send 50+ messages across six back-to-back test sessions, but that's
// exactly what iterating on this harness looks like. Exempting this one,
// specific, internal-only profile (its token is raw-seeded into KV directly,
// never obtainable through the real Google OAuth flow) rather than the rate
// limit blocking legitimate testing along with real abuse.
const RATE_LIMIT_EXEMPT_PROFILES = new Set(["eval-harness-profile"]);

// Hono middleware — must run AFTER requireAuth (needs c.get("authProfileId")).
export async function rateLimitAgentMessage(c: any, next: () => Promise<void>) {
  const profileId = c.get("authProfileId") as string;
  if (RATE_LIMIT_EXEMPT_PROFILES.has(profileId)) { await next(); return; }

  const result = await checkAndIncrementRateLimit(c.env.SESSIONS, profileId);

  if (!result.allowed) {
    const minutes = Math.ceil((result.retryAfterSeconds ?? 0) / 60);
    return c.json(
      {
        error: "Rate limit exceeded",
        message: `You've reached the message limit for now. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        retry_after_seconds: result.retryAfterSeconds,
      },
      429
    );
  }

  c.header("X-RateLimit-Remaining", String(result.remaining));
  await next();
}

// ── Global Gemini rate gate (2026-08-24) ──────────────────────────────────────
//
// The per-profile limiter above protects against one abusive/scripted user —
// it does nothing to stop Gemini's actual per-minute ceiling from being
// exceeded by normal traffic from several DIFFERENT real users landing close
// together in time. Confirmed via Google AI Studio's own usage dashboard:
// gemini-2.5-flash-lite's free tier is ~15 requests/minute — genuinely easy
// to exceed with just a handful of concurrent agent-loop-triggering messages,
// not just a testing burst.
//
// This is a proactive gate, not a reactive retry: checked BEFORE attempting
// a Gemini call, so a request that would fail anyway never gets sent —
// protecting Gemini's real quota instead of contributing to a 429 storm and
// giving fast, predictable fallback behavior instead of a slow failed
// round-trip.
//
// Set conservatively below the real ~15 RPM ceiling (not at it) — leaves
// headroom for other Gemini usage on this same API key/project, and for the
// imprecision inherent in KV not being strictly atomic (see note below).
const GEMINI_GLOBAL_RPM_LIMIT = 10;
const GEMINI_GLOBAL_WINDOW_SECONDS = 60;

interface GeminiRateState { count: number; windowStart: number }

// Same known limitation as the per-profile limiter: KV reads/writes aren't
// atomic, so truly concurrent requests could under-count by one or two in
// rare cases. Given this gate is deliberately set below the real ceiling
// (10 vs ~15), that margin absorbs the imprecision — accepted deliberately
// rather than pulling in Durable Objects for an exact global counter.
export async function reserveGeminiCallSlot(kv: KVNamespace): Promise<boolean> {
  const key = "ratelimit:gemini_global_rpm";
  const now = Date.now();

  let state: GeminiRateState = { count: 0, windowStart: now };
  const raw = await kv.get(key);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as GeminiRateState;
      if ((now - parsed.windowStart) / 1000 < GEMINI_GLOBAL_WINDOW_SECONDS) state = parsed;
    } catch { /* corrupted value — treat as a fresh window */ }
  }

  if (state.count >= GEMINI_GLOBAL_RPM_LIMIT) return false;

  await kv.put(key, JSON.stringify({ count: state.count + 1, windowStart: state.windowStart }), {
    expirationTtl: GEMINI_GLOBAL_WINDOW_SECONDS + 30,
  });
  return true;
}
