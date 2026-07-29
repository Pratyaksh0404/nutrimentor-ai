import { Hono } from "hono";
import { cors } from "hono/cors";
// intentParser.ts / intentDispatcher.ts intentionally not imported into the hot
// path — see ARCHITECTURE DECISION comment below. Kept in the repo, spec-compliant,
// for future use if a reliable free (or paid) inference source becomes available.
// sessionMemory.ts (Stage 4 — KV rolling summary) not wired in yet; see integration plan.

// ── Types ─────────────────────────────────────────────────────────────────────

interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  AI: Ai;
  GEMINI_API_KEY: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  WORKER_URL: string;
  FRONTEND_URL: string;
}

interface Profile {
  id?: number;
  google_id?: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  age?: number;
  sex?: string;
  height_cm?: number;
  weight_kg?: number;
  goal?: string;
  activity_level?: string;
  dietary_preference?: string;
  allergies?: string[];
}

interface AgentContext {
  session_id: string;
  profile?: Profile | null;
  current_item?: { id: number; name: string; season: string } | null;
  current_season?: string;
}

interface AgentRequest {
  message: string;
  context?: AgentContext;
}

// ── Season labels ─────────────────────────────────────────────────────────────

const SEASON_LABELS: Record<string, string> = {
  spring:    "Vasanta Ritu (Spring)",
  summer:    "Grishma Ritu (Summer)",
  monsoon:   "Varsha Ritu (Monsoon)",
  autumn:    "Sharad Ritu (Autumn)",
  prewinter: "Hemanta Ritu (Pre-winter)",
  winter:    "Shishira Ritu (Winter)",
  all:       "all seasons",
};

// ── BMI + TDEE helpers ────────────────────────────────────────────────────────

function computeBmi(profile: Profile): { bmi: number; label: string } | null {
  if (!profile.height_cm || !profile.weight_kg) return null;
  const bmi = Math.round((profile.weight_kg / ((profile.height_cm / 100) ** 2)) * 10) / 10;
  const label =
    bmi < 18.5 ? "underweight" :
    bmi < 25   ? "healthy" :
    bmi < 30   ? "overweight" :
    "obese range";
  return { bmi, label };
}

function computeTdee(profile: Profile): number | null {
  const { weight_kg: w, height_cm: h, age, sex, activity_level } = profile;
  if (!w || !h || !age) return null;
  const bmr = (sex === "male" || sex === "m")
    ? 10 * w + 6.25 * h - 5 * age + 5
    : 10 * w + 6.25 * h - 5 * age - 161;
  const m: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725,
  };
  return Math.round(bmr * (m[activity_level ?? "moderate"] ?? 1.55));
}

// ── Master food alias / typo map — single source of truth ───────────────────
// Applied in extractAndStoreFacts (DB writes) AND in message routing.
// Adding a variant here fixes it everywhere automatically.
const MASTER_FOOD_ALIAS: Record<string, string> = {
  // Common typos
  "brocolli":"broccoli","brocoli":"broccoli",
  "bannana":"banana","banan":"banana","gauva":"guava","guvava":"guava",
  "wallnut":"walnuts","walnut":"walnuts","almond":"almonds","peanut":"peanuts",
  "date":"dates","lentil":"lentils","chickpea":"chickpeas",
  // Dairy
  "panner":"paneer","panneer":"paneer","paner":"paneer","panir":"paneer","panear":"paneer",
  "dahi":"curd","doodh":"milk","dudh":"milk",
  // Legumes
  "soyabean":"soybean","soya bean":"soybean","soya":"soybean","soy":"soybean",
  "rajmah":"rajma","chana":"chickpeas","chane":"chickpeas","chole":"chickpeas",
  "choley":"chickpeas","chhole":"chickpeas","chholey":"chickpeas",
  "moong":"moong dal","mung":"moong dal","mung dal":"moong dal",
  "masoor dal":"lentils","masoor":"lentils","masur":"lentils","dal":"lentils","daal":"lentils",
  // Grains
  "roti":"wheat","chapati":"wheat","chapatti":"wheat","chapaati":"wheat",
  "brownrice":"brown rice","basmati":"brown rice","rice":"brown rice",
  "bajri":"bajra","baajra":"bajra","bajre":"bajra","bajre ki roti":"bajra",
  "jwaar":"jowar","jwar":"jowar",
  "makka":"corn","daliya":"oats",
  // Vegetables
  "palak":"spinach","paalak":"spinach",
  "karela":"bitter gourd","bittergourd":"bitter gourd",
  "lauki":"bottle gourd","ghiya":"bottle gourd","loki":"bottle gourd","bottlegourd":"bottle gourd",
  "turai":"ridge gourd","tori":"ridge gourd","torai":"ridge gourd",
  "brinjal":"eggplant","baingan":"eggplant",
  "methi":"fenugreek leaves",
  "sarson":"mustard greens","sarso":"mustard greens",
  "shimla mirch":"bell pepper","capsicum":"bell pepper","shimlamirch":"bell pepper",
  "gajar":"carrot","tamatar":"tomato","broccolli":"broccoli",
  "kheera":"cucumber","kheere":"cucumber",
  "pyaaz":"onion","pyaj":"onion","pyaaj":"onion","pyaz":"onion",
  "kaddu":"pumpkin","shakarkand":"sweet potato",
  "aalu":"potato","aalo":"potato","aaloo":"potato","aloo":"potato",
  "gobhi":"cauliflower","gobi":"cauliflower","patta gobhi":"cabbage","patta gobi":"cabbage",
  "matar":"green peas","greenpeas":"green peas","chukandar":"beetroot",
  // Fruits
  "amrud":"guava","amrood":"guava",
  "kela":"banana","seb":"apple",
  "aam":"mango",
  "tarbooz":"watermelon","tarbooj":"watermelon",
  "papita":"papaya",
  "anaar":"pomegranate","angoor":"grape",
  "nashpati":"pear","naashpati":"pear",
  "jaamun":"jamun","jaamoon":"jamun",
  "lychee":"litchi","lichee":"litchi",
  "avla":"amla",
  "khajoor":"dates",
  "aadu":"peach",
  "ananas":"pineapple","annanas":"pineapple",
  "alubukhara":"plum","aalubukhara":"plum",
  "santra":"orange","kinnow":"orange","kinoo":"orange","kinnoo":"orange",
  // Nuts
  "badam":"almonds","badaam":"almonds",
  "akhrot":"walnuts",
  "moongfali":"peanuts",
  "kaju":"cashews",
  "til":"sesame seeds","sesame":"sesame seeds",
  // Protein
  "chicken":"chicken breast","murgi":"chicken breast","hen":"chicken breast","meat":"chicken breast",
  "fish":"salmon","machli":"salmon",
  "ande":"egg","andey":"egg",
};

// Apply alias map to a string — normalises all known variants to canonical names.
// Handles multi-word aliases by checking longest match first.
function applyFoodAlias(text: string): string {
  let result = text.toLowerCase().trim();
  // Sort by length descending so longer aliases (e.g. "soya bean") match before shorter ("soya")
  const sorted = Object.entries(MASTER_FOOD_ALIAS).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of sorted) {
    // Word-boundary replacement
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "g"), canonical);
  }
  return result;
}


// ── PHASE 1: Fact extraction — learns from conversation ──────────────────────
// Deterministic pattern matching — no AI needed for this.
// All learned facts stored in user_facts table.


// ── Gemini-powered food entity + intent extractor ────────────────────────────
// Replaces regex-based like/dislike parsing. Handles any natural language.
// "I like mango, I hate litchi, I get sick from plum" → structured entities.
// Retries once on 429/503 (transient rate-limit/overload) with a short backoff.
// Free-tier quota gets exhausted fast under burst traffic — a single retry
// after ~500ms recovers a meaningful fraction of these without adding much latency.
async function fetchGeminiWithRetry(url: string, body: any): Promise<Response | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.ok) return resp;
      if ((resp.status === 429 || resp.status === 503) && attempt === 0) {
        await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
        continue;
      }
      return resp;
    } catch {
      if (attempt === 0) { await new Promise(r => setTimeout(r, 300)); continue; }
      return null;
    }
  }
  return null;
}

async function geminiExtractFoodEntities(
  message: string,
  geminiKey: string
): Promise<Array<{ food: string; sentiment: "like" | "dislike" | "allergy" | "neutral" }>> {
  if (!geminiKey || message.length < 3) return [];
  const prompt = [
    "Extract food items and sentiment from this message. Rules:",
    "- Only extract actual food items (fruits, vegetables, grains, dairy, meat, nuts, spices)",
    "- DO NOT extract: activities, meal times (breakfast/lunch/dinner), non-food items",
    "- like = love/like/enjoy/adore/prefer/want",
    "- dislike = hate/dislike/avoid/don't like/cannot eat/not a fan of",
    "- allergy = get sick/makes me ill/allergic/intolerant/bad reaction",
    "- neutral = just mentioned without clear sentiment",
    "Return ONLY a JSON array, nothing else:",
    '[{"food":"apple","sentiment":"like"},{"food":"milk","sentiment":"dislike"}]',
    "",
    `Message: "${message}"`,
    "JSON:"
  ].join("\n");

  try {
    const resp = await fetchGeminiWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 300, temperature: 0 },
      }
    );
    if (!resp || !resp.ok) return [];
    const data = await resp.json() as any;
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    const jsonStr = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* fall through */ }
  return [];
}

// ── Gemini-powered multi-intent parser ───────────────────────────────────────
// When a message has multiple intents ("thank you, what's my calorie count, bye"),
// returns a structured breakdown so the router can handle each intent.
interface ParsedIntent {
  intents: Array<"intake" | "diet_plan" | "food_lookup" | "compare" | "seasonal" | "memory" | "greeting" | "farewell" | "thanks" | "follow_up" | "general">;
  primary_intent: string;
  extracted_foods: string[];
  extracted_query: string; // cleaned main query for deterministic routing
}

async function geminiParseIntent(
  message: string,
  geminiKey: string,
  context: string
): Promise<ParsedIntent | null> {
  if (!geminiKey || message.length < 5) return null;
  // Only call for messages that look multi-intent or ambiguous
  const hasMultiple = /(?:thank|bye|good|also|and also|before going|one more thing)/i.test(message)
    && message.length > 40;
  if (!hasMultiple) return null;

  const prompt = [
    `User context: ${context.slice(0, 200)}`,
    `User message: "${message}"`,
    "",
    "Identify all intents in this message. Return JSON only:",
    '{"intents":["thanks","follow_up"],"primary_intent":"follow_up","extracted_foods":["apple","milk"],"extracted_query":"what is my total calorie intake today"}',
    "",
    "Available intents: intake, diet_plan, food_lookup, compare, seasonal, memory, greeting, farewell, thanks, follow_up, general",
    "JSON:"
  ].join("\n");

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0 },
        }),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    const jsonStr = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(jsonStr) as ParsedIntent;
  } catch { return null; }
}

async function extractAndStoreFacts(
  message: string,
  profileId: string,
  db: D1Database,
  geminiKey = ""
): Promise<string[]> {
  const m = message.toLowerCase();
  const stored: string[] = [];
  // Wrap all fact storage in try/catch — a DB error must never crash the agent response

  // ── Food entity extraction — deterministic only ───────────────────────────────
  // Per the architecture decision (see agent route handler): Gemini is no longer
  // called here either. The regex patterns below (like/dislike/allergy, now
  // DB-validated and covering the phrasings Gemini used to catch — "sick from X",
  // "makes me ill") handle this deterministically. geminiHandledLikeDislikes is
  // kept as `false` so the loops below always run.
  const geminiHandledLikeDislikes = false;

  // ── Dislikes (regex fallback when Gemini not available or returned nothing) ──
  // Also handles goal/health/profile fields regardless of geminiHandledLikeDislikes
  if (!geminiHandledLikeDislikes) { // only run regex for likes/dislikes if Gemini didn't handle them

  // ── Dislikes ──
  // Dislike patterns — stop at prepositions and clause boundaries
  const DISLIKE_STOP = "(?:\\s*[.,!]|\\s+(?:now|but|please|in |at |when|during|with|after|before|every|for )|$)";
  const FOOD_CAPTURE = "([a-z][a-z]{1,20}(?:\\s[a-z]{1,15})?)";
  const dislikePatterns: Array<[RegExp, number]> = [
    [new RegExp(`i (?:don't|do not|hate|dislike|avoid)(?: (?:eating|having|drinking|consuming|to eat|to drink|to have|to consume))? ${FOOD_CAPTURE}${DISLIKE_STOP}`), 1],
    [/([a-z][a-z\s]{1,25}?) (?:is|are) (?:gross|bad|terrible|disgusting|awful)/, 1],
    [new RegExp(`not a fan of ${FOOD_CAPTURE}${DISLIKE_STOP}`), 1],
    [new RegExp(`i (?:can't|cannot) (?:eat|stand|have|drink|consume) ${FOOD_CAPTURE}${DISLIKE_STOP}`), 1],
    [new RegExp(`i (?:don't|do not) like (?:to )?(?:eat|drink|have|consume) ${FOOD_CAPTURE}${DISLIKE_STOP}`), 1],
    [new RegExp(`i (?:don't|do not) like ${FOOD_CAPTURE}${DISLIKE_STOP}`), 1],
  ];
  for (const [pattern, group] of dislikePatterns) {
    const match = m.match(pattern);
    if (match && match[group]) {
      const rawCapture = match[group].trim();
      // Split on "and", "," to handle multi-food dislikes: "jamun and soyabean"
      const foodCandidates = rawCapture
        .split(/\s*(?:,|\band\b)\s*/)
        .map((f: string) => f.trim().replace(/\s+/g, " "))
        .filter((f: string) => f.length > 1 && f.length < 40);

      const stopWords = ["like","love","eat","have","a","the","my","i","to","and","or","is","are",
        "you","it","this","that","he","she","they","we","chatbot","bot","app","ai","agent","thing","service"];
      for (const foodName of foodCandidates) {
        const firstWord = foodName.split(" ")[0];
        if (stopWords.includes(firstWord)) continue;
        // Normalise using the master alias map — covers all variants
        const normalizedName = applyFoodAlias(foodName);
        // Validate against the real food database before storing — the "X is/are
        // bad" pattern has no food constraint on its own and was matching insults
        // ("you are bad" → stored "you" as a disliked food). Fixed 2026-07-03.
        const dbHit = await db.prepare(`SELECT 1 FROM items WHERE LOWER(name) LIKE ?1 LIMIT 1`)
          .bind(`%${normalizedName}%`).first().catch(() => null);
        if (!dbHit) continue;
        await db.prepare(
          `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'preference' AND fact_key != 'dietary' AND LOWER(fact_key) LIKE ?2`
        ).bind(profileId, `%${normalizedName}%`).run();
        await db.prepare(
          `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
           VALUES (?1, 'dislike', ?2, 'true', 'conversation', datetime('now'))
           ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
           fact_value='true', updated_at=datetime('now')`
        ).bind(profileId, normalizedName).run();
        stored.push(`dislike:${normalizedName}`);
      }
    }
  }

  // ── Likes ──
  // Like patterns — stop at clause boundaries AND prepositions
  // "i like milk in lunch" → captures "milk" only (stops at "in")
  // "i like milk when i get up" → captures "milk" only (stops at "when")
  const CLAUSE_STOP = "(?:\\s*[,!.]|\\s+(?:now|but|and also|however|though|please|in |at |when|during|with|after|before|every|for )|$)";
  // FOOD_CAPTURE declared above (before dislikePatterns) — same scope
  const likePatterns: Array<[RegExp, number]> = [
    [new RegExp(`i (?:love|enjoy|prefer|adore)(?: eating| having| drinking)? ${FOOD_CAPTURE}${CLAUSE_STOP}`), 1],
    [new RegExp(`i like ${FOOD_CAPTURE}${CLAUSE_STOP}`), 1],
    [new RegExp(`i(?:'m| am) (?:a fan of|fond of) ${FOOD_CAPTURE}${CLAUSE_STOP}`), 1],
    [/([a-z][a-z\s]{1,25}?) (?:is|are) (?:my favorite|my favourite|delicious|amazing)/, 1],
  ];
  // Only run likes patterns if message does NOT contain negation near "like"
  const hasNegationBeforeLike = /(?:don't|do not|can't|cannot|never)\s+(?:like|enjoy|eat|have)/i.test(m);
  for (const [pattern, group] of hasNegationBeforeLike ? [] : likePatterns) {
    const match = m.match(pattern);
    if (match && match[group]) {
      const rawCapture = match[group].trim();
      // Split on "and", "," to handle: "i like apple and papaya"
      const foodCandidates = rawCapture
        .split(/\s*(?:,|\band\b)\s*/)
        .map((f: string) => f.trim().replace(/\s+/g, " "))
        .filter((f: string) => f.length > 1 && f.length < 40);

      const stopWords = ["like","love","eat","have","a","the","my","i","to","and","or",
        "you","it","this","that","he","she","they","we","chatbot","bot","app","ai","agent","thing","service"];
      for (const foodName of foodCandidates) {
        const firstWord = foodName.split(" ")[0];
        if (stopWords.includes(firstWord)) continue;
        if (foodName.length > 1 && foodName.length < 40) {
          // Normalise before storing — "panner" → "paneer" so no duplicates
          const normLike = applyFoodAlias(foodName);
          // Validate against the real food database — same fix as the dislike
          // loop above (see comment there). Fixed 2026-07-03.
          const dbHit = await db.prepare(`SELECT 1 FROM items WHERE LOWER(name) LIKE ?1 LIMIT 1`)
            .bind(`%${normLike}%`).first().catch(() => null);
          if (!dbHit) continue;
          await db.prepare(
            `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'dislike' AND LOWER(fact_key) LIKE ?2`
          ).bind(profileId, `%${normLike}%`).run();
          await db.prepare(
            `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
             VALUES (?1, 'preference', ?2, 'like', 'conversation', datetime('now'))
             ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
             fact_value='like', updated_at=datetime('now')`
          ).bind(profileId, normLike).run();
          stored.push(`like:${normLike}`);
        }
      }
    }
  }
  } // end if (!geminiHandledLikeDislikes)

  // ── Dietary preference (always runs) ──
  if (m.includes("vegetarian") || m.match(/\bi am veg\b/) || m.match(/pure veg|strictly veg/)) {
    await db.prepare(
      `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
       VALUES (?1, 'preference', 'dietary', 'vegetarian', 'conversation', datetime('now'))
       ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
       fact_value='vegetarian', updated_at=datetime('now')`
    ).bind(profileId).run();
    stored.push("dietary:vegetarian");
  }
  if (m.includes("vegan")) {
    await db.prepare(
      `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
       VALUES (?1, 'preference', 'dietary', 'vegan', 'conversation', datetime('now'))
       ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
       fact_value='vegan', updated_at=datetime('now')`
    ).bind(profileId).run();
    stored.push("dietary:vegan");
  }
  if (m.match(/non.?veg|i eat meat|i eat chicken|i eat fish/)) {
    await db.prepare(
      `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
       VALUES (?1, 'preference', 'dietary', 'non-vegetarian', 'conversation', datetime('now'))
       ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
       fact_value='non-vegetarian', updated_at=datetime('now')`
    ).bind(profileId).run();
    stored.push("dietary:non-vegetarian");
  }

  // ── Health notes ──
  // Health notes — order matters: more specific patterns first
  const healthChecks: Array<[() => boolean, string]> = [
    [() => /low blood pressure|hypotension|low bp/.test(m), "low blood pressure"],
    [() => /high blood pressure|hypertension|high bp/.test(m), "high blood pressure"],
    [() => /blood pressure/.test(m) && !/low|high/.test(m), "blood pressure condition"],
    [() => /high sugar|blood sugar|sugar level/.test(m), "diabetes"],
    [() => /diabetes|diabetic/.test(m), "diabetes"],
    [() => /thyroid/.test(m), "thyroid condition"],
    [() => /pcos|pcod/.test(m), "PCOS"],
    [() => /cholesterol/.test(m), "high cholesterol"],
    [() => /anemia|anaemia/.test(m), "anemia"],
    [() => /ibs|irritable bowel/.test(m), "IBS"],
    [() => /lactose/.test(m), "lactose intolerance"],
    [() => /gluten/.test(m), "gluten sensitivity"],
  ];
  for (const [check, condition] of healthChecks) {
    if (check()) {
      // Use condition name as fact_key so multiple conditions coexist (not overwrite each other)
      await db.prepare(
        `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
         VALUES (?1, 'health_note', ?2, 'true', 'conversation', datetime('now'))
         ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
         fact_value='true', updated_at=datetime('now')`
      ).bind(profileId, condition).run();
      stored.push(`health:${condition}`);
      // Don't break — store all conditions that match (diabetes + high BP can coexist)
    }
  }

  // ── Allergies ──
  const allergyPatterns = [
    /(?:allergic to|allergy to) ([a-z][a-z\s]{1,25}?)(?:\.|,|$)/,
    /i have (?:an )?allergy (?:to|for) ([a-z][a-z\s]{1,25}?)(?:\.|,|$)/,
    /i am (?:allergic|sensitive) to ([a-z][a-z\s]{1,25}?)(?:\.|,|$)/,
    // Was Gemini-only before the architecture change — now deterministic too.
    /i get sick from ([a-z][a-z\s]{1,25}?)(?:\.|,|$)/,
    /([a-z][a-z\s]{1,25}?) makes me (?:sick|ill)/,
  ];
  for (const allergyPat of allergyPatterns) {
    const allergyMatch = m.match(allergyPat);
    if (allergyMatch?.[1]) {
      const allergen = allergyMatch[1].trim();
      // Skip non-food allergens like "dogs", "cats", "pollen"
      const nonFoodAllergens = ["dog","cat","pollen","dust","pet","animal","bee","insect","latex","mold","mould"];
      const isNonFood = nonFoodAllergens.some(a => allergen.includes(a));
      // DB-validate — same fix as the like/dislike loops above (see comment there)
      const dbHit = isNonFood ? null : await db.prepare(`SELECT 1 FROM items WHERE LOWER(name) LIKE ?1 LIMIT 1`)
        .bind(`%${applyFoodAlias(allergen)}%`).first().catch(() => null);
      if (!isNonFood && dbHit && allergen.length > 1 && allergen.length < 30) {
        await db.prepare(
          `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
           VALUES (?1, 'allergy', ?2, 'true', 'conversation', datetime('now'))
           ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
           fact_value='true', updated_at=datetime('now')`
        ).bind(profileId, applyFoodAlias(allergen)).run();
        stored.push(`allergy:${applyFoodAlias(allergen)}`);
      }
      break;
    }
  }

  // ── Goals ──
  const goalMap: Record<string, string> = {
    "lose weight|weight loss|slim down": "lose weight",
    "gain weight|bulk up|put on weight": "gain weight",
    "build muscle|muscle gain|get stronger": "muscle gain",
    "maintain weight|stay fit": "maintain weight",
    "better energy|more energy|feel energetic": "better energy",
  };
  for (const [pattern, goal] of Object.entries(goalMap)) {
    if (m.match(new RegExp(pattern))) {
      await db.prepare(
        `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
         VALUES (?1, 'goal_update', 'fitness_goal', ?2, 'conversation', datetime('now'))
         ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
         fact_value=?2, updated_at=datetime('now')`
      ).bind(profileId, goal).run();
      stored.push(`goal:${goal}`);
    }
  }

  // ── Lifestyle ──
  if (m.match(/gym|workout|exercise|running|yoga|fitness/)) {
    const freq = m.match(/(\d+)\s*(?:days?|times?)/)?.[1];
    const value = freq ? `active ${freq} days/week` : "physically active";
    await db.prepare(
      `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
       VALUES (?1, 'lifestyle', 'activity', ?2, 'conversation', datetime('now'))
       ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
       fact_value=?2, updated_at=datetime('now')`
    ).bind(profileId, value).run();
    stored.push(`lifestyle:${value}`);
  }

  return stored;
}

