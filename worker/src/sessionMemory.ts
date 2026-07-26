// ── Phase 3.5: Session Memory ─────────────────────────────────────────────────
// Rolling KV summary of what's happened in this session.
// Solves the "forgot what we discussed 20 messages ago" problem.
// Completely deterministic — no Gemini needed.

export interface SessionSummary {
  topics: string[];         // ["monsoon diet plan", "banana nutrition"]
  foods_mentioned: string[];// ["banana", "paneer", "moong dal"]
  plans_built: string[];    // ["7-day monsoon plan (Jun 26)"]
  meals_logged: string[];   // ["breakfast: egg 165g, milk 480g"]
  key_exchanges: string[];  // ["User asked about BMI: 21.2 healthy"]
  last_intent: string;      // last non-trivial intent type
  last_updated: string;     // ISO date
}

const SUMMARY_KEY = (sessionId: string) => `session_summary:${sessionId}`;
const TTL = 60 * 60 * 24 * 7; // 7 days

export async function getSessionSummary(
  sessionId: string,
  kv: KVNamespace
): Promise<SessionSummary | null> {
  try {
    const raw = await kv.get(SUMMARY_KEY(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionSummary;
  } catch { return null; }
}

export async function updateSessionSummary(
  sessionId: string,
  kv: KVNamespace,
  intentType: string,
  userMessage: string,
  assistantResponse: string,
  extractedFoods: string[] = []
): Promise<void> {
  try {
    const existing = await getSessionSummary(sessionId, kv) ?? {
      topics: [], foods_mentioned: [], plans_built: [],
      meals_logged: [], key_exchanges: [], last_intent: "", last_updated: "",
    };

    const msg = userMessage.toLowerCase();

    // Add topic based on intent type
    const topicMap: Record<string, string> = {
      diet_plan:      "Diet plan generation",
      intake_log:     "Meal intake logging",
      food_lookup:    `Food info: ${extractedFoods[0] ?? ""}`,
      compare:        `Food comparison: ${extractedFoods.slice(0, 2).join(" vs ")}`,
      seasonal_info:  "Seasonal food query",
      nutrient_query: "Nutrient-rich foods query",
      bmi_query:      "BMI calculation",
      memory_read:    "Profile review",
      preference_set: "Preferences updated",
      symptom_query:  "Symptom-based food advice",
      salad_suggestion: "Salad ingredient suggestion",
    };
    const topic = topicMap[intentType];
    if (topic && !existing.topics.includes(topic)) {
      existing.topics = [topic, ...existing.topics].slice(0, 8);
    }

    // Track foods mentioned
    for (const food of extractedFoods) {
      if (!existing.foods_mentioned.includes(food)) {
        existing.foods_mentioned = [food, ...existing.foods_mentioned].slice(0, 20);
      }
    }

    // Track plans built
    if (intentType === "diet_plan") {
      const isWeek = msg.includes("week") || msg.includes("7 day");
      const planNote = `${isWeek ? "7-day" : "Day"} plan — ${new Date().toLocaleDateString("en-IN")}`;
      existing.plans_built = [planNote, ...existing.plans_built].slice(0, 3);
    }

    // Track meals logged
    if (intentType === "intake_log" && extractedFoods.length > 0) {
      const logNote = `${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}: ${extractedFoods.join(", ")}`;
      existing.meals_logged = [logNote, ...existing.meals_logged].slice(0, 5);
    }

    // Key exchanges (BMI, profile updates, important answers)
    if (["bmi_query", "memory_update", "preference_set"].includes(intentType)) {
      const note = `${intentType}: ${userMessage.slice(0, 60)}`;
      existing.key_exchanges = [note, ...existing.key_exchanges].slice(0, 5);
    }

    existing.last_intent = intentType;
    existing.last_updated = new Date().toISOString();

    await kv.put(SUMMARY_KEY(sessionId), JSON.stringify(existing), { expirationTtl: TTL });
  } catch { /* non-fatal */ }
}

// Format summary for injection into Gemini system prompt
export function formatSummaryForPrompt(summary: SessionSummary | null): string {
  if (!summary || summary.topics.length === 0) return "";

  const parts: string[] = ["\n\n[What we've discussed in this session]"];

  if (summary.topics.length > 0) {
    parts.push(`Topics: ${summary.topics.join(", ")}`);
  }
  if (summary.plans_built.length > 0) {
    parts.push(`Plans built: ${summary.plans_built.join("; ")}`);
  }
  if (summary.meals_logged.length > 0) {
    parts.push(`Meals logged today: ${summary.meals_logged.join("; ")}`);
  }
  if (summary.foods_mentioned.length > 0) {
    parts.push(`Foods we talked about: ${summary.foods_mentioned.slice(0, 8).join(", ")}`);
  }
  if (summary.key_exchanges.length > 0) {
    parts.push(`Key moments: ${summary.key_exchanges.join("; ")}`);
  }

  return parts.join("\n");
}
