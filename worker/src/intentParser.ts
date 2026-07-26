// ── Phase 3.5: Intent Parser ─────────────────────────────────────────────────
// Replaces the 25-flag keyword router with Gemini-powered NLP understanding.
// Single Gemini call per non-trivial message → structured intents → tools.

export type IntentType =
  | "food_lookup"       // "tell me about mango" / "what is rajma"
  | "compare"           // "compare banana and apple"
  | "intake_log"        // "I ate 3 eggs for breakfast"
  | "diet_plan"         // "build me a monsoon diet plan"
  | "seasonal_info"     // "what should I eat in winter"
  | "seasonal_avoid"    // "what to avoid in monsoon"
  | "current_season"    // "what season is it"
  | "nutrient_query"    // "foods rich in iron"
  | "nutrient_in_food"  // "how much vitamin b6 does tofu have" — added: distinct from
                         // nutrient_query (a list request); this asks for one food's value.
                         // Gap found in production testing — see CHANGELOG 2026-07-02.
  | "availability"      // "can I get apple in summer?" — added: same-source gap as above.
  | "memory_read"       // "what do you know about me"
  | "memory_update"     // "remove mango from likes" / "add aam to likes" — renamed from
                         // the narrower original scope to also cover ADD, not just remove.
  | "preference_set"    // "I like mango, I hate litchi"
  | "meal_suggestion"   // "what should I eat for dinner"
  | "diet_advice"       // "should I add rajma to my diet"
  | "bmi_query"         // "what is my BMI"
  | "calorie_query"     // "what's my calorie count today" / "what did I eat today" — added
  | "swap_request"      // "substitute for paneer"
  | "symptom_query"     // "what to eat when I have cold"
  | "salad_suggestion"  // "what to add to my salad"
  | "general_nutrition" // "what vitamins does the body need"
  | "greeting"
  | "farewell"
  | "thanks"
  | "follow_up"         // "tell me more" / "what about monsoon"
  | "general";          // anything else → Gemini narrative

export interface FoodSlot {
  name: string;              // normalised food name
  quantity?: number;         // 3 (from "3 eggs")
  unit?: string;             // "piece", "glass", "g", "ml", "bowl"
  amount_g?: number;         // computed grams
  sentiment?: "like" | "dislike" | "allergy" | "neutral";
  meal_slot?: string;        // "breakfast", "lunch", "dinner"
}

export interface ParsedIntent {
  type: IntentType;
  is_primary: boolean;       // main intent to respond to
  foods?: FoodSlot[];
  season?: string;
  nutrient?: string;
  meal_slot?: string;
  remove_from?: "likes" | "dislikes" | "allergies" | "both";
  memory_op?: "add" | "remove";   // for memory_update — which direction
  context?: string;          // any free-form context extracted
}

export interface ParsedMessage {
  intents: ParsedIntent[];
  session_topic?: string;    // 1-line summary for session memory
}

// ── Unit weights (ml/g per unit) ──────────────────────────────────────────────
const UNIT_TO_G: Record<string, number> = {
  g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000,
  ml: 1, milliliter: 1, millilitre: 1, l: 1000, liter: 1000, litre: 1000,
  glass: 240, glasses: 240, cup: 240, cups: 240,
  bowl: 150, bowls: 150, plate: 200, plates: 200,
  tablespoon: 15, tbsp: 15, teaspoon: 5, tsp: 5,
  handful: 30, handfuls: 30, piece: 100, pieces: 100,
  slice: 30, slices: 30, roti: 30, rotis: 30,
  katori: 150, katoris: 150,
};

const FOOD_UNIT_G: Record<string, number> = {
  egg: 55, eggs: 55, banana: 120, apple: 180, mango: 200,
  orange: 150, guava: 100, date: 10, dates: 10, litchi: 15,
  almond: 1, almonds: 1, walnut: 5, walnuts: 5, peanut: 1, peanuts: 1,
  roti: 30, chapati: 30,
};

export function computeAmountG(qty: number, unit: string, foodName: string): number {
  const u = unit.toLowerCase().trim();
  if (UNIT_TO_G[u]) return Math.round(qty * UNIT_TO_G[u]);
  const f = foodName.toLowerCase();
  for (const [key, grams] of Object.entries(FOOD_UNIT_G)) {
    if (f.includes(key)) return Math.round(qty * grams);
  }
  return Math.round(qty * 100);
}

// ── The Gemini prompt ─────────────────────────────────────────────────────────
const KNOWN_FOODS = [
  "Banana","Mango","Watermelon","Papaya","Litchi","Pineapple","Jamun","Plum",
  "Grape","Pomegranate","Pear","Apple","Orange","Guava","Amla","Dates","Peach","Strawberry",
  "Onion","Tomato","Cucumber","Bell Pepper","Bitter Gourd","Ridge Gourd","Bottle Gourd",
  "Pumpkin","Spinach","Broccoli","Carrot","Cabbage","Cauliflower","Beetroot","Sweet Potato",
  "Green Peas","Mustard Greens","Fenugreek Leaves",
  "Oats","Brown Rice","Bajra","Jowar","Wheat",
  "Lentils","Moong Dal","Chickpeas","Rajma","Soybean",
  "Milk","Curd","Paneer",
  "Almonds","Walnuts","Peanuts","Sesame Seeds",
  "Egg","Chicken Breast","Tofu","Salmon",
].join(", ");

