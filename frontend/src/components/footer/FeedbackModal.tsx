import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

// Sends feedback to a free FormSubmit.co endpoint — no backend needed
// Replace YOUR_EMAIL below with your real email address
const FEEDBACK_EMAIL = "pratyakshagrawal0404@gmail.com";

export default function FeedbackModal({ open, onClose }: Props) {
  const [rating, setRating]   = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus]   = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) { setStatus("idle"); setRating(null); setMessage(""); }
  }, [open]);

  if (!open) return null;

  async function submitFeedback() {
    if (!message.trim() && rating === null) return;
    setStatus("sending");
    try {
      const body = new FormData();
      body.append("_subject", `NutriMentor Feedback — ${rating ? `${rating}/5 stars` : "no rating"}`);
      body.append("rating", rating?.toString() ?? "not given");
      body.append("feedback", message.trim() || "(no message)");
      body.append("_captcha", "false");

      await fetch(`https://formsubmit.co/${FEEDBACK_EMAIL}`, {
        method: "POST",
        body,
      });
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  const STARS = [1, 2, 3, 4, 5];
  const STAR_LABELS = ["Poor", "Fair", "Good", "Great", "Excellent"];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Share your feedback</h3>
            <p className="text-xs text-slate-500 mt-0.5">Help us make NutriMentor better for you.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2">🙏</div>
            <p className="text-sm font-medium text-slate-800">Thank you for your feedback!</p>
            <p className="text-xs text-slate-500 mt-1">It goes directly to the team.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Star rating */}
            <div className="mb-4">
              <p className="text-xs font-medium text-slate-600 mb-2">Rate your experience</p>
              <div className="flex gap-2">
                {STARS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    title={STAR_LABELS[s - 1]}
                    className={`text-2xl transition-transform hover:scale-110 ${
                      rating !== null && s <= rating ? "opacity-100" : "opacity-30"
                    }`}
                  >
                    ⭐
                  </button>
                ))}
                {rating && (
                  <span className="ml-2 self-center text-xs text-slate-500">{STAR_LABELS[rating - 1]}</span>
                )}
              </div>
            </div>

            {/* Message */}
            <textarea
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:outline-none resize-none transition-colors"
              rows={4}
              placeholder="What's working well? What could be better? Any bugs or missing foods?"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />

            {status === "error" && (
              <p className="text-xs text-red-500 mt-1">Something went wrong. Try again or email us directly.</p>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFeedback}
                disabled={status === "sending" || (!message.trim() && rating === null)}
                className="flex-1 rounded-xl bg-emerald-600 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition-colors"
              >
                {status === "sending" ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}