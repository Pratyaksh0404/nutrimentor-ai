import { X, Copy, Check } from "lucide-react";
import { useState } from "react";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const email = "pratyaksh0404@gmail.com";
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-black"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h2 className="text-xl font-semibold mb-4">Contact</h2>

        {/* Email */}
        <div className="flex items-center justify-between border rounded-lg px-4 py-3 mb-4">
          <span className="text-sm text-gray-800">{email}</span>
          <button
            onClick={handleCopy}
            className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-sm"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {/* LinkedIn */}
        <a
          href="https://www.linkedin.com/in/pratyaksh-agrawal-59b82928a/"
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition"
        >
          Open LinkedIn
        </a>

        {/* Footer note */}
        <p className="text-xs text-gray-500 mt-4 text-center">
          For queries, collaborations, or feedback.
        </p>
      </div>
    </div>
  );
}
