import { Hono } from "hono";
import { cors } from "hono/cors";

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

// ── PHASE 1: Fact extraction — learns from conversation ──────────────────────
// Deterministic pattern matching — no AI needed for this.
// All learned facts stored in user_facts table.

async function extractAndStoreFacts(
  message: string,
  profileId: string,
  db: D1Database
): Promise<string[]> {
  const m = message.toLowerCase();
  const stored: string[] = [];
  // Wrap all fact storage in try/catch — a DB error must never crash the agent response

  // ── Dislikes ──
  const dislikePatterns: Array<[RegExp, number]> = [
    [/i (?:don't|do not|hate|dislike|avoid)(?: (?:eating|having|drinking|consuming|to eat|to drink|to have|to consume))? ([a-z][a-z\s]{1,35}?)(?:\s*[.,!]|$)/, 1],
    [/([a-z][a-z\s]{1,35}?) (?:is|are) (?:gross|bad|terrible|disgusting|awful)/, 1],
    [/not a fan of ([a-z][a-z\s]{1,35}?)(?:\s*[.,!]|$)/, 1],
    [/i (?:can't|cannot) (?:eat|stand|have|drink|consume) ([a-z][a-z\s]{1,35}?)(?:\s*[.,!]|$)/, 1],
    [/i (?:don't|do not) like (?:to )?(?:eat|drink|have|consume) ([a-z][a-z\s]{1,35}?)(?:\s*[.,!]|$)/, 1],
    [/i (?:don't|do not) like ([a-z][a-z\s]{1,35}?)(?:\s*[.,!]|$)/, 1],
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

      const stopWords = ["like","love","eat","have","a","the","my","i","to","and","or","is","are"];
      for (const foodName of foodCandidates) {
        const firstWord = foodName.split(" ")[0];
        if (stopWords.includes(firstWord)) continue;
        // Normalize common spelling variants before storing
        const SPELLING_MAP: Record<string, string> = {
          "soyabean": "soybean", "soya bean": "soybean", "soya": "soybean",
          "chilli": "chili", "chillies": "chili",
          "brinjal": "eggplant", "karela": "bitter gourd",
          "aloo": "potato", "palak": "spinach", "pyaz": "onion",
        };
        const normalizedName = SPELLING_MAP[foodName.toLowerCase()] || foodName;
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
  const likePatterns: Array<[RegExp, number]> = [
    [/i (?:love|enjoy|prefer|adore)(?: eating)? ([a-z][a-z\s,]{1,60}?)(?:\s*[.!]|$)/, 1],
    [/i like ([a-z][a-z\s,]{1,60}?)(?:\s*[.!]|$)/, 1],
    [/([a-z][a-z\s]{1,35}?) (?:is|are) (?:my favorite|my favourite|delicious|amazing)/, 1],
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

      const stopWords = ["like","love","eat","have","a","the","my","i","to","and","or"];
      for (const foodName of foodCandidates) {
        const firstWord = foodName.split(" ")[0];
        if (stopWords.includes(firstWord)) continue;
        if (foodName.length > 1 && foodName.length < 40) {
          await db.prepare(
            `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
             VALUES (?1, 'preference', ?2, 'like', 'conversation', datetime('now'))
             ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
             fact_value='like', updated_at=datetime('now')`
          ).bind(profileId, foodName).run();
          stored.push(`like:${foodName}`);
        }
      }
    }
  }

  // ── Dietary preference ──
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
  ];
  for (const allergyPat of allergyPatterns) {
    const allergyMatch = m.match(allergyPat);
    if (allergyMatch?.[1]) {
      const allergen = allergyMatch[1].trim();
      // Skip non-food allergens like "dogs", "cats", "pollen"
      const nonFoodAllergens = ["dog","cat","pollen","dust","pet","animal","bee","insect","latex","mold","mould"];
      const isNonFood = nonFoodAllergens.some(a => allergen.includes(a));
      if (!isNonFood && allergen.length > 1 && allergen.length < 30) {
        await db.prepare(
          `INSERT INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, updated_at)
           VALUES (?1, 'allergy', ?2, 'true', 'conversation', datetime('now'))
           ON CONFLICT(profile_id, fact_type, fact_key) DO UPDATE SET
           fact_value='true', updated_at=datetime('now')`
        ).bind(profileId, allergen).run();
        stored.push(`allergy:${allergen}`);
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

async function logMealFromMessage(
  message: string,
  profileId: string,
  db: D1Database
): Promise<{ logged: string[]; notFound: string[] }> {
  const foods = await extractFoodsFromText(message.toLowerCase(), db);
  if (foods.length === 0) return { logged: [], notFound: [] };

  const mealSlot = detectMealSlot(message);
  const today = new Date().toISOString().split("T")[0];
  const logged: string[] = [];
  const notFound: string[] = [];

  for (const foodName of foods) {
    const item = await db.prepare(
      `SELECT id FROM items WHERE name LIKE ?1 LIMIT 1`
    ).bind(`%${foodName}%`).first<any>();

    if (item) {
      await db.prepare(
        `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
         VALUES (NULL, ?1, ?2, ?3, 100, ?4, datetime('now'))`
      ).bind(profileId, today, item.id, mealSlot).run();
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
async function toolBuildDietPlan(
  db: D1Database,
  profile: Profile | null,
  season: string,
  goal?: string,
  days = 1,
  dislikedFoods: string[] = []   // ← Phase 1: excluded foods
) {
  const effectiveGoal = goal || profile?.goal || "balanced";
  const tdee = profile ? computeTdee(profile) : null;
  const isVeg = profile?.dietary_preference === "vegetarian"
    || profile?.dietary_preference === "vegan";

  let targetCal = tdee ?? 2000;
  if (effectiveGoal.includes("gain") || effectiveGoal.includes("increase")) targetCal += 400;
  else if (effectiveGoal.includes("lose") || effectiveGoal.includes("weight loss")) targetCal -= 400;

  // Exclude disliked foods using LIKE for fuzzy name matching
  // Normalize spelling variants AND expand to catch all forms in the DB
  const PLAN_SPELLING_MAP: Record<string, string> = {
    "soyabean": "soybean", "soya bean": "soybean", "soya": "soybean",
    "brinjal": "eggplant", "karela": "bitter gourd", "palak": "spinach",
  };
  // Normalize + deduplicate dislikes, then expand each to catch DB name variants
  const rawDislikes = dislikedFoods.map(d => d.toLowerCase().trim());
  const normalizedDislikes = [...new Set(rawDislikes.map(d => PLAN_SPELLING_MAP[d] || d))];
  // Add both original and normalized forms so '%soyabean%' and '%soybean%' both filter
  const allDislikeForms = [...new Set([...rawDislikes, ...normalizedDislikes])];
  const dislikedLower = allDislikeForms;

  // Build NOT LIKE conditions — each dislike gets its own ?N param
  // Produce: ?1=season, ?2..=dislikes
  const produceNotLike = dislikedLower.length > 0
    ? dislikedLower.map((_, i) => `LOWER(i.name) NOT LIKE ?${i + 2}`).join(" AND ")
    : "";
  const produceDislikeFilter = produceNotLike ? `AND ${produceNotLike}` : "";
  // Add % wildcards for fuzzy match
  const dislikedFuzzy = dislikedLower.map(d => `%${d}%`);
  const produceBinds: any[] = [season, ...dislikedFuzzy];
  const produceQ = db.prepare(
    `SELECT i.id, i.name, i.category, i.calories_per_100g FROM items i
     WHERE i.category IN ('fruit', 'vegetable') AND (i.season = ?1 OR i.season = 'all')
     AND i.calories_per_100g >= 20 ${produceDislikeFilter} ORDER BY RANDOM() LIMIT 12`
  ).bind(...produceBinds);

  // Protein: ?1..=dislikes (no season)
  const cats = isVeg ? "'legume','dairy','nut','grain'" : "'legume','dairy','nut','grain','protein'";
  const proteinNotLike = dislikedLower.length > 0
    ? dislikedLower.map((_, i) => `LOWER(i.name) NOT LIKE ?${i + 1}`).join(" AND ")
    : "";
  const proteinDislikeFilter = proteinNotLike ? `AND ${proteinNotLike}` : "";
  const proteinBinds: any[] = [...dislikedFuzzy];
  const proteinQ = db.prepare(
    `SELECT i.id, i.name, i.category, i.calories_per_100g FROM items i
     WHERE i.category IN (${cats}) ${proteinDislikeFilter} ORDER BY RANDOM() LIMIT 12`
  ).bind(...proteinBinds);

  const [produceRes, proteinRes] = await Promise.all([produceQ.all(), proteinQ.all()]);
  const produce = produceRes.results as any[];
  const proteins = proteinRes.results as any[];

  const fruits   = produce.filter((f: any) => f.category === "fruit");
  const veggies  = produce.filter((f: any) => f.category === "vegetable");
  const grains   = proteins.filter((p: any) => p.category === "grain");
  const dals     = proteins.filter((p: any) => p.category === "legume");
  const dairy    = proteins.filter((p: any) => p.category === "dairy");
  const nuts     = proteins.filter((p: any) => p.category === "nut");
  const meats    = proteins.filter((p: any) => p.category === "protein");

  const fallbackGrain = grains.length  ? grains  : [{ name: "Brown Rice" }, { name: "Oats" }];
  const fallbackDal   = dals.length    ? dals    : [{ name: "Lentils" }, { name: "Moong Dal" }];
  const fallbackDairy = dairy.length   ? dairy   : [{ name: "Curd" }, { name: "Paneer" }];
  const fallbackNut   = nuts.length    ? nuts    : [{ name: "Almonds" }, { name: "Walnuts" }];
  const fallbackFruit = fruits.length  ? fruits  : [{ name: "Banana" }, { name: "Apple" }];
  const fallbackVeg   = veggies.length ? veggies : [{ name: "Spinach" }, { name: "Carrot" }];
  const proteinSource = meats.length && !isVeg ? meats : fallbackDal;

  const pick = (arr: any[], i = 0) => arr[i % arr.length]?.name ?? arr[0]?.name ?? "seasonal food";

  const plan = [];
  for (let d = 0; d < days; d++) {
    plan.push({
      day: d + 1,
      day_label: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][d % 7],
      calorie_target: targetCal,
      meals: {
        breakfast:   { foods: [pick(fallbackFruit, d), pick(fallbackGrain, d)],           note: "Start light — fruit gives natural sugars, grain provides sustained energy" },
        mid_morning: { foods: [pick(fallbackFruit, d + 1), pick(fallbackNut, d)],          note: "Small snack to maintain blood sugar" },
        lunch:       { foods: [pick(fallbackVeg, d), pick(fallbackDal, d), pick(fallbackGrain, d + 1)], note: "Main meal — balanced macros: protein, carbs, and fibre" },
        evening:     { foods: [pick(fallbackFruit, d + 2), pick(fallbackNut, d + 1)],      note: "Light energy before dinner" },
        dinner:      { foods: [pick(fallbackVeg, d + 1), pick(proteinSource, d), pick(fallbackGrain, d + 2)], note: "Lighter than lunch — easier digestion at night" },
      },
    });
  }

  return {
    profile_used: !!profile,
    goal: effectiveGoal,
    season,
    season_label: SEASON_LABELS[season] ?? season,
    calorie_target: targetCal,
    vegetarian: isVeg,
    excluded_foods: dislikedFoods,
    days: plan,
    note: "All quantities approximate at 100g per food item. Adjust portions to your calorie target.",
  };
}

async function toolAnalyzeIntake(db: D1Database, foods: string[], profile: Profile | null) {
  const totals: Record<string, { amount: number; unit: string }> = {};
  let totalCal = 0;
  const foundFoods: string[] = [];
  const notFound: string[] = [];

  for (const foodName of foods) {
    const r = await toolFoodLookup(db, foodName);
    if (!r.found) { notFound.push(foodName); continue; }
    foundFoods.push(r.name!);
    totalCal += r.calories_per_100g!;
    for (const n of r.nutrients ?? []) {
      if (!totals[n.name]) totals[n.name] = { amount: 0, unit: n.unit };
      totals[n.name].amount += n.amount;
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  // Try once, retry after 6s on 429 (rate limit)
  for (let attempt = 0; attempt < 2; attempt++) {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (resp.status === 429 || resp.status === 503) {
      if (attempt === 0) {
        // 429 = rate limit (wait 6s), 503 = service unavailable (wait 3s)
        const waitMs = resp.status === 429 ? 6000 : 3000;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      console.error(`Gemini ${resp.status} — both attempts exhausted`);
      return "";
    }

    if (!resp.ok) {
      console.error("Gemini error:", resp.status, await resp.text());
      return "";
    }

    const data = await resp.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    // Guard: reject JSON blobs — all nutrition data must come from D1
    if (text.startsWith("{") || text.startsWith("[") || text.includes('"name":')) return "";
    return text;
  }

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
    const today = new Date().toISOString().split("T")[0];
    const todayLogs = await db.prepare(
      `SELECT i.name, ml.meal_slot FROM meal_logs ml JOIN items i ON i.id = ml.item_id
       WHERE ml.session_id = ?1 AND ml.logged_date = ?2 ORDER BY ml.created_at ASC LIMIT 8`
    ).bind(profileId, today).all();
    if (todayLogs.results.length > 0) {
      const mealLines = (todayLogs.results as any[]).map(l => `${l.meal_slot}: ${l.name}`).join(", ");
      todayMealContext = `\n\nToday's logged meals: ${mealLines}`;
    }
  } catch { /* non-fatal */ }

  return base + `\n\nWhat I know about this user from our conversations:\n${factLines}\n\nAlways use these learned preferences when giving advice. Never suggest foods the user has said they dislike.` + todayMealContext;
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
      return `**Day plan for ${result.season_label}** (target: ~${result.calorie_target} kcal)\n\n🌅 Breakfast: ${m.breakfast?.foods?.join(" + ")}\n🍎 Mid-morning: ${m.mid_morning?.foods?.join(" + ")}\n🍱 Lunch: ${m.lunch?.foods?.join(" + ")}\n🫖 Evening: ${m.evening?.foods?.join(" + ")}\n🌙 Dinner: ${m.dinner?.foods?.join(" + ")}\n\n${result.note}${excludeNote}`;
    } else {
      // Multi-day plan — show all days
      const dayLines = result.days.map((d: any) => {
        const m = d.meals;
        return `**${d.day_label} (Day ${d.day})**\n🌅 ${m.breakfast?.foods?.join(" + ")} · 🍱 ${m.lunch?.foods?.join(" + ")} · 🌙 ${m.dinner?.foods?.join(" + ")}`;
      }).join("\n\n");
      return `**${result.days.length}-day plan for ${result.season_label}** (~${result.calorie_target} kcal/day)\n\n${dayLines}\n\n${result.note}${excludeNote}`;
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

async function getOrCreateSession(db: D1Database, kv: KVNamespace, sessionId: string) {
  const existing = await db.prepare(`SELECT id FROM sessions WHERE id = ?1`).bind(sessionId).first();
  if (existing) return existing;
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
  const today = new Date().toISOString().split("T")[0];

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
      const geminiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: geminiBody }
      );
      if (geminiResp.ok) {
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

  const today = new Date().toISOString().split("T")[0];

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

  const unique = [...new Set(knownSessions)].slice(0, 10);
  const placeholders = unique.map((_, i) => `?${i + 1}`).join(",");

  const result = await c.env.DB.prepare(
    `SELECT s.id as session_id, s.title, s.updated_at,
     (SELECT content FROM messages WHERE session_id = s.id AND role = 'user'
      ORDER BY created_at ASC LIMIT 1) as first_message,
     (SELECT COUNT(*) FROM messages WHERE session_id = s.id) as message_count
     FROM sessions s
     WHERE s.id IN (${placeholders})
     ORDER BY s.updated_at DESC`
  ).bind(...unique).all();

  const withMessages = (result.results as any[]).filter(
    s => s.first_message && (s.message_count as number) > 0
  );
  return c.json(withMessages);
});

app.get("/agent/sessions/:id", async (c) => {
  const session = await c.env.DB.prepare(`SELECT * FROM sessions WHERE id = ?1`).bind(c.req.param("id")).first();
  if (!session) return c.json({ error: "Not found" }, 404);
  const messages = await c.env.DB.prepare(
    `SELECT role, content, task_type, created_at FROM messages
     WHERE session_id = ?1 ORDER BY created_at ASC LIMIT 50`
  ).bind(c.req.param("id")).all();
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
  const journal = await c.env.DB.prepare(`SELECT * FROM ritu_journal WHERE season = ?1`).bind(season).first();
  if (!journal) return c.json({ error: "Season not found" }, 404);
  const foods = await c.env.DB.prepare(
    `SELECT id, name, category, calories_per_100g, image_url FROM items
     WHERE season = ?1 OR season = 'all' ORDER BY category, name`
  ).bind(season).all();
  return c.json({ ...journal, foods: foods.results });
});

app.get("/ritu", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT season, title, description, eat_more, avoid, dosha FROM ritu_journal ORDER BY id`
  ).all();
  return c.json(result.results);
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

  const today = body.logged_date ?? new Date().toISOString().split("T")[0];

  await c.env.DB.prepare(
    `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
     VALUES (NULL, ?1, ?2, ?3, ?4, ?5, datetime('now'))`
  ).bind(body.profile_id, today, body.item_id, body.amount_g ?? 100, body.meal_slot ?? "meal").run();

  return c.json({ ok: true, logged_date: today });
});

app.get("/meals/today/:profile_id", async (c) => {
  const today = new Date().toISOString().split("T")[0];
  const result = await c.env.DB.prepare(
    `SELECT ml.id, ml.logged_date, ml.meal_slot, ml.amount_g,
     i.name, i.calories_per_100g, i.category, i.image_url
     FROM meal_logs ml
     JOIN items i ON i.id = ml.item_id
     WHERE ml.session_id = ?1 AND ml.logged_date = ?2
     ORDER BY ml.created_at ASC`
  ).bind(c.req.param("profile_id"), today).all();

  const logs = result.results as any[];
  const totalCal = logs.reduce((sum, l) => sum + (l.calories_per_100g * (l.amount_g / 100)), 0);

  return c.json({ date: today, logs, total_calories: Math.round(totalCal) });
});

app.get("/meals/week/:profile_id", async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT ml.id, ml.logged_date, ml.meal_slot, ml.amount_g,
     i.name, i.calories_per_100g, i.category
     FROM meal_logs ml
     JOIN items i ON i.id = ml.item_id
     WHERE ml.session_id = ?1 AND ml.logged_date >= date('now', '-7 days')
     ORDER BY ml.logged_date DESC, ml.created_at ASC`
  ).bind(c.req.param("profile_id")).all();

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

  await getOrCreateSession(c.env.DB, c.env.SESSIONS, sessionId);

  // Load conversation history
  const historyResult = await c.env.DB.prepare(
    `SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 10`
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
    stored = await extractAndStoreFacts(message, profileId, c.env.DB);
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
  const msgLower = message.toLowerCase().trim();
  const msgClean = msgLower.replace(/[!?.]+$/, "").trim();

  const GREETINGS    = ["hi", "hello", "hey", "hola", "namaste", "howdy", "sup", "yo", "hai"];
  const BYES         = ["bye", "goodbye", "see you", "ciao", "alvida", "tata", "byee", "byebye",
                         "bye bye", "good bye", "byeee", "byeeee", "bbye", "bay", "bb",
                         "see ya", "later", "ttyl", "tata", "cheerio", "cya"];
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
  const isThanks   = !hasActionAfterThanks && THANKS.some(t => msgClean.includes(t));
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
                     msgClean.includes("are you claude") || msgClean.includes("are you an ai");
  const isAccuracy = msgClean.includes("how accurate") || msgClean.includes("are you accurate") ||
                     msgClean.includes("is this accurate") || msgClean.includes("is the data accurate") ||
                     msgClean.includes("is that all you know") || msgClean.includes("accuracy");
  const hasDietIntent = msgClean.includes("diet") || msgClean.includes("plan") || msgClean.includes("what to eat");
  const isMemory   = !hasDietIntent && MEMORY_PHRASES.some(p => msgClean.includes(p));
  // Memory update: "remove X from likes" / "delete X from dislikes"
  const isMemoryUpdate = /(?:remove|delete|forget) .{1,30} from (?:my )?(?:likes|dislikes|preferences|memory|allergies)/i.test(message)
    || /(?:i no longer|i don.?t anymore|forget that i) (?:like|dislike|hate|love) .{1,30}/i.test(message);

  const VAGUE = ["this","this one","tell me about this","what is this",
                 "what about this","this food","should i eat this","is it good","is this good","this item",
                 "is it healthy","is it healthy for me","is this healthy","is this healthy for me",
                 "should i include this","should i include this in my diet","should i add this",
                 "should i add it","should i add it to my diet","should i add this to my diet",
                 "can i eat this","can i have this","is this good for me","is it good for me",
                 "is this ok","is it ok","what is this food","about it"];
  // Exclude "it" alone if it appears in a question about a plan ("will it help", "does it work")
  const itAlone = msgClean === "it" || msgClean === "that";
  const itInPlanQuestion = /will it|does it|can it|is it (?:good|healthy|ok)|about it/.test(msgClean);
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

  // Memory update handler — "remove panner from likes", "forget that I dislike soybean"
  if (isMemoryUpdate) {
    // Extract the food name and operation from the message
    const removeMatch = message.match(/(?:remove|delete|forget) (.{1,30}?) from (?:my )?(?:likes|dislikes|preferences|memory|allergies)/i);
    const noLongerMatch = message.match(/(?:i no longer|i don.?t anymore|forget that i) (?:like|dislike|hate|love) (.{1,30})/i);
    const itemToRemove = (removeMatch?.[1] || noLongerMatch?.[1] || "").trim().toLowerCase();
    const isFromLikes = /likes|preference/i.test(message);
    const isFromDislikes = /dislikes|hate/i.test(message);

    if (itemToRemove) {
      // Delete from user_facts
      try {
        if (isFromDislikes) {
          await c.env.DB.prepare(
            `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'dislike' AND LOWER(fact_key) LIKE ?2`
          ).bind(profileId, `%${itemToRemove}%`).run();
        } else {
          // Remove from likes (preference table, not 'dietary')
          await c.env.DB.prepare(
            `DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = 'preference' AND fact_key != 'dietary' AND LOWER(fact_key) LIKE ?2`
          ).bind(profileId, `%${itemToRemove}%`).run();
        }
      } catch { /* non-fatal */ }

      // Reload updated facts and confirm
      const updatedFacts = await loadUserFacts(profileId, c.env.DB);
      const lines: string[] = [];
      if (updatedFacts.dislikes.length)     lines.push(`🚫 Dislikes: ${updatedFacts.dislikes.join(", ")}`);
      if (updatedFacts.likes.length)        lines.push(`✅ Likes: ${updatedFacts.likes.join(", ")}`);
      if (updatedFacts.health_notes.length) lines.push(`🏥 Health notes: ${updatedFacts.health_notes.join(", ")}`);
      const memSummary = lines.length ? `\n\n${lines.join("\n")}` : "";
      const msg = `Got it! I've removed **${itemToRemove}** from your ${isFromDislikes ? "dislikes" : "likes"}. Here's what I know now:${memSummary}`;
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

  // ── Deterministic routing ─────────────────────────────────────────────────
  let finalResponse = "";
  let taskType      = "general";
  let toolsUsed: string[] = [];

  const m = msgClean;
  const foodInMsg = await findFoodInMessage(m, c.env.DB);

  const NUTRIENT_KEYWORDS: Record<string, string> = {
    "vitamin c":"Vitamin C","vitamin a":"Vitamin A","vitamin d":"Vitamin D",
    "vitamin e":"Vitamin E","vitamin k":"Vitamin K","vitamin b6":"Vitamin B6",
    "protein":"Protein","fiber":"Fiber","fibre":"Fiber","iron":"Iron",
    "calcium":"Calcium","magnesium":"Magnesium","potassium":"Potassium",
    "zinc":"Zinc","folate":"Folate","phosphorus":"Phosphorus",
    "sodium":"Sodium","fat":"Fat","carbs":"Carbohydrates","carbohydrates":"Carbohydrates",
    "sugar":"Sugar","calories":"Calories","energy":"Calories",
  };
  const nutrientMentioned = Object.entries(NUTRIENT_KEYWORDS).find(([kw]) => m.includes(kw))?.[1];

  const SEASON_MAP: Record<string, string> = {
    "spring":"spring","vasanta":"spring","summer":"summer","grishma":"summer",
    "monsoon":"monsoon","varsha":"monsoon","rainy":"monsoon","autumn":"autumn","sharad":"autumn",
    "prewinter":"prewinter","hemanta":"prewinter","pre-winter":"prewinter",
    "winter":"winter","shishira":"winter",
  };
  const seasonMentioned = Object.entries(SEASON_MAP).find(([kw]) => m.includes(kw))?.[1]
    ?? agentContext.current_season ?? "all";

  const wantsFoodInfo        = !!(foodInMsg && (m.includes("tell me") || m.includes("what is") || m.includes("about") || m.includes("show") || m.includes("info") || m.startsWith(foodInMsg.name.toLowerCase())));
  const wantsNutrients       = !!(foodInMsg && nutrientMentioned);
  // "I have high sugar" = health note, not a nutrient query — exclude health-statement patterns
  const isHealthStatement = /i have|i am|i suffer|i often|i get/.test(m);
  const wantsNutrientSources = !!(nutrientMentioned && !isHealthStatement && (m.includes("rich") || m.includes("source") || m.includes("high") || m.includes("best") || m.includes("foods")));
  const wantsCompare         = m.includes("compare") || m.includes(" vs ") || m.includes("versus") || m.includes("difference between") || m.includes("which is better") || m.includes("which has more");
  // Exclude questions ABOUT a plan (not requesting a new one)
  // Also catches "will it help", "will this help", "is this good for"
  const isAskingAboutPlan = (
    /will (?:this|it) (?:help|work|be good|increase|decrease|reduce|improve)/.test(m) ||
    (/will this|does this|can this|is this/.test(m) && /plan|diet|help|work/.test(m)) ||
    /(?:help me|cure|fix|heal)/.test(m)
  );
  const MEAL_SLOTS = "breakfast|lunch|dinner|evening|morning|night|snack";
  const wantsMealSlot =
    new RegExp(`(?:now )?what (?:should i|can i|to) (?:eat|have|cook|make) (?:(?:for|in|at) )?(?:${MEAL_SLOTS})`).test(m)
    || new RegExp(`what (?:to eat|should i eat|can i eat|do i eat) (?:now|today|tonight|for) (?:${MEAL_SLOTS})?`).test(m)
    || new RegExp(`(?:for|in|at) (?:${MEAL_SLOTS}).*(?:what|suggest|recommend|eat|have)`).test(m)
    || new RegExp(`(?:what|suggest|tell me).*(?:for|in|at) (?:${MEAL_SLOTS})`).test(m)
    || new RegExp(`(?:${MEAL_SLOTS}) (?:idea|suggestion|option|recommendation)`).test(m)
    || new RegExp(`now what (?:should i|can i|to) (?:eat|have) (?:(?:in|for|at) )?(?:${MEAL_SLOTS})`).test(m)
    || new RegExp(`(?:what|suggest) (?:should i|can i) (?:eat|have) (?:in|for|at) (?:${MEAL_SLOTS})`).test(m);
  // "what to eat now" / "what should i eat" without "plan" keyword → context suggestion, not full plan
  const isVagueEatNow = /what (?:to eat|should i eat|can i eat) (?:now|next|today)(?:\s*\?)?$/.test(m)
    && !m.includes("plan") && !m.includes("for the day") && !m.includes("week");
  // "add X to my diet" = a food question, NOT a plan-build request
  // "should I add wheat in my diet?" = wantsHealth question
  const isAddToDietQuestion = (
    /add .{1,30} to my (?:diet|plan)/i.test(m) ||
    /should i add .{1,30} (?:to|in) my (?:diet|plan)/i.test(m) ||
    /include .{1,30} in my (?:diet|plan)/i.test(m)
  );
  // "build me a seasonal diet plan" / "diet plan for monsoon" = wantsDiet, NOT wantsSeason
  const isSeasonalDietPlan = (
    (m.includes("build") || m.includes("make") || m.includes("create") || m.includes("give")) &&
    m.includes("plan") && (m.includes("season") || Object.keys(SEASON_MAP).some(k => m.includes(k)))
  ) || (
    m.includes("diet plan") && (m.includes("season") || Object.keys(SEASON_MAP).some(k => m.includes(k)))
  ) || (
    m.includes("seasonal") && (m.includes("diet") || m.includes("plan"))
  );
  const wantsDiet = !isAskingAboutPlan && !wantsMealSlot && !isVagueEatNow && !isAddToDietQuestion && (
    isSeasonalDietPlan ||
    m.includes("diet") || m.includes("meal plan") || m.includes("day plan") ||
    m.includes("week plan") || m.includes("what to eat") || (m.includes("build") && m.includes("plan")) ||
    (m.includes("make") && m.includes("plan")) || (m.includes("create") && m.includes("plan"))
  );
  // "what should I eat for dinner" is a meal-slot suggestion, NOT intake logging
  // Only trigger intake when user is REPORTING what they ate, not asking what to eat
  const isReportingIntake = m.includes("i ate") || m.includes("i had") || m.includes("i consumed") || m.includes("analyze my");
  // "for breakfast/lunch/dinner" triggers intake ONLY when combined with reporting words
  const hasMealSlotReport = (m.includes("for breakfast") || m.includes("for lunch") || m.includes("for dinner"))
    && !m.includes("what should") && !m.includes("what can") && !m.includes("what to eat") && !m.includes("suggest");
  const wantsIntake = isReportingIntake || hasMealSlotReport;
  const wantsNextMeal        = /what (?:to|should i|can i) eat (?:now|next)|what now|what else|what next/.test(m) && !wantsDiet;
  // ── Phase 2 fix: "what is the current season?" must answer directly, not fall into food-list route ──
  const wantsCurrentSeasonInfo = (
    /(?:what|which|tell me)(?: is| the)?(?: current| today.?s?)? (?:season|ritu)/.test(m) ||
    /(?:current|today.?s?|right now|now|which) (?:season|ritu)/.test(m) ||
    m === "what season is it" || m === "which season is it" ||
    m === "what ritu is it" || m === "what is the ritu" ||
    m === "what season are we in" || m === "what ritu are we in" ||
    (m.includes("what season") && !m.includes("what should i eat")) ||
    (m.includes("which season") && !m.includes("what should i eat"))
  );
  // wantsSeason handles "what should I eat in monsoon?" — exclude season-info AND diet-plan requests
  const wantsSeason          = !wantsCurrentSeasonInfo && !wantsDiet && (m.includes("season") || m.includes("ritu") || m.includes("what should i eat in") || (Object.keys(SEASON_MAP).some(k => m.includes(k)) && !foodInMsg));
  const wantsHealth          = !!(foodInMsg && (m.includes("healthy") || m.includes("good for") || m.includes("benefits") || m.includes("should i eat") || m.includes("is it good")));

  try {
    // ── Pre-route: Explicit dislike/like with food name — store + confirm immediately ──
    const hasExplicitDislike = /i (?:don't|do not|hate|dislike|avoid|can't stand|cannot stand)(?: eating| having| to eat| to drink)? /i.test(message);
    const hasExplicitLike    = !hasExplicitDislike && /i (?:like|love|enjoy|prefer|adore)(?: eating| drinking)? /i.test(message);

    if (hasExplicitDislike) {
      // Deduplicate stored dislikes before confirming
      const allStoredRaw = stored.filter(s => s.startsWith("dislike:")).map(s => s.replace("dislike:", ""));
      const allStored = [...new Set(allStoredRaw)]; // remove duplicates
      const names = allStored.length > 1
        ? allStored.slice(0, -1).join(", ") + " and " + allStored[allStored.length - 1]
        : allStored.length === 1 ? allStored[0] : foodInMsg?.name;
      if (names) {
        const existingAll = allStored.every(d =>
          userFacts.dislikes.some(e => e.toLowerCase() === d.toLowerCase())
        );
        finalResponse = existingAll
          ? `I already know you don't like **${names}** — excluded from all your plans.`
          : `Got it — I've noted that you don't like **${names}**. ${allStored.length > 1 ? "All of them are" : "It's"} excluded from your diet plans.`;
        taskType = "fact_store";
      }
    }

    // Explicit like — confirm without showing food info
    else if (hasExplicitLike) {
      const allLikes = stored.filter(s => s.startsWith("like:")).map(s => s.replace("like:", ""));
      if (allLikes.length > 0) {
        const names = allLikes.length > 1
          ? allLikes.slice(0, -1).join(", ") + " and " + allLikes[allLikes.length - 1]
          : allLikes[0];
        finalResponse = `Noted! I'll remember that you like **${names}** and include ${allLikes.length > 1 ? "them" : "it"} in your plans where possible.`;
        taskType = "fact_store";
      }
    }

    // Route 1: Specific nutrient in food
    else if (wantsNutrients && foodInMsg) {
      const result = await toolFoodLookup(c.env.DB, foodInMsg.name);
      const nutrient = result.nutrients?.find((n: any) => n.name === nutrientMentioned);
      if (nutrient) {
        const unit = cleanUnit(nutrient.unit);
        const rdaNote = nutrient.rda_pct ? ` — that's **${nutrient.rda_pct}%** of the daily recommended amount` : "";
        finalResponse = `**${result.name}** has **${nutrient.amount} ${unit}** of ${nutrientMentioned} per 100g${rdaNote}.`;
      } else {
        finalResponse = `I don't have ${nutrientMentioned} data for ${foodInMsg.name}. Available: ${result.nutrients?.slice(0,5).map((n:any)=>`${n.name} ${n.amount}${cleanUnit(n.unit)}`).join(", ")}.`;
      }
      taskType = "nutrient-lookup"; toolsUsed = ["food_lookup"];
    }

    // Route 2: Comparison
    else if (wantsCompare) {
      let food1Name = foodInMsg?.name ?? currentItem?.name ?? null;
      let food2Name: string | null = null;

      // If no food in current message, try to recover both foods from history
      // e.g. "Which has more protein?" after "compare broccoli and cabbage"
      if (!food1Name || !food2Name) {
        for (const h of [...history].reverse()) {
          const matches: string[] = [];
          const allFoods = await c.env.DB.prepare(`SELECT name FROM items ORDER BY LENGTH(name) DESC`).all();
          for (const row of allFoods.results as any[]) {
            if (h.content.toLowerCase().includes(row.name.toLowerCase())) matches.push(row.name);
            if (matches.length >= 2) break;
          }
          if (matches.length >= 2) {
            food1Name = food1Name ?? matches[0];
            food2Name = food2Name ?? matches[1];
            break;
          }
        }
      }

      if (!food1Name) {
        finalResponse = "Tell me which two foods to compare — e.g. 'compare mango and banana'.";
        taskType = "clarification";
      } else {
        // Try to find second food in current message, then fall back to history
        const food2Match = await findSecondFoodInMessage(m, food1Name, c.env.DB);
        const resolvedFood2 = food2Match?.name ?? food2Name ?? (food1Name !== currentItem?.name ? currentItem?.name : null);
        if (!resolvedFood2 || resolvedFood2 === food1Name) {
          finalResponse = `I have **${food1Name}** — which food should I compare it with?`;
          taskType = "clarification";
        } else {
          const result = await toolCompareFoods(c.env.DB, food1Name, resolvedFood2, nutrientMentioned);
          finalResponse = buildDirectResponse("compare_foods", result, message);
          taskType = "compare_foods"; toolsUsed = ["compare_foods"];
        }
      }
    }

    // Route 3: Food lookup + "add to diet" advisor
    else if (wantsFoodInfo || wantsHealth || isAddToDietQuestion || (foodInMsg && !wantsDiet && !wantsIntake)) {
      const result = await toolFoodLookup(c.env.DB, foodInMsg!.name);
      finalResponse = buildDirectResponse("food_lookup", result, message);
      if (result.found) {
        const bmiCtx = profile && computeBmi(profile);
        const isDisliked = userFacts.dislikes.some(d => result.name?.toLowerCase().includes(d.toLowerCase()));

        if (isAddToDietQuestion) {
          // "add X to my diet / should I add wheat?" — give a direct yes/no + reasoning
          if (isDisliked) {
            finalResponse += `\n\nYou've mentioned you don't like **${result.name}** — I'd skip it. There are better alternatives that you enjoy.`;
          } else {
            const goal = userFacts.goal || profile?.goal || "";
            const cal = result.calories_per_100g ?? 0;
            const isHighCal = cal > 300;
            const isGoodForGoal =
              goal.includes("lose") ? !isHighCal :
              goal.includes("gain") ? isHighCal :
              true;
            const verdict = isGoodForGoal ? "✅ Yes" : "⚠️ In moderation";
            const reason = goal.includes("lose") && isHighCal
              ? `It's calorie-dense at ${cal} kcal/100g — have small portions if you're trying to lose weight.`
              : goal.includes("gain") && !isHighCal
              ? `It's relatively light at ${cal} kcal/100g — pair it with higher-calorie foods for weight gain.`
              : `At ${cal} kcal/100g it fits well into a balanced diet.`;
            if (userFacts.health_notes.includes("diabetes")) {
              const hasHighSugar = (result.nutrients ?? []).find((n: any) => n.name === "Sugar" && n.amount > 10);
              finalResponse += hasHighSugar
                ? `\n\n${verdict}, but watch portion sizes. ${result.name} has ${hasHighSugar.amount}g sugar per 100g — eat with a meal, not alone, for blood sugar management.`
                : `\n\n${verdict} — ${reason} Good choice for blood sugar management too.`;
            } else if (userFacts.health_notes.includes("high blood pressure")) {
              const sodium = (result.nutrients ?? []).find((n: any) => n.name === "Sodium");
              finalResponse += sodium && sodium.amount > 400
                ? `\n\n⚠️ High sodium (${sodium.amount}mg/100g) — limit this if you have high blood pressure.`
                : `\n\n${verdict} — ${reason}`;
            } else {
              finalResponse += `\n\n${verdict} — ${reason}`;
            }
          }
        } else if (wantsHealth) {
          if (bmiCtx) {
            finalResponse += `\n\nFor your profile (BMI ${bmiCtx.bmi}, ${bmiCtx.label}): `;
            finalResponse += (result.calories_per_100g ?? 0) > 300
              ? `${result.name} is calorie-dense — have it in small portions.`
              : `${result.name} fits well into a balanced diet at ${result.calories_per_100g} kcal/100g.`;
          }
          if (isDisliked) {
            finalResponse += `\n\n_(You've mentioned you don't usually eat ${result.name} — I'll keep that in mind for your plans.)_`;
          }
        }
      }
      taskType = "food_lookup"; toolsUsed = ["food_lookup"];
    }

    // Route 4: Nutrient-rich foods
    else if (wantsNutrientSources && nutrientMentioned) {
      const result = await toolGetNutrientRichFoods(c.env.DB, nutrientMentioned, seasonMentioned !== "all" ? seasonMentioned : undefined);
      finalResponse = buildDirectResponse("get_nutrient_rich_foods", result, message);
      taskType = "get_nutrient_rich_foods"; toolsUsed = ["get_nutrient_rich_foods"];
    }

    // Route 4.5: "what to eat now" / "what next" — suggest next meal based on logged meals
    else if (wantsNextMeal) {
      const hour = new Date(Date.now() + 5.5 * 60 * 60 * 1000).getUTCHours();
      const nextSlot = hour < 10 ? "breakfast" : hour < 13 ? "lunch" : hour < 17 ? "evening snack" : "dinner";
      const result = await toolGetSeasonalFoods(c.env.DB, seasonMentioned !== "all" ? seasonMentioned : agentContext.current_season ?? "all");
      const suggestion = result.foods?.slice(0, 3).map((f: any) => `**${f.name}**`).join(", ") ?? "seasonal foods";
      finalResponse = `For ${nextSlot}, try: ${suggestion}. These fit your current season and your weight management goal.`;
      taskType = "meal_suggestion"; toolsUsed = ["get_seasonal_foods"];
    }

    // Route 4a.5: "What should I avoid this season?" / "foods to avoid in monsoon"
    else if (
      (m.includes("avoid") || m.includes("not eat") || m.includes("stay away") || m.includes("skip")) &&
      (m.includes("season") || m.includes("ritu") || Object.keys(SEASON_MAP).some(k => m.includes(k)))
    ) {
      const avoidSeason = seasonMentioned !== "all" ? seasonMentioned : getCurrentSeason();
      const avoidLabel = SEASON_LABELS[avoidSeason] ?? avoidSeason;
      const journal = await c.env.DB.prepare(
        `SELECT avoid, eat_more, dosha, description FROM ritu_journal WHERE season = ?1`
      ).bind(avoidSeason).first<any>();
      if (journal?.avoid) {
        let msg = `In **${avoidLabel}**, you should avoid: **${journal.avoid}**.`;
        if (journal.dosha) msg += `\n\nThis season aggravates the **${journal.dosha}** dosha — these foods make it worse.`;
        if (journal.eat_more) msg += `\n\nInstead, focus on: ${journal.eat_more}.`;
        finalResponse = msg;
      } else {
        finalResponse = `I don't have specific avoid-list data for that season right now. Generally, avoid heavy, fried, or stale foods and focus on fresh, seasonal produce.`;
      }
      taskType = "season_info"; toolsUsed = ["ritu_journal"];
    }

    // Route 4b: Current season info — Phase 2 fix
    // "What is the current season?" / "Which Ritu is it now?" — answers directly
    else if (wantsCurrentSeasonInfo) {
      const cs = getCurrentSeason();
      const csLabel = SEASON_LABELS[cs] ?? cs;
      const journal = await c.env.DB.prepare(
        `SELECT title, description, eat_more, avoid, dosha, ayurvedic_note FROM ritu_journal WHERE season = ?1`
      ).bind(cs).first<any>();
      const foods = await toolGetSeasonalFoods(c.env.DB, cs, undefined, 6);
      const foodList = (foods.foods as any[])
        .filter((f: any) => !userFacts.dislikes.some(d => f.name.toLowerCase().includes(d.toLowerCase())))
        .slice(0, 5)
        .map((f: any) => `**${f.name}**`)
        .join(", ");

      let msg = `We are currently in **${csLabel}**.`;
      if (journal) {
        msg += `\n\n${journal.description}`;
        if (journal.dosha) msg += ` This season is governed by the **${journal.dosha}** dosha.`;
        if (foodList) msg += `\n\n🌿 **Best foods right now:** ${foodList}.`;
        if (journal.eat_more) msg += `\n\n✅ **Eat more:** ${journal.eat_more}.`;
        if (journal.avoid) msg += `\n\n❌ **Avoid:** ${journal.avoid}.`;
        if (journal.ayurvedic_note) msg += `\n\n_${journal.ayurvedic_note}_`;
      } else if (foodList) {
        msg += ` Good foods to eat right now: ${foodList}.`;
      }
      finalResponse = msg;
      taskType = "season_info";
      toolsUsed = ["get_seasonal_foods"];
    }

    // Route 5: Seasonal foods / season journal
    else if (wantsSeason) {
      // "tell me about spring season" / "about Hemanta Ritu" → full journal + foods
      const wantsSeasonDetail = m.includes("tell me about") || m.includes("about the") ||
        m.includes("what is") || m.includes("describe") || m.includes("explain") ||
        (m.includes("about") && !m.includes("what should i eat"));

      if (wantsSeasonDetail && seasonMentioned !== "all") {
        // Return full journal entry for named season
        const journal = await c.env.DB.prepare(
          `SELECT title, description, eat_more, avoid, dosha, ayurvedic_note FROM ritu_journal WHERE season = ?1`
        ).bind(seasonMentioned).first<any>();
        const foods = await toolGetSeasonalFoods(c.env.DB, seasonMentioned, undefined, 6);
        const foodList = (foods.foods as any[])
          .filter((f: any) => !userFacts.dislikes.some(d => f.name.toLowerCase().includes(d.toLowerCase())))
          .slice(0, 5).map((f: any) => `**${f.name}**`).join(", ");
        if (journal) {
          let msg = `**${journal.title}**\n\n${journal.description}`;
          if (journal.dosha) msg += ` This season is governed by the **${journal.dosha}** dosha.`;
          if (foodList) msg += `\n\n🌿 **Foods in season:** ${foodList}.`;
          if (journal.eat_more) msg += `\n\n✅ **Eat more:** ${journal.eat_more}.`;
          if (journal.avoid) msg += `\n\n❌ **Avoid:** ${journal.avoid}.`;
          if (journal.ayurvedic_note) msg += `\n\n_${journal.ayurvedic_note}_`;
          finalResponse = msg;
        } else {
          finalResponse = buildDirectResponse("get_seasonal_foods", foods, message);
        }
      } else {
        // Simple: "what should I eat in monsoon?" → food list
        const result = await toolGetSeasonalFoods(c.env.DB, seasonMentioned);
        if (result.foods && userFacts.dislikes.length > 0) {
          result.foods = result.foods.filter((f: any) =>
            !userFacts.dislikes.some(d => d.toLowerCase() === f.name?.toLowerCase())
          );
        }
        finalResponse = buildDirectResponse("get_seasonal_foods", result, message);
      }
      taskType = "get_seasonal_foods"; toolsUsed = ["get_seasonal_foods"];
    }

    // Route 6: Diet plan — PHASE 1: passes dislikedFoods
    else if (wantsDiet) {
      const spokenGoal =
        m.includes("gain") || m.includes("increase weight") ? "gain weight" :
        m.includes("lose") || m.includes("weight loss")      ? "lose weight" :
        m.includes("maintain")                                ? "maintain weight" :
        m.includes("gym") || m.includes("muscle")            ? "muscle gain" : undefined;
      const days = (m.includes("week") || m.includes("7 day") || m.includes("7-day") || m.includes("whole week") || m.includes("entire week")) ? 7 : 1;

      // PHASE 1: pass user's dislikes AND dietary preference from learned facts
      // Merge profile dietary_preference with learned facts dietary
      const profileWithFacts: Profile | null = profile ? {
        ...profile,
        dietary_preference: userFacts.dietary || profile.dietary_preference,
      } : (userFacts.dietary ? { dietary_preference: userFacts.dietary } as Profile : null);

      const result = await toolBuildDietPlan(
        c.env.DB, profileWithFacts, seasonMentioned, spokenGoal, days, userFacts.dislikes
      );
      finalResponse = buildDirectResponse("build_diet_plan", result, message);
      if (profile?.goal && !spokenGoal) finalResponse += `\n\nThis plan takes your profile goal into account: **${profile.goal}**.`;
      taskType = "build_diet_plan"; toolsUsed = ["build_diet_plan"];
    }

    // Route 7: Intake analysis + PHASE 1 meal logging
    else if (wantsIntake) {
      const allFoods = await extractFoodsFromText(m, c.env.DB);
      if (allFoods.length === 0) {
        finalResponse = "I couldn't identify specific foods in your message. Try: 'I ate banana, oats, and milk today'.";
        taskType = "clarification";
      } else {
        // Analyse nutrition
        const result = await toolAnalyzeIntake(c.env.DB, allFoods, profile);
        finalResponse = buildDirectResponse("analyze_intake", result, message);

        // PHASE 1: Also log the meal to D1
        const { logged, notFound } = await logMealFromMessage(message, profileId, c.env.DB);
        if (logged.length > 0) {
          finalResponse += `\n\n✅ Logged to your meal diary: ${logged.join(", ")}.`;
        }

        taskType = "analyze_intake"; toolsUsed = ["analyze_intake"];
      }
    }

    // Route 8a: "What to eat now?" — context-aware suggestion based on today's intake
    else if (isVagueEatNow) {
      // Look at what they've eaten today and suggest what's missing
      const mealLogToday = await c.env.DB.prepare(
        `SELECT i.name, i.calories_per_100g FROM meal_logs ml
         JOIN items i ON i.id = ml.item_id
         WHERE ml.session_id = ?1 AND ml.logged_date = date('now')`
      ).bind(profileId).all();
      const eaten = (mealLogToday.results as any[]).map(l => l.name);
      const cal = (mealLogToday.results as any[]).reduce((s: number, l: any) => s + l.calories_per_100g, 0);
      const tdee = profile ? computeTdee(profile) : 1800;
      const remaining = (tdee ?? 1800) - cal;

      if (eaten.length > 0) {
        const seasonResult = await toolGetSeasonalFoods(c.env.DB, agentContext.current_season ?? "all", undefined, 6);
        const suggestions = (seasonResult.foods as any[])
          .filter(f => !eaten.includes(f.name) && !userFacts.dislikes.some(d => f.name.toLowerCase().includes(d)))
          .slice(0, 3)
          .map(f => `**${f.name}** (${f.calories_per_100g} kcal)`)
          .join(", ");
        finalResponse = `You've had ${eaten.join(", ")} today — about **${cal} kcal** so far. You have ~${remaining} kcal remaining.${suggestions ? `

Good options for your next meal: ${suggestions}.` : ""}`;
      } else {
        finalResponse = `You haven't logged any meals today. Try something light to start — a fruit and some whole grains for breakfast. What season are you eating for?`;
      }
      taskType = "intake_suggestion";
      toolsUsed = ["meal_log"];
    }

    // Route 8: Symptoms
    else if (SYMPTOM_MAP[Object.keys(SYMPTOM_MAP).find(k => m.includes(k)) ?? ""]) {
      const symptomKey = Object.keys(SYMPTOM_MAP).find(k => m.includes(k))!;
      finalResponse = SYMPTOM_MAP[symptomKey];
      // PHASE 1: personalise if we know their conditions
      if (userFacts.health_notes.length > 0) {
        finalResponse += `\n\n_Keeping in mind your health notes: ${userFacts.health_notes.join(", ")}._`;
      }
      taskType = "symptom";
    }

    // Route 8b: User correction — "not brown rice, I selected guava" / "I said mango not banana"
    // Detect when user is correcting the agent about which food they meant
    else if (
      /not (?:brown rice|banana|oats|lentils|the|that|it|this)/i.test(m) ||
      /i (?:said|selected|chose|meant|have selected|have clicked|am talking about) (.{2,25})/i.test(m) ||
      /that.?s (?:not|wrong)|you.?re wrong|incorrect|it is not|it.?s not/i.test(m)
    ) {
      // Try to find the food the user is actually referring to
      const correctionFoodMatch = await findFoodInMessage(m, c.env.DB);
      if (correctionFoodMatch) {
        const result = await toolFoodLookup(c.env.DB, correctionFoodMatch.name);
        finalResponse = `Got it — you meant **${correctionFoodMatch.name}**! ` + buildDirectResponse("food_lookup", result, message);
        taskType = "food_lookup"; toolsUsed = ["food_lookup"];
      } else if (currentItem) {
        const result = await toolFoodLookup(c.env.DB, currentItem.name);
        finalResponse = `I see you have **${currentItem.name}** selected. ` + buildDirectResponse("food_lookup", result, message);
        taskType = "food_lookup"; toolsUsed = ["food_lookup"];
      } else {
        finalResponse = `I'm sorry about the confusion! Which food were you asking about? You can click it in the food grid on the left and I'll pick it up automatically.`;
        taskType = "clarification";
      }
    }

    // Route 9: Gemini Flash — with PHASE 1 enriched system prompt
    else {
      const geminiKey = c.env.GEMINI_API_KEY ?? "";
      if (geminiKey) {
        try {
          // PHASE 1: use enriched prompt that includes learned facts
          const systemPrompt = await buildSystemPromptWithFacts(profile, agentContext, c.env.DB, profileId);
          finalResponse = await callGeminiFlash(message, systemPrompt, geminiKey, history);
        } catch (e) {
          console.error("Gemini error:", e);
          finalResponse = "";
        }
      }

      if (!finalResponse) {
        if (currentItem) {
          const result = await toolFoodLookup(c.env.DB, currentItem.name);
          finalResponse = buildDirectResponse("food_lookup", result, message);
          taskType = "food_lookup"; toolsUsed = ["food_lookup"];
        } else {
          finalResponse = `I'm not sure I understood that. Here are some things you can ask:\n\n• "Tell me about spinach"\n• "Compare mango and banana"\n• "Foods rich in iron in winter"\n• "Build a summer diet plan"\n• "I ate banana and oats today"`;
        }
      }
      taskType = "general";
    }

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
      return ["Give me a full week plan", "What do you know about me?", seasonLabel ? `Tell me about ${seasonLabel}` : "Tell me about the current season"];
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

  const smartNextActions = buildNextActions(taskType, currentItem?.name ?? null, !!profile || Object.keys(userFacts).some(k => (userFacts as any)[k]?.length > 0));

  return c.json({
    session_id: sessionId, message: finalResponse, task_type: taskType,
    tools_used: toolsUsed, mode: toolsUsed.length > 0 ? "tool-assisted" : "conversational",
    agent_state: "complete", used_profile: !!profile, used_selected_item: !!currentItem,
    selected_item: currentItem, next_actions: smartNextActions, cards: [],
    citations: toolsUsed.length > 0 ? ["NutriMentor food database (ICMR-NIN)"] : [],
  });
});


// ── PHASE 2: Morning Insight endpoint ────────────────────────────────────

app.get("/agent/morning/:profile_id", async (c) => {
  const profileId = c.req.param("profile_id");
  const today = new Date().toISOString().split("T")[0];
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