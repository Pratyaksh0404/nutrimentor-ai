import { useState } from "react";
import ContactModal from "./ContactModal";
import FeedbackModal from "./FeedbackModal";

export default function Footer() {
  const [contactOpen, setContactOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <footer className="border-t bg-white w-full">
          {/* FULL WIDTH BACKGROUND */}
          <div className="w-full">
            {/* CONSTRAINED CONTENT */}
            <div className="max-w-[1400px] mx-auto px-6 py-6
                            flex flex-col md:flex-row
                            items-center justify-between gap-4
                            text-sm text-gray-600">

              {/* Left */}
              <div>
                <p className="font-medium text-gray-800">NutriMentor AI</p>
                <p className="text-xs">
                  Season-aware nutrition powered by AI & Indian Ritu wisdom
                </p>
              </div>

              {/* Center */}
              <div className="flex gap-6">
                <button onClick={() => setContactOpen(true)} className="hover:text-black">
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

              {/* Right */}
              <div className="text-xs">
                <p className="text-xs">© 2026 Pratyaksh Agrawal.</p>
                <p className="text-xs">All rights reserved.</p>
              </div>
            </div>
          </div>
        </footer>

      {/* CONTACT MODAL */}
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