function buildParserPrompt(message: string, season: string, profileSummary: string): string {
  return `You are the NLP parser for NutriMentor AI, an Indian nutrition agent.
Known foods: ${KNOWN_FOODS}
Current season: ${season}
User profile: ${profileSummary}

Parse this message into structured intents. Rules:
- A message can have MULTIPLE intents (e.g. "thanks, what's my calorie count, bye" = thanks + calorie_query + farewell)
- Extract ALL food items with quantity/unit if mentioned
- For intake: extract quantity (3), unit (glass/piece/g/bowl), food name
- For preference: classify as like/dislike/allergy
- "get sick from X" / "X makes me ill" / "allergic to X" = allergy sentiment
- Mark one intent as is_primary=true (the main thing to respond to)
- greeting/farewell/thanks are never primary unless the message is ONLY that
- nutrient_query = asking for a LIST of foods rich in a nutrient ("foods rich in iron")
- nutrient_in_food = asking for ONE food's value of ONE nutrient ("how much vitamin b6 does tofu have", "vitamin b6 in tofu") — set foods[0] AND nutrient
- availability = asking whether a food is in season now/in a given season ("can I get apple in summer?") — set foods[0] AND season
- calorie_query = asking about today's calorie total or what was eaten today ("what's my calorie count", "what did I eat today")
- memory_update = asking to ADD or REMOVE a food from likes/dislikes/allergies (not just "I like X" which is preference_set) — set memory_op ("add"/"remove") and remove_from ("likes"/"dislikes"/"allergies"/"both")
- symptom_query = asking what to eat for a health condition/symptom (fever, cold, diarrhea, headache, etc., including colloquial forms like "vomit", "loose motions", "bp") — set context to the symptom word(s) verbatim

Return ONLY valid JSON, no explanation:
{
  "intents": [
    {
      "type": "intake_log",
      "is_primary": true,
      "foods": [{"name": "Egg", "quantity": 3, "unit": "piece"}, {"name": "Milk", "quantity": 2, "unit": "glass"}],
      "meal_slot": "breakfast"
    }
  ],
  "session_topic": "Logged breakfast: 3 eggs, 2 glass milk"
}

Message: "${message}"
JSON:`;
}

// ── Main parser function ──────────────────────────────────────────────────────
export async function parseMessageIntent(
  message: string,
  geminiKey: string,
  currentSeason: string,
  profileSummary: string
): Promise<ParsedMessage | null> {
  if (!geminiKey) return null;

  const msg = message.trim();
  if (msg.length < 3) return null;

  const prompt = buildParserPrompt(msg, currentSeason, profileSummary);

  try {
    // Try Flash-Lite first, cascade to 2.0 on rate limit
    for (const model of ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"]) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 400, temperature: 0 },
          }),
        }
      );

      if (resp.status === 429 || resp.status === 503) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      if (!resp.ok) break;

      const data = await resp.json() as any;
      const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
      const jsonStr = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(jsonStr) as ParsedMessage;

      // Validate structure
      if (!Array.isArray(parsed.intents) || parsed.intents.length === 0) return null;

      // Fill in computed amount_g for each food slot
      for (const intent of parsed.intents) {
        if (intent.foods) {
          for (const food of intent.foods) {
            if (food.quantity && !food.amount_g) {
              food.amount_g = computeAmountG(food.quantity, food.unit ?? "", food.name);
            } else if (!food.quantity && !food.amount_g) {
              food.amount_g = 100; // default
            }
          }
        }
      }

      return parsed;
    }
  } catch { /* fall through to null */ }

  return null;
}

// ── Quick intents that never need Gemini ─────────────────────────────────────
// Returns null if message needs full parsing, or a ParsedMessage for trivial cases
export function tryQuickParse(msgClean: string): ParsedMessage | null {
  const GREETINGS = ["hi","hello","hey","hola","namaste","howdy","sup","yo","hai","good morning","good afternoon","good evening"];
  const BYES = ["bye","goodbye","see you","ciao","alvida","tata","byee","byebye","bye bye","good bye",
    "see ya","later","ttyl","cheerio","cya","ok bye","okay bye","take care","good night","gtg","gotta go",
    "thanks bye","ok thanks","ok cya"];
  const THANKS = ["thanks","thank you","thx","ty","dhanyawad","shukriya","thankyou","thanku","thnx"];

  if (GREETINGS.some(g => msgClean === g || msgClean.startsWith(g + " "))) {
    return { intents: [{ type: "greeting", is_primary: true }] };
  }
  if (BYES.some(b => msgClean === b || msgClean.startsWith(b + " "))) {
    return { intents: [{ type: "farewell", is_primary: true }] };
  }
  if (THANKS.some(t => msgClean === t) && msgClean.length < 20) {
    return { intents: [{ type: "thanks", is_primary: true }] };
  }
  return null;
}

// ── PHASE 3.5.1: KV-cached wrapper (spec: 60s cache, keyed by message hash) ──
// "If the same message is sent again (retry), no extra Gemini call."
// Cheap FNV-1a hash — no crypto needed, just needs to be a stable short key.
function hashMessage(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export async function parseMessageIntentCached(
  message: string,
  geminiKey: string,
  currentSeason: string,
  profileSummary: string,
  kv: KVNamespace
): Promise<ParsedMessage | null> {
  const msg = message.trim();
  if (msg.length < 3) return null;

  const cacheKey = `intent:${hashMessage(msg.toLowerCase())}`;
  try {
    const cached = await kv.get(cacheKey);
    if (cached) return JSON.parse(cached) as ParsedMessage;
  } catch { /* cache miss/corrupt — fall through to live parse */ }

  const parsed = await parseMessageIntent(message, geminiKey, currentSeason, profileSummary);
  if (parsed) {
    try {
      await kv.put(cacheKey, JSON.stringify(parsed), { expirationTtl: 60 });
    } catch { /* non-fatal — caching is an optimization, not a requirement */ }
  }
  return parsed;
}
