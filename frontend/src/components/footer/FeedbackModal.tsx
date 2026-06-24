import { useEffect, useState } from "react";
import { X, Star } from "lucide-react";

interface Props { open: boolean; onClose: () => void; }

const FEEDBACK_EMAIL = "pratyakshagrawal0404@gmail.com";

export default function FeedbackModal({ open, onClose }: Props) {
  const [rating,  setRating]  = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status,  setStatus]  = useState<"idle"|"sending"|"sent"|"error">("idle");
  const [hover,   setHover]   = useState<number | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) { setStatus("idle"); setRating(null); setMessage(""); setHover(null); }
  }, [open]);

  if (!open) return null;

  async function submit() {
    if (!message.trim() && rating === null) return;
    setStatus("sending");
    try {
      const body = new FormData();
      body.append("_subject", `NutriMentor Feedback — ${rating ? `${rating}/5 ⭐` : "no rating"}`);
      body.append("rating",   rating?.toString() ?? "not given");
      body.append("feedback", message.trim() || "(no message)");
      body.append("_captcha", "false");
      await fetch(`https://formsubmit.co/${FEEDBACK_EMAIL}`, { method: "POST", body });
      setStatus("sent");
    } catch { setStatus("error"); }
  }

  const LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <div
      style={{
        position:"fixed", inset:0, zIndex:200,
        background:"rgba(0,0,0,0.7)",
        display:"flex", alignItems:"center", justifyContent:"center",
        padding:"16px",
        backdropFilter:"blur(4px)",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background:"var(--bg-panel,#13261d)",
        border:"1px solid var(--border-2,rgba(34,197,94,0.22))",
        borderRadius:"var(--r-xl,20px)",
        width:"100%", maxWidth:"400px",
        padding:"24px",
        boxShadow:"0 24px 60px rgba(0,0,0,0.6)",
      }}>

        {/* Header */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"16px" }}>
          <div>
            <h3 style={{ fontSize:"16px", fontWeight:600, color:"var(--text-1,#d4edd9)", margin:0 }}>
              Share feedback
            </h3>
            <p style={{ fontSize:"12px", color:"var(--text-3,#4d7a5a)", marginTop:"3px" }}>
              Help make NutriMentor better for you.
            </p>
          </div>
          <button onClick={onClose} style={{
            background:"none", border:"none", cursor:"pointer",
            color:"var(--text-3,#4d7a5a)", padding:"4px",
            borderRadius:"var(--r-sm,6px)", display:"flex",
            transition:"color .15s",
          }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {status === "sent" ? (
          <div style={{ textAlign:"center", padding:"24px 0" }}>
            <div style={{ fontSize:"40px", marginBottom:"8px" }}>🙏</div>
            <p style={{ fontSize:"14px", fontWeight:600, color:"var(--text-1,#d4edd9)" }}>Thank you!</p>
            <p style={{ fontSize:"12px", color:"var(--text-3,#4d7a5a)", marginTop:"4px" }}>
              Your feedback goes directly to Pratyaksh.
            </p>
            <button onClick={onClose} style={{
              marginTop:"16px",
              background:"var(--accent,#22c55e)", color:"var(--accent-text,#052e16)",
              border:"none", borderRadius:"var(--r-md,10px)", padding:"8px 20px",
              fontSize:"13px", fontWeight:600, cursor:"pointer",
            }}>Close</button>
          </div>
        ) : (
          <>
            {/* Star rating */}
            <div style={{ marginBottom:"16px" }}>
              <p style={{ fontSize:"11px", fontWeight:600, color:"var(--text-2,#8ab89a)", marginBottom:"8px", textTransform:"uppercase", letterSpacing:".06em" }}>
                Rate your experience
              </p>
              <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                {[1,2,3,4,5].map(s => (
                  <button key={s} type="button"
                    onMouseEnter={() => setHover(s)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setRating(rating === s ? null : s)}
                    style={{
                      background:"none", border:"none", cursor:"pointer", padding:"2px",
                      transition:"transform .1s",
                      transform: (hover ?? 0) >= s || (rating ?? 0) >= s ? "scale(1.15)" : "scale(1)",
                    }}
                    title={LABELS[s-1]} aria-label={`${s} star — ${LABELS[s-1]}`}>
                    <Star size={24}
                      fill={(hover ?? 0) >= s || (rating ?? 0) >= s ? "#f59e0b" : "none"}
                      color={(hover ?? 0) >= s || (rating ?? 0) >= s ? "#f59e0b" : "var(--text-3,#4d7a5a)"}
                    />
                  </button>
                ))}
                {(hover || rating) && (
                  <span style={{ fontSize:"11px", color:"var(--text-2,#8ab89a)", marginLeft:"4px" }}>
                    {LABELS[(hover ?? rating ?? 1) - 1]}
                  </span>
                )}
              </div>
            </div>

            {/* Message */}
            <textarea
              rows={4}
              placeholder="What's working well? What could be better? Any bugs or missing foods?"
              value={message}
              onChange={e => setMessage(e.target.value)}
              style={{
                width:"100%",
                padding:"10px 12px",
                borderRadius:"var(--r-md,10px)",
                border:"1px solid var(--border,rgba(34,197,94,0.12))",
                background:"var(--bg-input,#0f2018)",
                color:"var(--text-1,#d4edd9)",
                fontSize:"12px",
                fontFamily:"inherit",
                resize:"none",
                outline:"none",
                lineHeight:"1.55",
                transition:"border-color .15s",
                marginBottom:"12px",
                boxSizing:"border-box",
              }}
              onFocus={e => e.target.style.borderColor = "var(--accent-border,rgba(34,197,94,0.3))"}
              onBlur={e => e.target.style.borderColor = "var(--border,rgba(34,197,94,0.12))"}
            />

            {status === "error" && (
              <p style={{ fontSize:"11px", color:"#ef4444", marginBottom:"8px" }}>
                Something went wrong. Try again.
              </p>
            )}

            <div style={{ display:"flex", gap:"8px" }}>
              <button onClick={onClose} style={{
                flex:1, padding:"9px",
                borderRadius:"var(--r-md,10px)",
                border:"1px solid var(--border-2,rgba(34,197,94,0.22))",
                background:"transparent",
                color:"var(--text-2,#8ab89a)",
                fontSize:"12px", fontWeight:500, cursor:"pointer",
              }}>Cancel</button>
              <button onClick={submit}
                disabled={status === "sending" || (!message.trim() && rating === null)}
                style={{
                  flex:2, padding:"9px",
                  borderRadius:"var(--r-md,10px)",
                  border:"none",
                  background: status === "sending" ? "var(--accent-dim,#16a34a)" : "var(--accent,#22c55e)",
                  color:"var(--accent-text,#052e16)",
                  fontSize:"12px", fontWeight:600, cursor:"pointer",
                  opacity: (status === "sending" || (!message.trim() && rating === null)) ? .5 : 1,
                  transition:"opacity .15s",
                }}>
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}