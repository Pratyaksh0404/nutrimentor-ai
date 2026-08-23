// ── Phase 5: Google Auth ──────────────────────────────────────────────────────
//
// Standard OAuth 2.0 authorization code flow. Design goal: authentication
// should make an existing profileId resolvable from any device — it should
// NOT introduce a second identity system alongside the one already used
// everywhere else in the app (KV profile storage, D1 user_facts, meal_logs,
// sessions). See phase5_auth_migration.sql for the reasoning in full.
//
// Flow:
//   1. GET /auth/google/start?profile_id=<local guest id>
//      → redirects to Google's consent screen, with a short-lived,
//        single-use `state` token (stored in KV) binding this request to
//        the caller's current local profileId, for CSRF protection.
//   2. GET /auth/google/callback?code=...&state=...
//      → validates state, exchanges code for tokens, fetches the Google
//        profile, resolves (or creates) the auth_identities mapping,
//        issues a session token, redirects back to the frontend.
//   3. GET /auth/me            — validate a session token, return identity.
//   4. POST /auth/logout       — invalidate a session token.

import { Hono } from "hono";
import type { Env } from "./index";

const authApp = new Hono<{ Bindings: Env }>();

const GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const STATE_TTL_SECONDS   = 10 * 60;              // 10 minutes to complete login
const SESSION_TTL_SECONDS = 28 * 24 * 60 * 60;      // 28 days — re-authentication required after this

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