// ── PHASE 1: Load all learned facts for a profile ────────────────────────────

async function loadUserFacts(profileId: string, db: D1Database): Promise<{
  dislikes: string[];
  likes: string[];
  dietary: string;
  health_notes: string[];
  allergies: string[];
  goal: string;
  lifestyle: string;
}> {
  const result = await db.prepare(
    `SELECT fact_type, fact_key, fact_value FROM user_facts
     WHERE profile_id = ?1 ORDER BY updated_at DESC LIMIT 50`
  ).bind(profileId).all();

  const facts = result.results as any[];
  const dislikes: string[] = [];
  const likes: string[] = [];
  const health_notes: string[] = [];
  const allergies: string[] = [];
  let dietary = "";
  let goal = "";
  let lifestyle = "";

  for (const f of facts) {
    if (f.fact_type === "dislike") dislikes.push(f.fact_key);
    if (f.fact_type === "preference" && f.fact_key !== "dietary") likes.push(f.fact_key);
    if (f.fact_type === "preference" && f.fact_key === "dietary") dietary = f.fact_value;
    if (f.fact_type === "health_note") health_notes.push(f.fact_key); // fact_key IS the condition name
    if (f.fact_type === "allergy") allergies.push(f.fact_key);
    if (f.fact_type === "goal_update") goal = f.fact_value;
    if (f.fact_type === "lifestyle") lifestyle = f.fact_value;
  }

  return { dislikes, likes, dietary, health_notes, allergies, goal, lifestyle };
}

// ── PHASE 1: Meal logging helpers ────────────────────────────────────────────

function detectMealSlot(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("breakfast") || m.includes("morning")) return "breakfast";
  if (m.includes("lunch") || m.includes("afternoon")) return "lunch";
  if (m.includes("dinner") || m.includes("night") || m.includes("supper")) return "dinner";
  if (m.includes("snack") || m.includes("evening") || m.includes("mid-morning")) return "snack";
  return "meal";
}

// Split a multi-food message into per-meal clauses by finding "in/for/at <slot>"
// markers wherever they occur — NOT by punctuation. This is what makes
// "litchi, milk in breakfast, paneer in lunch" parse the same as
// "litchi, milk in breakfast. paneer in lunch." — commas and periods both
// just separate items; only the slot marker itself defines a boundary.
function splitIntoMealClauses(message: string): Array<{ text: string; slot: string | null }> {
  const m = message.toLowerCase();
  const slotRegex = /\b(?:in|for|at|during)\s+(breakfast|lunch|dinner|supper|snack|morning|afternoon|evening|night|mid-morning)\b/g;
  const clauses: Array<{ text: string; slot: string | null }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = slotRegex.exec(m)) !== null) {
    const text = m.slice(lastIndex, match.index + match[0].length);
    if (text.trim().length > 2) clauses.push({ text, slot: detectMealSlot(match[1]) });
    lastIndex = match.index + match[0].length;
  }
  const rest = m.slice(lastIndex).trim();
  if (rest.length > 2) clauses.push({ text: rest, slot: null });
  return clauses.length ? clauses : [{ text: m, slot: null }];
}

// ── Quantity / serving-size parser ───────────────────────────────────────────
// Converts "3 eggs", "2 glass milk", "1 bowl rice", "100g paneer" → grams
const UNIT_TO_G: Record<string, number> = {
  // weight
  "g": 1, "gram": 1, "grams": 1,
  "kg": 1000, "kilogram": 1000,
  // volume (ml ≈ g for liquids)
  "ml": 1, "milliliter": 1,
  "l": 1000, "litre": 1000, "liter": 1000,
  // common servings
  "glass": 240, "glasses": 240,
  "cup": 240, "cups": 240,
  "bowl": 150, "bowls": 150,
  "plate": 200, "plates": 200,
  "tablespoon": 15, "tbsp": 15,
  "teaspoon": 5, "tsp": 5,
  "handful": 30, "handfuls": 30,
  "piece": 100, "pieces": 100,
  "slice": 30, "slices": 30,
  "roti": 30, "rotis": 30,
  "chapati": 30, "chapatis": 30,
};

// Per-food default unit weights (when no unit specified, e.g. "3 eggs")
const FOOD_UNIT_G: Record<string, number> = {
  "egg": 55, "eggs": 55,
  "banana": 120, "bananas": 120,
  "apple": 180, "apples": 180,
  "mango": 200, "mangoes": 200,
  "orange": 150, "oranges": 150,
  "guava": 100, "guavas": 100,
  "date": 10, "dates": 10,
  "litchi": 15, "lychee": 15,
  "almond": 1, "almonds": 1,
  "walnut": 5, "walnuts": 5,
  "cashew": 3, "cashews": 3,
  "roti": 30, "chapati": 30,
};

function parseAmountG(quantityWord: string, unit: string, foodName: string): number {
  const qty = parseFloat(quantityWord) || 1;
  const unitLower = unit.toLowerCase().trim();
  // Check explicit unit
  if (UNIT_TO_G[unitLower]) return Math.round(qty * UNIT_TO_G[unitLower]);
  // No unit — check food-specific default
  const foodKey = foodName.toLowerCase().trim();
  for (const [key, grams] of Object.entries(FOOD_UNIT_G)) {
    if (foodKey.includes(key)) return Math.round(qty * grams);
  }
  // Default: assume 100g per item
  return Math.round(qty * 100);
}

// Extract food names WITH quantities from a message
// e.g. "3 eggs and 2 glass milk" → [{ name:"egg", amount_g:165 }, { name:"milk", amount_g:480 }]
async function extractFoodsWithAmounts(
  message: string,
  db: D1Database
): Promise<Array<{ name: string; amount_g: number }>> {
  const m = message.toLowerCase();

  // Pattern: (number)? (unit)? (food_name)
  // Match things like: "3 eggs", "2 glass milk", "100g paneer", "a bowl of rice", "some banana"
  // We extract all food items first using the existing extractor, then scan for their quantities
  const rawFoods = await extractFoodsFromText(m, db);
  const result: Array<{ name: string; amount_g: number }> = [];

  for (const foodName of rawFoods) {
    const nameLower = foodName.toLowerCase();
    // Build variants: exact, +s plural, -s singular, common plurals
    const variants = [
      nameLower,
      nameLower + "s",                         // pear → pears
      nameLower.replace(/s$/, ""),              // eggs → egg
      nameLower.replace(/es$/, ""),             // glasses → glass
      nameLower.replace(/oes$/, "o"),           // tomatoes → tomato
    ].filter((v, i, a) => v && a.indexOf(v) === i); // deduplicate

    let amount_g = 100;

    for (const variant of variants) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const unitKeys = Object.keys(UNIT_TO_G).join("|");
      const patterns = [
        // "100g paneer" / "100 grams of milk"
        new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|l|grams?|kilograms?)\\s+(?:of\\s+)?${escaped}`, "i"),
        // "2 glass milk" / "3 glasses of milk" / "1 bowl of curd"
        new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(${unitKeys})\\s+(?:of\\s+)?${escaped}`, "i"),
        // "3 eggs" / "2 pears" (number directly before food, possibly plural)
        new RegExp(`(\\d+)\\s+(?:of\\s+)?${escaped}(?:s|es)?\\b`, "i"),
        // "a bowl of rice" / "a glass of milk"
        new RegExp(`a\\s+(${unitKeys})\\s+(?:of\\s+)?${escaped}`, "i"),
        // food + "100g" (quantity after name)
        new RegExp(`${escaped}\\s+(\\d+(?:\\.\\d+)?)\\s*(g|kg|ml|l|grams?)`, "i"),
      ];

      let matched = false;
      for (const pat of patterns) {
        const match = m.match(pat);
        if (match) {
          const qty = match[1] ?? "1";
          const unitCandidate = match[2] ?? "";
          amount_g = parseAmountG(qty, unitCandidate, foodName);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    result.push({ name: foodName, amount_g });
  }
  return result;
}

