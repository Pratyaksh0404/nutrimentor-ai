import { useEffect, useState } from "react";
import { API_BASE_URL } from "../api/config";

// ── Settings — profile editing, preferences, clear memory ────────────────────
// Backed by existing endpoints: GET/POST /profile/:id, GET/DELETE /facts/:id,
// DELETE /facts/:id/all. No new backend surface beyond the bulk-clear route.

interface ProfileData {
  age?: number;
  sex?: string;
  height_cm?: number;
  weight_kg?: number;
  goal?: string;
  activity_level?: string;
  dietary_preference?: string;
}

interface Fact {
  fact_type: string;
  fact_key: string;
  fact_value: string;
  source: string;
  updated_at: string;
}

const GOALS = ["maintain weight", "lose weight", "gain weight", "build muscle"];
const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very active"];
const DIETARY_PREFS = ["vegetarian", "non-vegetarian", "vegan", "jain"];
const AUTH_TOKEN_KEY = "nutrimentor-auth-token";

function getProfileId(): string {
  let id = localStorage.getItem("nutrimentor-profile-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("nutrimentor-profile-id", id);
  }
  return id;
}

export default function SettingsPage() {
  // By the time this component mounts, Home.tsx has already consumed the
  // OAuth redirect params and persisted auth_token + profile_id to
  // localStorage — so getProfileId() returns the correct post-login value.
  const profileId = getProfileId();

  const [profile, setProfile]   = useState<ProfileData>({});
  const [facts, setFacts]       = useState<Fact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; email?: string; name?: string; avatar_url?: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authRedirectError] = useState<string | null>(null);

  // Check current auth status (redirect params already consumed by Home.tsx before this mounted)
  useEffect(() => {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) { setAuthLoading(false); return; }

    let cancelled = false;
    fetch(`${API_BASE_URL}/auth/me?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : { authenticated: false })
      .then(data => { if (!cancelled) setAuthInfo(data); })
      .catch(() => { if (!cancelled) setAuthInfo({ authenticated: false }); })
      .finally(() => { if (!cancelled) setAuthLoading(false); });
    return () => { cancelled = true; };
  }, []);

  function signInWithGoogle() {
    const currentId = getProfileId();
    window.location.href = `${API_BASE_URL}/auth/google/start?profile_id=${encodeURIComponent(currentId)}`;
  }

  async function signOut() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).catch(() => {});
    }
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthInfo({ authenticated: false });
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`${API_BASE_URL}/profile/${profileId}`).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE_URL}/facts/${profileId}`).then(r => r.ok ? r.json() : []),
    ])
      .then(([p, f]) => {
        if (cancelled) return;
        setProfile(p ?? {});
        setFacts(Array.isArray(f) ? f : []);
        setError(null);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load your settings. Please try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/profile/${profileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) throw new Error();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      setError("Couldn't save — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function removeFact(f: Fact) {
    setFacts(prev => prev.filter(x => !(x.fact_type === f.fact_type && x.fact_key === f.fact_key)));
    try {
      await fetch(`${API_BASE_URL}/facts/${profileId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_type: f.fact_type, fact_key: f.fact_key }),
      });
    } catch {
      // Re-fetch on failure to avoid a stale/incorrect UI state
      fetch(`${API_BASE_URL}/facts/${profileId}`).then(r => r.json()).then(setFacts).catch(() => {});
    }
  }

  async function addFact(fact_type: string, rawKey: string) {
    const key = rawKey.trim().toLowerCase();
    if (!key) return;
    try {
      const res = await fetch(`${API_BASE_URL}/facts/${profileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact_type, fact_key: key }),
      });
      if (!res.ok) throw new Error();
      const { fact_key } = await res.json();
      // Server normalises the key (alias map) — use its answer, and dedupe
      // against anything already in state (mutual-exclusion may have removed
      // a matching row from the opposite bucket too, so just re-fetch clean).
      const refreshed = await fetch(`${API_BASE_URL}/facts/${profileId}`).then(r => r.json());
      setFacts(Array.isArray(refreshed) ? refreshed : []);
      return fact_key;
    } catch {
      setError("Couldn't add that — please try again.");
    }
  }

  async function clearAllMemory() {
    setClearing(true);
    try {
      await fetch(`${API_BASE_URL}/facts/${profileId}/all`, { method: "DELETE" });
      setFacts([]);
      setConfirmClear(false);
    } catch {
      setError("Couldn't clear memory — please try again.");
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", opacity: 0.7 }}>Loading your settings…</div>;
  }

  const likes      = facts.filter(f => f.fact_type === "preference" && f.fact_key !== "dietary");
  const dislikes    = facts.filter(f => f.fact_type === "dislike");
  const allergies    = facts.filter(f => f.fact_type === "allergy");
  const healthNotes  = facts.filter(f => f.fact_type === "health_note" || f.fact_type === "health");

  const cardStyle: React.CSSProperties = {
    background: "var(--bg-card, #1e3a28)", borderRadius: 14, padding: 18, marginBottom: 14,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.7, marginBottom: 4, display: "block" };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--bg-panel, #13261d)",
    background: "var(--bg-panel, #13261d)", color: "inherit", fontSize: 13,
  };

  return (
    <div className="nm-centre-body" style={{ display: "block" }}>
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22 }}>⚙️ Settings</h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.65 }}>
        {authInfo?.authenticated
          ? "Profile, preferences, and memory — synced to your Google account."
          : "Profile, preferences, and memory — stored locally to this device (guest mode)."}
      </p>

      {authRedirectError && (
        <div style={{ background: "#f8717120", border: "1px solid #f8717150", borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 13 }}>
          Sign-in didn't complete ({authRedirectError.replace(/_/g, " ")}). Please try again.
        </div>
      )}

      {/* ── Account ── */}
      <div style={{ background: "var(--bg-card, #1e3a28)", borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Account</div>
        {authLoading ? (
          <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>Checking sign-in status…</p>
        ) : authInfo?.authenticated ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {authInfo.avatar_url && (
              <img src={authInfo.avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: "50%" }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{authInfo.name ?? "Signed in"}</div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>{authInfo.email}</div>
            </div>
            <button
              type="button" onClick={signOut}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--bg-panel, #13261d)", background: "transparent", color: "inherit", fontSize: 12, cursor: "pointer" }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 10px" }}>
              You're using guest mode — your data stays on this device only. Sign in to sync across devices.
            </p>
            <button
              type="button" onClick={signInWithGoogle}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8,
                border: "1px solid var(--bg-panel, #13261d)", background: "#fff", color: "#1a1a1a",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.3-.1-2.7-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.6 5.1 29.6 3 24 3c-7.7 0-14.4 4.4-17.7 10.7z"/>
                <path fill="#4CAF50" d="M24 45c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2.1 1.5-4.8 2.4-7.7 2.4-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 40.5 16.2 45 24 45z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.6C41.5 36.2 45 30.7 45 24c0-1.3-.1-2.7-.4-3.5z"/>
              </svg>
              Sign in with Google
            </button>
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: "#f8717120", border: "1px solid #f8717150", borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Profile ── */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>Profile</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Age</label>
            <input type="number" style={inputStyle} value={profile.age ?? ""} min={1} max={120}
              onChange={e => setProfile(p => ({ ...p, age: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
          <div>
            <label style={labelStyle}>Sex</label>
            <select style={inputStyle} value={profile.sex ?? ""} onChange={e => setProfile(p => ({ ...p, sex: e.target.value || undefined }))}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Height (cm)</label>
            <input type="number" style={inputStyle} value={profile.height_cm ?? ""} min={50} max={250}
              onChange={e => setProfile(p => ({ ...p, height_cm: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
          <div>
            <label style={labelStyle}>Weight (kg)</label>
            <input type="number" style={inputStyle} value={profile.weight_kg ?? ""} min={20} max={300}
              onChange={e => setProfile(p => ({ ...p, weight_kg: e.target.value ? Number(e.target.value) : undefined }))} />
          </div>
          <div>
            <label style={labelStyle}>Goal</label>
            <select style={inputStyle} value={profile.goal ?? ""} onChange={e => setProfile(p => ({ ...p, goal: e.target.value || undefined }))}>
              <option value="">—</option>
              {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Activity level</label>
            <select style={inputStyle} value={profile.activity_level ?? ""} onChange={e => setProfile(p => ({ ...p, activity_level: e.target.value || undefined }))}>
              <option value="">—</option>
              {ACTIVITY_LEVELS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Dietary preference</label>
            <select style={inputStyle} value={profile.dietary_preference ?? ""} onChange={e => setProfile(p => ({ ...p, dietary_preference: e.target.value || undefined }))}>
              <option value="">—</option>
              {DIETARY_PREFS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <button
          type="button" onClick={saveProfile} disabled={saving}
          style={{
            marginTop: 14, padding: "8px 16px", borderRadius: 8, border: "none",
            background: savedFlash ? "#4ade80" : "var(--accent, #22c55e)", color: "#0a1a0f",
            fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? "Saving…" : savedFlash ? "✓ Saved" : "Save profile"}
        </button>
      </div>

      {/* ── Preferences (learned facts) ── */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Preferences</div>
        <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 12px" }}>
          Add or remove anything — kept in sync whether you edit here or just mention it in chat.
        </p>
        {[
          { title: "✅ Likes", factType: "preference", items: likes, color: "#4ade80", placeholder: "e.g. mango" },
          { title: "🚫 Dislikes", factType: "dislike", items: dislikes, color: "#f87171", placeholder: "e.g. beetroot" },
          { title: "⚠️ Allergies", factType: "allergy", items: allergies, color: "#fbbf24", placeholder: "e.g. peanuts" },
          { title: "🏥 Health notes", factType: "health_note", items: healthNotes, color: "#60a5fa", placeholder: "e.g. diabetes" },
        ].map(group => (
          <div key={group.title} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: group.color }}>{group.title}</div>
            {group.items.length === 0 ? (
              <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>None yet</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {group.items.map(f => (
                  <span key={`${f.fact_type}:${f.fact_key}`} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: "var(--bg-panel, #13261d)", borderRadius: 999,
                    padding: "4px 6px 4px 10px", fontSize: 12,
                  }}>
                    {f.fact_key}
                    <button
                      type="button" onClick={() => removeFact(f)}
                      aria-label={`Remove ${f.fact_key}`}
                      style={{
                        background: "none", border: "none", color: "inherit", opacity: 0.6,
                        cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 2,
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <AddFactRow factType={group.factType} placeholder={group.placeholder} onAdd={addFact} />
          </div>
        ))}
      </div>

      {/* ── Clear memory ── */}
      <div style={{ ...cardStyle, border: "1px solid #f8717140" }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: "#f87171" }}>Clear all memory</div>
        <p style={{ fontSize: 12, opacity: 0.65, margin: "0 0 12px" }}>
          Permanently deletes every learned like, dislike, allergy, and health note.
          This does not affect your meal log or the profile fields above.
        </p>
        {!confirmClear ? (
          <button
            type="button" onClick={() => setConfirmClear(true)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid #f8717160",
              background: "transparent", color: "#f87171", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}
          >
            Clear all memory
          </button>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13 }}>Are you sure? This can't be undone.</span>
            <button
              type="button" onClick={clearAllMemory} disabled={clearing}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none",
                background: "#f87171", color: "#1a0a0a", fontWeight: 700, fontSize: 13,
                cursor: clearing ? "wait" : "pointer",
              }}
            >
              {clearing ? "Clearing…" : "Yes, clear it"}
            </button>
            <button
              type="button" onClick={() => setConfirmClear(false)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--bg-panel)", background: "transparent", color: "inherit", fontSize: 13, cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ── Small input+button row for adding one preference item ────────────────────
function AddFactRow({
  factType, placeholder, onAdd,
}: { factType: string; placeholder: string; onAdd: (factType: string, key: string) => Promise<string | void> }) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit() {
    const v = value.trim();
    if (!v || adding) return;
    setAdding(true);
    await onAdd(factType, v);
    setAdding(false);
    setValue("");
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        type="text" value={value} placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); }}
        style={{
          flex: 1, padding: "6px 10px", borderRadius: 8, fontSize: 12,
          border: "1px solid var(--bg-panel, #13261d)", background: "var(--bg-panel, #13261d)", color: "inherit",
        }}
      />
      <button
        type="button" onClick={submit} disabled={adding || !value.trim()}
        style={{
          padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700,
          background: "var(--accent, #22c55e)", color: "#0a1a0f",
          cursor: adding || !value.trim() ? "default" : "pointer",
          opacity: adding || !value.trim() ? 0.5 : 1,
        }}
      >
        {adding ? "…" : "+ Add"}
      </button>
    </div>
  );
}
