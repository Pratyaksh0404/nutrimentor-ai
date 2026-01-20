import { useEffect, useRef, useState } from "react";
import { sendChatMessage } from "../../api/chat";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
}

export default function ChatBox() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
      const el = messagesRef.current;
      if (!el) return;

      el.scrollTop = el.scrollHeight;
    }, [messages]);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userText = input.trim();

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: userText,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    let outgoingContext = context ?? {};

    if (
      userText.toLowerCase().includes("analyze") &&
      !outgoingContext.consumed_items &&
      !outgoingContext.details
    ) {
      outgoingContext = {
        consumed_items: [{ item_id: 1, quantity_in_grams: 150 }],
      };
    }

    try {
      const response = await sendChatMessage({
        message: userText,
        context: outgoingContext,
      });

      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response.response,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (response.details) {
        setContext({ details: response.details });
      } else {
        setContext(outgoingContext);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "Sorry, I couldn’t process that. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0 border rounded-lg overflow-hidden">
      {/* MESSAGES */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] px-4 py-2 rounded-lg text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="text-sm text-gray-500">
            NutriMentor is thinking…
          </div>
        )}

      </div>

      {/* INPUT */}
      <div className="border-t p-3 flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2 text-sm"
          placeholder="Ask NutriMentor AI…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          disabled={loading}
          className="bg-blue-600 text-white px-4 rounded disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