async function logMealFromMessage(
  message: string,
  profileId: string,
  db: D1Database,
  sessionId: string = profileId
): Promise<{ logged: string[]; notFound: string[] }> {
  const foodsWithAmounts = await extractFoodsWithAmounts(message, db);
  if (foodsWithAmounts.length === 0) return { logged: [], notFound: [] };

  const mealSlot = detectMealSlot(message);
  const today = getISTDateString();
  const logged: string[] = [];
  const notFound: string[] = [];

  for (const { name: foodName, amount_g } of foodsWithAmounts) {
    const item = await db.prepare(
      `SELECT id FROM items WHERE name LIKE ?1 LIMIT 1`
    ).bind(`%${foodName}%`).first<any>();

    if (item) {
      await db.prepare(
        `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
      ).bind(profileId, sessionId, today, item.id, amount_g, mealSlot).run();
      logged.push(foodName);
    } else {
      notFound.push(foodName);
    }
  }

  return { logged, notFound };
}

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolFoodLookup(db: D1Database, name: string) {
  const item = await db.prepare(
    `SELECT i.*, GROUP_CONCAT(n.name || '::' || in_.amount_per_100g || '::' || n.unit, '|||') AS nutrients
     FROM items i
     LEFT JOIN item_nutrients in_ ON in_.item_id = i.id
     LEFT JOIN nutrients n ON n.id = in_.nutrient_id
     WHERE i.name LIKE ?1
     GROUP BY i.id LIMIT 1`
  ).bind(`%${name}%`).first<any>();

  if (!item) {
    const fallback = await db.prepare(
      `SELECT name FROM items WHERE name LIKE ?1 OR category LIKE ?1 LIMIT 5`
    ).bind(`%${name}%`).all();
    return { found: false, suggestions: fallback.results.map((r: any) => r.name) };
  }

  const nutrients: Record<string, { amount: number; unit: string }> = {};
  if (item.nutrients) {
    for (const part of item.nutrients.split("|||")) {
      const [n, a, u] = part.split("::");
      if (n && a) nutrients[n.trim()] = { amount: parseFloat(a), unit: (u ?? "").trim() };
    }
  }

  const rdaRows = await db.prepare(`SELECT nutrient_name, daily_amount FROM rda`).all();
  const rdaMap: Record<string, number> = {};
  for (const r of rdaRows.results as any[]) rdaMap[r.nutrient_name] = r.daily_amount;

  const nutrientsWithRda = Object.entries(nutrients).map(([n, { amount, unit }]) => ({
    name: n, amount, unit,
    rda_pct: rdaMap[n] ? Math.round((amount / rdaMap[n]) * 100) : null,
  }));

  return {
    found: true,
    id: item.id,
    name: item.name,
    category: item.category,
    calories_per_100g: item.calories_per_100g,
    season: item.season,
    season_label: SEASON_LABELS[item.season] ?? item.season,
    scientific_name: item.scientific_name,
    image_url: item.image_url,
    ritu_note: item.ritu_note,
    nutrients: nutrientsWithRda,
  };
}

async function toolCompareFoods(db: D1Database, food1: string, food2: string, nutrientFilter?: string) {
  const [r1, r2] = await Promise.all([
    toolFoodLookup(db, food1),
    toolFoodLookup(db, food2),
  ]);
  if (!r1.found || !r2.found) {
    return {
      error: `Could not find: ${!r1.found ? food1 : ""}${!r1.found && !r2.found ? " and " : ""}${!r2.found ? food2 : ""}`,
    };
  }

  const n1: Record<string, any> = {};
  const n2: Record<string, any> = {};
  for (const n of r1.nutrients ?? []) n1[n.name] = n;
  for (const n of r2.nutrients ?? []) n2[n.name] = n;

  const allKeys = [...new Set([...Object.keys(n1), ...Object.keys(n2)])];
  const priority = ["Protein", "Fiber", "Iron", "Calcium", "Vitamin C", "Vitamin D",
                    "Magnesium", "Potassium", "Zinc", "Fat", "Carbohydrates"];
  const ordered = [
    ...priority.filter(k => allKeys.includes(k)),
    ...allKeys.filter(k => !priority.includes(k)),
  ];

  const rows = (nutrientFilter
    ? ordered.filter(k => k.toLowerCase() === nutrientFilter.toLowerCase())
    : ordered.slice(0, 14)
  ).map(key => ({
    nutrient: key,
    food1: n1[key] ? { amount: n1[key].amount, unit: n1[key].unit, rda_pct: n1[key].rda_pct } : null,
    food2: n2[key] ? { amount: n2[key].amount, unit: n2[key].unit, rda_pct: n2[key].rda_pct } : null,
  }));

  return {
    food1: { name: r1.name, calories: r1.calories_per_100g, season: r1.season_label },
    food2: { name: r2.name, calories: r2.calories_per_100g, season: r2.season_label },
    comparison: rows,
    nutrient_filter: nutrientFilter ?? null,
  };
}

// ── PHASE 4.2: Ingredient swap engine ────────────────────────────────────────
// "I don't have spinach, what can I use instead?" → same-season alternatives
// with a similar nutrient profile. Module scope — never nested (Workers rule).
async function findIngredientSwap(
  foodName: string,
  db: D1Database,
  season: string,
  dislikes: string[] = [],
  isVegUser = false
): Promise<Array<{ food: string; shared_nutrient: string; amount: number; unit: string }>> {
  // 1. Get original food's top 3 nutrients (by % RDA)
  const original: any = await toolFoodLookup(db, foodName);
  if (!original.found) return [];

  const topNutrients: string[] = (original.nutrients ?? [])
    .slice()
    .sort((a: any, b: any) => (b.rda_pct ?? 0) - (a.rda_pct ?? 0))
    .slice(0, 3)
    .map((n: any) => n.name as string);

  // 2. Find foods rich in those nutrients, same season (or all-season)
  const NONVEG = ["chicken breast", "salmon", "egg"];
  const alternatives: Array<{ food: string; shared_nutrient: string; amount: number; unit: string }> = [];
  for (const nutrient of topNutrients) {
    const rich: any = await toolGetNutrientRichFoods(db, nutrient, season, 6);
    for (const f of rich.foods ?? []) {
      const fn = (f.name ?? "").toLowerCase();
      if (fn === foodName.toLowerCase()) continue;
      if (dislikes.some(d => d && fn.includes(d.toLowerCase()))) continue;
      if (isVegUser && NONVEG.some(nv => fn.includes(nv))) continue;
      alternatives.push({ food: f.name, shared_nutrient: nutrient, amount: f.amount, unit: f.unit });
    }
  }

  // 3. Deduplicate (first occurrence keeps the highest-priority nutrient) and take top 3
  return [...new Map(alternatives.map(a => [a.food, a])).values()].slice(0, 3);
}

// Filter a food list against the user's dislikes and dietary preference (module scope)
function filterFoodsForUser(
  foods: any[],
  userFacts: { dislikes: string[]; dietary: string } | null
): any[] {
  if (!userFacts) return foods;
  const isVegU = userFacts.dietary === "vegetarian" || userFacts.dietary === "vegan" || userFacts.dietary === "jain";
  const NONVEG = ["chicken breast", "salmon", "egg"];
  return foods.filter((f: any) => {
    const n = (f.name ?? "").toLowerCase();
    if (isVegU && NONVEG.some(nv => n.includes(nv))) return false;
    if (userFacts.dislikes.some(d => d && n.includes(d.toLowerCase()))) return false;
    return true;
  });
}

async function toolGetSeasonalFoods(db: D1Database, season: string, category?: string, limit = 12) {
  let q = `SELECT i.id, i.name, i.category, i.calories_per_100g, i.season, i.image_url
           FROM items i WHERE (i.season = ?1 OR i.season = 'all')`;
  const binds: any[] = [season];
  if (category) { q += ` AND i.category = ?2`; binds.push(category); }
  q += ` ORDER BY i.category, i.name LIMIT ${limit}`;
  const result = await db.prepare(q).bind(...binds).all();
  return { season, season_label: SEASON_LABELS[season] ?? season, foods: result.results };
}

async function toolGetNutrientRichFoods(db: D1Database, nutrient: string, season?: string, limit = 8) {
  const nut = await db.prepare(`SELECT id FROM nutrients WHERE name LIKE ?1`).bind(`%${nutrient}%`).first<any>();
  if (!nut) return { error: `Nutrient "${nutrient}" not found`, nutrient };

  let q = `SELECT i.name, i.category, i.season, in_.amount_per_100g as amount, n.unit
           FROM item_nutrients in_
           JOIN items i ON i.id = in_.item_id
           JOIN nutrients n ON n.id = in_.nutrient_id
           WHERE in_.nutrient_id = ?1`;
  const binds: any[] = [nut.id];
  if (season && season !== "all") { q += ` AND (i.season = ?2 OR i.season = 'all')`; binds.push(season); }
  q += ` ORDER BY in_.amount_per_100g DESC LIMIT ${limit}`;

  const result = await db.prepare(q).bind(...binds).all();
  const rda = await db.prepare(`SELECT daily_amount, unit FROM rda WHERE nutrient_name LIKE ?1`).bind(`%${nutrient}%`).first<any>();

  return {
    nutrient,
    rda: rda ? { daily_amount: rda.daily_amount, unit: rda.unit } : null,
    season_filter: season ?? null,
    foods: result.results,
  };
}

// PHASE 1 ENHANCED: Diet plan now respects dislikes from user_facts
// ── Diet plan helpers — module level (NOT inside async functions) ─────────────
// Cloudflare Workers V8 strict mode: function declarations inside async
// functions are unreliable. All helpers live at module scope.

function dietRng<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dietSeq(arr: string[], n: number): string[] {
  if (!arr.length) return Array(n).fill("seasonal food");
  const out: string[] = [];
  let sh = dietRng(arr);
  let i = 0;
  while (out.length < n) {
    out.push(sh[i % sh.length]);
    i++;
    if (i % sh.length === 0) sh = dietRng(arr);
  }
  return out;
}

function dietPickSeq(
  s: string[], d: number, usedToday: Set<string>, fallback: string[]
): string {
  const first = s[d];
  if (!usedToday.has(first)) { usedToday.add(first); return first; }
  for (const name of dietRng([...fallback])) {
    if (!usedToday.has(name)) { usedToday.add(name); return name; }
  }
  usedToday.add(first);
  return first;
}

async function dietFetchCat(
  db: D1Database,
  cat: string,
  seasonForSQL: string,
  dislikeClause: string,
  dislikedFuzzy: string[],
  strictSeason = false  // when true: ONLY current season + all-season foods
): Promise<string[]> {
  // strictSeason=true: used when user explicitly asks for a specific season's plan
  // e.g. 'Build a monsoon diet plan' → only monsoon + all-season foods
  const seasonFilter = strictSeason
    ? `AND (season = '${seasonForSQL}' OR season = 'all')`
    : "";
  const q = `SELECT name FROM items
     WHERE category = '${cat}'
     ${seasonFilter}
     ${dislikeClause}
     ORDER BY
       CASE season
         WHEN '${seasonForSQL}' THEN 0
         WHEN 'all'             THEN 1
         ELSE                       2
       END,
       RANDOM()
     LIMIT 30`;
  const rows = dislikedFuzzy.length > 0
    ? await db.prepare(q).bind(...dislikedFuzzy).all()
    : await db.prepare(q).all();
  return (rows.results as any[]).map((r: any) => r.name as string);
}


async function toolBuildDietPlan(
  db: D1Database,
  profile: Profile | null,
  season: string,
  goal?: string,
  days = 1,
  dislikedFoods: string[] = []
) {
  const effectiveGoal = goal || profile?.goal || "balanced";
  const isVeg  = profile?.dietary_preference === "vegetarian"
               || profile?.dietary_preference === "vegan";
  const isMale   = (profile?.sex ?? "").toLowerCase() === "male";
  const weightKg = profile?.weight_kg ?? (isMale ? 70 : 60);
  const heightCm = profile?.height_cm ?? (isMale ? 170 : 160);
  const age      = profile?.age       ?? 25;

  // Mifflin-St Jeor BMR → TDEE
  const bmr = isMale
    ? 10 * weightKg + 6.25 * heightCm - 5 * age + 5
    : 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  const actMult: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  };
  const tdee = Math.round(bmr * (actMult[profile?.activity_level ?? "sedentary"] ?? 1.2));

  let targetCal = tdee;
  if (effectiveGoal.includes("lose") || effectiveGoal.includes("weight loss"))
    targetCal = Math.max(tdee - 500, 1200);
  else if (effectiveGoal.includes("gain") || effectiveGoal.includes("increase") || effectiveGoal.includes("muscle"))
    targetCal = tdee + 400;

  const proteinG = Math.round(weightKg * (effectiveGoal.includes("muscle") ? 2.0 : 1.4));
  const fatG     = Math.round(targetCal * 0.28 / 9);
  const carbG    = Math.round((targetCal - proteinG * 4 - fatG * 9) / 4);

  const mealCal = {
    breakfast:   Math.round(targetCal * 0.25),
    mid_morning: Math.round(targetCal * 0.10),
    lunch:       Math.round(targetCal * 0.35),
    evening:     Math.round(targetCal * 0.10),
    dinner:      Math.round(targetCal * 0.20),
  };

  // Dislike normalisation
  const SMAP: Record<string, string> = {
    soyabean:"soybean", "soya bean":"soybean", soya:"soybean",
    brinjal:"eggplant", karela:"bitter gourd", palak:"spinach",
  };
  const rawD  = dislikedFoods.map(d => d.toLowerCase().trim());
  const normD = [...new Set([...rawD, ...rawD.map(d => SMAP[d] ?? d)])];
  const dFuzzy = normD.map(d => `%${d}%`);

  // Dislike SQL clause — ?1, ?2... mapped to dFuzzy array
  const dClause = dFuzzy.length > 0
    ? "AND " + dFuzzy.map((_, i) => `LOWER(name) NOT LIKE ?${i + 1}`).join(" AND ")
    : "";

  const cs = getCurrentSeason();
  const sqlSeason = (season === "all" || !season) ? cs : season;

  // Fetch all categories — using module-level dietFetchCat (no nested async fn)
  // Use strict season filtering when user specifies a season
  // But if strict mode yields too few fruits/veggies, fall back to include all-season
  const strictMode = season !== "all" && !!season;
  let [fruits, veggies, grains, dals, dairy, nuts, meats] = await Promise.all([
    dietFetchCat(db, "fruit",     sqlSeason, dClause, dFuzzy, strictMode),
    dietFetchCat(db, "vegetable", sqlSeason, dClause, dFuzzy, strictMode),
    dietFetchCat(db, "grain",     sqlSeason, dClause, dFuzzy, strictMode),
    dietFetchCat(db, "legume",    sqlSeason, dClause, dFuzzy, false),
    dietFetchCat(db, "dairy",     sqlSeason, dClause, dFuzzy, false),
    dietFetchCat(db, "nut",       sqlSeason, dClause, dFuzzy, false),
    isVeg ? Promise.resolve([] as string[]) : dietFetchCat(db, "protein", sqlSeason, dClause, dFuzzy, false),
  ]);
  // If strict mode yields < 3 unique fruits or veggies, fall back to non-strict
  // Strict mode fallback: if < 3 seasonal items, ADD all-season items only
  // NEVER pull other-season foods — that breaks the seasonal integrity
  if (strictMode && fruits.length < 3) {
    // Only add items with season='all' that aren't already in the list
    const fruitFallbackQ = db.prepare(
      `SELECT name FROM items WHERE category='fruit' AND season='all' ${dClause} ORDER BY RANDOM() LIMIT 10`
    );
    const allSeasonFruits = await (dFuzzy.length ? fruitFallbackQ.bind(...dFuzzy) : fruitFallbackQ).all()
      .catch(() => ({ results: [] as any[] }));
    const allFruits = (allSeasonFruits.results as any[]).map((r: any) => r.name as string);
    fruits = [...new Set([...fruits, ...allFruits])];
  }
  if (strictMode && veggies.length < 3) {
    const vegFallbackQ = db.prepare(
      `SELECT name FROM items WHERE category='vegetable' AND season='all' ${dClause} ORDER BY RANDOM() LIMIT 10`
    );
    const allSeasonVegs = await (dFuzzy.length ? vegFallbackQ.bind(...dFuzzy) : vegFallbackQ).all()
      .catch(() => ({ results: [] as any[] }));
    const allVegs = (allSeasonVegs.results as any[]).map((r: any) => r.name as string);
    veggies = [...new Set([...veggies, ...allVegs])];
  }

  const F  = fruits.length  ? fruits  : ["Banana", "Apple", "Guava", "Mango", "Papaya"];
  const V  = veggies.length ? veggies : ["Spinach", "Carrot", "Broccoli", "Tomato", "Onion"];
  const G  = grains.length  ? grains  : ["Oats", "Brown Rice", "Bajra", "Jowar", "Wheat"];
  const D  = dals.length    ? dals    : ["Lentils", "Moong Dal", "Chickpeas", "Rajma"];
  const Da = dairy.length   ? dairy   : ["Curd", "Milk", "Paneer"];
  const N  = nuts.length    ? nuts    : ["Almonds", "Walnuts", "Peanuts", "Sesame Seeds"];
  const M  = meats.length   ? meats   : [];

  // Professional meal structure — 5 meals, every slot different pool
  // Breakfast:   Fruit + Grain + Dairy    (~25% kcal)
  // Mid-morning: Fruit + Nut              (~10% kcal)
  // Lunch:       Veg + Legume + Grain     (~35% kcal) + curd raita side
  // Evening:     Fruit + Nut              (~10% kcal)
  // Dinner:      Veg + Protein + Grain    (~20% kcal)
  const numDays = Math.max(days, 1);
  const protSource = isVeg ? D : (M.length > 0 ? M : D);

  const sBkF = dietSeq(F,  numDays);
  const sBkG = dietSeq(G,  numDays);
  const sBkD = dietSeq(Da, numDays);
  const sMmF = dietSeq(F,  numDays);
  const sMmN = dietSeq(N,  numDays);
  const sLuV = dietSeq(V,  numDays);
  const sLuD = dietSeq(D,  numDays);
  const sLuG = dietSeq(G,  numDays);
  const sEvF = dietSeq(F,  numDays);
  const sEvN = dietSeq(N,  numDays);
  const sDiV = dietSeq(V,  numDays);
  const sDiP = dietSeq(protSource, numDays);
  const sDiG = dietSeq(G,  numDays);

  const plan = [];
  for (let d = 0; d < numDays; d++) {
    const used = new Set<string>();

    const bkFruit = dietPickSeq(sBkF, d, used, F);
    const bkGrain = dietPickSeq(sBkG, d, used, G);
    const bkDairy = dietPickSeq(sBkD, d, used, Da);

    const mmFruit = dietPickSeq(sMmF, d, used, F);
    const mmNut   = dietPickSeq(sMmN, d, used, N);

    const luVeg   = dietPickSeq(sLuV, d, used, V);
    const luDal   = dietPickSeq(sLuD, d, used, D);
    const luGrain = dietPickSeq(sLuG, d, used, G);
    const luSide  = Da.find((name: string) => !used.has(name)) ?? "";
    if (luSide) used.add(luSide);

    const evFruit = dietPickSeq(sEvF, d, used, F);
    const evNut   = dietPickSeq(sEvN, d, used, N);

    const diVeg   = dietPickSeq(sDiV, d, used, V);
    const diProt  = dietPickSeq(sDiP, d, used, protSource);
    const diGrain = dietPickSeq(sDiG, d, used, G);

    plan.push({
      day: d + 1,
      day_label: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][d % 7],
      calorie_target: targetCal,
      calorie_estimate: targetCal,
      meals: {
        breakfast:   { foods: [bkFruit, bkGrain, bkDairy],
                       note: `~${mealCal.breakfast} kcal · Fruit + whole grain + dairy` },
        mid_morning: { foods: [mmFruit, mmNut],
                       note: `~${mealCal.mid_morning} kcal · Fruit + healthy fat` },
        lunch:       { foods: luSide ? [luVeg, luDal, luGrain, luSide] : [luVeg, luDal, luGrain],
                       note: `~${mealCal.lunch} kcal · Veg + legume protein + complex carbs${luSide ? " + probiotic" : ""}` },
        evening:     { foods: [evFruit, evNut],
                       note: `~${mealCal.evening} kcal · Light energy boost` },
        dinner:      { foods: [diVeg, diProt, diGrain],
                       note: `~${mealCal.dinner} kcal · Light veg + protein + grain` },
      },
    });
  }

  return {
    profile_used:   !!profile,
    goal:           effectiveGoal,
    season,
    season_label:   SEASON_LABELS[season] ?? season,
    calorie_target: targetCal,
    macro_targets:  { protein_g: proteinG, fat_g: fatG, carb_g: carbG },
    vegetarian:     isVeg,
    excluded_foods: dislikedFoods,
    days:           plan,
    note: "All quantities approximate at 100g per food item. Adjust portions to your calorie target.",
  };
}


async function toolAnalyzeIntake(
  db: D1Database,
  foods: string[],
  profile: Profile | null,
  // Optional: amounts in grams for each food (same order as foods array)
  amounts_g?: number[]
) {
  const totals: Record<string, { amount: number; unit: string }> = {};
  let totalCal = 0;
  const foundFoods: string[] = [];
  const notFound: string[] = [];

  for (let i = 0; i < foods.length; i++) {
    const foodName = foods[i];
    const amtG = amounts_g?.[i] ?? 100;  // default 100g if no amount provided
    const scaleFactor = amtG / 100;       // nutrients are per 100g in DB
    const r = await toolFoodLookup(db, foodName);
    if (!r.found) { notFound.push(foodName); continue; }
    foundFoods.push(r.name!);
    totalCal += (r.calories_per_100g! * scaleFactor); // scale by actual amount
    for (const n of r.nutrients ?? []) {
      if (!totals[n.name]) totals[n.name] = { amount: 0, unit: n.unit };
      totals[n.name].amount += n.amount * scaleFactor; // scale nutrients too
    }
  }

  const rdaRows = await db.prepare(`SELECT nutrient_name, daily_amount, unit FROM rda`).all();
  const rdaMap: Record<string, { daily: number; unit: string }> = {};
  for (const r of rdaRows.results as any[]) rdaMap[r.nutrient_name] = { daily: r.daily_amount, unit: r.unit };

  const analysis = Object.entries(totals).map(([name, { amount, unit }]) => {
    const rda = rdaMap[name];
    const pct = rda ? Math.round((amount / rda.daily) * 100) : null;
    return { name, amount: Math.round(amount * 10) / 10, unit, rda_pct: pct,
             status: pct === null ? "no-rda" : pct >= 80 ? "good" : pct >= 40 ? "low" : "deficient" };
  }).sort((a, b) => (a.rda_pct ?? 999) - (b.rda_pct ?? 999));

  const deficiencies = analysis.filter(n => n.status === "deficient").map(n => n.name);
  const tdee = profile ? computeTdee(profile) : null;

  return {
    foods_analysed: foundFoods,
    foods_not_found: notFound,
    total_calories: totalCal,
    calorie_target: tdee,
    calorie_pct: tdee ? Math.round((totalCal / tdee) * 100) : null,
    nutrients: analysis,
    deficiencies,
    note: "Estimates assume 100g of each food. Actual portions may differ.",
  };
}

// ── Gemini 2.5 Flash-Lite — Route 9 fallback ─────────────────────────────────

async function callGeminiFlash(
  message: string,
  systemPrompt: string,
  apiKey: string,
  history: Array<{ role: string; content: string }> = []
): Promise<string> {
  const contents = [
    ...history.map(h => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const body = JSON.stringify({
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: 400, temperature: 0.3 },
  });

  // Model cascade: try Flash-Lite first, fall back to gemini-2.0-flash if rate-limited
  // Short waits only — Cloudflare Workers have a 30s CPU limit, 6s sleep wastes it
  const MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite",   // fallback — separate quota pool
  ];

  for (const model of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (resp.status === 429 || resp.status === 503) {
        if (attempt === 0) {
          // Short wait only — 6s was too long and risked Worker CPU timeout
          // 429: wait 1.5s then retry same model once; if still 429, try next model
          // 503: wait 800ms then retry
          const waitMs = resp.status === 429 ? 1500 : 800;
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        // Both attempts failed on this model — try the next one
        break;
      }

      if (!resp.ok) {
        console.error(`Gemini ${model} error:`, resp.status);
        break; // try next model
      }

      const data = await resp.json() as any;
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
      // Guard: reject JSON blobs — all nutrition data must come from D1
      if (text.startsWith("{") || text.startsWith("[") || text.includes('"name":')) return "";
      return text;
    } // end attempt loop
  } // end model loop

  return "";
}

// ── PHASE 1: Enriched system prompt with learned facts ───────────────────────

function buildSystemPrompt(profile: Profile | null, context: AgentContext): string {
  const bmiInfo = profile ? computeBmi(profile) : null;
  const tdee    = profile ? computeTdee(profile) : null;

  return `You are NutriMentor AI — a warm, knowledgeable, and trustworthy nutrition companion built for India.
You are grounded in real food data from a structured database. You NEVER make up nutrition facts.

Your personality:
- Warm and conversational, like a knowledgeable friend who happens to be a nutritionist
- Direct and clear — give the answer first, then explain if needed
- Honest about what you don't know or what falls outside your scope
- Never dismissive — every question deserves a thoughtful response

Your expertise:
- Indian seasonal nutrition based on the 6 Ritu seasons (Vasanta, Grishma, Varsha, Sharad, Hemanta, Shishira)
- Practical diet guidance grounded in ICMR-NIN recommendations
- Ayurvedic food principles — Pitta, Vata, Kapha in relation to seasons
- BMI, calorie estimation, and goal-based diet planning
- Nutrient deficiency identification and food-based solutions

Database coverage: 57 Indian foods across all 6 Ritu seasons with 19 nutrients each.

${profile ? `
User profile:
- Name: ${profile.name ?? "not set"}
- Age: ${profile.age ?? "not set"}, Sex: ${profile.sex ?? "not set"}
- Height: ${profile.height_cm ? profile.height_cm + " cm" : "not set"}, Weight: ${profile.weight_kg ? profile.weight_kg + " kg" : "not set"}
- Goal: ${profile.goal ?? "not set"}
- Activity: ${profile.activity_level ?? "moderate"}
- Diet preference: ${profile.dietary_preference ?? "not set"}
- Allergies: ${profile.allergies?.join(", ") || "none"}
${bmiInfo ? `- BMI: ${bmiInfo.bmi} (${bmiInfo.label})` : ""}
${tdee ? `- Daily calorie estimate: ~${tdee} kcal` : ""}
` : "No profile set yet. Encourage the user to fill in their profile for personalised guidance."}

${context.current_item ? `
Currently selected food: ${context.current_item.name} (${context.current_item.season})
When the user says "this", "it", "this food", they mean ${context.current_item.name}.
` : "No food currently selected."}

Current season: ${context.current_season ? SEASON_LABELS[context.current_season] ?? context.current_season : "not set"}

Identity rules (CRITICAL — never break these):
- You are NutriMentor AI, created by Pratyaksh Agrawal. You are NOT any other AI.
- If asked "who made you", "who built you", "are you ChatGPT/Gemini/Bard/Claude" → say "I'm NutriMentor AI, built by Pratyaksh Agrawal to help with Indian seasonal nutrition."
- NEVER say you are "trained by Google", "made by OpenAI", or any other company. You are NutriMentor AI.
- NEVER reveal the underlying model or technology stack.

Safety rules:
- For medical conditions, give general food guidance and add: "Please consult your doctor or dietitian."
- Never claim to cure or treat any disease
- Do not give specific medication advice

IMPORTANT: Respond in plain conversational text only. No JSON, no code blocks.

Agent behaviour rules — you are an AGENT, not a chatbot:
- You remember everything learned about the user. Reference it proactively.
- When a user selects a food, you know about it. Use it in your answer.
- When you know their goal/health/dislikes, weave them into every response.
- If you can infer what they need, do it — don't ask unnecessary clarifying questions.
- Give complete, actionable answers. Don't just say "it depends".
- If they ask a question about food, give a direct answer first, then explain.
- Never repeat information you already told the user in the same session.
- Sound like a knowledgeable friend, not a search engine.

Today is a great day to eat well.`;
}

async function buildSystemPromptWithFacts(
  profile: Profile | null,
  context: AgentContext,
  db: D1Database,
  profileId: string
): Promise<string> {
  const base = buildSystemPrompt(profile, context);

  const facts = await db.prepare(
    `SELECT fact_type, fact_key, fact_value FROM user_facts
     WHERE profile_id = ?1 ORDER BY updated_at DESC LIMIT 30`
  ).bind(profileId).all();

  if (!facts.results.length) return base;

  const factLines = (facts.results as any[]).map(f => {
    if (f.fact_type === "dislike")     return `- Dislikes: ${f.fact_key}`;
    if (f.fact_type === "preference" && f.fact_key === "dietary") return `- Dietary preference: ${f.fact_value}`;
    if (f.fact_type === "preference")  return `- Likes: ${f.fact_key}`;
    if (f.fact_type === "health_note") return `- Health condition: ${f.fact_key}`; // fact_key is condition name
    if (f.fact_type === "allergy")     return `- Allergic to: ${f.fact_key}`;
    if (f.fact_type === "goal_update") return `- Fitness goal: ${f.fact_value}`;
    if (f.fact_type === "lifestyle")   return `- Lifestyle: ${f.fact_value}`;
    return null;
  }).filter(Boolean).join("\n");

  // Also inject today's meal log summary so Gemini knows what they ate
  let todayMealContext = "";
  try {
    const today = getISTDateString();
    const todayLogs = await db.prepare(
      `SELECT i.name, ml.meal_slot FROM meal_logs ml JOIN items i ON i.id = ml.item_id
       WHERE ml.session_id = ?1 AND ml.logged_date = ?2 ORDER BY ml.created_at ASC LIMIT 8`
    ).bind(profileId, today).all();
    if (todayLogs.results.length > 0) {
      const mealLines = (todayLogs.results as any[]).map(l => `${l.meal_slot}: ${l.name}`).join(", ");
      todayMealContext = `\n\nToday's logged meals: ${mealLines}`;
    }
  } catch { /* non-fatal */ }

  // Inject session summary (rolling notes from this session)
  // This gives the agent memory of what happened earlier in the current chat
  let sessionSummary = "";
  try {
    // We pass sessionId via a closure trick — it's set as a KV key
    // The summary is updated after every exchange
    // Note: sessionId not available here directly, so we look it up via profileId
    // This is best-effort; the main memory is in user_facts
  } catch { /* non-fatal */ }

  const systemParts = [
    base,
    `\n\nWhat I know about this user from our conversations:\n${factLines}`,
    `\n\nAlways use these learned preferences when giving advice. Never suggest foods the user has said they dislike.`,
    todayMealContext,
    sessionSummary,
  ];
  return systemParts.join("");
}

// ── Unit cleaner ──────────────────────────────────────────────────────────────

function cleanUnit(unit: string): string {
  if (!unit) return "";
  return unit.replace(/Â/g, "").replace(/Âµ/g, "µ").replace(/\u00c2\u00b5/g, "µ").replace(/ug$/i, "µg").trim();
}

// ── Direct response builder ───────────────────────────────────────────────────

function buildDirectResponse(toolName: string, result: any, userMessage: string): string {
  if (result.error) {
    return `I couldn't find that in my database. ${result.suggestions?.length ? `Did you mean: ${result.suggestions.join(", ")}?` : "Try a different food name."}`;
  }

  if (toolName === "food_lookup" && result.found) {
    const msgL = userMessage.toLowerCase();
    const specificNutrient = (result.nutrients ?? []).find((n: any) =>
      msgL.includes(n.name.toLowerCase()) ||
      (msgL.includes("vitamin c") && n.name === "Vitamin C") ||
      (msgL.includes("protein") && n.name === "Protein") ||
      (msgL.includes("iron") && n.name === "Iron") ||
      (msgL.includes("calcium") && n.name === "Calcium") ||
      ((msgL.includes("calorie") || msgL.includes("energy")) && n.name === "Calories")
    );

    if (specificNutrient) {
      const unit = cleanUnit(specificNutrient.unit);
      const rdaNote = specificNutrient.rda_pct ? ` — that's **${specificNutrient.rda_pct}%** of the daily recommended amount` : "";
      return `**${result.name}** has **${specificNutrient.amount} ${unit}** of ${specificNutrient.name} per 100g${rdaNote}.`;
    }

    const top = (result.nutrients ?? []).slice(0, 5).map((n: any) =>
      `${n.name} ${n.amount}${cleanUnit(n.unit)}${n.rda_pct ? ` (${n.rda_pct}% RDA)` : ""}`
    ).join(", ");
    return `**${result.name}** is a ${result.category} with **${result.calories_per_100g} kcal** per 100g. Best in ${result.season_label}. Key nutrients: ${top}.${result.ritu_note ? `\n\n${result.ritu_note}` : ""}`;
  }

  if (toolName === "compare_foods" && result.food1 && result.food2) {
    const calLine = `**${result.food1.name}** has ${result.food1.calories} kcal/100g vs **${result.food2.name}** with ${result.food2.calories} kcal/100g.`;
    const topRows = (result.comparison ?? []).slice(0, 3).map((row: any) => {
      const v1 = row.food1 ? `${row.food1.amount}${cleanUnit(row.food1.unit)}` : "—";
      const v2 = row.food2 ? `${row.food2.amount}${cleanUnit(row.food2.unit)}` : "—";
      return `${row.nutrient}: ${result.food1.name} ${v1} · ${result.food2.name} ${v2}`;
    }).join("\n");
    return `${calLine}\n\n${topRows}`;
  }

  if (toolName === "get_seasonal_foods" && result.foods?.length) {
    const list = result.foods.slice(0, 6).map((f: any) => `**${f.name}** (${f.calories_per_100g} kcal)`).join(", ");
    return `Good foods for ${result.season_label}: ${list}.`;
  }

  if (toolName === "get_nutrient_rich_foods" && result.foods?.length) {
    const list = result.foods.slice(0, 5).map((f: any) => `**${f.name}** (${f.amount} ${cleanUnit(f.unit)})`).join(", ");
    return `Best sources of ${result.nutrient}${result.season_filter ? ` in ${SEASON_LABELS[result.season_filter] ?? result.season_filter}` : ""}: ${list}.${result.rda ? ` Daily RDA is ${result.rda.daily_amount} ${cleanUnit(result.rda.unit)}.` : ""}`;
  }

  if (toolName === "build_diet_plan" && result.days?.length) {
    const excludeNote = result.excluded_foods?.length ? `\n\n_(Excluded your dislikes: ${result.excluded_foods.join(", ")})_` : "";
    const goalNote = "";

    if (result.days.length === 1) {
      // Single day plan
      const d = result.days[0];
      const m = d.meals;
      const macros = result.macro_targets
        ? ` · Targets: ${result.macro_targets.protein_g}g protein, ${result.macro_targets.carb_g}g carbs, ${result.macro_targets.fat_g}g fat`
        : "";
      return `**Day plan for ${result.season_label}** (~${result.calorie_target} kcal/day${macros})\n\n🌅 **Breakfast** (~${Math.round(result.calorie_target * 0.25)} kcal): ${m.breakfast?.foods?.join(" + ")}\n🍎 **Mid-morning** (~${Math.round(result.calorie_target * 0.10)} kcal): ${m.mid_morning?.foods?.join(" + ")}\n🍱 **Lunch** (~${Math.round(result.calorie_target * 0.35)} kcal): ${m.lunch?.foods?.join(" + ")}\n🫖 **Evening** (~${Math.round(result.calorie_target * 0.10)} kcal): ${m.evening?.foods?.join(" + ")}\n🌙 **Dinner** (~${Math.round(result.calorie_target * 0.20)} kcal): ${m.dinner?.foods?.join(" + ")}\n\n${result.note}${excludeNote}`;
    } else {
      // Multi-day plan — show all days
      const dayLines = result.days.map((d: any) => {
        const m = d.meals;
        return `**${d.day_label}**\n🌅 ${m.breakfast?.foods?.join(" + ")}\n🍎 ${m.mid_morning?.foods?.join(" + ")}\n🍱 ${m.lunch?.foods?.join(" + ")}\n🫖 ${m.evening?.foods?.join(" + ")}\n🌙 ${m.dinner?.foods?.join(" + ")}`;
      }).join("\n\n");
      const macrosW = result.macro_targets
        ? ` | Targets: ${result.macro_targets.protein_g}g protein · ${result.macro_targets.carb_g}g carbs · ${result.macro_targets.fat_g}g fat`
        : "";
      return `**${result.days.length}-day plan for ${result.season_label}** (~${result.calorie_target} kcal/day${macrosW})\n\n${dayLines}\n\n${result.note}${excludeNote}`;
    }
  }

  if (toolName === "analyze_intake" && result.foods_analysed?.length) {
    const defStr = result.deficiencies?.length
      ? `You may be low on: **${result.deficiencies.join(", ")}**.`
      : "Good overall intake!";
    const calStr = result.calorie_target
      ? ` Daily calorie target: ~${result.calorie_target} kcal (you had ~${result.calorie_pct}% today).`
      : "";
    return `Analysed: ${result.foods_analysed.join(", ")}. Total: **~${result.total_calories} kcal**.${calStr}\n\n${defStr}${result.foods_not_found?.length ? `\n\nCouldn't find in database: ${result.foods_not_found.join(", ")}.` : ""}`;
  }

  return "I found the data but had trouble formatting a response. Try rephrasing your question.";
}

// ── Symptom map ───────────────────────────────────────────────────────────────

const SYMPTOM_MAP: Record<string, string> = {
  "fever":        "For fever, eat light and cooling foods: coconut water, watermelon, curd, moong dal, and fresh fruits. Avoid heavy or oily food. Stay well hydrated. See a doctor if fever persists.",
  "cold":         "For a cold, try ginger tea with honey, turmeric milk, warm soups, and amla or citrus fruits for Vitamin C. Avoid cold drinks and raw foods.",
  "cough":        "For cough, try honey with warm water, ginger-turmeric tea, and steam-cooked vegetables. Avoid dairy and fried foods when symptoms are active.",
  "headache":     "Stay hydrated first. Magnesium-rich foods like almonds, spinach, and banana may help. Ginger tea can ease tension headaches.",
  "dizziness":    "Dizziness often signals low blood sugar or dehydration. Try a banana, dates, or coconut water. Eat small, frequent meals.",
  "nausea":       "Eat small, bland meals: rice, banana, curd, or ginger water. Avoid spicy or strong-smelling foods.",
  "vomit":        "After vomiting, rest 30 minutes, then try small sips of coconut water or ORS. Start with rice, curd, or banana when ready.",
  "weakness":     "For weakness, eat iron-rich foods (spinach, lentils, dates), protein (eggs, paneer, moong dal), and pair with Vitamin C to improve iron absorption.",
  "constipation": "Increase fibre: papaya, guava, sweet potato, oats, and a glass of warm water each morning. Avoid refined foods.",
  "acidity":      "Try cold milk, curd, banana, coconut water, or cucumber. Avoid spicy and fried foods when symptoms are active.",
  "bloating":     "Try fennel water, ginger tea, curd, and cooked vegetables. Eat slowly and avoid carbonated drinks.",
  "anemia":       "Focus on iron-rich foods: spinach, lentils, dates, sesame seeds, bajra, and amla. Pair with Vitamin C sources for better iron absorption.",
  "diabetes":     "Focus on low-GI foods: bitter gourd, fenugreek, oats, brown rice, and non-starchy vegetables. Limit refined carbs. Always follow your doctor's guidance.",
  "sick":         "Choose light, easy-to-digest foods: rice porridge, moong dal, curd, banana, or soups. Stay hydrated. See a doctor if symptoms persist.",
  "tired":        "For fatigue, try iron-rich foods (spinach, dates, bajra), Vitamin B6 sources (banana, oats), and stay well hydrated.",
  "stress":       "Magnesium-rich foods like almonds and spinach may help with stress. Curd, and green vegetables are also good choices.",
};

// ── Food name extraction ──────────────────────────────────────────────────────

async function findFoodInMessage(msg: string, db: D1Database): Promise<{ name: string } | null> {
  const allFoods = await db.prepare(`SELECT name FROM items ORDER BY LENGTH(name) DESC`).all();
  for (const row of allFoods.results as any[]) {
    if (msg.includes(row.name.toLowerCase())) return { name: row.name };
  }
  return null;
}

async function findSecondFoodInMessage(msg: string, excludeName: string, db: D1Database): Promise<{ name: string } | null> {
  const allFoods = await db.prepare(`SELECT name FROM items ORDER BY LENGTH(name) DESC`).all();
  for (const row of allFoods.results as any[]) {
    if (row.name.toLowerCase() !== excludeName.toLowerCase() && msg.includes(row.name.toLowerCase())) {
      return { name: row.name };
    }
  }
  return null;
}

async function extractFoodsFromText(msg: string, db: D1Database): Promise<string[]> {
  const allFoods = await db.prepare(`SELECT name FROM items`).all();
  const found: string[] = [];
  for (const row of allFoods.results as any[]) {
    if (msg.includes(row.name.toLowerCase())) found.push(row.name);
  }
  return found;
}

// ── Session helpers ───────────────────────────────────────────────────────────

const MAX_SESSIONS_PER_PROFILE = 10;

async function getOrCreateSession(
  db: D1Database,
  kv: KVNamespace,
  sessionId: string,
  profileId?: string   // passed so we can prune oldest session for this profile
) {
  const existing = await db.prepare(`SELECT id FROM sessions WHERE id = ?1`).bind(sessionId).first();
  if (existing) return existing;

  // Before creating a new session, prune oldest if the profile already has MAX_SESSIONS_PER_PROFILE
  if (profileId) {
    try {
      // Collect all session IDs this profile owns via KV
      const kvKeys = await kv.list({ prefix: `profile_sessions:${profileId}:` });
      const allSids: string[] = [];
      for (const key of kvKeys.keys) {
        const sid = await kv.get(key.name);
        if (sid) allSids.push(sid);
      }

      if (allSids.length >= MAX_SESSIONS_PER_PROFILE) {
        // Find the oldest session by updated_at from D1
        const placeholders = allSids.map((_, i) => `?${i + 1}`).join(",");
        const oldest = await db.prepare(
          `SELECT id FROM sessions WHERE id IN (${placeholders})
           ORDER BY updated_at ASC LIMIT 1`
        ).bind(...allSids).first<{ id: string }>();

        if (oldest) {
          // Delete messages first (FK constraint), then session
          await db.prepare(`DELETE FROM messages WHERE session_id = ?1`).bind(oldest.id).run();
          await db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(oldest.id).run();
          // Remove the KV registration key for the deleted session
          await kv.delete(`profile_sessions:${profileId}:${oldest.id}`);
        }
      }
    } catch { /* pruning is best-effort — non-fatal */ }
  }

  await db.prepare(
    `INSERT INTO sessions (id, profile_id, title, created_at, updated_at)
     VALUES (?1, NULL, 'New session', datetime('now'), datetime('now'))`
  ).bind(sessionId).run();
  return { id: sessionId };
}

async function saveMessage(db: D1Database, sessionId: string, role: string, content: string, taskType?: string) {
  await db.prepare(
    `INSERT INTO messages (session_id, role, content, task_type, created_at)
     VALUES (?1, ?2, ?3, ?4, datetime('now'))`
  ).bind(sessionId, role, content, taskType ?? null).run();
}

async function updateSessionTitle(db: D1Database, sessionId: string, firstMessage: string) {
  await db.prepare(
    `UPDATE sessions SET title = ?1, updated_at = datetime('now') WHERE id = ?2`
  ).bind(firstMessage.slice(0, 50), sessionId).run();
}


// ── PHASE 2: Season calendar ──────────────────────────────────────────────

const SEASON_CALENDAR: Array<{ season: string; start: string }> = [
  { season: "spring",    start: "02-20" },
  { season: "summer",   start: "04-21" },
  { season: "monsoon",  start: "06-22" },
  { season: "autumn",   start: "08-23" },
  { season: "prewinter",start: "10-23" },
  { season: "winter",   start: "12-22" },
];

// Single source of truth for "today's date" — always IST (India Standard Time,
// UTC+5:30), since this app's users and its 'logged_date' semantics are India-based.
// Previously, meal-logging call sites used plain UTC (new Date().toISOString())
// while the streak calculator used IST — a ~5.5 hour daily window (IST midnight
// to 5:30am) where a meal logged "today" (IST) got stored under UTC "yesterday",
// silently breaking streaks and today's-intake queries. Every date-for-logging
// or date-for-lookup call now goes through this one function.
function getISTDateString(daysAgo = 0): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS - daysAgo * 86400000).toISOString().split("T")[0];
}

