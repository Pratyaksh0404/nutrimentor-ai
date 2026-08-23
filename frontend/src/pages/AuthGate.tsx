import { useEffect, useState } from "react";
import Home from "./Home";
import { API_BASE_URL } from "../api/config";
import logo from "../components/layout/logo.png";

const AUTH_TOKEN_KEY = "nutrimentor-auth-token";
const PROFILE_KEY = "nutrimentor-profile-id";

interface AuthInfo {
  authenticated: boolean;
  profile_id?: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

// Runs once, synchronously, in the lazy useState initializer below — before
// any render. Consumes the OAuth redirect params (auth_token, profile_id,
// tab, auth_error) if Google just sent us back here, persists them, and
// cleans the URL. Moved here from Home.tsx: this is now the real entry
// point — nothing past this component should render without a confirmed
// session, so the redirect has to be resolved here, first.
function consumeAuthRedirect(): { initialTab: string; redirectError: string | null } {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("auth_token");
  const returnedProfile = params.get("profile_id");
  const tab = params.get("tab");
  const authError = params.get("auth_error");
  const hasRedirectParams = !!(token || authError);

  if (token && returnedProfile) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(PROFILE_KEY, returnedProfile);
  }
  if (hasRedirectParams) {
    ["auth_token", "profile_id", "tab", "auth_error"].forEach(k => params.delete(k));
    const clean = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (clean ? `?${clean}` : ""));
  }
  return { initialTab: tab ?? "foods", redirectError: authError };
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3c-7.7 0-14.4 4.4-17.7 10.7z"/>
      <path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2.1 1.5-4.8 2.4-7.7 2.4-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 40.5 16.2 45 24 45z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.5 36.2 45 30.7 45 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

export default function AuthGate() {
  // Lazy initializer — runs exactly once, before first render, same pattern
  // Home.tsx used for consumeAuthRedirectAndGetInitialTab previously.
  const [{ initialTab, redirectError }] = useState(() => consumeAuthRedirect());
  const [status, setStatus] = useState<"checking" | "signed-in" | "signed-out">("checking");
  const [authInfo, setAuthInfo] = useState<AuthInfo | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { setStatus("signed-out"); return; }

    let cancelled = false;
    fetch(`${API_BASE_URL}/auth/me?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : { authenticated: false })
      .then((data: AuthInfo) => {
        if (cancelled) return;
        if (data.authenticated && data.profile_id) {
          // Server is the source of truth for which profile_id this session
          // resolves to (handles cross-device sign-in correctly) — sync it
          // into localStorage in case it differs from whatever was there.
          localStorage.setItem(PROFILE_KEY, data.profile_id);
          setAuthInfo(data);
          setStatus("signed-in");
        } else {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setStatus("signed-out");
        }
      })
      .catch(() => {
        if (!cancelled) { localStorage.removeItem(AUTH_TOKEN_KEY); setStatus("signed-out"); }
      });
    return () => { cancelled = true; };
  }, []);

  function signInWithGoogle() {
    // A fresh, disposable id per sign-in attempt. This used to be a
    // persisted "guest" profile id, carried over from anonymous use, that
    // the OAuth flow would claim on first sign-in. There's no more
    // anonymous use to preserve — the app doesn't render anything until
    // sign-in completes — so this id only needs to survive the round trip
    // to Google and back (it's bound server-side via the `state` param in
    // auth.ts, purely for CSRF protection and first-time-claim resolution).
    const throwawayId = crypto.randomUUID().replace(/-/g, "");
    window.location.href = `${API_BASE_URL}/auth/google/start?profile_id=${encodeURIComponent(throwawayId)}`;
  }

  if (status === "checking") {
    return (
      <div style={outerStyle}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <div style={spinnerStyle} />
          <span style={{ fontSize: 13, color: "var(--text-3, #7a9484)" }}>Checking sign-in status…</span>
        </div>
        <style>{spinKeyframes}</style>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div style={outerStyle}>
        <div style={cardStyle}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 28 }}>
            <img src={logo} alt="" style={{ width: 72, height: 72, marginBottom: 10 }} />
            <div style={{ fontSize: 21, fontWeight: 700, color: "var(--text-1, #eafaf0)", letterSpacing: "-0.01em" }}>
              NutriMentor AI
            </div>
            <div style={{ fontSize: 13.5, color: "var(--text-3, #7a9484)", textAlign: "center", lineHeight: 1.55, maxWidth: 260 }}>
              Sign in to continue — your profile, meal log, and health notes stay tied to your account.
            </div>
          </div>

          {redirectError && (
            <div style={{
              background: "#f8717118", border: "1px solid #f8717140", borderRadius: 10,
              padding: "10px 12px", marginBottom: 18, fontSize: 12.5, color: "#fca5a5", lineHeight: 1.5,
            }}>
              Sign-in didn't complete ({redirectError.replace(/_/g, " ")}). Please try again.
            </div>
          )}

          <button
            type="button" onClick={signInWithGoogle}
            style={googleBtnStyle}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.18)")}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)")}
          >
            <GoogleIcon />
            Sign in with Google
          </button>

          <div style={{ marginTop: 20, fontSize: 11, color: "var(--text-3, #5c7568)", textAlign: "center", lineHeight: 1.6 }}>
            By continuing, you agree this app provides general nutrition information,
            not medical advice.
          </div>
        </div>
      </div>
    );
  }

  // status === "signed-in" — authInfo.profile_id is guaranteed set here
  return <Home profileId={authInfo!.profile_id!} initialTab={initialTab} />;
}

// ── Styles — reuses the app's own token set (--bg-card, --bg-panel, --accent,
// --text-1/2/3) rather than introducing a separate palette for this one screen ──

const outerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background:
    "radial-gradient(ellipse 640px 420px at 50% 40%, rgba(34,197,94,0.09), transparent 70%), " +
    "var(--bg-app, #0d1a12)",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 360,
  background: "var(--bg-card, #1e3a28)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 20,
  padding: "36px 32px 30px",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset",
};

const googleBtnStyle: React.CSSProperties = {
  width: "100%",
  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
  padding: "11px 20px",
  borderRadius: 12,
  border: "1px solid #e5e5e5",
  background: "#fff",
  color: "#1a1a1a",
  fontSize: 14, fontWeight: 600,
  cursor: "pointer",
  boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
  transition: "box-shadow 0.15s ease",
};

const spinnerStyle: React.CSSProperties = {
  width: 22, height: 22,
  borderRadius: "50%",
  border: "2.5px solid rgba(34,197,94,0.2)",
  borderTopColor: "var(--accent, #22c55e)",
  animation: "nm-auth-spin 0.7s linear infinite",
};

const spinKeyframes = `@keyframes nm-auth-spin { to { transform: rotate(360deg); } }`;