// ── Real Agent Loop: Gemini function-calling over the existing deterministic tools ──
//
// This is the "Planning" + "Tools" half of the Brain/Planning/Tools/Memory
// architecture. Rather than a decision tree that occasionally calls Gemini
// for narrative text, this hands Gemini the actual deterministic functions
// (already built, already tested) as callable tools, and lets it decide
// which ones to call, in what order, chaining multiple calls within a single
// user turn before producing a final, grounded answer.
//
// It is NOT the only path — index.ts's deterministic router remains as an
// automatic fallback if this loop errors, times out, or Gemini is
// unavailable. That fallback is what keeps the app answering even when this
// path can't run; it is deliberately not removed.
//
// Design constraints respected:
// - Every fact-bearing answer is grounded through a tool call — the model
//   is instructed never to state a nutrient value, calorie count, or
//   seasonal fact from its own memory.
// - Safety: allergies are checked before any food recommendation.
// - Bounded: a hard cap on tool-call round trips prevents runaway loops
//   (and runaway Neuron/latency cost).

import {
  toolFoodLookup, toolCompareFoods, toolGetSeasonalFoods, toolGetNutrientRichFoods,
  toolBuildDietPlan, toolAnalyzeIntake, findIngredientSwap, computeBmi, computeTdee,
  getISTDateString, applyFoodAlias, fetchGeminiWithRetry,
  SEASON_LABELS, type Profile,
} from "./index";
import { searchKnowledgeBase } from "./rag";

export interface AgentContext {
  db: D1Database;
  ai: Ai;
  vectorIndex: VectorizeIndex;
  kv: KVNamespace; // for the global Gemini RPM gate — see rateLimit.ts
  geminiKey: string;
  profileId: string;
  sessionId: string;
  profile: Profile | null;
  userFacts: {
    dislikes: string[]; likes: string[]; dietary: string;
    health_notes: string[]; allergies: string[]; goal: string; lifestyle: string;
  };
  currentSeason: string;
  currentItemName: string | null;
  history: Array<{ role: string; content: string }>;
}

export interface AgentResult {
  text: string;
  toolsUsed: string[];
  citations?: string[];
  ragGaps?: string[];
  planData?: any;
  wantsPdf?: boolean;
  failed?: false; // present so callers can discriminate AgentResult | AgentLoopFailure on `.failed`
}

// Observability (2026-08-14): the loop used to return a bare `null` on every
// failure path — no API key, a bad Gemini response, an empty model answer,
// hitting the round cap, or a thrown exception all looked identical to the
// caller. That made cases like "milk and citrus" (agent loop ran, returned
// nothing, silently fell through to the generic clarification text)
// undiagnosable without redeploying extra logging and waiting to repro it.
// Now every failure path reports WHY, so index.ts can log a reason instead
// of just a symptom.
export type AgentLoopFailureReason =
  | "no_api_key"
  | "gemini_http_error"
  | "empty_model_response"
  | "round_cap_exceeded"
  | "exception";

export interface AgentLoopFailure {
  failed: true;
  reason: AgentLoopFailureReason;
  detail?: string;
  toolsUsed?: string[]; // was previously only captured for round_cap_exceeded — every
                        // failure should carry this, since "was a tool even called
                        // before this failed" is exactly the ambiguity that made the
                        // empty_model_response diagnosis harder than it needed to be.
}

// ── Tool declarations (Gemini function-calling schema — OpenAPI-compatible) ──