// ── Step 1: start the flow ────────────────────────────────────────────────────
authApp.get("/google/start", async (c) => {
  const localProfileId = c.req.query("profile_id");
  if (!localProfileId) return c.json({ error: "profile_id is required" }, 400);
  if (!c.env.GOOGLE_CLIENT_ID || !c.env.WORKER_URL) {
    return c.json({ error: "Google auth is not configured on this deployment" }, 501);
  }

  const state = randomToken();
  // Single-use, short-lived — consumed and deleted at the callback step.
  await c.env.SESSIONS.put(`oauth_state:${state}`, localProfileId, { expirationTtl: STATE_TTL_SECONDS });

  const redirectUri = `${c.env.WORKER_URL}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
});

// ── Step 2: Google redirects back here with a code ────────────────────────────
authApp.get("/google/callback", async (c) => {
  const code  = c.req.query("code");
  const state = c.req.query("state");
  const frontendUrl = c.env.FRONTEND_URL || "/";

  if (!code || !state) {
    return c.redirect(`${frontendUrl}?auth_error=missing_params`);
  }

  // Validate + consume the state token (CSRF protection, single-use)
  const boundProfileId = await c.env.SESSIONS.get(`oauth_state:${state}`);
  if (!boundProfileId) {
    return c.redirect(`${frontendUrl}?auth_error=invalid_or_expired_state`);
  }
  await c.env.SESSIONS.delete(`oauth_state:${state}`);

  try {
    // Exchange the authorization code for tokens
    const redirectUri = `${c.env.WORKER_URL}/auth/google/callback`;
    const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID,
        client_secret: c.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResp.ok) {
      console.error("Google token exchange failed:", await tokenResp.text().catch(() => ""));
      return c.redirect(`${frontendUrl}?auth_error=token_exchange_failed`);
    }
    const tokenData = await tokenResp.json() as any;
    const accessToken = tokenData.access_token;
    if (!accessToken) return c.redirect(`${frontendUrl}?auth_error=no_access_token`);

    // Fetch the user's Google profile
    const userResp = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userResp.ok) return c.redirect(`${frontendUrl}?auth_error=userinfo_failed`);
    const googleUser = await userResp.json() as any;
    const googleId = googleUser.id as string;
    if (!googleId) return c.redirect(`${frontendUrl}?auth_error=no_google_id`);

    // Resolve identity: if this Google account has signed in before (from any
    // device), use THAT profileId — this is what makes cross-device sync work.
    // Otherwise, this is a first-time link: claim the caller's current local
    // (guest) profileId, preserving whatever data it already has.
    const existing = await c.env.DB.prepare(
      `SELECT profile_id FROM auth_identities WHERE google_id = ?1`
    ).bind(googleId).first<any>();

    const resolvedProfileId = existing?.profile_id ?? boundProfileId;

    await c.env.DB.prepare(
      `INSERT INTO auth_identities (google_id, profile_id, email, name, avatar_url, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))
       ON CONFLICT(google_id) DO UPDATE SET
         email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url,
         updated_at = datetime('now')`
    ).bind(googleId, resolvedProfileId, googleUser.email ?? null, googleUser.name ?? null, googleUser.picture ?? null).run();

    // Issue a session token the frontend will send on future requests to
    // resolve "who is this" without re-running the OAuth dance.
    const sessionToken = randomToken();
    await c.env.SESSIONS.put(
      `auth_session:${sessionToken}`,
      JSON.stringify({
        profile_id: resolvedProfileId,
        google_id: googleId,
        email: googleUser.email ?? null,
        name: googleUser.name ?? null,
        avatar_url: googleUser.picture ?? null,
      }),
      { expirationTtl: SESSION_TTL_SECONDS }
    );

    const redirectParams = new URLSearchParams({
      tab: "settings",
      auth_token: sessionToken,
      profile_id: resolvedProfileId,
    });
    return c.redirect(`${frontendUrl}?${redirectParams.toString()}`);
  } catch (err) {
    console.error("Google auth callback error:", err);
    return c.redirect(`${frontendUrl}?auth_error=unexpected_error`);
  }
});

// ── Step 3: resolve a session token ───────────────────────────────────────────
authApp.get("/me", async (c) => {
  const token = c.req.query("token") ?? c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return c.json({ authenticated: false }, 401);

  const raw = await c.env.SESSIONS.get(`auth_session:${token}`);
  if (!raw) return c.json({ authenticated: false }, 401);

  const session = JSON.parse(raw);
  return c.json({ authenticated: true, ...session });
});

// ── Step 4: logout ─────────────────────────────────────────────────────────────
authApp.post("/logout", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const token = body.token ?? c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (token) await c.env.SESSIONS.delete(`auth_session:${token}`);
  return c.json({ ok: true });
});

// ── Auth enforcement (2026-08-23) ─────────────────────────────────────────────
//
// Everything below this point closes the gap between "there's a sign-in
// screen" and "the API actually requires it." Before this, every route in
// index.ts trusted whatever profile_id the client sent — a direct API call
// with a made-up or guessed id could read or write that profile's data,
// including health notes, regardless of whether the frontend showed a login
// wall. This makes the login wall real.
//
// Usage in index.ts:
//   app.post("/some/route", requireAuth, async (c) => {
//     const profileId = c.get("authProfileId"); // verified — never trust a
//     ...                                        // client-supplied profile_id
//   });

export async function requireAuth(c: any, next: () => Promise<void>) {
  const token =
    c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ??
    c.req.query("auth_token");
  if (!token) return c.json({ error: "Not authenticated" }, 401);

  const raw = await c.env.SESSIONS.get(`auth_session:${token}`);
  if (!raw) return c.json({ error: "Session expired or invalid — please sign in again" }, 401);

  let session: any;
  try { session = JSON.parse(raw); } catch { return c.json({ error: "Invalid session" }, 401); }
  if (!session?.profile_id) return c.json({ error: "Invalid session" }, 401);

  c.set("authProfileId", session.profile_id as string);
  c.set("authSession", session);
  await next();
}

// For the rare route where a client-visible id (like a chat session_id) isn't
// itself the profile id, but still needs to be confirmed as belonging to the
// authenticated profile before returning its data.
export function ownsProfile(c: any, claimedProfileId: string | null | undefined): boolean {
  return !!claimedProfileId && claimedProfileId === c.get("authProfileId");
}

export default authApp;