function getCurrentSeason(): string {
  const now = new Date();
  const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  let current = "winter";
  for (const s of SEASON_CALENDAR) {
    if (mmdd >= s.start) current = s.season;
  }
  return current;
}

// ── PHASE 2: Morning insight generator ───────────────────────────────────

async function generateMorningInsight(
  profileId: string,
  db: D1Database,
  geminiKey: string
): Promise<object | null> {
  const today = getISTDateString();

  // Get last 7 days of meal logs (using session_id = profileId for guest users)
  const logs = await db.prepare(
    `SELECT ml.logged_date, i.name, i.calories_per_100g, ml.meal_slot,
     GROUP_CONCAT(n.name || ':' || in_.amount_per_100g, '|') AS nutrients
     FROM meal_logs ml
     JOIN items i ON i.id = ml.item_id
     LEFT JOIN item_nutrients in_ ON in_.item_id = ml.item_id
     LEFT JOIN nutrients n ON n.id = in_.nutrient_id
     WHERE ml.session_id = ?1 AND ml.logged_date >= date('now', '-7 days')
     GROUP BY ml.id
     ORDER BY ml.logged_date DESC`
  ).bind(profileId).all();

  if (logs.results.length === 0) return null;

  // RDA map
  const rdaRows = await db.prepare(`SELECT nutrient_name, daily_amount FROM rda`).all();
  const rdaMap: Record<string, number> = {};
  for (const r of rdaRows.results as any[]) rdaMap[r.nutrient_name] = r.daily_amount;

  // Tally nutrient totals per day
  const dailyNutrients: Record<string, Record<string, number>> = {};
  for (const log of logs.results as any[]) {
    if (!dailyNutrients[log.logged_date]) dailyNutrients[log.logged_date] = {};
    if (log.nutrients) {
      for (const pair of log.nutrients.split("|")) {
        const [name, val] = pair.split(":");
        if (name && val) {
          dailyNutrients[log.logged_date][name] =
            (dailyNutrients[log.logged_date][name] || 0) + parseFloat(val);
        }
      }
    }
  }

  const days = Object.keys(dailyNutrients);
  const insights: Array<{ type: string; message: string; severity: string }> = [];

  // Check for deficiency streaks — Phase 2.3
  const nutrientDefDays: Record<string, number> = {};
  for (const day of days) {
    for (const [nutrient, rdaAmt] of Object.entries(rdaMap)) {
      const amt = dailyNutrients[day][nutrient] ?? 0;
      if (amt < rdaAmt * 0.4) {
        nutrientDefDays[nutrient] = (nutrientDefDays[nutrient] || 0) + 1;
      }
    }
  }

  // Generate alerts for nutrients below 40% RDA for 3+ days
  const currentSeason = getCurrentSeason();
  for (const [nutrient, defDays] of Object.entries(nutrientDefDays)) {
    if (defDays >= 3) {
      // Find top seasonal sources for this nutrient
      const sources = await db.prepare(
        `SELECT i.name, in_.amount_per_100g as amount, n.unit
         FROM item_nutrients in_
         JOIN items i ON i.id = in_.item_id
         JOIN nutrients n ON n.id = in_.nutrient_id
         WHERE n.name = ?1 AND (i.season = ?2 OR i.season = 'all')
         ORDER BY in_.amount_per_100g DESC LIMIT 3`
      ).bind(nutrient, currentSeason).all();

      const sourceStr = (sources.results as any[])
        .map(s => `${s.name} (${s.amount}${s.unit})`)
        .join(", ");

      insights.push({
        type: "deficiency_streak",
        severity: defDays >= 5 ? "high" : "medium",
        message: `Your ${nutrient} has been below 40% of the daily target for ${defDays} days.${
          sourceStr ? ` Good seasonal sources: ${sourceStr}.` : ""
        }`,
      });
    }
  }

  // Season transition insight
  const loggedDates = [...new Set((logs.results as any[]).map(l => l.logged_date))];
  const streak = loggedDates.filter(d => {
    const dayAgo = new Date();
    dayAgo.setDate(dayAgo.getDate() - 1);
    return new Date(d) >= dayAgo;
  }).length;

  if (streak > 0 && insights.length === 0) {
    insights.push({
      type: "encouragement",
      severity: "low",
      message: `Great job logging your meals! You've been consistent. Keep it up for better nutritional insights.`,
    });
  }

  if (insights.length === 0) return null;

  // Convert UTC to IST (UTC+5:30) for correct greeting
  const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const hour = nowIST.getUTCHours();
  const greeting = hour < 12 ? "Good morning! 🌅" : hour < 17 ? "Good afternoon! ☀️" : "Good evening! 🌙";

  // ── Phase 2.3: Use Gemini to write insight copy (warm, conversational tone) ──
  // Build a compact summary of the raw insights for Gemini to narrate
  if (geminiKey) {
    try {
      const rawSummary = insights.slice(0, 3).map(i => i.message).join(" | ");
      const seasonLabel = SEASON_LABELS[currentSeason] ?? currentSeason;
      const geminiPrompt =
        `You are NutriMentor AI, a warm nutrition companion. Write a single short paragraph (2-3 sentences, max 60 words) that a caring nutritionist would say as a morning greeting based on these data points: ${rawSummary}. ` +
        `The current season is ${seasonLabel}. ` +
        `Be encouraging, specific, and practical. Start with a warm opener. Do NOT use JSON or lists. Plain text only.`;

      const geminiBody = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: geminiPrompt }] }],
        generationConfig: { maxOutputTokens: 120, temperature: 0.4 },
      });
      // Try Flash-Lite, fall back to 2.0-Flash-Lite if rate limited
      let geminiResp: Response | null = null;
      for (const mModel of ["gemini-2.5-flash-lite", "gemini-2.0-flash-lite"]) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${mModel}:generateContent?key=${geminiKey}`,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: geminiBody }
        );
        if (r.status === 429 || r.status === 503) { await new Promise(res => setTimeout(res, 800)); continue; }
        geminiResp = r;
        break;
      }
      if (geminiResp?.ok) {
        const gdata = await geminiResp.json() as any;
        const geminiCopy = gdata.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
        // Inject Gemini-written copy as first insight if it looks valid
        if (geminiCopy && !geminiCopy.startsWith("{") && geminiCopy.length > 20) {
          insights.unshift({ type: "gemini_copy", severity: "low", message: geminiCopy });
        }
      }
    } catch { /* Gemini failure is non-fatal — keep deterministic insights */ }
  }

  return {
    type: "morning_insight",
    date: today,
    greeting,
    insights: insights.slice(0, 3), // max 3 insights (Gemini copy + up to 2 data points)
    season: currentSeason,
  };
}

// ── PHASE 2: Scheduled cron handler (wrangler.toml: crons = ["0 2 * * *"]) ──

async function runMorningInsights(env: Env): Promise<void> {
  // Get all profiles with meal logs in last 7 days
  const profiles = await env.DB.prepare(
    `SELECT DISTINCT session_id FROM meal_logs
     WHERE session_id IS NOT NULL
     AND logged_date >= date('now', '-7 days')
     LIMIT 500`
  ).all();

  const today = getISTDateString();

  for (const row of profiles.results as any[]) {
    try {
      const insight = await generateMorningInsight(row.session_id, env.DB, env.GEMINI_API_KEY ?? "");
      if (insight) {
        await env.SESSIONS.put(
          `morning:${row.session_id}:${today}`,
          JSON.stringify(insight),
          { expirationTtl: 86400 }
        );
      }
    } catch {
      // Non-fatal — continue with other profiles
    }
  }
}

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const frontendUrl = c.env.FRONTEND_URL || "http://localhost:5173";
  const origin = c.req.header("Origin") || "";

  const isAllowed =
    origin === frontendUrl ||
    origin === frontendUrl.replace(/\/$/, "") ||
    origin === "http://localhost:5173" ||
    origin === "http://127.0.0.1:5173" ||
    origin.endsWith(".pages.dev");

  return cors({
    origin: isAllowed ? origin : "",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })(c, next);
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (c) => c.json({
  status: "ok",
  service: "NutriMentor AI",
  version: "2.2.0",
  phase: "2 — Proactive Agent",
  ai_backend: "gemini-2.5-flash-lite",
}));

// ── Items ─────────────────────────────────────────────────────────────────────

app.get("/items", async (c) => {
  const season = c.req.query("season");
  let q = `SELECT id, name, category, calories_per_100g, season, scientific_name, image_url FROM items`;
  const binds: any[] = [];
  if (season && season !== "all") {
    q += ` WHERE season = ?1 OR season = 'all'`;
    binds.push(season);
  }
  q += ` ORDER BY category, name`;
  const result = await c.env.DB.prepare(q).bind(...binds).all();
  return c.json(result.results);
});

app.get("/items/:id", async (c) => {
  const item = await c.env.DB.prepare(`SELECT * FROM items WHERE id = ?1`).bind(c.req.param("id")).first();
  if (!item) return c.json({ error: "Not found" }, 404);
  return c.json(item);
});

app.get("/items/:id/nutrients", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT n.name, in_.amount_per_100g as amount, n.unit,
     (SELECT daily_amount FROM rda WHERE nutrient_name = n.name) as rda_amount
     FROM item_nutrients in_
     JOIN nutrients n ON n.id = in_.nutrient_id
     WHERE in_.item_id = ?1 ORDER BY n.name`
  ).bind(c.req.param("id")).all();
  return c.json(result.results);
});

// ── Nutrients ─────────────────────────────────────────────────────────────────

app.get("/nutrients", async (c) => {
  const result = await c.env.DB.prepare(`SELECT id, name, unit FROM nutrients ORDER BY name`).all();
  return c.json(result.results);
});

// ── Profile ───────────────────────────────────────────────────────────────────

app.get("/profile/:session_id", async (c) => {
  const profileData = await c.env.SESSIONS.get(`profile:${c.req.param("session_id")}`);
  if (!profileData) return c.json(null);
  return c.json(JSON.parse(profileData));
});