const AGENT_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "food_lookup",
        description: "Get full nutrient profile, calories, and season for ONE specific food from the 57-food Indian seasonal database. Use this whenever you need real nutrient numbers for a food — never state nutrient values from memory.",
        parameters: {
          type: "object",
          properties: { name: { type: "string", description: "Food name, e.g. 'guava', 'paneer'" } },
          required: ["name"],
        },
      },
      {
        name: "compare_foods",
        description: "Compare two foods side by side across calories and key nutrients.",
        parameters: {
          type: "object",
          properties: {
            food1: { type: "string" }, food2: { type: "string" },
          },
          required: ["food1", "food2"],
        },
      },
      {
        name: "get_seasonal_foods",
        description: "List foods available in a given Ritu (season): spring, summer, monsoon, autumn, prewinter, winter. Optionally filter by category (fruit, vegetable, grain, dairy, legume, nut, protein).",
        parameters: {
          type: "object",
          properties: {
            season: { type: "string" }, category: { type: "string" },
          },
          required: ["season"],
        },
      },
      {
        name: "get_nutrient_rich_foods",
        description: "List foods that are rich sources of a specific nutrient (e.g. 'iron', 'vitamin c', 'protein'), optionally filtered to a season.",
        parameters: {
          type: "object",
          properties: {
            nutrient: { type: "string" }, season: { type: "string" },
          },
          required: ["nutrient"],
        },
      },
      {
        name: "build_diet_plan",
        description: "Build a full-day or 7-day diet plan for the user, automatically excluding their known dislikes and allergies and respecting their dietary preference and goal. Use this for any 'build me a diet plan' request.",
        parameters: {
          type: "object",
          properties: {
            season: { type: "string", description: "Season to plan for; defaults to current season if omitted" },
            days: { type: "number", description: "1 for a single day, 7 for a full week. Default 1." },
          },
          required: [],
        },
      },
      {
        name: "swap_ingredient",
        description: "Find seasonal substitutes for a food with a similar nutrient profile — for 'I don't have X, what can I use instead' or 'substitute for X'.",
        parameters: {
          type: "object",
          properties: { food_name: { type: "string" }, season: { type: "string" } },
          required: ["food_name"],
        },
      },
      {
        name: "log_meal",
        description: "Log food(s) the user says they ate/drank/had, to their meal log for today. Call this whenever the user reports eating something — do not just acknowledge it in text.",
        parameters: {
          type: "object",
          properties: {
            foods: {
              type: "array",
              description: "Each food eaten, with amount in grams if known (default 100g if not specified) and meal slot if known.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  amount_g: { type: "number" },
                  meal_slot: { type: "string", description: "breakfast, lunch, dinner, or snack" },
                },
                required: ["name"],
              },
            },
          },
          required: ["foods"],
        },
      },
      {
        name: "get_today_intake",
        description: "Get everything the user has logged as eaten today, plus total calories vs their daily target. Use this for 'what did I eat today', 'what's my calorie count'.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "get_weekly_deficiencies",
        description: "Get the user's real nutrient deficiencies computed from their last 7 days of logged meals. Use this for 'what am I deficient in' — never guess or invent deficiencies.",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "check_food_safety",
        description: "Check whether a food conflicts with the user's recorded allergies or dislikes before recommending it. ALWAYS call this before suggesting a specific food in a personalized recommendation.",
        parameters: {
          type: "object",
          properties: { food_name: { type: "string" } },
          required: ["food_name"],
        },
      },
      {
        name: "get_bmi_and_calories",
        description: "Get the user's BMI and estimated daily calorie target from their profile (age, sex, height, weight, activity level).",
        parameters: { type: "object", properties: {} },
      },
      {
        name: "search_knowledge_base",
        description: "Search a curated knowledge base for nutrition, health, and Ayurvedic information NOT covered by the 57-food database or the other tools — general nutrition science, foods outside the tracked database (e.g. kiwi, dragon fruit), condition-specific dietary guidance, food-combination principles, and Ayurvedic concepts. Call this when the other tools don't have what's needed to answer. If it returns no results, say so honestly — do not fall back to unverified general knowledge as if it were grounded.",
        parameters: {
          type: "object",
          properties: { query: { type: "string", description: "A focused search query capturing what information is needed" } },
          required: ["query"],
        },
      },
    ],
  },
];

// ── Tool dispatcher ──────────────────────────────────────────────────────────

