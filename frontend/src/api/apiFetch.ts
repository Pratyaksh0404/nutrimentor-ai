const AUTH_TOKEN_KEY = "nutrimentor-auth-token";

/**
 * Drop-in replacement for fetch() against protected backend endpoints.
 *
 * Same call signature as fetch() — takes a full URL, same options object.
 * The only change needed at any existing call site is renaming
 * `fetch(` → `apiFetch(`. Nothing else about the call needs to change.
 *
 * What it adds:
 *  - Attaches the current auth token as `Authorization: Bearer <token>`.
 *  - If the backend responds 401 (session expired/invalid/revoked), clears
 *    the stored token and reloads — AuthGate re-checks on mount and will
 *    show the sign-in screen again, rather than the app silently failing
 *    every subsequent request.
 *
 * IMPORTANT: every fetch() call in the frontend that hits a route requiring
 * requireAuth on the backend (see index.ts — that's most routes now: /agent/*,
 * /profile/*, /facts/*, /meals/*, /nutrition-score/*) MUST use this instead
 * of plain fetch(), or it will get a 401 the moment the backend auth changes
 * are deployed. Routes that stay public (/items, /nutrients, /ritu, /health)
 * can keep using plain fetch() — no harm either way, but no need to change them.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.reload();
  }

  return res;
}
