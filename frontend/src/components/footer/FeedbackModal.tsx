import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function FeedbackModal({ open, onClose }: Props) {
  const [rating, setRating] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  function submitFeedback() {
    console.log({ rating, message });
    onClose();
    setRating(null);
    setMessage("");
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl animate-fade-in">

        <h3 className="text-lg font-semibold text-gray-900">
          Help us improve NutriMentor AI
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Your feedback helps us build better nutrition guidance.
        </p>

        {/* RATING */}
        <div className="mt-5">
          <p className="text-sm font-medium text-gray-700 mb-2">
            How was your experience?
          </p>
          <div className="flex justify-between text-2xl">
            {[
              { label: "Poor", emoji: "😕" },
              { label: "Okay", emoji: "😐" },
              { label: "Good", emoji: "🙂" },
              { label: "Excellent", emoji: "😍" },
            ].map((r) => (
              <button
                key={r.label}
                onClick={() => setRating(r.label)}
                className={`transition transform hover:scale-110 ${
                  rating === r.label ? "opacity-100" : "opacity-60"
                }`}
              >
                {r.emoji}
              </button>
            ))}
          </div>
        </div>

        {/* MESSAGE */}
        <div className="mt-4">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="What worked well? What can we improve?"
            className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ACTIONS */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={submitFeedback}
            disabled={!rating}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
          >
            Send feedback
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Anonymous • Takes less than 30 seconds • No personal data collected
        </p>
      </div>
    </div>
  );
}