async function executeAgentTool(name: string, args: any, ctx: AgentContext): Promise<{ result: any; toolLabel: string; sources?: string[]; ragGap?: string }> {
  switch (name) {
    case "food_lookup": {
      const result = await toolFoodLookup(ctx.db, applyFoodAlias(String(args.name ?? "")));
      return { result, toolLabel: "food_lookup" };
    }
    case "compare_foods": {
      const result = await toolCompareFoods(ctx.db, applyFoodAlias(String(args.food1 ?? "")), applyFoodAlias(String(args.food2 ?? "")));
      return { result, toolLabel: "compare_foods" };
    }
    case "get_seasonal_foods": {
      const season = String(args.season ?? ctx.currentSeason);
      const result = await toolGetSeasonalFoods(ctx.db, season, args.category);
      return { result, toolLabel: "get_seasonal_foods" };
    }
    case "get_nutrient_rich_foods": {
      const result = await toolGetNutrientRichFoods(ctx.db, String(args.nutrient ?? ""), args.season ?? ctx.currentSeason);
      return { result, toolLabel: "get_nutrient_rich_foods" };
    }
    case "build_diet_plan": {
      const season = String(args.season ?? ctx.currentSeason);
      const days = args.days === 7 ? 7 : 1;
      const isVeg = ctx.userFacts.dietary === "vegetarian" || ctx.userFacts.dietary === "vegan" || ctx.userFacts.dietary === "jain";
      const dislikes = isVeg
        ? [...ctx.userFacts.dislikes, ...ctx.userFacts.allergies, "chicken breast", "salmon", "egg"]
        : [...ctx.userFacts.dislikes, ...ctx.userFacts.allergies];
      const profileForPlan: Profile = { ...(ctx.profile ?? {}), dietary_preference: ctx.userFacts.dietary || ctx.profile?.dietary_preference };
      const result = await toolBuildDietPlan(ctx.db, profileForPlan, season, ctx.userFacts.goal || ctx.profile?.goal, days, dislikes);
      return { result, toolLabel: "build_diet_plan" };
    }
    case "swap_ingredient": {
      const isVeg = ctx.userFacts.dietary === "vegetarian" || ctx.userFacts.dietary === "vegan" || ctx.userFacts.dietary === "jain";
      const result = await findIngredientSwap(
        applyFoodAlias(String(args.food_name ?? "")), ctx.db, String(args.season ?? ctx.currentSeason), ctx.userFacts.dislikes, isVeg
      );
      return { result: { alternatives: result }, toolLabel: "swap_ingredient" };
    }
    case "log_meal": {
      const today = getISTDateString();
      const foods: Array<{ name: string; amount_g?: number; meal_slot?: string }> = Array.isArray(args.foods) ? args.foods : [];
      const logged: string[] = [];
      const failed: string[] = [];
      for (const f of foods) {
        try {
          const item = await ctx.db.prepare(`SELECT id FROM items WHERE name LIKE ?1 LIMIT 1`)
            .bind(`%${applyFoodAlias(f.name)}%`).first<any>();
          if (item) {
            const amt = f.amount_g ?? 100;
            const slot = f.meal_slot ?? "meal";
            // Dedup guard: skip if the exact same food/amount/slot was already
            // logged in the last 60 seconds for this profile+day. Retries after
            // a 429/503 previously caused this tool to fire twice for the same
            // user message, silently double-logging the same meal.
            const dupe = await ctx.db.prepare(
              `SELECT 1 FROM meal_logs WHERE session_id = ?1 AND item_id = ?2 AND logged_date = ?3
               AND meal_slot = ?4 AND amount_g = ?5 AND created_at >= datetime('now', '-60 seconds') LIMIT 1`
            ).bind(ctx.profileId, item.id, today, slot, amt).first();
            if (dupe) { logged.push(f.name); continue; } // already logged moments ago — treat as success, don't duplicate
            await ctx.db.prepare(
              `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
               VALUES (NULL, ?1, ?2, ?3, ?4, ?5, datetime('now'))`
            ).bind(ctx.profileId, today, item.id, amt, slot).run();
            logged.push(f.name);
          } else {
            failed.push(f.name);
          }
        } catch {
          failed.push(f.name);
        }
      }
      // Enrich with nutrient analysis (calories, what's covered, what's still
      // low) so the model can weave that into its confirmation, same as the
      // deterministic path already does.
      let analysis: any = null;
      if (logged.length > 0) {
        try {
          analysis = await toolAnalyzeIntake(ctx.db, logged, ctx.profile, foods.filter(f => logged.includes(f.name)).map(f => f.amount_g ?? 100));
        } catch { /* non-fatal — logging itself already succeeded */ }
      }
      const allergensEaten = logged.filter(name =>
        ctx.userFacts.allergies.some(a => name.toLowerCase().includes(a.toLowerCase()) || a.toLowerCase().includes(name.toLowerCase()))
      );
      return { result: { logged, not_found: failed, analysis, allergy_warning: allergensEaten.length > 0 ? `SAFETY ALERT: ${allergensEaten.join(", ")} is a recorded allergen for this user — you MUST prominently warn them and advise seeking medical attention if they have any reaction, in your response.` : null }, toolLabel: "log_meal" };
    }
    case "get_today_intake": {
      const today = getISTDateString();
      const rows = await ctx.db.prepare(
        `SELECT i.name, ml.amount_g, ml.meal_slot, i.calories_per_100g
         FROM meal_logs ml JOIN items i ON i.id = ml.item_id
         WHERE ml.session_id = ?1 AND ml.logged_date = ?2 ORDER BY ml.created_at ASC`
      ).bind(ctx.profileId, today).all();
      const logs = rows.results as any[];
      const totalCal = Math.round(logs.reduce((s, l) => s + (l.calories_per_100g * l.amount_g / 100), 0));
      const targetCal = computeTdee(ctx.profile ?? {}) ?? 2000;
      return {
        result: {
          items: logs.map(l => ({ name: l.name, amount_g: l.amount_g, meal_slot: l.meal_slot })),
          total_calories: totalCal, target_calories: targetCal, remaining: Math.max(0, targetCal - totalCal),
        },
        toolLabel: "get_today_intake",
      };
    }
    case "get_weekly_deficiencies": {
      const rows = await ctx.db.prepare(
        `SELECT n.name as nutrient_name, SUM(in_.amount_per_100g * ml.amount_g / 100.0) as total, rda.daily_amount
         FROM meal_logs ml
         JOIN item_nutrients in_ ON in_.item_id = ml.item_id
         JOIN nutrients n ON n.id = in_.nutrient_id
         LEFT JOIN rda ON rda.nutrient_name = n.name
         WHERE ml.session_id = ?1 AND ml.logged_date >= date('now', '-7 days')
         GROUP BY n.name`
      ).bind(ctx.profileId).all();
      const rowsArr = rows.results as any[];
      if (rowsArr.length === 0) {
        return { result: { has_data: false }, toolLabel: "get_weekly_deficiencies" };
      }
      const deficient = rowsArr
        .filter(r => r.daily_amount && (r.total / (r.daily_amount * 7)) < 0.4)
        .map(r => r.nutrient_name);
      return { result: { has_data: true, deficient_nutrients: deficient }, toolLabel: "get_weekly_deficiencies" };
    }
    case "check_food_safety": {
      const food = applyFoodAlias(String(args.food_name ?? "")).toLowerCase();
      const isAllergen = ctx.userFacts.allergies.some(a => food.includes(a.toLowerCase()) || a.toLowerCase().includes(food));
      const isDisliked = ctx.userFacts.dislikes.some(d => food.includes(d.toLowerCase()) || d.toLowerCase().includes(food));
      return { result: { safe: !isAllergen, is_allergen: isAllergen, is_disliked: isDisliked }, toolLabel: "check_food_safety" };
    }
    case "get_bmi_and_calories": {
      const bmi = ctx.profile ? computeBmi(ctx.profile) : null;
      const tdee = ctx.profile ? computeTdee(ctx.profile) : null;
      return { result: { bmi: bmi?.bmi ?? null, bmi_label: bmi?.label ?? null, daily_calorie_target: tdee }, toolLabel: "get_bmi_and_calories" };
    }
    case "search_knowledge_base": {
      const query = String(args.query ?? "");
      if (!query) return { result: { found: false }, toolLabel: "search_knowledge_base" };
      const results = await searchKnowledgeBase(
        { DB: ctx.db, AI: ctx.ai, VECTOR_INDEX: ctx.vectorIndex },
        query, 3
      );
      if (results.length === 0) {
        return { result: { found: false, note: "No relevant content in the knowledge base for this query." }, toolLabel: "search_knowledge_base", ragGap: query };
      }
      return {
        result: {
          found: true,
          chunks: results.map(r => ({ content: r.content, category: r.category, source: r.source, relevance: Math.round(r.score * 100) / 100 })),
        },
        toolLabel: "search_knowledge_base",
        sources: results.map(r => r.source).filter((s): s is string => !!s),
      };
    }
    default:
      return { result: { error: `Unknown tool: ${name}` }, toolLabel: name };
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemInstruction(ctx: AgentContext): string {
  const facts = [
    ctx.userFacts.dietary ? `Dietary preference: ${ctx.userFacts.dietary}` : "",
    ctx.userFacts.likes.length ? `Likes: ${ctx.userFacts.likes.join(", ")}` : "",
    ctx.userFacts.dislikes.length ? `Dislikes: ${ctx.userFacts.dislikes.join(", ")}` : "",
    ctx.userFacts.allergies.length ? `ALLERGIES (never recommend these): ${ctx.userFacts.allergies.join(", ")}` : "",
    ctx.userFacts.health_notes.length ? `Health notes: ${ctx.userFacts.health_notes.join(", ")}` : "",
    ctx.userFacts.goal ? `Goal: ${ctx.userFacts.goal}` : "",
    ctx.profile?.age ? `Age: ${ctx.profile.age}` : "",
    ctx.profile?.height_cm ? `Height: ${ctx.profile.height_cm}cm` : "",
    ctx.profile?.weight_kg ? `Weight: ${ctx.profile.weight_kg}kg` : "",
  ].filter(Boolean).join("; ");

  return `You are NutriMentor AI, a nutrition and health mentor for Indian seasonal eating (Ayurvedic Ritu system). You ONLY discuss nutrition, food, diet, and health topics — for anything else, politely redirect.

Ayurvedic concepts (dosha, agni, prakriti, ritu, and similar) ARE inside your domain — they are core to this app's own framework, not an exception to it. Never decline or redirect an Ayurveda question as out-of-scope. Call search_knowledge_base and answer from what it returns; if it returns nothing relevant, say so honestly rather than declining the whole topic.

Current season: ${SEASON_LABELS[ctx.currentSeason] ?? ctx.currentSeason}. Currently viewing: ${ctx.currentItemName ?? "nothing selected"}.
What you know about this user: ${facts || "nothing yet"}.

CRITICAL RULES:
1. GROUNDING: Never state a specific nutrient value, calorie count, or seasonal fact from memory — always call the relevant tool first. For a food not in the 57-food database, or a general nutrition/health/Ayurveda question the food tools can't answer, call search_knowledge_base before answering. If a tool (including search_knowledge_base) returns "not found", say so honestly — do not fall back to unverified general knowledge presented as if it were grounded fact.
1b. CONFIDENCE CALIBRATION: search_knowledge_base results include a "relevance" score (0-1). Above ~0.75, state the answer directly. Between ~0.5-0.75 (a real but weaker match), still answer, but signal it's a general/traditional guideline rather than a precise fact — phrasing like "generally," "traditionally," or "as a general guideline" — rather than presenting a borderline match with the same confidence as an exact one.
2. SAFETY: Before recommending any specific food, call check_food_safety if you're not certain it's outside the user's allergies/dislikes listed above. Never recommend an allergen. If any tool result includes an "allergy_warning" field, you MUST address it prominently and immediately in your response — this is never optional or skippable, even if the user's message was about something else.
3. DIRECTNESS: Answer exactly what was asked. If asked "can I eat X and Y together", give a direct yes/no/generally-fine answer with brief reasoning — do not dump one food's nutrient profile instead. If asked a yes/no question, lead with the answer.
3b. PRECISION: When comparing foods or citing a nutrient value, include the actual number and unit from the tool result (e.g. "Mango has 36mg Vitamin C vs Banana's 8mg") — not just qualitative language like "mango has more". The exact numbers are the whole point of a comparison.
4. LOGGING: If the user reports eating/drinking something, call log_meal — don't just acknowledge it in text.
5. MEDICAL DISCLAIMER — ONLY when actually warranted: add the "I'm an AI nutrition assistant, not a doctor, please consult a healthcare professional" note ONLY for questions about a specific medical condition/diagnosis, a symptom needing treatment, medication interactions, or an explicit "should I see a doctor" question. Do NOT add it for routine food questions like "is X good for health", "are green vegetables healthy", "is alcohol okay to drink" — these get a normal, direct, grounded answer with no disclaimer at all. Over-using the disclaimer on ordinary food questions is a real problem users have complained about — treat it as the exception, not the default.
6. INDEPENDENCE: Treat each new message as its own question. Do not carry over or repeat phrasing, disclaimers, or topics from your previous answer unless the new question is actually about the same thing. If the topic changed (e.g. previous question was about alcohol, this one is about vegetables), answer ONLY the new question — never reference the old topic.
7. TOOLS ARE FOR FOOD ANSWERS: Do not call a tool for greetings, thanks, or identity questions — just respond naturally and briefly.
8. Keep answers concise and conversational — this is a chat, not a report. Use **bold** for food/nutrient names.`;
}

// ── Main loop ────────────────────────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 3;
const MODEL = "gemini-2.5-flash-lite";

export async function runAgentLoop(message: string, ctx: AgentContext): Promise<AgentResult | AgentLoopFailure> {
  if (!ctx.geminiKey) return { failed: true, reason: "no_api_key" };

  const systemInstruction = { parts: [{ text: buildSystemInstruction(ctx) }] };
  const contents: any[] = [
    ...ctx.history.slice(-10).map(h => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const toolsUsed: string[] = [];
  const citations: string[] = [];
  const ragGaps: string[] = [];
  let planData: any = null;
  let wantsPdf = false;

  // Fixed 2026-08-29: removed model-name guessing entirely. Two different
  // fallback model names from external sources ("gemini-2.5-flash", then
  // "gemini-3.6-flash") have now both failed — the second with NEW 400 errors
  // that didn't exist before, on top of persisting 404s. Guessing a third
  // name is a losing strategy when the ground truth (what's actually valid
  // for THIS project) isn't visible to me at all. Retrying with the already-
  // confirmed-working primary model instead, but stripped down — no tools
  // (isolates whether tool-calling context is part of the empty-response
  // problem) and no thinkingConfig override (isolates whether that specific
  // param is what's been causing the newly-seen 400s).

  async function callGemini(modelName: string, includeTools = true) {
    return fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${ctx.geminiKey}`,
      {
        contents,
        system_instruction: systemInstruction,
        ...(includeTools ? { tools: AGENT_TOOLS } : {}),
        // Fixed 2026-08-24: gemini-2.5-flash-lite has "thinking" enabled by
        // default, and thinking tokens count against maxOutputTokens — for
        // some inputs this consumes the entire budget, leaving zero tokens
        // for the actual answer, reported back as finishReason=STOP with
        // empty content (not a truncation error, which is what made this
        // hard to spot). thinkingBudget: 0 is the documented fix for this
        // model family in general.
        generationConfig: includeTools
          ? { temperature: 0.3, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
          : { temperature: 0.3, maxOutputTokens: 800 }, // stripped down for the retry — see note above
      },
      ctx.kv
    );
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await callGemini(MODEL);
      if (!resp || !resp.ok) {
        // let the caller fall back to the deterministic router — but tell it why
        return { failed: true, reason: "gemini_http_error", detail: resp ? `HTTP ${resp.status}` : "no response object", toolsUsed };
      }

      const data = await resp.json() as any;
      const candidate = data.candidates?.[0];
      const parts: any[] = candidate?.content?.parts ?? [];
      const functionCallPart = parts.find(p => p.functionCall);

      if (!functionCallPart) {
        // Model produced a final text answer — done.
        let text = parts.filter(p => p.text).map(p => p.text).join("").trim();

        if (!text) {
          // Scaled back 2026-08-24: this used to retry same-model-then-
          // fallback-model (up to 2 extra full calls, each with its own
          // internal 3-attempt backoff in fetchGeminiWithRetry — up to ~6
          // extra HTTP requests for one failing case). Confirmed via D1 logs
          // that the real failures today are genuine Gemini 429s from
          // cumulative testing volume, not a per-input model quirk — under
          // real quota pressure, amplifying retries per failure makes things
          // worse, not better. Down to a single fallback-model attempt.
          const retryResp = await callGemini(MODEL, false); // same confirmed-working model, no tools, no thinkingConfig
          let fallbackDetail = "not attempted";
          if (!retryResp) {
            fallbackDetail = `${MODEL} (retry, no tools): no response object`;
          } else if (!retryResp.ok) {
            fallbackDetail = `${MODEL} (retry, no tools): HTTP ${retryResp.status}`;
          } else {
            const retryData = await retryResp.json() as any;
            const retryCandidate = retryData.candidates?.[0];
            const retryParts: any[] = retryCandidate?.content?.parts ?? [];
            if (!retryParts.some((p: any) => p.functionCall)) {
              const retryText = retryParts.filter((p: any) => p.text).map((p: any) => p.text).join("").trim();
              if (retryText) { text = retryText; fallbackDetail = "succeeded"; }
              else fallbackDetail = `${MODEL} (retry, no tools): also empty, finishReason=${retryCandidate?.finishReason ?? "unknown"}`;
            } else {
              fallbackDetail = `${MODEL} (retry, no tools): unexpected functionCall`;
            }
          }
          if (!text) {
            return {
              failed: true, reason: "empty_model_response",
              detail: `round ${round}, finishReason=${candidate?.finishReason ?? "unknown"}, safetyRatings=${JSON.stringify(candidate?.safetyRatings ?? data?.promptFeedback ?? null)}, fallback=[${fallbackDetail}]`,
              toolsUsed,
            };
          }
        }

        return { text, toolsUsed, citations, ragGaps, planData, wantsPdf };
      }

      // Model wants to call a tool — execute it and feed the result back.
      // Wrapped defensively: if ONE tool throws (a transient embedding/vector
      // query error, for example), that must not kill the entire turn — feed
      // the model an honest "this tool failed" result and let it continue or
      // answer with what it has, instead of the whole response silently
      // becoming empty and falling through to a generic static message.
      const call = functionCallPart.functionCall;
      let result: any; let toolLabel: string; let sources: string[] | undefined; let ragGap: string | undefined;
      try {
        ({ result, toolLabel, sources, ragGap } = await executeAgentTool(call.name, call.args ?? {}, ctx));
      } catch (toolErr) {
        console.error(`Tool ${call.name} failed:`, toolErr);
        result = { error: "This tool failed to execute — try answering without it, or tell the user you don't have this information right now." };
        toolLabel = call.name;
      }
      if (!toolsUsed.includes(toolLabel)) toolsUsed.push(toolLabel);
      for (const s of sources ?? []) { if (!citations.includes(s)) citations.push(s); }
      if (ragGap && !ragGaps.includes(ragGap)) ragGaps.push(ragGap);

      if (call.name === "build_diet_plan" && result && !result.error) {
        planData = result;
        wantsPdf = (result.days?.length === 7);
      }

      // Append the model's function-call turn, then our function-response turn
      contents.push({ role: "model", parts: [{ functionCall: call }] });
      contents.push({
        role: "user",
        parts: [{ functionResponse: { name: call.name, response: { content: result } } }],
      });
    }

    // Hit the round cap without a final answer — treat as failure, fall back.
    return { failed: true, reason: "round_cap_exceeded", detail: `toolsUsed=[${toolsUsed.join(",")}]`, toolsUsed };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: "agent_loop_exception", sessionId: ctx.sessionId, detail }));
    return { failed: true, reason: "exception", detail, toolsUsed };
  }
}