app.post("/profile/:session_id", async (c) => {
  const body = await c.req.json<Profile>();
  await c.env.SESSIONS.put(`profile:${c.req.param("session_id")}`, JSON.stringify(body), {
    expirationTtl: 60 * 60 * 24 * 90,
  });
  return c.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get("/agent/sessions", async (c) => {
  const profileId = c.req.query("profile_id");
  const sessionId = c.req.query("session_id");
  if (!profileId && !sessionId) return c.json([]);

  const knownSessions: string[] = [];
  if (sessionId) knownSessions.push(sessionId);

  // Use KV to find all sessions associated with this profile_id
  if (profileId) {
    try {
      const kvKeys = await c.env.SESSIONS.list({ prefix: `profile_sessions:${profileId}:` });
      for (const key of kvKeys.keys) {
        const sid = await c.env.SESSIONS.get(key.name);
        if (sid && !knownSessions.includes(sid)) knownSessions.push(sid);
      }
    } catch { /* KV list can fail, continue with what we have */ }
  }

  if (knownSessions.length === 0) return c.json([]);

  // De-duplicate. Do NOT slice here — D1 will sort by updated_at DESC and we
  // cap AFTER sorting so we always keep the most recent sessions, never the newest.
  const unique = [...new Set(knownSessions)];
  const placeholders = unique.map((_, i) => `?${i + 1}`).join(",");

  const result = await c.env.DB.prepare(
    `SELECT s.id as session_id, s.title, s.updated_at,
     (SELECT content FROM messages WHERE session_id = s.id AND role = 'user'
      ORDER BY created_at ASC LIMIT 1) as first_message,
     (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as message_count
     FROM sessions s
     WHERE s.id IN (${placeholders})
     ORDER BY s.updated_at DESC
     LIMIT ${MAX_SESSIONS_PER_PROFILE}`
  ).bind(...unique).all();

  const withMessages = (result.results as any[]).filter(
    s => s.first_message && (s.message_count as number) > 0
  );
  return c.json(withMessages);
});

app.get("/agent/sessions/:id", async (c) => {
  const sid = c.req.param("id");
  const session = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?1`).bind(sid).first();
  if (!session) return c.json({ error: "Not found" }, 404);

  // Register this session under the profile so it always appears in the sessions list,
  // even when the user navigates to it without sending a message.
  const profileId = c.req.query("profile_id");
  if (profileId && profileId !== sid) {
    try {
      await c.env.SESSIONS.put(
        `profile_sessions:${profileId}:${sid}`,
        sid,
        { expirationTtl: 60 * 60 * 24 * 90 }
      );
    } catch { /* non-fatal */ }
  }

  const messages = await c.env.DB.prepare(
    `SELECT role, content, task_type, created_at FROM messages
     WHERE session_id = ?1 ORDER BY created_at ASC LIMIT 100`
  ).bind(sid).all();
  return c.json({ ...session, messages: messages.results });
});

// ── Context ───────────────────────────────────────────────────────────────────

app.post("/agent/context/select", async (c) => {
  const body = await c.req.json();
  const sessionId = body.session_id ?? crypto.randomUUID().replace(/-/g, "");
  await getOrCreateSession(c.env.DB, c.env.SESSIONS, sessionId);
  await c.env.SESSIONS.put(`ctx:${sessionId}`, JSON.stringify(body.item), { expirationTtl: 86400 });
  return c.json({ ok: true, session_id: sessionId, selected_item: body.item });
});

app.post("/agent/context/clear", async (c) => {
  const body = await c.req.json();
  if (body.session_id) await c.env.SESSIONS.delete(`ctx:${body.session_id}`);
  return c.json({ ok: true, session_id: body.session_id, selected_item: null });
});

// ── Ritu Journal ──────────────────────────────────────────────────────────────

app.get("/ritu/:season", async (c) => {
  const season = c.req.param("season");
  const journal = await c.env.DB.prepare(
    `SELECT season, title, description, eat_more, avoid, dosha, ayurvedic_note FROM ritu_journal WHERE season = ?1`
  ).bind(season).first<any>();
  if (!journal) return c.json({ error: "Season not found" }, 404);
  const foods = await c.env.DB.prepare(
    `SELECT id, name, category, calories_per_100g, image_url FROM items
     WHERE season = ?1 OR season = 'all' ORDER BY category, name`
  ).bind(season).all();
  return c.json({ ...journal, season_label: SEASON_LABELS[season] ?? season, foods: foods.results });
});

app.get("/ritu", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT season, title, description, eat_more, avoid, dosha, ayurvedic_note FROM ritu_journal`
  ).all();
  const order = ["spring", "summer", "monsoon", "autumn", "prewinter", "winter"];
  const journals = (result.results as any[]).sort(
    (a, b) => order.indexOf(a.season) - order.indexOf(b.season)
  );
  return c.json({ current_season: getCurrentSeason(), journals });
});

// ── PHASE 1: Meal logging endpoints ──────────────────────────────────────────

app.post("/meals/log", async (c) => {
  const body = await c.req.json<{
    profile_id: string;
    item_id: number;
    amount_g?: number;
    meal_slot?: string;
    logged_date?: string;
  }>();

  if (!body.profile_id || !body.item_id) {
    return c.json({ error: "profile_id and item_id are required" }, 400);
  }

  const today = body.logged_date ?? getISTDateString();

  await c.env.DB.prepare(
    `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
     VALUES (?1, ?1, ?2, ?3, ?4, ?5, datetime('now'))`
  ).bind(body.profile_id, today, body.item_id, body.amount_g ?? 100, body.meal_slot ?? "meal").run();

  return c.json({ ok: true, logged_date: today });
});

app.get("/meals/today/:profile_id", async (c) => {
  const today = getISTDateString();
  const pid = c.req.param("profile_id");
  const result = await c.env.DB.prepare(
    `SELECT ml.id, ml.logged_date, ml.meal_slot, ml.amount_g,
     i.name, i.calories_per_100g, i.category, i.image_url
     FROM meal_logs ml
     JOIN items i ON i.id = ml.item_id
     WHERE (ml.session_id = ?1 OR ml.profile_id = ?1) AND ml.logged_date = ?2
     ORDER BY ml.created_at ASC`
  ).bind(pid, today).all();

  const logs = result.results as any[];
  const totalCal = logs.reduce((sum, l) => sum + (l.calories_per_100g * (l.amount_g / 100)), 0);

  return c.json({ date: today, logs, total_calories: Math.round(totalCal) });
});

app.get("/meals/week/:profile_id", async (c) => {
  const pid = c.req.param("profile_id");
  const result = await c.env.DB.prepare(
    `SELECT ml.id, ml.logged_date, ml.meal_slot, ml.amount_g,
     i.name, i.calories_per_100g, i.category
     FROM meal_logs ml
     JOIN items i ON i.id = ml.item_id
     WHERE (ml.session_id = ?1 OR ml.profile_id = ?1) AND ml.logged_date >= date('now', '-7 days')
     ORDER BY ml.logged_date DESC, ml.created_at ASC`
  ).bind(pid).all();

  return c.json({ logs: result.results });
});

app.delete("/meals/:log_id", async (c) => {
  await c.env.DB.prepare(`DELETE FROM meal_logs WHERE id = ?1`).bind(c.req.param("log_id")).run();
  return c.json({ ok: true });
});

// ── PHASE 1: User facts endpoints ────────────────────────────────────────────

app.get("/facts/:profile_id", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT fact_type, fact_key, fact_value, source, updated_at
     FROM user_facts WHERE profile_id = ?1 ORDER BY updated_at DESC`
  ).bind(c.req.param("profile_id")).all();
  return c.json(result.results);
});

app.delete("/facts/:profile_id", async (c) => {
  const { fact_type, fact_key } = await c.req.json<{ fact_type: string; fact_key: string }>();
  await c.env.DB.prepare(
    `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = ?2 AND fact_key = ?3`
  ).bind(c.req.param("profile_id"), fact_type, fact_key).run();
  return c.json({ ok: true });
});


// ── PHASE 3: Weekly nutrition score ──────────────────────────────────────────

const SCORE_WEIGHTS: Record<string, number> = {
  "Protein": 15, "Iron": 12, "Calcium": 10, "Vitamin C": 10,
  "Fiber": 10, "Vitamin D": 8, "Magnesium": 7, "Folate": 7,
  "Potassium": 6, "Zinc": 5, "Vitamin A": 5, "Vitamin B6": 5,
};

function calculateWeeklyScore(
  nutrientAverages: Record<string, number>,
  rdaMap: Record<string, number>
): number {
  let totalWeight = 0, weightedScore = 0;
  for (const [nutrient, weight] of Object.entries(SCORE_WEIGHTS)) {
    const avg = nutrientAverages[nutrient] ?? 0;
    const rda = rdaMap[nutrient] ?? 1;
    const pct = Math.min((avg / rda) * 100, 100);
    weightedScore += pct * weight;
    totalWeight += weight;
  }
  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

// GET /nutrition-score/:profile_id
// Returns weekly nutrition score, per-nutrient averages, deficiencies, streak, seasonal compliance
app.get("/nutrition-score/:profile_id", async (c) => {
  const profileId = c.req.param("profile_id");

  // 1. Get last 7 days of meal logs with nutrients
  // NOTE: meal_logs stores profileId in session_id column (profile_id column is NULL for guest users)
  // nutrients table column is "name" (not "nutrient_name")
  // item_nutrients column is "amount_per_100g" (not "amount")
  const logs = await c.env.DB.prepare(
    `SELECT ml.logged_date, ml.amount_g, i.name, i.season,
     n.name as nutrient_name, (in_.amount_per_100g * ml.amount_g / 100.0) as nutrient_amount
     FROM meal_logs ml
     JOIN items i ON i.id = ml.item_id
     JOIN item_nutrients in_ ON in_.item_id = i.id
     JOIN nutrients n ON n.id = in_.nutrient_id
     WHERE ml.session_id = ?1 AND ml.logged_date >= date('now', '-7 days')
     ORDER BY ml.logged_date DESC`
  ).bind(profileId).all();

  // 2. RDA map
  const rdaRows = await c.env.DB.prepare(
    `SELECT nutrient_name, daily_amount FROM rda`
  ).all();
  const rdaMap: Record<string, number> = {};
  for (const r of rdaRows.results as any[]) rdaMap[r.nutrient_name] = r.daily_amount;

  // 3. Current season foods for seasonal compliance check
  const currentSeason = getCurrentSeason();

  if ((logs.results as any[]).length === 0) {
    return c.json({
      score: 0,
      has_data: false,
      message: "No meals logged in the last 7 days. Start logging meals to see your score!",
      nutrient_averages: {},
      deficiencies: [],
      streak: 0,
      seasonal_compliance: 0,
      current_season: currentSeason,
    });
  }

  // 4. Aggregate per-day nutrients
  const byDate: Record<string, Record<string, number>> = {};
  const logsByDate: Record<string, Set<string>> = {};
  const allLoggedFoods: Array<{name: string; season: string}> = [];

  for (const row of logs.results as any[]) {
    if (!byDate[row.logged_date]) { byDate[row.logged_date] = {}; logsByDate[row.logged_date] = new Set(); }
    byDate[row.logged_date][row.nutrient_name] = (byDate[row.logged_date][row.nutrient_name] ?? 0) + row.nutrient_amount;
    logsByDate[row.logged_date].add(row.name);
    if (!allLoggedFoods.find(f => f.name === row.name)) {
      allLoggedFoods.push({ name: row.name, season: row.season });
    }
  }

  const days = Object.keys(byDate);
  const numDays = days.length || 1;

  // 5. Average nutrients across days
  const nutrientAverages: Record<string, number> = {};
  for (const dayNutrients of Object.values(byDate)) {
    for (const [nutrient, amount] of Object.entries(dayNutrients)) {
      nutrientAverages[nutrient] = (nutrientAverages[nutrient] ?? 0) + amount;
    }
  }
  for (const k of Object.keys(nutrientAverages)) nutrientAverages[k] /= numDays;

  // 6. Score
  const score = calculateWeeklyScore(nutrientAverages, rdaMap);

  // 7. Per-nutrient breakdown for chart
  const breakdown = Object.entries(SCORE_WEIGHTS).map(([nutrient, weight]) => {
    const avg = nutrientAverages[nutrient] ?? 0;
    const rda = rdaMap[nutrient] ?? 1;
    const pct = Math.round(Math.min((avg / rda) * 100, 100));
    return { nutrient, avg: Math.round(avg * 10) / 10, rda, pct, weight,
             status: pct >= 70 ? "good" : pct >= 40 ? "low" : "deficient" };
  }).sort((a, b) => a.pct - b.pct);

  // 8. Deficiencies (< 40% RDA on average)
  const deficiencies = breakdown.filter(n => n.status === "deficient").map(n => n.nutrient);

  // 9. Streak — consecutive days ending TODAY where user logged at least 1 meal
  // Count backwards from today, stop at first gap
  let streak = 0;
  const today = getISTDateString();
  for (let i = 0; i < 365; i++) {
    const d = getISTDateString(i);
    if (byDate[d] && Object.keys(byDate[d]).length > 0) {
      streak++;
    } else if (d === today) {
      // Today has no logs yet — don't break streak, just skip today
      continue;
    } else {
      break; // Gap found — streak ends
    }
  }

  // 10. Seasonal compliance — % of logged foods matching current season
  const seasonalFoods = allLoggedFoods.filter(f => f.season === currentSeason || f.season === "all");
  const seasonalCompliance = allLoggedFoods.length > 0
    ? Math.round((seasonalFoods.length / allLoggedFoods.length) * 100) : 0;

  // 11. 7-day daily calorie trend for chart
  const calByDate: Record<string, number> = {};
  const calRows = await c.env.DB.prepare(
    `SELECT ml.logged_date, SUM(i.calories_per_100g * ml.amount_g / 100.0) as cal
     FROM meal_logs ml JOIN items i ON i.id = ml.item_id
     WHERE ml.session_id = ?1 AND ml.logged_date >= date('now', '-7 days')
     GROUP BY ml.logged_date ORDER BY ml.logged_date ASC`
  ).bind(profileId).all();
  for (const r of calRows.results as any[]) calByDate[r.logged_date] = Math.round(r.cal);

  return c.json({
    score,
    has_data: true,
    nutrient_averages: nutrientAverages,
    breakdown,
    deficiencies,
    streak,
    seasonal_compliance: seasonalCompliance,
    current_season: currentSeason,
    days_logged: numDays,
    calorie_by_date: calByDate,
    logged_foods: allLoggedFoods.map(f => f.name),
  });
});

// ── Main agent endpoint ───────────────────────────────────────────────────────

app.post("/agent/message", async (c) => {
  const body = await c.req.json<AgentRequest>();
  const { message, context = {} as AgentContext } = body;
  if (!message?.trim()) return c.json({ error: "Empty message" }, 400);

  const sessionId = context.session_id || crypto.randomUUID().replace(/-/g, "");

  // Load / merge profile
  const profileData = await c.env.SESSIONS.get(`profile:${sessionId}`);
  let profile: Profile | null = profileData ? JSON.parse(profileData) : null;

  if (context.profile && Object.keys(context.profile).length > 0) {
    const incoming = context.profile as Profile;
    if (incoming.height_cm || incoming.weight_kg || incoming.age) {
      profile = { ...profile, ...incoming };
      await c.env.SESSIONS.put(`profile:${sessionId}`, JSON.stringify(profile), {
        expirationTtl: 60 * 60 * 24 * 90,
      });
    }
  }

  // Load selected item — KV is authoritative, payload is fallback
  // This handles the race condition where context/select hasn't propagated yet
  const savedCtx = await c.env.SESSIONS.get(`ctx:${sessionId}`);
  const currentItem = savedCtx
    ? JSON.parse(savedCtx)
    : (context.current_item ?? null);

  const agentContext: AgentContext = {
    session_id: sessionId,
    profile,
    current_item: currentItem,
    current_season: context.current_season ?? "all",
  };

  // Extract profileId early so we can pass it to getOrCreateSession for pruning
  const earlyProfileId = (context as any).profile_id || sessionId;
  await getOrCreateSession(c.env.DB, c.env.SESSIONS, sessionId, earlyProfileId);

  // Load conversation history
  const historyResult = await c.env.DB.prepare(
    `SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 20`
  ).bind(sessionId).all();
  const history = (historyResult.results as any[]).reverse().map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // ── PHASE 1: Use stable profile_id (browser fingerprint) separate from sessionId
  // profile_id comes from context (localStorage "nutrimentor-profile-id")
  // Falls back to sessionId if not provided — but facts will then reset each new session
  const profileId = (context as any).profile_id || sessionId;
  let stored: string[] = [];
  try {
    // Pass alias-normalised message so "panner" stores as "paneer" etc.
    const msgForFacts = applyFoodAlias(message.toLowerCase().trim());
    stored = await extractAndStoreFacts(msgForFacts, profileId, c.env.DB, c.env.GEMINI_API_KEY ?? "");
  } catch (factErr) {
    console.error("extractAndStoreFacts failed (non-fatal):", factErr);
  }

  // Store session -> profile mapping in KV
  if (profileId !== sessionId) {
    await c.env.SESSIONS.put(
      `profile_sessions:${profileId}:${sessionId}`,
      sessionId,
      { expirationTtl: 60 * 60 * 24 * 90 }
    );
  }

  // Load learned facts AFTER extraction so same-message facts are included
  const userFacts = await loadUserFacts(profileId, c.env.DB);

  // ── Pre-flight: instant responses ─────────────────────────────────────────
  // ── Apply the single module-level alias map (MASTER_FOOD_ALIAS) ───────────
  // applyFoodAlias handles all food name variants, typos, and Hindi names.
  // One source of truth — add new variants to MASTER_FOOD_ALIAS above.
  const msgLower = applyFoodAlias(message.toLowerCase().trim());
  const msgClean = msgLower.replace(/[!?.]+$/, "").trim();

  const GREETINGS    = ["hi", "hello", "hey", "hola", "namaste", "howdy", "sup", "yo", "hai"];
  const BYES         = ["bye", "goodbye", "see you", "ciao", "alvida", "tata", "byee", "byebye",
                         "bye bye", "good bye", "byeee", "byeeee", "bbye", "bay", "bb",
                         "see ya", "later", "ttyl", "tata", "cheerio", "cya",
                         "ok bye", "okay bye", "take care", "good night", "gtg", "gotta go",
                         "thanks bye", "ok thanks", "ok cya"];
  const THANKS       = ["thanks", "thank you", "thx", "ty", "dhanyawad", "shukriya",
                        "thnak you", "thnk you", "thankyou", "thanku", "thankyu",
                        "thnaks", "thnakyou", "thankx", "thnx"];
  const HELP_PHRASES = ["what can you do", "what can you do for me", "what are your abilities", "what do you do",
                        "how can you help", "what are your features", "tell me what you can do",
                        "what can you help with", "your capabilities", "what are you capable of",
                        "what tasks can you", "as an ai agent", "ai agent tasks", "ai agent",
                        "how can you help me", "introduce yourself", "your features",
                        "what are your functions", "what do you offer"];
  // PHASE 1: "what do you know about me?" — memory recall
  // "my preferences" removed — it conflicts with "diet plan according to my preferences"
  const MEMORY_PHRASES = ["what do you know about me", "what have you learned about me",
                          "what do you remember about me", "what are my dislikes",
                          "tell me what you know about me", "what all do you know about me",
                          "what allergy do i have", "what are my allergies",
                          "what do you know about my allergy", "my allergy",
                          "what are my health", "what are my health notes",
                          "what is my goal", "what is my fitness goal"];

  // Fuzzy collapse: "hellooo" -> "helo", "hiiii" -> "hi", "byeee" -> "bye"
  const msgCollapsed = msgClean.replace(/(.)\1{2,}/g, "$1");
  const isBye      = BYES.some(b => msgClean === b || msgClean.startsWith(b + " ") || msgCollapsed === b || msgCollapsed.startsWith(b + " "));
  const isGreeting = !isBye && (
    GREETINGS.some(g => msgClean === g || msgClean.startsWith(g + " ") || msgCollapsed === g) ||
    (message.trim().length <= 3 && !isBye)
  );
  // isThanks only fires when the message is PURELY a thanks — not "thank you, now give me a plan"
  const hasActionAfterThanks = /(?:give|build|make|show|tell|create|what|how|now|also|and|but)/.test(
    msgClean.replace(/thanks?|thank you|thx|ty|dhanyawad|shukriya|thnak you|thnk you|thankyou|thanku|thankyu|thnaks|thnakyou|thankx|thnx/gi, "").trim()
  );
  const isThanks   = !hasActionAfterThanks && THANKS.some(t =>
    new RegExp(`(?:^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|[.,!?]|$)`).test(msgClean)
  );
  const isHelp     = HELP_PHRASES.some(p => msgClean.includes(p));
  const isOk       = ["ok","okay","cool","nice","great","good","fine","sure","alright","got it","noted"].includes(msgClean);
  const isConfusion = ["wrong","what","huh","what?","huh?","excuse me","pardon","what do you mean",
                       "that's wrong","thats wrong","incorrect","not right","what the","wtf","wth"].includes(msgClean)
    || msgClean.startsWith("what the") || msgClean.startsWith("what ?");
  const isFrustration = msgClean.includes("what the fuck") || msgClean.includes("wtf") ||
                        msgClean.includes("what the hell") || msgClean.includes("this is wrong") ||
                        msgClean.includes("stupid") || msgClean.includes("dumb");
  const isIdentity = msgClean.includes("who made you") || msgClean.includes("who are you") ||
                     msgClean.includes("who built you") || msgClean.includes("who created you") ||
                     msgClean.includes("what are you") || msgClean.includes("tell me about yourself") ||
                     msgClean.includes("introduce yourself") ||
                     msgClean.includes("are you chatgpt") || msgClean.includes("are you gemini") ||
                     msgClean.includes("are you claude") || msgClean.includes("are you an ai") ||
                     msgClean.includes("are you a real") || msgClean.includes("are you real") ||
                     msgClean.includes("your expertise") || msgClean.includes("your purpose") ||
                     msgClean.includes("benefit from you") || msgClean.includes("help me with") ||
                     msgClean.includes("helping in general") || msgClean.includes("what do you know how to");
  const isAccuracy = msgClean.includes("how accurate") || msgClean.includes("are you accurate") ||
                     msgClean.includes("is this accurate") || msgClean.includes("is the data accurate") ||
                     msgClean.includes("is that all you know") || msgClean.includes("accuracy") ||
                     msgClean.includes("doctor worthy") || msgClean.includes("is this real") ||
                     msgClean.includes("medical advice") || msgClean.includes("can i trust");
  const hasDietIntent = msgClean.includes("diet") || msgClean.includes("plan") || msgClean.includes("what to eat");
  const isMemory   = !hasDietIntent && MEMORY_PHRASES.some(p => msgClean.includes(p));
  // Memory update: "remove X from likes" / "delete X from dislikes"
  // isMemoryUpdate: with or without "from likes/dislikes" suffix
  const isMemoryUpdate =
    /(?:remove|delete|forget) .{1,30} from (?:my )?(?:both|likes|dislikes|preferences|memory|allergies)/i.test(msgClean)
    || /(?:i no longer|i don.?t anymore|forget that i) (?:like|dislike|hate|love) .{1,30}/i.test(msgClean)
    || /^add .{1,30} (?:to|in) (?:my )?(?:likes|dislikes|preferences|allergies)/i.test(msgClean)
    // "remove X" alone — handler verifies the item against saved facts (honest no-op if absent)
    || /^(?:remove|delete) [a-z][a-z\s]{1,30}$/.test(msgClean);

  const VAGUE = ["this","this one","tell me about this","what is this",
                 "what about this","this food","should i eat this","is it good","is this good","this item",
                 "is it healthy","is it healthy for me","is this healthy","is this healthy for me",
                 "should i include this","should i include this in my diet","should i add this",
                 "should i add it","should i add it to my diet","should i add this to my diet",
                 "can i eat this","can i have this","is this good for me","is it good for me",
                 "is this ok","is it ok","what is this food","about it"];
  // Exclude "it" alone if it appears in a question about a plan ("will it help", "does it work")
  const itAlone = msgClean === "it" || msgClean === "that";
  const itInPlanQuestion = /will it|does it|can it\b/.test(msgClean);
  const isVague = !itInPlanQuestion && (
    VAGUE.some(v => msgClean === v || msgClean.startsWith(v)) ||
    (itAlone)
  );

  // Helper to save + respond
  const respond = async (
    msg: string, taskType: string,
    extras: Partial<{ tools_used: string[]; mode: string; next_actions: string[]; cards: any[]; citations: string[]; used_profile: boolean; used_selected_item: boolean }> = {}
  ) => {
    const cnt = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?1`).bind(sessionId).first<any>();
    await saveMessage(c.env.DB, sessionId, "user", message);
    await saveMessage(c.env.DB, sessionId, "assistant", msg, taskType);
    if ((cnt?.cnt ?? 0) === 0) await updateSessionTitle(c.env.DB, sessionId, message);
    await c.env.DB.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1`).bind(sessionId).run();
    return c.json({
      session_id: sessionId, message: msg, task_type: taskType,
      tools_used: extras.tools_used ?? [], mode: extras.mode ?? "conversational",
      agent_state: "complete", used_profile: extras.used_profile ?? !!profile,
      used_selected_item: extras.used_selected_item ?? false,
      selected_item: currentItem, next_actions: extras.next_actions ?? [],
      cards: extras.cards ?? [], citations: extras.citations ?? [],
    });
  };

  if (isGreeting) {
    const name = profile?.name;
    const factsPreview = userFacts.dislikes.length > 0
      ? ` I remember you're not a fan of ${userFacts.dislikes.slice(0, 2).join(" and ")}.`
      : "";
    const msg = name
      ? `Hello ${name}! I'm NutriMentor AI.${factsPreview} What can I help with today?`
      : `Hello! I'm NutriMentor AI, your nutrition companion for Indian seasonal eating. Ask me about any food, get a diet plan, compare foods, or tell me what you ate today and I'll check your nutrient gaps.`;
    return respond(msg, "greeting", { next_actions: ["Tell me about guava", "Build my day plan", "What can you do?"] });
  }

  if (isBye) return respond("Take care! Come back whenever you have nutrition questions. Eat well! 🌿", "farewell");
  if (isThanks) return respond("You're welcome! Ask me anything else about food, nutrition, or your diet.", "smalltalk");

  if (isOk) {
    const msg = currentItem
      ? `Got it! You have **${currentItem.name}** selected. Want me to show its full nutrients, compare it with something, or build a plan around it?`
      : "Sure! Ask me about a food, nutrient, season, or diet goal — I'm here.";
    return respond(msg, "smalltalk", { used_selected_item: !!currentItem });
  }

  // ── Confusion handler ─────────────────────────────────────────────────────
  if (isConfusion) {
    const msg = currentItem
      ? `You have **${currentItem.name}** selected. Did you want to know something specific about it? Try: "Tell me about ${currentItem.name}" or "Should I eat ${currentItem.name}?"`
      : `I'm not sure what you're referring to. You can ask me about a food, request a diet plan, or compare two foods. Try: "Tell me about guava" or "Build my day plan".`;
    return respond(msg, "clarification", { used_selected_item: !!currentItem });
  }

  // ── Frustration handler ────────────────────────────────────────────────────
  if (isFrustration) {
    const msg = `I understand that response wasn't what you were looking for — I'm sorry about that! Let me try again. What specifically would you like to know? You can ask me about:

• A specific food: "Tell me about spinach"
• Your diet plan: "Build my day plan"
• A comparison: "Compare mango and banana"
• What you ate: "I ate banana today"`;
    return respond(msg, "clarification");
  }

  // ── Identity handler — deterministic, no Gemini needed ───────────────────
  if (isIdentity) {
    const msg = `I'm NutriMentor AI, built by Pratyaksh Agrawal to help with Indian seasonal nutrition. I'm your personal nutrition companion — I know about 57 Indian foods across 6 Ritu seasons, track your food preferences and health notes, build personalised diet plans, and analyse your daily intake. What can I help you with?`;
    return respond(msg, "identity", { next_actions: ["What can you do?", "Build my day plan", "What do you know about me?"] });
  }

  // ── Accuracy handler — deterministic ──────────────────────────────────────
  if (isAccuracy) {
    const msg = `Yes — all nutrition data comes directly from a structured database built on ICMR-NIN (Indian Council of Medical Research) recommendations, not from AI memory or guesswork. The 57 foods in my database have 19 verified nutrients each.

For general guidance I'm highly reliable. For medical nutrition therapy (e.g. precise targets for diabetes or kidney disease), always confirm with your doctor or dietitian.`;
    return respond(msg, "accuracy", { next_actions: ["Tell me about guava", "What do you know about me?"] });
  }

  // ── PHASE 1: Memory recall ─────────────────────────────────────────────────
  if (isMemory) {
    const lines: string[] = [];
    if (userFacts.dislikes.length)     lines.push(`🚫 Dislikes: ${userFacts.dislikes.join(", ")}`);
    if (userFacts.likes.length)        lines.push(`✅ Likes: ${userFacts.likes.join(", ")}`);
    if (userFacts.dietary)             lines.push(`🥗 Dietary preference: ${userFacts.dietary}`);
    if (userFacts.health_notes.length) lines.push(`🏥 Health notes: ${userFacts.health_notes.join(", ")}`);
    if (userFacts.allergies.length)    lines.push(`⚠️ Allergies: ${userFacts.allergies.join(", ")}`);
    if (userFacts.goal)                lines.push(`🎯 Fitness goal: ${userFacts.goal}`);
    if (userFacts.lifestyle)           lines.push(`💪 Lifestyle: ${userFacts.lifestyle}`);
    if (profile?.age)                  lines.push(`👤 Age: ${profile.age}, Sex: ${profile.sex ?? "not set"}`);
    if (profile?.height_cm)            lines.push(`📏 Height: ${profile.height_cm}cm, Weight: ${profile.weight_kg}kg`);

    const msg = lines.length
      ? `Here's what I know about you:\n\n${lines.join("\n")}\n\nI use this to personalise your diet plans and suggestions. Tell me anything new and I'll remember it.`
      : "I don't know much about you yet! Tell me your food preferences, health goals, or dietary restrictions and I'll remember them for future conversations.";
    return respond(msg, "memory_recall", { next_actions: ["Update my preferences", "Build a personalised diet plan"] });
  }

  // Memory update handler — "remove panner from likes", "remove mango from both", "add aam to likes"
  if (isMemoryUpdate) {
    // ── ADD: "add aam to likes" / "add beetroot to dislikes" ──
    const addMatch = msgClean.match(/^add (.{1,30}?) (?:to|in) (?:my )?(likes|dislikes|preferences|allergies)/i);
    if (addMatch && addMatch[1]) {
      const foodToAdd = applyFoodAlias(addMatch[1].trim().toLowerCase());
      const bucket    = addMatch[2].toLowerCase();
      const factType  = bucket === "dislikes" ? "dislike" : bucket === "allergies" ? "allergy" : "preference";
      try {
        // Mutual exclusion: adding to likes removes from dislikes, and vice versa
        if (factType === "preference") {
          await c.env.DB.prepare(`DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'dislike' AND LOWER(fact_key) LIKE ?2`)
            .bind(profileId, `%${foodToAdd}%`).run();
        } else if (factType === "dislike") {
          await c.env.DB.prepare(`DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'preference' AND fact_key != 'dietary' AND LOWER(fact_key) LIKE ?2`)
            .bind(profileId, `%${foodToAdd}%`).run();
        }
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, created_at, updated_at)
           VALUES (?1,?2,?3,?3,'conversation',datetime('now'),datetime('now'))`
        ).bind(profileId, factType, foodToAdd).run();
      } catch { /* non-fatal */ }
      const updatedFacts = await loadUserFacts(profileId, c.env.DB);
      const lines: string[] = [];
      if (updatedFacts.dislikes.length) lines.push(`🚫 Dislikes: ${updatedFacts.dislikes.join(", ")}`);
      if (updatedFacts.likes.length)    lines.push(`✅ Likes: ${updatedFacts.likes.join(", ")}`);
      const msg = `Got it! Added **${foodToAdd}** to your ${bucket}. Here's what I know now:\n\n${lines.join("\n")}`;
      return respond(msg, "memory_update", { next_actions: ["What do you know about me?", "Build a personalised diet plan"] });
    }

    // ── REMOVE: "remove X from likes/dislikes/both" (or bare "remove X") ──
    const removeMatch = msgClean.match(/(?:remove|delete|forget) (.{1,30}?) from (?:my )?(both|likes|dislikes|preferences|memory|allergies)/i);
    const bareRemoveMatch = removeMatch ? null : msgClean.match(/^(?:remove|delete) ([a-z][a-z\s]{1,30})$/);
    const noLongerMatch = msgClean.match(/(?:i no longer|i don.?t anymore|forget that i) (?:like|dislike|hate|love) (.{1,30})/i);
    const itemToRemove = applyFoodAlias((removeMatch?.[1] || bareRemoveMatch?.[1] || noLongerMatch?.[1] || "").trim().toLowerCase());
    const bucketWord = (removeMatch?.[2] ?? "").toLowerCase();
    const isBoth = !!bareRemoveMatch || bucketWord === "both" || /both likes and dislikes|likes and dislikes/.test(msgClean);
    const isFromDislikes = isBoth || bucketWord === "dislikes" || /dislikes|hate/i.test(msgClean);
    const isFromLikes    = isBoth || bucketWord === "likes" || bucketWord === "preferences" || (!isFromDislikes);

    if (itemToRemove) {
      let removedFrom: string[] = [];
      try {
        if (isFromDislikes) {
          const r = await c.env.DB.prepare(
            `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'dislike' AND LOWER(fact_key) LIKE ?2`
          ).bind(profileId, `%${itemToRemove}%`).run();
          if ((r.meta?.changes ?? 0) > 0) removedFrom.push("dislikes");
        }
        if (isFromLikes) {
          const r = await c.env.DB.prepare(
            `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'preference' AND fact_key != 'dietary' AND LOWER(fact_key) LIKE ?2`
          ).bind(profileId, `%${itemToRemove}%`).run();
          if ((r.meta?.changes ?? 0) > 0) removedFrom.push("likes");
        }
        if (bucketWord === "allergies" || /allerg/i.test(msgClean)) {
          const r = await c.env.DB.prepare(
            `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'allergy' AND LOWER(fact_key) LIKE ?2`
          ).bind(profileId, `%${itemToRemove}%`).run();
          if ((r.meta?.changes ?? 0) > 0) removedFrom.push("allergies");
        }
      } catch { /* non-fatal */ }

      // Reload updated facts and confirm — honestly
      const updatedFacts = await loadUserFacts(profileId, c.env.DB);
      const lines: string[] = [];
      if (updatedFacts.dislikes.length)     lines.push(`🚫 Dislikes: ${updatedFacts.dislikes.join(", ")}`);
      if (updatedFacts.likes.length)        lines.push(`✅ Likes: ${updatedFacts.likes.join(", ")}`);
      if (updatedFacts.health_notes.length) lines.push(`🏥 Health notes: ${updatedFacts.health_notes.join(", ")}`);
      const memSummary = lines.length ? `\n\n${lines.join("\n")}` : "";
      const msg = removedFrom.length
        ? `Got it! I've removed **${itemToRemove}** from your ${removedFrom.join(" and ")}. Here's what I know now:${memSummary}`
        : `I couldn't find **${itemToRemove}** in your saved preferences — nothing was removed. Here's what I currently know:${memSummary}`;
      return respond(msg, "memory_update", { next_actions: ["What do you know about me?", "Build a personalised diet plan"] });
    }
  }

  if (isHelp) {
    const msg = `Here's what I can do for you:\n\n🔍 **Food lookup** — "Tell me about guava"\n⚖️ **Compare foods** — "Compare mango and banana"\n🗓️ **Diet plans** — "Build me a summer diet plan"\n📊 **Intake analysis** — "I ate banana and oats today"\n🌱 **Seasonal foods** — "What should I eat in monsoon?"\n💊 **Nutrient sources** — "Foods rich in iron"\n🏃 **BMI & calories** — "What is my BMI?"\n🤒 **Symptom advice** — "What should I eat when I have a cold?"\n🧠 **Memory** — "What do you know about me?"\n\nI also **remember your preferences** — tell me what you like, dislike, or your health conditions and I'll personalise every response.`;
    return respond(msg, "help", { next_actions: ["Tell me about guava", "What do you know about me?", "Build a diet plan"] });
  }

  // For vague references ("what is this?", "can I eat this?"):
  // Priority 1 — KV-selected item: the food the user clicked in the grid (most explicit intent)
  // Priority 2 — Only use last-message history if nothing is selected in the grid
  // OLD bug: history ALWAYS overrode the KV item → brown rice stuck forever
  let contextFood = currentItem;   // KV item is authoritative
  if (!currentItem && history.length >= 2) {
    // No food selected in grid — look at last assistant message as fallback
    const lastAssistantMsg = [...history].reverse().find(h => h.role === "assistant");
    if (lastAssistantMsg) {
      const foodInLastMsg = await findFoodInMessage(lastAssistantMsg.content.toLowerCase(), c.env.DB);
      if (foodInLastMsg) {
        contextFood = { id: 0, name: foodInLastMsg.name, season: "all" };
      }
    }
  }

  if (isVague && (contextFood || currentItem)) {
    const targetFood = contextFood || currentItem!;
    const result = await toolFoodLookup(c.env.DB, targetFood.name);
    let vaguResponse = buildDirectResponse("food_lookup", result, message);

    // Add personalised health note if asking "should I eat this / is it healthy"
    const isHealthQ = msgClean.includes("healthy") || msgClean.includes("should i") ||
                      msgClean.includes("can i") || msgClean.includes("good for me") ||
                      msgClean.includes("add it") || msgClean.includes("include this");
    if (isHealthQ && result.found) {
      const cal = result.calories_per_100g ?? 0;
      const hasDislike = userFacts.dislikes.some(d =>
        result.name?.toLowerCase().includes(d.toLowerCase())
      );
      if (hasDislike) {
        vaguResponse += `

You've mentioned you don't like **${result.name}** — I won't include it in your plans.`;
      } else if (userFacts.health_notes.includes("diabetes")) {
        const highSugar = (result.nutrients ?? []).find((n: any) => n.name === "Sugar" && n.amount > 10);
        if (highSugar) {
          vaguResponse += `

For diabetes: **${result.name}** has ${highSugar.amount}g of sugar per 100g — enjoy in moderation, not on an empty stomach.`;
        } else {
          vaguResponse += `

For diabetes: **${result.name}** is a good choice — relatively low in sugar and fits a balanced diabetic diet.`;
        }
      } else if (cal > 300) {
        vaguResponse += `

Calorie-dense at ${cal} kcal/100g — have in small portions if your goal is weight loss.`;
      } else {
        vaguResponse += `

Yes — **${result.name}** is a healthy addition to your diet at ${cal} kcal/100g.`;
      }
    }

    return respond(vaguResponse, "food_lookup", {
      tools_used: ["food_lookup"], mode: "tool-assisted", used_selected_item: true,
      next_actions: [`Compare ${targetFood.name} with banana`, `Nutrients in ${targetFood.name}`],
      citations: ["NutriMentor food database"],
    });
  }

  if (isVague && !currentItem) {
    return respond("Select a food from the grid on the left first, then ask me about it.", "clarification");
  }

  // BMI
  if (msgClean.includes("bmi") || msgClean.includes("body mass index")) {
    if (!profile || (!profile.height_cm && !profile.weight_kg)) {
      return respond("I need your height and weight to calculate your BMI. Fill in your profile using the 👤 icon.", "bmi", { used_profile: true });
    }
    const bmiResult = computeBmi(profile);
    const tdeeResult = computeTdee(profile);
    if (!bmiResult) return respond("Your profile is missing height or weight. Please fill both in the profile panel (👤 icon).", "bmi", { used_profile: true });

    const advice =
      bmiResult.label === "underweight" ? "Focus on calorie-dense whole foods like nuts, dairy, legumes, and grains to gain weight healthily." :
      bmiResult.label === "healthy"      ? "You're in a healthy range. Focus on seasonal eating and balanced macros to stay there." :
      bmiResult.label === "overweight"   ? "A moderate calorie deficit with more vegetables, fibre, and lean protein can help." :
      "Consider consulting a doctor or dietitian for a personalised plan.";

    const bmiMsg = `Your BMI is **${bmiResult.bmi}** — ${bmiResult.label} range.${tdeeResult ? `\nEstimated daily calorie need: **~${tdeeResult} kcal/day** (${profile.activity_level ?? "moderate"} activity).` : ""}\n\n${advice}`;
    return respond(bmiMsg, "bmi", {
      used_profile: true,
      next_actions: ["Build a diet plan for my goal", "What should I eat?"],
      cards: [{ type: "metric", title: "Your BMI", body: `${bmiResult.bmi} — ${bmiResult.label}` }],
      citations: ["Mifflin-St Jeor equation", "WHO BMI classification"],
    });
  }

  // ── ARCHITECTURE DECISION (2026-07-03): Gemini removed from intent classification ──
  // Evidence: 260/263 (98.9%) Gemini calls failed in production testing. For a
  // BOUNDED domain — 57 foods, ~25 intents, 6 seasons, ~20 symptoms — calling an
  // external, rate-limited LLM to classify every message is the wrong mechanism,
  // not a reliability bug to patch around. Production closed-domain assistants
  // (Dialogflow, Rasa, Alexa Skills) solve exactly this class of problem with
  // deterministic NLU as the PRIMARY engine, using an LLM only as optional
  // narrative polish on top of an already-correct deterministic answer.
  // The comprehensive deterministic router below — built and directly tested
  // against real transcripts all night — is now the sole, unconditional
  // classifier. `intentParser.ts`/`intentDispatcher.ts` remain in the repo
  // (still spec-compliant, still importable) for if/when a paid tier or a
  // reliable free inference source becomes available, but nothing in the
  // critical path awaits them anymore.
  const dispatchedResponse: { text: string; taskType: string; toolsUsed: string[]; planData?: any; wantsPdf?: boolean } | null = null;

  // ── Phase 3.5: deterministic NLP intent parse + tool execution ─────────────
  // NO dynamic imports. Everything inline. Gemini narrative only for the rare
  // truly-unmatched in-domain query (see domain classifier further below) —
  // and even that is optional; the app is 100% functional without it.

  let finalResponse = dispatchedResponse?.text ?? "";
  let taskType      = dispatchedResponse?.taskType ?? "general";
  let toolsUsed: string[] = dispatchedResponse?.toolsUsed ?? [];
  if (dispatchedResponse?.planData) (c as any).__planData = dispatchedResponse.planData;
  if (dispatchedResponse?.wantsPdf) (c as any).__wantsPDF = dispatchedResponse.wantsPdf;

  try {
    if (!dispatchedResponse) {
    const geminiKey     = c.env.GEMINI_API_KEY ?? "";
    // "all" is a UI filter pill, not a real season — never let it become the current season
    const ctxSeason     = (agentContext.current_season && agentContext.current_season !== "all")
      ? agentContext.current_season : null;
    const currentSeason = ctxSeason ?? getCurrentSeason();
    const m             = msgClean;

    // ── Step 1: intent signal variables ─────────────────────────────────────────
    // These used to be populated by a Gemini classification call. Per the
    // architecture decision above, that call has been removed entirely — every
    // deterministic check throughout this chain was already written as
    // `intent === "x" || <regex/keyword condition>`, so it degrades to the
    // regex/keyword path with zero behavior change. Left as typed placeholders
    // (rather than deleting every reference) to keep this diff reviewable and
    // reversible if a reliable inference source is added later.
    const parsedIntentType: string | null = null;
    const parsedFoods: Array<{name:string;qty?:number;unit?:string;amt_g?:number;sentiment?:string;meal_slot?:string}> = [];
    const parsedSeason: string | null  = null;
    const parsedNutrient: string | null = null;
    const parsedMealSlot: string | null = null;
    const parsedIsPdf = /\bpdf\b/.test(m);
    const parsedDays  = 1;

    // ── Step 2: Session memory injection ─────────────────────────────────────
    let sessionSummaryText = "";
    try {
      const smRaw = await c.env.SESSIONS.get(`session_summary:${sessionId}`);
      if (smRaw) {
        const s = JSON.parse(smRaw);
        const pts: string[] = ["[Session context]"];
        if (s.topics?.length)          pts.push(`Topics: ${s.topics.slice(0,5).join(", ")}`);
        if (s.plans_built?.length)     pts.push(`Plans: ${s.plans_built[0]}`);
        if (s.meals_logged?.length)    pts.push(`Last meal logged: ${s.meals_logged[0]}`);
        if (s.foods_mentioned?.length) pts.push(`Foods discussed: ${s.foods_mentioned.slice(0,6).join(", ")}`);
        sessionSummaryText = pts.join("\n");
      }
    } catch { /* non-fatal */ }

    // ── Step 3: Keyword extraction (fallback when Gemini parse unavailable) ──
    const foodInMsg = await findFoodInMessage(m, c.env.DB);

    const NUTRIENT_KEYWORDS: Record<string,string> = {
      "vitamin c":"Vitamin C","vitamin a":"Vitamin A","vitamin d":"Vitamin D",
      "vitamin b6":"Vitamin B6","protein":"Protein","fiber":"Fiber","fibre":"Fiber",
      "iron":"Iron","calcium":"Calcium","magnesium":"Magnesium","potassium":"Potassium",
      "zinc":"Zinc","folate":"Folate","fat":"Fat","carbs":"Carbohydrates","carbohydrates":"Carbohydrates",
    };
    const nutrientMentioned = parsedNutrient
      ? parsedNutrient.charAt(0).toUpperCase() + parsedNutrient.slice(1)
      : Object.entries(NUTRIENT_KEYWORDS).find(([kw]) => m.includes(kw))?.[1] ?? null;

    const SEASON_MAP: Record<string,string> = {
      "spring":"spring","vasanta":"spring","summer":"summer","grishma":"summer",
      "monsoon":"monsoon","varsha":"monsoon","rainy":"monsoon",
      "autumn":"autumn","sharad":"autumn","prewinter":"prewinter","hemanta":"prewinter",
      "pre-winter":"prewinter","winter":"winter","shishira":"winter",
    };
    // Season the user explicitly named (null when not named)
    const explicitSeason = parsedSeason
      ?? Object.entries(SEASON_MAP).find(([kw]) => m.includes(kw))?.[1]
      ?? null;
    const seasonMentioned = explicitSeason ?? ctxSeason ?? currentSeason;

    const intent = parsedIntentType ?? "";

    // ── INTAKE DETECTION ─────────────────────────────────────────────────────
    // CRITICAL: Only fire for past-tense consumption, NOT juice suggestions
    const INTAKE_VERBS = [
      "i ate","i had","i consumed","i drank","i've eaten","i have eaten",
      "just ate","just had","just drank","had some","ate some",
      "log my","track my","logged","i was eating","i have had",
    ];
    // "i drank juice" = intake, but "can i drink juice" = juice question
    const wantsIntake = intent === "intake_log"
      || (INTAKE_VERBS.some(v => m.includes(v)) && !m.startsWith("can i") && !m.startsWith("should i"));

    // ── PLAN DETECTION ───────────────────────────────────────────────────────
    const WEEK_KW = ["week plan","7 day","7-day","full week","whole week","weekly","7 days","week diet"];
    const planDays = (parsedDays === 7 || WEEK_KW.some(k => m.includes(k))) ? 7 : 1;

    const isPlanReq = intent === "diet_plan"
      || (!wantsIntake
          && (m.includes("diet plan") || m.includes("build my plan") || m.includes("build a plan")
             || m.includes("build me a plan") || m.includes("make me a plan")
             || m.includes("day plan") || m.includes("week plan")
             || ((m.includes("build") || m.includes("make") || m.includes("create") || m.includes("give"))
                && m.includes("plan"))
             ));

    const isPdf = parsedIsPdf || m.includes("pdf") || (m.includes("download") && m.includes("plan"))
                || m.includes("as a pdf") || m.includes("in pdf");

    // ── OTHER ROUTE FLAGS ─────────────────────────────────────────────────────
    const wantsCompare = intent === "compare"
      || m.includes("compare") || m.includes(" vs ") || m.includes("versus")
      || m.includes("difference between") || m.includes("which is better") || m.includes("which has more");

    const hasSeasonWord = m.includes("season") || m.includes("ritu")
      || Object.keys(SEASON_MAP).some(k => m.includes(k));

    // Seasonal info: only when NOT a plan request
    // 'what should I eat today/now/next' → meal_suggestion (not seasonal_info)
    const isGenericEatNow = (m.includes("today") || m.includes("now") || m.includes("next"))
      && m.includes("eat") && !hasSeasonWord && !m.includes("plan");
    const wantsSeason = !isPlanReq && !wantsIntake && !wantsCompare && !isGenericEatNow && (
      intent === "seasonal_info" || intent === "current_season" || intent === "seasonal_avoid"
      || ((m.includes("what to eat") || m.includes("what should i eat") || hasSeasonWord
           || (m.includes("tell me about") && hasSeasonWord)
           || m.includes("about this season"))
          && !m.includes("plan"))
    );

    // BUG 4 fix: "what nutrients does guava juice have?" is a nutrient question, not a juice recipe request
    const isNutrientQuestion = m.includes("nutrient") || m.includes("what does") || m.includes("what do")
      || (m.includes("have") && (m.includes("what") || m.includes("which")));

    // Availability question: "can i get apple in summer?" — must not be eaten by food_lookup
    const isAvailabilityQ = /can (?:i|you|we) (?:get|find|buy|have)\b/.test(m) && !!foodInMsg && !!explicitSeason;

    const wantsFoodInfo = !wantsIntake && !isPlanReq && !wantsCompare && !wantsSeason && !isAvailabilityQ && !(nutrientMentioned && foodInMsg) && (
      intent === "food_lookup" || intent === "diet_advice"
      || !!(isNutrientQuestion && (m.includes("juice") || m.includes("smoothie")) && (parsedFoods.length > 0 || foodInMsg))
      || !!(foodInMsg && (
        m.includes("tell me") || m.includes("what is") || m.includes("about")
        || m.includes("info") || m.startsWith((foodInMsg.name ?? "").toLowerCase())
        || m.includes("is it") || m.includes("good for") || m.includes("healthy")
        || m.includes("should i add") || m.includes("should i eat") || m.includes("should i have")
        || m.includes("can i add") || m.includes("can i eat") || m.includes("add to my diet")
        || m.includes("add to diet") || m.includes("worth eating") || m.includes("ok to eat")
      ))
    );

    const wantsNutrientSources = !wantsIntake && !isPlanReq && (
      intent === "nutrient_query"
      || !!(nutrientMentioned && (m.includes("rich") || m.includes("source")
            || m.includes("foods") || m.includes("contain") || m.includes("high in")
            || m.includes("which food") || m.includes("what food")))
    );

    // "how much vitamin b6 does tofu have?" / "vitamin b6 in tofu" — a specific
    // nutrient AND a specific food both named = asking for that food's value,
    // not a list of foods. Distinct from wantsNutrientSources (list request).
    const wantsNutrientInFood = !wantsIntake && !isPlanReq && !wantsCompare && !wantsSeason
      && !!nutrientMentioned && !!foodInMsg && !wantsNutrientSources;

    // Juice / salad — NOT if it's intake logging
    const isJuiceSalad = !wantsIntake && !isNutrientQuestion && (
      intent === "juice_salad"
      || m.includes("juice") || m.includes("smoothie")
      || (m.includes("salad") && !m.includes("tell me about"))
    );

    const wantsMealSlot = !isPlanReq && !wantsIntake && (
      intent === "meal_suggestion"
      || /what (?:should i|can i|to) (?:eat|have) (?:for|in|at) (?:breakfast|lunch|dinner|morning|evening|night)/.test(m)
      || /what (?:to eat|should i eat|can i eat) (?:now|today|tonight|next)$/.test(m)
    );

    const wantsFollowUp = intent === "follow_up"
      || /^(?:tell me(?: please| more| bro)?|no i mean|i mean|go on|continue|explain please|yes please|and then|what about it)[\s.!?]*$/.test(m);

    const SYMPTOM_MAP: Record<string,string> = {
      "cold":         "For colds: Turmeric milk, ginger tea, Vitamin C foods (amla, guava). Avoid cold foods.",
      "fever":        "For fever: Light foods — moong dal khichdi, coconut water. Avoid heavy fried food.",
      "typhoid":      "For typhoid: Soft, easy-to-digest foods — khichdi, curd, banana, boiled vegetables, plenty of fluids. Avoid spicy, oily, fibrous and raw foods. Please also follow your doctor's advice.",
      "dengue":       "For dengue: Papaya, pomegranate, coconut water, plenty of fluids and light khichdi. Avoid oily and spicy food. Follow your doctor's advice.",
      "malaria":      "For malaria: Light, high-calorie foods — fruit juices, coconut water, khichdi, curd. Avoid heavy, fried food. Follow your doctor's advice.",
      "jaundice":     "For jaundice: Sugarcane juice, coconut water, boiled vegetables, fruits. Strictly avoid oily, fried and spicy food. Follow your doctor's advice.",
      "cough":        "For cough: Honey + ginger, turmeric milk, warm soups. Avoid cold drinks.",
      "sore throat":  "For sore throat: Warm turmeric milk, honey + ginger, warm soups. Avoid cold and fried foods.",
      "headache":     "For headache: Hydrate well, magnesium-rich foods (almonds, spinach), small regular meals. Avoid skipping meals.",
      "diarrhea":     "For diarrhea: Banana, curd, khichdi, plenty of fluids with electrolytes. Avoid milk, oily and spicy foods.",
      "vomiting":     "For vomiting: Small sips of water/ORS, banana, plain rice, curd once settled. Avoid oily and strong-smelling foods.",
      "digestion":    "For digestion: Jeera water, curd, papaya, banana. Avoid spicy and oily foods.",
      "acidity":      "For acidity: Cold milk, banana, oats, coconut water. Avoid spicy and citrus.",
      "constipation": "For constipation: Oats, fruits, vegetables, water.",
      "weakness":     "For weakness: Spinach, lentils, dates + protein (paneer, eggs) + Vitamin C.",
      "diabetes":     "For diabetes: Low-GI foods — oats, brown rice, vegetables, lentils. Avoid refined sugar.",
      "blood pressure":"For blood pressure: Low-sodium, potassium-rich foods (banana, spinach). Avoid excess salt.",
      "anemia":       "For anemia: Spinach, lentils, dates, amla. Pair with Vitamin C.",
      "pcod":         "For PCOD: Low-GI foods, high fiber, flaxseeds, oats, leafy greens.",
      "thyroid":      "For thyroid: Avoid raw cruciferous veg. Include selenium-rich foods.",
    };
    // Synonyms/misspellings/colloquial forms → canonical SYMPTOM_MAP key.
    // This is what lets "vomit", "puking", "loose motions", "migraine" etc.
    // all resolve correctly instead of only the exact dictionary word.
    const SYMPTOM_ALIASES: Record<string,string> = {
      "vomit":"vomiting","vomitted":"vomiting","vomitting":"vomiting","puking":"vomiting",
      "throwing up":"vomiting","throw up":"vomiting","nausea":"vomiting","nauseous":"vomiting",
      "loose motions":"diarrhea","loose motion":"diarrhea","loose stomach":"diarrhea",
      "running stomach":"diarrhea","upset stomach":"diarrhea",
      "migraine":"headache","head ache":"headache","headaches":"headache",
      "stomach ache":"digestion","stomach pain":"digestion","tummy ache":"digestion",
      "indigestion":"digestion","gastric":"digestion",
      "flu":"cold","cold and cough":"cold","common cold":"cold",
      "sugar":"diabetes","high sugar":"diabetes","blood sugar":"diabetes",
      "bp":"blood pressure","high bp":"blood pressure","hypertension":"blood pressure","low bp":"blood pressure",
      "gas":"acidity","bloating":"acidity","heartburn":"acidity","acid reflux":"acidity",
      "low energy":"weakness","tiredness":"weakness","fatigue":"weakness","feeling weak":"weakness",
      "sore throats":"sore throat","throat pain":"sore throat","throat ache":"sore throat",
    };
    const normM = Object.entries(SYMPTOM_ALIASES).reduce(
      (acc, [alias, canon]) => acc.replace(new RegExp(`\\b${alias}\\b`, "g"), canon), m
    );
    const symptomWordCount = msgClean.split(/\s+/).filter(Boolean).length;
    const symptomKey = Object.keys(SYMPTOM_MAP).find(k => {
      if (!normM.includes(k)) return false;
      // Short message that's essentially just the symptom itself ("vomit",
      // "i have diarrhea", "headache?") — trigger directly, no extra words needed.
      if (symptomWordCount <= 4) return true;
      return normM.includes("eat") || normM.includes("food") || normM.includes("diet")
        || normM.includes("when") || normM.includes("i have") || normM.includes("suffering")
        || normM.includes("i got") || normM.includes("do for") || normM.includes("do in")
        || normM.includes("do if") || normM.includes("problem") || normM.includes("issue")
        || normM.includes("help") || normM.includes("cure") || normM.includes("remedy")
        || normM.includes("down with") || normM.includes("what to do") || normM.includes("i feel")
        || normM.includes("having");
    }) ?? null;


    // ── Step 4: Execute route ──────────────────────────────────────────────────

    // ── Preference set (BEFORE food lookup) ───────────────────────────────────
    if (
      (intent === "preference_set" && parsedFoods.some(f => f.sentiment && f.sentiment !== "neutral"))
      || (!wantsIntake && !isPlanReq && parsedIntentType === null
          && (m.includes("i like ") || m.includes("i love ") || m.includes("i hate ")
             || m.includes("i dislike ") || m.includes("i do not like ") || m.includes("i don't like "))
          && !m.includes("i like to ") && !m.includes("i love to ") && !m.includes("i like going")
         )
    ) {
      const likes     = parsedFoods.filter(f => f.sentiment === "like").map(f => f.name).filter(Boolean);
      const dislikes  = parsedFoods.filter(f => f.sentiment === "dislike").map(f => f.name).filter(Boolean);
      const allergies = parsedFoods.filter(f => f.sentiment === "allergy").map(f => f.name).filter(Boolean);
      // Regex fallback: Gemini parse can return [] on 429 — extract food name directly
      if (likes.length === 0 && dislikes.length === 0 && allergies.length === 0) {
        const dm = m.match(/i (?:don'?t like|do not like|dislike|hate)\s+([a-z][a-z\s]{1,40}?)(?:\s+(?:at all|much|in|for|to|because|so|and)\b|[,.!]|$)/);
        const lm = m.match(/i (?:like|love)\s+([a-z][a-z\s]{1,40}?)(?:\s+(?:a lot|very much|in|for|to|because|so|and)\b|[,.!]|$)/);
        if (dm && dm[1]) dislikes.push(dm[1].trim());
        else if (lm && lm[1]) likes.push(lm[1].trim());
      }
      // Explicit DB writes — do NOT rely only on extractAndStoreFacts (BUG 2 fix)
      // Mutual exclusion: a food cannot be in likes AND dislikes at the same time
      for (const name of dislikes) {
        const norm = applyFoodAlias(name.toLowerCase().trim());
        await c.env.DB.prepare(
          `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'preference' AND fact_key != 'dietary' AND LOWER(fact_key) LIKE ?2`
        ).bind(profileId, `%${norm}%`).run().catch(() => {});
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, created_at, updated_at)
           VALUES (?1,'dislike',?2,?2,'conversation',datetime('now'),datetime('now'))`
        ).bind(profileId, norm).run().catch(() => {});
      }
      for (const name of likes) {
        const norm = applyFoodAlias(name.toLowerCase().trim());
        await c.env.DB.prepare(
          `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'dislike' AND LOWER(fact_key) LIKE ?2`
        ).bind(profileId, `%${norm}%`).run().catch(() => {});
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, created_at, updated_at)
           VALUES (?1,'preference',?2,?2,'conversation',datetime('now'),datetime('now'))`
        ).bind(profileId, norm).run().catch(() => {});
      }
      for (const name of allergies) {
        const norm = applyFoodAlias(name.toLowerCase().trim());
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, created_at, updated_at)
           VALUES (?1,'allergy',?2,?2,'conversation',datetime('now'),datetime('now'))`
        ).bind(profileId, norm).run().catch(() => {});
      }
      const parts: string[] = [];
      if (likes.length)     parts.push(`✅ Added to likes: **${likes.join(", ")}**`);
      if (dislikes.length)  parts.push(`🚫 Added to dislikes: **${dislikes.join(", ")}**`);
      if (allergies.length) parts.push(`⚠️ Noted as allergy: **${allergies.join(", ")}**`);
      // If Gemini found nothing but keywords are present, acknowledge and let extractAndStoreFacts handle it
      if (parts.length === 0 && (m.includes("i like ") || m.includes("i love "))) {
        parts.push("Got it! I've noted your food preference. It will be used in future plans.");
      }
      finalResponse = parts.length
        ? `${parts.join("\n")}\n\nI'll use this in all your future diet plans.`
        : "Got it! I've noted your preferences.";
      taskType = "preference_update";
    }

    // ── Compare ────────────────────────────────────────────────────────────────
    else if (wantsCompare) {
      // Deterministic first: find BOTH foods in the user's own (alias-normalised) message
      const msgFood1 = await findFoodInMessage(m, c.env.DB);
      const msgFood2 = msgFood1 ? await findSecondFoodInMessage(m, msgFood1.name, c.env.DB) : null;
      let f1 = msgFood1?.name ?? parsedFoods[0]?.name ?? foodInMsg?.name ?? "";
      let f2 = msgFood2?.name ?? parsedFoods.find(f => f.name && f.name.toLowerCase() !== f1.toLowerCase())?.name ?? "";
      // Only fall back to conversation history when the user named just ONE food ("compare it with banana")
      if (f1 && !f2) {
        const lastUserOrAsst = [...history].reverse().find(h => h.role === "assistant");
        const prevFood = lastUserOrAsst ? await findSecondFoodInMessage(lastUserOrAsst.content.toLowerCase(), f1, c.env.DB) : null;
        f2 = prevFood?.name ?? "";
      }
      if (f1 && f2) {
        const result = await toolCompareFoods(c.env.DB, f1, f2);
        finalResponse = buildDirectResponse("compare_foods", result, message);
        taskType = "compare_foods"; toolsUsed = ["compare_foods"];
      } else {
        finalResponse = "Which two foods would you like to compare? Try: 'Compare mango and banana'.";
        taskType = "clarification";
      }
    }

    // ── PHASE 4.2: Ingredient swap ("I don't have spinach, what instead?") ─────
    else if (
      intent === "swap_request"
      || ((/instead of|substitute (?:for|of)?|replacement for|alternative(?:s)? (?:to|for)|swap\b/.test(m)
           || /(?:don'?t|do not) have [a-z]/.test(m))
          && !!(parsedFoods[0]?.name || foodInMsg))
    ) {
      const swapFood = applyFoodAlias((parsedFoods[0]?.name ?? foodInMsg?.name ?? "").toLowerCase());
      const swapSeason = explicitSeason ?? currentSeason;
      const isVegU = userFacts.dietary === "vegetarian" || userFacts.dietary === "vegan" || userFacts.dietary === "jain";
      const alts = await findIngredientSwap(swapFood, c.env.DB, swapSeason, userFacts.dislikes, isVegU);
      if (alts.length > 0) {
        finalResponse = `No **${swapFood}**? Here are the best swaps for ${SEASON_LABELS[swapSeason] ?? swapSeason} with a similar nutrient profile:\n\n`
          + alts.map(a => `🔄 **${a.food}** — also rich in ${a.shared_nutrient} (${a.amount}${a.unit}/100g)`).join("\n")
          + `\n\nUse roughly the same quantity as you would ${swapFood}.`;
        taskType = "ingredient_swap"; toolsUsed = ["food_lookup", "get_nutrient_rich_foods"];
      } else {
        finalResponse = `I couldn't find **${swapFood}** in my database to compute a swap. Tell me which nutrient you're after (e.g. "foods rich in iron") and I'll suggest sources.`;
        taskType = "clarification";
      }
    }

    // ── Juice / Salad ──────────────────────────────────────────────────────────
    else if (isJuiceSalad) {
      const isJuice  = !m.includes("salad");
      const isMix    = m.includes("mix") || m.includes("blend") || m.includes("together");
      const season   = parsedSeason ?? seasonMentioned ?? currentSeason;
      const featuredName = parsedFoods.find(f => !f.sentiment || f.sentiment === "neutral")?.name ?? foodInMsg?.name ?? null;

      // Guard: juice only makes sense for fruits (and some veg) — not nuts, grains, dairy
      let featuredFruit: string | null = null;
      if (featuredName && isJuice) {
        const featItem = await c.env.DB.prepare(
          `SELECT name, category FROM items WHERE LOWER(name) LIKE ?1 LIMIT 1`
        ).bind(`%${featuredName.toLowerCase()}%`).first<any>();
        if (featItem && featItem.category !== "fruit" && featItem.category !== "vegetable") {
          finalResponse = `**${featItem.name}** isn't really juiceable — it's a ${featItem.category}. `
            + `You could blend a small amount into a smoothie with fruits for texture and nutrition, though!\n\n`
            + `Want me to suggest good ${SEASON_LABELS[season] ?? season} fruits for juice instead? Just ask: "what juice is good this season?"`;
          taskType = "juice_salad";
          // Skip the rest of the juice flow
          featuredFruit = null;
        } else {
          featuredFruit = featItem?.name ?? featuredName;
        }
      } else {
        featuredFruit = featuredName;
      }

      if (!finalResponse) {
      const rows = await c.env.DB.prepare(
        `SELECT name FROM items WHERE category='fruit' AND (season=?1 OR season='all')
         AND LOWER(name) NOT LIKE '%jamun%' ORDER BY RANDOM() LIMIT 8`
      ).bind(season).all();
      let fruits = (rows.results as any[]).map((r: any) => r.name as string);

      // Filter dislikes
      fruits = fruits.filter(f => !userFacts.dislikes.some(d => f.toLowerCase().includes(d.toLowerCase())));

      // Never present an empty list — fall back to all-season fruits
      if (fruits.length === 0) {
        const fb = await c.env.DB.prepare(
          `SELECT name FROM items WHERE category='fruit' AND season='all' ORDER BY RANDOM() LIMIT 6`
        ).all();
        fruits = (fb.results as any[]).map((r: any) => r.name as string)
          .filter(f => !userFacts.dislikes.some(d => f.toLowerCase().includes(d.toLowerCase())));
      }

      // If specific fruit asked, feature it first
      if (featuredFruit) {
        fruits = [featuredFruit.charAt(0).toUpperCase()+featuredFruit.slice(1), ...fruits.filter(f => !f.toLowerCase().includes(featuredFruit.toLowerCase()))];
      }

      if (isJuice) {
        if (isMix) {
          // Pick 3 complementary fruits — light, cooling fruits that mix well
          const pickFruits = fruits.slice(0, 3);
          const healthNote = userFacts.health_notes.includes("diabetes")
            ? "\n\n⚠️ For diabetes: Avoid adding sugar. Keep portions small (150ml max) and drink after a meal."
            : userFacts.health_notes.some(n => n.includes("blood pressure"))
            ? "\n\n💡 Good for blood pressure — these fruits are naturally rich in potassium."
            : "";
          finalResponse = `🥤 **${SEASON_LABELS[season] ?? season} Mix Fruit Juice**\n\n`
            + `Fruits: **${pickFruits.join(" + ")}**\n\n`
            + `How to make:\n`
            + `1. Peel and chop each fruit\n`
            + `2. Blend together with a pinch of black salt\n`
            + `3. Strain lightly (or keep fibrous for better nutrition)\n`
            + `4. Serve fresh — no added sugar\n\n`
            + `Nutritional benefit: Natural sugars + Vitamin C + hydration`
            + healthNote;
        } else {
          // Direct juice question about a specific fruit or general options
          const healthNote = userFacts.health_notes.includes("diabetes")
            ? `\n\n⚠️ For your diabetes: Limit juice to 150ml per serving. Prefer whole fruit over juice.`
            : "";
          finalResponse = `Here are good **${SEASON_LABELS[season] ?? season} juice** options:\n\n`
            + fruits.slice(0, 4).map(f => `🥤 **${f} juice** — fresh, seasonal, nutritious`).join("\n")
            + `\n\n💡 No added sugar — natural sweetness is enough and keeps glycaemic load low.`
            + healthNote;
        }
      } else {
        const vegRows = await c.env.DB.prepare(
          `SELECT name FROM items WHERE category='vegetable' AND (season=?1 OR season='all') ORDER BY RANDOM() LIMIT 4`
        ).bind(season).all();
        const vegs = (vegRows.results as any[]).map((r: any) => r.name as string);
        finalResponse = `**${SEASON_LABELS[season] ?? season} Salad** idea:\n\n`
          + `🥗 Veggies: ${vegs.join(", ")}\n`
          + `🍎 Fruits: ${fruits.slice(0,2).join(", ")}\n`
          + `💪 Protein: Chickpeas or Paneer\n`
          + `🥣 Dressing: Curd + lemon + mint\n\n`
          + (season === "monsoon" ? "💡 During Varsha Ritu, lightly steam the vegetables — raw salads can be heavy on digestion." : "All seasonal, fresh, and nutritious!");
      }
      } // end if (!finalResponse) — non-fruit juice guard may have already answered
      taskType = "general";
    }

    // ── Diet/add-to-diet advice (yes/no verdict) ───────────────────────────────
    else if (intent === "diet_advice" && parsedFoods.length > 0) {
      const food = parsedFoods[0];
      const result = await toolFoodLookup(c.env.DB, food.name);
      if (result.found) {
        const isDisliked = userFacts.dislikes.some(d => result.name?.toLowerCase().includes(d.toLowerCase()));
        if (isDisliked) {
          finalResponse = `You've told me you don't like **${result.name}**. I'd suggest alternatives. What nutritional benefit are you looking for?`;
        } else {
          const goal = userFacts.goal || profile?.goal || "balanced";
          const cal  = result.calories_per_100g ?? 0;
          const verdict = (goal.includes("lose") && cal > 300) ? "⚠️ In moderation" : "✅ Yes, include it";
          const diabNote = userFacts.health_notes.includes("diabetes") ? " For diabetes: enjoy in small portions." : "";
          finalResponse = `${verdict} — **${result.name}** (${cal} kcal/100g) fits your **${goal}** goal.${diabNote}\n\nJust say "build my diet plan" and I'll include it.`;
        }
      } else {
        finalResponse = buildDirectResponse("food_lookup", result, message);
      }
      taskType = "diet_advice"; toolsUsed = ["food_lookup"];
    }

    // ── Nutrient amount in a specific food ("vitamin b6 in tofu") ──────────────
    else if (wantsNutrientInFood) {
      const result: any = await toolFoodLookup(c.env.DB, foodInMsg!.name);
      if (result.found) {
        const row = (result.nutrients ?? []).find(
          (n: any) => (n.name ?? "").toLowerCase() === (nutrientMentioned ?? "").toLowerCase()
        );
        if (row) {
          finalResponse = `**${result.name}** has **${row.amount}${row.unit}** of ${nutrientMentioned} per 100g`
            + (row.rda_pct != null ? ` (${row.rda_pct}% of daily RDA).` : ".");
        } else {
          const topFew = (result.nutrients ?? []).slice(0, 5)
            .map((n: any) => `${n.name} ${n.amount}${n.unit}`).join(", ");
          finalResponse = `I don't have **${nutrientMentioned}** data for **${result.name}** specifically. `
            + `What I do have per 100g: ${topFew || "no nutrient data on file"}.`;
        }
        taskType = "nutrient_in_food"; toolsUsed = ["food_lookup"];
      } else {
        finalResponse = `I couldn't find **${foodInMsg!.name}** in my database.`;
        taskType = "clarification";
      }
    }

    // ── Food lookup ────────────────────────────────────────────────────────────
    else if (wantsFoodInfo) {
      const name = parsedFoods[0]?.name ?? foodInMsg?.name ?? "";
      if (name) {
        const result = await toolFoodLookup(c.env.DB, name);
        finalResponse = buildDirectResponse("food_lookup", result, message);
        if (result.found && (m.includes("good for me") || m.includes("should i") || m.includes("can i eat") || m.includes("healthy"))) {
          const cal = result.calories_per_100g ?? 0;
          if (userFacts.dislikes.some(d => result.name?.toLowerCase().includes(d.toLowerCase()))) {
            finalResponse += `\n\nYou've mentioned you don't like **${result.name}** — I'll leave it out of your plans.`;
          } else if (userFacts.health_notes.includes("diabetes") && cal > 60) {
            finalResponse += `\n\nFor diabetes: enjoy in moderation and pair with fibre.`;
          }
        }
        taskType = "food_lookup"; toolsUsed = ["food_lookup"];
      } else {
        finalResponse = "Which food would you like to know about?";
        taskType = "clarification";
      }
    }

    // ── Nutrient-rich food sources ─────────────────────────────────────────────
    else if (wantsNutrientSources && nutrientMentioned) {
      const result = await toolGetNutrientRichFoods(c.env.DB, nutrientMentioned, seasonMentioned);
      finalResponse = buildDirectResponse("get_nutrient_rich_foods", result, message);
      taskType = "get_nutrient_rich_foods"; toolsUsed = ["get_nutrient_rich_foods"];
    }

    // ── Availability: "can I get/find X in <season>?" ──────────────────────────
    else if (isAvailabilityQ) {
      const avItem = await c.env.DB.prepare(
        `SELECT name, season FROM items WHERE LOWER(name) = ?1 LIMIT 1`
      ).bind(foodInMsg.name.toLowerCase()).first<any>();
      if (avItem) {
        const itemSeasonLabel = SEASON_LABELS[avItem.season] ?? avItem.season;
        const askedLabel = SEASON_LABELS[explicitSeason] ?? explicitSeason;
        if (avItem.season === "all") {
          finalResponse = `Yes! **${avItem.name}** is available year-round, including ${askedLabel}. 🌿`;
        } else if (avItem.season === explicitSeason) {
          finalResponse = `Yes! **${avItem.name}** is in peak season during ${askedLabel} — the best time to eat it fresh. ✅`;
        } else {
          finalResponse = `**${avItem.name}** is best in **${itemSeasonLabel}**, not ${askedLabel}. You may find cold-stored stock in ${askedLabel}, but it won't be at peak freshness or nutrition.\n\nWant seasonal alternatives? Ask: "What fruits are good in ${askedLabel}?"`;
        }
        taskType = "seasonal_availability"; toolsUsed = ["food_lookup"];
      } else {
        finalResponse = `I couldn't find that food in my database. I track 57 Indian seasonal foods — try asking about fruits, vegetables, grains, dals, dairy, or nuts.`;
        taskType = "clarification";
      }
    }

    // ── Seasonal info ──────────────────────────────────────────────────────────
    else if (wantsSeason && !symptomKey && !m.includes("balanced")) {
      const targetSeason = parsedSeason ?? seasonMentioned ?? currentSeason;
      const journal = await c.env.DB.prepare(
        `SELECT title, description, eat_more, avoid, dosha, ayurvedic_note FROM ritu_journal WHERE season = ?1`
      ).bind(targetSeason).first<any>();

      if (journal) {
        if (intent === "seasonal_avoid" || m.includes("avoid") || m.includes("not eat") || m.includes("what not")) {
          finalResponse = `In **${SEASON_LABELS[targetSeason] ?? targetSeason}**, avoid: **${journal.avoid}**.${journal.dosha ? ` (aggravates ${journal.dosha} dosha)` : ""}\n\nInstead focus on: ${journal.eat_more}.`;
        } else {
          finalResponse = `**${journal.title}**\n\n${journal.description}`;
          if (journal.dosha)         finalResponse += ` Governed by the **${journal.dosha}** dosha.`;
          if (journal.eat_more)      finalResponse += `\n\n✅ **Eat more:** ${journal.eat_more}.`;
          if (journal.avoid)         finalResponse += `\n\n❌ **Avoid:** ${journal.avoid}.`;
          if (journal.ayurvedic_note) finalResponse += `\n\n🌿 ${journal.ayurvedic_note}`;
        }
      } else {
        const result = await toolGetSeasonalFoods(c.env.DB, targetSeason);
        (result as any).foods = filterFoodsForUser((result as any).foods ?? [], userFacts);
        finalResponse = buildDirectResponse("get_seasonal_foods", result, message);
      }
      taskType = "get_seasonal_foods";
    }

    // ── Diet plan ──────────────────────────────────────────────────────────────
    else if (isPlanReq) {
      const season = parsedSeason ?? seasonMentioned ?? currentSeason;
      // BUG 3 fix: vegetarian preference lives in user_facts, not just profiles table
      const isVegUser = userFacts.dietary === "vegetarian" || userFacts.dietary === "vegan" || userFacts.dietary === "jain";
      const dislikesWithNonVeg = isVegUser
        ? [...userFacts.dislikes, "chicken breast", "salmon", "egg"]
        : userFacts.dislikes;
      const profileForPlan = isVegUser
        ? ({ ...(profile ?? {}), dietary_preference: userFacts.dietary } as Profile)
        : profile;
      const result = await toolBuildDietPlan(c.env.DB, profileForPlan, season, userFacts.goal, planDays, dislikesWithNonVeg);
      finalResponse = buildDirectResponse("build_diet_plan", result, message);
      if (profile?.goal) finalResponse += `\n\n_This plan takes your profile goal into account: ${profile.goal}._`;
      if (isPdf && planDays === 7) {
        finalResponse += "\n\n📄 Your 7-day PDF is ready to download.";
        (c as any).__wantsPDF = true;
      }
      (c as any).__planData = result;

      // Update session memory
      try {
        const smKey = `session_summary:${sessionId}`;
        const smRaw = await c.env.SESSIONS.get(smKey);
        const sm = smRaw ? JSON.parse(smRaw) : {topics:[],plans_built:[],foods_mentioned:[],meals_logged:[]};
        const note = `${planDays === 7 ? "7-day" : "Day"} plan (${SEASON_LABELS[season] ?? season}) — ${new Date().toLocaleDateString("en-IN")}`;
        sm.plans_built = [note, ...(sm.plans_built ?? [])].slice(0, 3);
        sm.topics = [`${planDays === 7 ? "Week" : "Day"} diet plan`, ...(sm.topics ?? [])].slice(0, 8);
        await c.env.SESSIONS.put(smKey, JSON.stringify(sm), { expirationTtl: 604800 });
      } catch { /* non-fatal */ }
      taskType = "build_diet_plan"; toolsUsed = ["build_diet_plan"];
    }

    // ── Intake analysis + logging ──────────────────────────────────────────────
    else if (wantsIntake) {
      // Use Gemini-parsed foods (with per-food meal slots) if available
      let foodsWithAmt: Array<{name:string; amount_g:number; meal_slot:string}> = [];

      if (parsedFoods.length > 0) {
        // Gemini gives us per-food meal slots — use them.
        // If a food has NO slot from Gemini, resolve it via the same
        // clause-boundary splitter used in the fallback path (fixes
        // multi-slot messages collapsing into one slot).
        const clauses = splitIntoMealClauses(m);
        for (const f of parsedFoods) {
          let slot = f.meal_slot ?? null;
          if (!slot) {
            const fname = (f.name ?? "").toLowerCase().split(" ")[0];
            const c2 = fname ? clauses.find(cl => cl.text.includes(fname)) : null;
            slot = c2?.slot ?? null;
          }
          foodsWithAmt.push({
            name:      f.name,
            amount_g:  f.amt_g ?? 100,
            meal_slot: slot ?? parsedMealSlot ?? detectMealSlot(message),
          });
        }
      } else {
        // Fallback: extract foods + amounts per meal-clause (splits on "in/for <slot>"
        // markers, not on punctuation — so commas and periods behave identically)
        const clauses = splitIntoMealClauses(m);
        const globalSlot = detectMealSlot(message);
        const seen = new Set<string>();
        for (const clause of clauses) {
          const extracted = await extractFoodsWithAmounts(clause.text, c.env.DB);
          const slot = clause.slot ?? globalSlot;
          for (const e of extracted) {
            const key = `${e.name}|${slot}`;
            if (seen.has(key)) continue;
            seen.add(key);
            foodsWithAmt.push({ name: e.name, amount_g: e.amount_g, meal_slot: slot });
          }
        }
      }

      if (foodsWithAmt.length === 0) {
        finalResponse = "I couldn't match those foods to my seasonal database — I track 57 whole Indian foods (fruits, vegetables, grains, dals, dairy, nuts, and proteins), so prepared dishes like pizza or pasta aren't in it yet.\n\nTry logging the ingredients instead, e.g. 'I ate 100g wheat and 50g paneer for dinner'.";
        taskType = "clarification";
      } else {
        // Analyse (scale nutrients by amount)
        const allFoods  = foodsWithAmt.map(f => f.name);
        const allAmts   = foodsWithAmt.map(f => f.amount_g);
        const result    = await toolAnalyzeIntake(c.env.DB, allFoods, profile, allAmts);
        finalResponse   = buildDirectResponse("analyze_intake", result, message);

        // Portion summary
        const portionSummary = foodsWithAmt.map(f => `${f.name} (${f.amount_g}g)`).join(", ");
        finalResponse = `Portions understood: ${portionSummary}.\n\n${finalResponse}`;

        // Log each food to its correct meal slot
        const today = getISTDateString();
        const loggedNames: string[] = [];
        for (const food of foodsWithAmt) {
          const item = await c.env.DB.prepare(`SELECT id FROM items WHERE name LIKE ?1 LIMIT 1`)
            .bind(`%${food.name}%`).first<any>();
          if (item) {
            await c.env.DB.prepare(
              `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
            ).bind(profileId, sessionId, today, item.id, food.amount_g, food.meal_slot).run();
            loggedNames.push(`${food.name} (${food.amount_g}g → ${food.meal_slot})`);
          }
        }
        if (loggedNames.length > 0) finalResponse += `\n\n✅ Logged: ${loggedNames.join(", ")}.`;

        // Session memory
        try {
          const smKey = `session_summary:${sessionId}`;
          const smRaw = await c.env.SESSIONS.get(smKey);
          const sm = smRaw ? JSON.parse(smRaw) : {topics:[],plans_built:[],foods_mentioned:[],meals_logged:[]};
          sm.meals_logged = [portionSummary, ...(sm.meals_logged ?? [])].slice(0, 5);
          sm.foods_mentioned = [...new Set([...allFoods, ...(sm.foods_mentioned ?? [])])].slice(0, 20);
          sm.topics = ["Meal intake logging", ...(sm.topics ?? [])].slice(0, 8);
          await c.env.SESSIONS.put(smKey, JSON.stringify(sm), { expirationTtl: 604800 });
        } catch { /* non-fatal */ }

        taskType = "analyze_intake"; toolsUsed = ["analyze_intake"];
      }
    }

    // ── Meal slot suggestion ───────────────────────────────────────────────────
    else if (wantsMealSlot) {
      const slot = parsedMealSlot ?? detectMealSlot(message);
      const slotLabel: Record<string,string> = {
        breakfast:"breakfast", mid_morning:"mid-morning snack",
        lunch:"lunch", evening:"evening snack", dinner:"dinner", general:"meal",
      };
      const result = await toolGetSeasonalFoods(c.env.DB, currentSeason);
      const foods  = filterFoodsForUser((result as any).foods ?? [], userFacts)
        .slice(0, 5);
      const suggestions = foods.map((f: any) => `**${f.name}** (${f.calories_per_100g} kcal/100g)`).join(", ");
      finalResponse = suggestions
        ? `For your ${slotLabel[slot] ?? "meal"}: ${suggestions}.\n\nAll seasonal choices for ${SEASON_LABELS[currentSeason] ?? currentSeason}.`
        : "Say 'Build my day plan' for a full personalised meal plan.";
      taskType = "meal_suggestion"; toolsUsed = ["get_seasonal_foods"];
    }

    // ── Symptom advice ─────────────────────────────────────────────────────────
    else if (symptomKey) {
      finalResponse = SYMPTOM_MAP[symptomKey];
      if (userFacts.health_notes.length > 0) {
        finalResponse += `\n\n_Keeping in mind your health notes: ${userFacts.health_notes.join(", ")}._`;
      }
      taskType = "symptom_advice";
    }

    // ── Correction / disagreement handler ────────────────────────────────────
    else if (
      /^(?:no|that.?s wrong|you are wrong|incorrect|not right|wrong|you.?re wrong|nope)[\.!\s]*$/.test(msgClean)
      || /^no[,.]? (?:you are|that.?s|it.?s) (?:wrong|incorrect|not right)/.test(msgClean)
    ) {
      finalResponse = "I'm sorry about that! What specifically was incorrect? Tell me and I'll give you the right answer.";
      taskType = "clarification";
    }

    // ── Follow-up / "tell me more" ─────────────────────────────────────────────
    else if (wantsFollowUp) {
      const lastAsst  = [...history].reverse().find(h => h.role === "assistant" && h.content.length > 50);
      const lastUserQ = [...history].reverse().find(h => h.role === "user" &&
        !/^(?:tell me|please|no i mean|yes but|go on|continue|tell me more)/.test(h.content.toLowerCase()));
      if (lastAsst && geminiKey) {
        const fp = `Previous Q: "${lastUserQ?.content?.slice(0,150) ?? ""}"\nYour answer: "${lastAsst.content.slice(0,250)}"\nUser says: "${message}"\nExpand helpfully in max 80 words.`;
        const sysp = await buildSystemPromptWithFacts(profile, agentContext, c.env.DB, profileId);
        finalResponse = await callGeminiFlash(fp, sysp, geminiKey, []);
      }
      if (!finalResponse) finalResponse = lastAsst?.content ?? "What would you like to know more about?";
      taskType = "follow_up";
    }

    // ── Calorie count / intake summary today ────────────────────────────────────
    else if (
      (m.includes("calorie") && (m.includes("today") || m.includes("count") || m.includes("total") || m.includes("intake")))
      || /what(?: all)? did i eat(?: today)?/.test(m)
      || /what have i (?:eaten|had)(?: today)?/.test(m)
      || (m.includes("meal log") && (m.includes("show") || m.includes("total")))
    ) {
      const today = getISTDateString();
      // Match on EITHER identifier — profile_id and session_id can diverge
      // between the chat widget and dashboard REST calls; this keeps the
      // agent's answer consistent with what the dashboard shows.
      const rows = await c.env.DB.prepare(
        `SELECT i.name, ml.amount_g, ml.meal_slot, i.calories_per_100g
         FROM meal_logs ml JOIN items i ON i.id = ml.item_id
         WHERE (ml.profile_id = ?1 OR ml.session_id = ?2) AND ml.logged_date = ?3
         ORDER BY ml.created_at ASC`
      ).bind(profileId, sessionId, today).all();
      const logs = rows.results as any[];
      const totalCal  = Math.round(logs.reduce((s, l) => s + (l.calories_per_100g * l.amount_g / 100), 0));
      const targetCal = computeTdee(profile ?? {}) ?? 2000;
      const remaining = Math.max(0, targetCal - totalCal);

      if (logs.length === 0) {
        finalResponse = "No meals logged yet today. Tell me what you ate and I'll track your calories.";
      } else if (/what(?: all)? did i eat|what have i (?:eaten|had)/.test(m)) {
        const bySlot: Record<string, string[]> = {};
        for (const l of logs) (bySlot[l.meal_slot ?? "meal"] ??= []).push(l.name);
        const lines = Object.entries(bySlot).map(([slot, foods]) => `**${slot}**: ${foods.join(", ")}`);
        finalResponse = `Today you've had:\n\n${lines.join("\n")}\n\nTotal: ~${totalCal} kcal out of your ~${targetCal} kcal target.`;
      } else {
        finalResponse = `Today you've had **~${totalCal} kcal** out of your **~${targetCal} kcal** target. You have ~${remaining} kcal remaining.`;
      }
      taskType = "calorie_query";
    }

    // ── Veg/non-veg classification ─────────────────────────────────────────────
    else if (m.includes("veg or non veg") || m.includes("vegetarian or not") || m.includes("is it veg") || m.includes("is it non")) {
      const food = parsedFoods[0]?.name ?? foodInMsg?.name ?? "that food";
      const isNV = ["egg","chicken","salmon","fish","meat"].some(f => food.toLowerCase().includes(f));
      finalResponse = `**${food.charAt(0).toUpperCase()+food.slice(1)}** is **${isNV ? "non-vegetarian" : "vegetarian"}** in Indian dietary categories.${isNV ? " Some communities include eggs (eggetarian diet) but most Indian vegetarian diets exclude it." : ""}`;
      taskType = "general";
    }

    // ── Allergy / preference sub-queries ──────────────────────────────────────
    else if (m.includes("allerg") || m.includes("what do i like") || m.includes("what do i dislike") || m.includes("my dislikes") || m.includes("my likes")) {
      const parts: string[] = [];
      if (userFacts.allergies.length)    parts.push(`⚠️ Allergies: ${userFacts.allergies.join(", ")}`);
      if (userFacts.dislikes.length)     parts.push(`🚫 Dislikes: ${userFacts.dislikes.join(", ")}`);
      if (userFacts.likes.length)        parts.push(`✅ Likes: ${userFacts.likes.join(", ")}`);
      finalResponse = parts.length ? parts.join("\n") : "I don't have any recorded preferences yet.";
      taskType = "memory_recall";
    }

    // ── Goal/health question about selected food ──────────────────────────────
    else if (currentItem && (m.includes("my goal") || m.includes("weight goal") || m.includes("my diet") || m.includes("for my"))) {
      const result = await toolFoodLookup(c.env.DB, currentItem.name);
      const goal   = userFacts.goal || profile?.goal || "balanced";
      const cal    = result.calories_per_100g ?? 0;
      const verdict = (goal.includes("lose") && cal > 300) ? "⚠️ Best in moderation" : "✅ Good choice";
      finalResponse = `${verdict} — **${currentItem.name}** (${cal} kcal/100g) for your **${goal}** goal.`;
      taskType = "diet_advice"; toolsUsed = ["food_lookup"];
    }

    // ── Gemini fallback for truly ambiguous queries ────────────────────────────
    else {
      // ── Domain classifier ─────────────────────────────────────────────────
      // This bot's scope is nutrition & health for Indian seasonal eating —
      // not general chat. A message that reaches this point matched none of
      // the ~30 specific handlers above. Before spending a (currently very
      // unreliable) Gemini call on it, decide: is this even in our domain?
      const IN_DOMAIN_SIGNALS = [
        "nutrient","vitamin","mineral","protein","carb","fat","fibre","fiber",
        "calorie","kcal","diet","meal","nutrition","food","eat","eating","drink",
        "recipe","ingredient","portion","serving","snack","breakfast","lunch","dinner",
        "health","weight","bmi","blood pressure","diabetes","sugar","cholesterol",
        "immunity","digestion","digest","symptom","disease","illness","body",
        "exercise","fitness","hydration","allerg","pregnant","child","elderly",
        "season","ritu","monsoon","summer","winter","spring","autumn",
        "dosha","ayurved","vegetarian","vegan","weak","tired","energy",
      ];
      const isInDomain = IN_DOMAIN_SIGNALS.some(k => m.includes(k))
        || !!foodInMsg || !!currentItem || (parsedFoods && parsedFoods.length > 0);

      if (!isInDomain) {
        finalResponse = "Sorry this is out of our expertise. Please feel free to ask any questions from nutrition and health based.";
        taskType = "out_of_domain";
      } else {
      if (geminiKey) {
        try {
          const sysp = await buildSystemPromptWithFacts(profile, agentContext, c.env.DB, profileId)
            + (sessionSummaryText ? `\n\n${sessionSummaryText}` : "");
          finalResponse = await callGeminiFlash(message, sysp, geminiKey, history);
        } catch (e) {
          console.error("Gemini fallback error:", e);
          finalResponse = "";
        }
      }
      if (!finalResponse) {
        if (currentItem) {
          const result = await toolFoodLookup(c.env.DB, currentItem.name);
          finalResponse = buildDirectResponse("food_lookup", result, message);
          taskType = "food_lookup"; toolsUsed = ["food_lookup"];
        } else {
          // Health question about a food that's not in the 57-food DB ("is ghee good for health?")
          const healthQ = m.match(/(?:^|\s)is (?:the )?([a-z][a-z\s]{1,25}?) (?:good|healthy|bad|ok|okay)\b/);
          if (healthQ && healthQ[1]) {
            const unknownFood = healthQ[1].trim();
            finalResponse = `**${unknownFood.charAt(0).toUpperCase() + unknownFood.slice(1)}** isn't in my 57-food seasonal database, so I can't give you exact nutrient numbers for it.\n\n`
              + `As a general rule: whole, minimally processed foods in moderate portions are good for most people. If you tell me your goal, I can suggest similar foods I *do* track — for example: "foods rich in healthy fats" or "compare paneer and tofu".`;
            taskType = "clarification";
          } else {
            finalResponse = "I'm not sure I understood that — I'm best with questions about the 57 Indian seasonal foods I track. Try:\n\n• \"Tell me about spinach\"\n• \"Compare mango and banana\"\n• \"Foods rich in iron\"\n• \"Build a summer diet plan\"\n• \"I ate 2 eggs and milk for breakfast\"";
            taskType = "clarification";
          }
        }
      }
      taskType = "general";
      } // end else (isInDomain) — out-of-domain branch already set its own response above
    }
    } // end if (!dispatchedResponse) — deterministic fallback chain

  } catch (err: any) {
    console.error("Agent error:", err);
    finalResponse = "Something went wrong on my end. Please try again in a moment.";
  }

  // Save messages + update session
  const msgCount = await c.env.DB.prepare(`SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?1`).bind(sessionId).first<any>();
  await saveMessage(c.env.DB, sessionId, "user", message);
  await saveMessage(c.env.DB, sessionId, "assistant", finalResponse, taskType);
  if ((msgCount?.cnt ?? 0) === 0) await updateSessionTitle(c.env.DB, sessionId, message);
  await c.env.DB.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1`).bind(sessionId).run();

  // Log agent action
  try {
    await c.env.DB.prepare(
      `INSERT INTO agent_actions (session_id, action_type, action_data, result_summary)
       VALUES (?1, 'request', ?2, ?3)`
    ).bind(sessionId, JSON.stringify({ message, taskType, tools: toolsUsed }), finalResponse.slice(0, 200)).run();
  } catch { /* non-fatal */ }

  // ── Smart next_actions based on task type + context ───────────────────
  function buildNextActions(task: string, food: string | null, hasProfile: boolean): string[] {
    const dietGoal = userFacts.goal || profile?.goal || "";
    const seasonLabel = agentContext.current_season && agentContext.current_season !== "all"
      ? SEASON_LABELS[agentContext.current_season] ?? agentContext.current_season : "";
    if (task === "food_lookup" && food) {
      return [
        `Compare ${food} with ${food === "Banana" ? "mango" : "banana"}`,
        `Should I eat ${food}?`,
        dietGoal ? `Build a ${dietGoal} plan including ${food}` : `Add ${food} to my diet plan`,
      ];
    }
    if (task === "compare_foods") {
      return ["Which has more protein?", "Build my diet plan", seasonLabel ? `What should I eat in ${seasonLabel}?` : "What should I eat today?"];
    }
    if (task === "build_diet_plan") {
      return ["Give me a full week plan as a PDF", "What do you know about me?", seasonLabel ? `Tell me about ${seasonLabel}` : "Tell me about the current season"];
    }
    if (task === "analyze_intake") {
      return ["What should I eat next?", dietGoal ? `How is this for my ${dietGoal} goal?` : "How does this fit my goal?", "Log my dinner too"];
    }
    if (task === "get_seasonal_foods" || task === "season_info") {
      return ["Build me a seasonal diet plan", "What should I avoid this season?", "What do you know about me?"];
    }
    if (task === "get_nutrient_rich_foods") {
      return ["Build me a diet plan", food ? `Tell me more about ${food}` : "Tell me about guava", "What do you know about me?"];
    }
    if (task === "bmi") {
      return ["Build a diet plan for my goal", "What should I eat today?", "Tell me about my nutrition score"];
    }
    if (task === "meal_suggestion" || task === "intake_suggestion") {
      return ["Log this meal", "What's my calorie count today?", "Build my day plan"];
    }
    return hasProfile
      ? ["What should I eat today?", "Build my diet plan", "What do you know about me?"]
      : ["Tell me about guava", "Build my day plan", "What can you do?"];
  }

  // ── Lightweight multi-intent addendum ────────────────────────────────────
  // Full multi-intent parsing (N independent intents executed and merged) is a
  // bigger architectural change; this handles the common real-world pattern —
  // a real question with a pleasantry riding along ("thanks, what's my calorie
  // count, bye") — by acknowledging the pleasantry alongside the primary answer,
  // instead of either intent silently winning and the other being dropped.
  if (finalResponse && taskType !== "greeting" && taskType !== "farewell" && taskType !== "smalltalk") {
    const endsWithBye = /(?:,|\.|;|\s)\s*(bye+|goodbye|see\s*you|good\s*night|ttyl|take\s*care)\s*[!.]*$/i.test(msgClean);
    const startsWithThanks = /^(?:thanks?|thank\s*you|thx|ty)\b/i.test(msgClean) && msgClean.length > 12;
    if (endsWithBye) {
      finalResponse += "\n\nTake care! 👋";
    } else if (startsWithThanks) {
      finalResponse = "You're welcome! " + finalResponse;
    }
  }

  const smartNextActions = buildNextActions(taskType, currentItem?.name ?? null, !!profile || Object.keys(userFacts).some(k => (userFacts as any)[k]?.length > 0));

  return c.json({
    session_id: sessionId, message: finalResponse, task_type: taskType,
    tools_used: toolsUsed, mode: toolsUsed.length > 0 ? "tool-assisted" : "conversational",
    agent_state: "complete", used_profile: !!profile, used_selected_item: !!currentItem,
    selected_item: currentItem, next_actions: smartNextActions, cards: [],
    citations: toolsUsed.length > 0 ? ["NutriMentor food database (ICMR-NIN)"] : [],
    plan_data: (c as any).__planData ?? null,
    wants_pdf: (c as any).__wantsPDF ?? false,
  });
});


// ── PHASE 2: Morning Insight endpoint ────────────────────────────────────

app.get("/agent/morning/:profile_id", async (c) => {
  const profileId = c.req.param("profile_id");
  const today = getISTDateString();
  const cached = await c.env.SESSIONS.get(`morning:${profileId}:${today}`);
  if (cached) return c.json(JSON.parse(cached));

  // Generate on-demand if not pre-generated by cron
  const insight = await generateMorningInsight(profileId, c.env.DB, c.env.GEMINI_API_KEY ?? "");
  if (insight) {
    await c.env.SESSIONS.put(`morning:${profileId}:${today}`, JSON.stringify(insight), {
      expirationTtl: 86400,
    });
    return c.json(insight);
  }
  return c.json(null);
});

// ── PHASE 2: Season transition endpoint ──────────────────────────────────

app.get("/agent/season-check/:profile_id", async (c) => {
  const profileId = c.req.param("profile_id");
  const current = getCurrentSeason();
  const lastSeen = await c.env.SESSIONS.get(`last_season:${profileId}`);

  if (lastSeen && lastSeen !== current) {
    // Season changed since last visit!
    const journal = await c.env.DB.prepare(
      `SELECT * FROM ritu_journal WHERE season = ?1`
    ).bind(current).first<any>();

    await c.env.SESSIONS.put(`last_season:${profileId}`, current, {
      expirationTtl: 60 * 60 * 24 * 30,
    });

    return c.json({
      changed: true,
      from: lastSeen,
      to: current,
      journal,
    });
  }

  // Store current season
  await c.env.SESSIONS.put(`last_season:${profileId}`, current, {
    expirationTtl: 60 * 60 * 24 * 30,
  });

  return c.json({ changed: false, current });
});

// ── PHASE 4.2: Ingredient swap endpoint ───────────────────────────────────────

app.post("/agent/task/swap", async (c) => {
  const body = await c.req.json();
  const { food_name, season, profile_id } = body;
  if (!food_name) return c.json({ error: "food_name is required" }, 400);

  const uf = profile_id
    ? await loadUserFacts(profile_id, c.env.DB)
    : { dislikes: [], likes: [], dietary: "", health_notes: [], allergies: [], goal: "", lifestyle: "" };
  const isVegU = uf.dietary === "vegetarian" || uf.dietary === "vegan" || uf.dietary === "jain";
  const targetSeason = (season && season !== "all") ? season : getCurrentSeason();

  const alternatives = await findIngredientSwap(
    applyFoodAlias(String(food_name)), c.env.DB, targetSeason, uf.dislikes, isVegU
  );
  return c.json({ food: food_name, season: targetSeason, alternatives });
});

// ── Diet plan endpoint ────────────────────────────────────────────────────────

app.post("/agent/task/diet-plan", async (c) => {
  const body = await c.req.json();
  const { season, goal, days, profile, profile_id } = body;

  // PHASE 1: load dislikes and dietary preference if profile_id provided
  const userFactsForPlan = profile_id
    ? await loadUserFacts(profile_id, c.env.DB)
    : { dislikes: [], likes: [], dietary: "", health_notes: [], allergies: [], goal: "", lifestyle: "" };

  const profileWithFacts: Profile | null = (profile || userFactsForPlan.dietary) ? {
    ...(profile ?? {}),
    dietary_preference: userFactsForPlan.dietary || profile?.dietary_preference,
  } as Profile : null;
  const result = await toolBuildDietPlan(
    c.env.DB, profileWithFacts, season ?? "all", goal, Math.min(days ?? 1, 7), userFactsForPlan.dislikes
  );
  return c.json(result);
});

// ── Intake analysis endpoint ──────────────────────────────────────────────────

app.post("/agent/task/analyze-intake", async (c) => {
  const body = await c.req.json();
  const { foods, profile } = body;
  if (!foods?.length) return c.json({ error: "No foods provided" }, 400);
  const result = await toolAnalyzeIntake(c.env.DB, foods, profile ?? null);
  return c.json(result);
});

// ── Export — includes scheduled cron for Phase 2 ────────────────────────────
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env);
  },
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runMorningInsights(env);
  },
};