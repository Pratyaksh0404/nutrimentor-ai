import { useState } from "react";
import ContactModal from "./ContactModal";
import FeedbackModal from "./FeedbackModal";

export default function Footer() {
  const [contactOpen, setContactOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <footer className="w-screen bg-white border-t">
        <div
          className="
            max-w-[1400px] mx-auto
            px-6 py-3
            grid grid-cols-1 md:grid-cols-3
            items-center gap-4
            text-sm text-gray-600
          "
        >
          {/* LEFT */}
          <div>
            <p className="font-medium text-gray-800">NutriMentor AI</p>
            <p className="text-xs">
              Season-aware nutrition powered by AI & Indian Ritu wisdom
            </p>
          </div>

          {/* CENTER – FORCE SINGLE LINE */}
          <div className="flex justify-center items-center gap-6 flex-nowrap whitespace-nowrap">
            <button
              onClick={() => setContactOpen(true)}
              className="hover:text-black"
            >
              Contact
            </button>

            <a
              href="https://www.linkedin.com/in/pratyaksh-agrawal-59b82928a/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black"
            >
              LinkedIn
            </a>

            <button
              onClick={() => setFeedbackOpen(true)}
              className="hover:text-black"
            >
              Feedback
            </button>
          </div>

          {/* RIGHT */}
          <div className="text-xs md:text-right">
            <p>© 2026 Pratyaksh Agrawal.</p>
            <p>All rights reserved.</p>
          </div>
        </div>
      </footer>

      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
      />

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
    </>
  );
}
