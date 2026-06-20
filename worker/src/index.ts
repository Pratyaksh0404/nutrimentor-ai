import { Hono } from "hono";
import { cors } from "hono/cors";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  AI: Ai;                        // Workers AI — kept for Phase 6 vision scanner
  GEMINI_API_KEY: string;        // Gemini 2.0 Flash — Route 9 fallback
  GOOGLE_CLIENT_ID: string;      // Phase 5 OAuth
  GOOGLE_CLIENT_SECRET: string;  // Phase 5 OAuth
  WORKER_URL: string;            // Phase 5 OAuth redirect
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

// ── Tool implementations (D1 only — zero hallucination) ───────────────────────

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
  return {
    season,
    season_label: SEASON_LABELS[season] ?? season,
    foods: result.results,
  };
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

async function toolBuildDietPlan(
  db: D1Database,
  profile: Profile | null,
  season: string,
  goal?: string,
  days = 1
) {
  const effectiveGoal = goal || profile?.goal || "balanced";
  const tdee = profile ? computeTdee(profile) : null;
  const isVeg = profile?.dietary_preference === "vegetarian" || profile?.dietary_preference === "vegan";

  let targetCal = tdee ?? 2000;
  if (effectiveGoal.includes("gain") || effectiveGoal.includes("increase")) targetCal += 400;
  else if (effectiveGoal.includes("lose") || effectiveGoal.includes("weight loss")) targetCal -= 400;

  const produceQ = db.prepare(
    `SELECT i.id, i.name, i.category, i.calories_per_100g FROM items i
     WHERE i.category IN ('fruit', 'vegetable') AND (i.season = ?1 OR i.season = 'all')
     AND i.calories_per_100g >= 20 ORDER BY RANDOM() LIMIT 12`
  ).bind(season);

  const cats = isVeg ? "'legume','dairy','nut','grain'" : "'legume','dairy','nut','grain','protein'";
  const proteinQ = db.prepare(
    `SELECT i.id, i.name, i.category, i.calories_per_100g FROM items i
     WHERE i.category IN (${cats}) ORDER BY RANDOM() LIMIT 12`
  );

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

  const fallbackGrain  = grains.length  ? grains  : [{ name: "Brown Rice" }, { name: "Oats" }, { name: "Wheat" }];
  const fallbackDal    = dals.length    ? dals    : [{ name: "Lentils" }, { name: "Moong Dal" }, { name: "Chickpeas" }];
  const fallbackDairy  = dairy.length   ? dairy   : [{ name: "Curd" }, { name: "Paneer" }];
  const fallbackNut    = nuts.length    ? nuts    : [{ name: "Almonds" }, { name: "Walnuts" }];
  const fallbackFruit  = fruits.length  ? fruits  : [{ name: "Banana" }, { name: "Apple" }, { name: "Guava" }];
  const fallbackVeg    = veggies.length ? veggies : [{ name: "Spinach" }, { name: "Carrot" }, { name: "Tomato" }];
  const proteinSource  = meats.length && !isVeg ? meats : fallbackDal;

  const pick = (arr: any[], i = 0) => arr[i % arr.length]?.name ?? arr[0]?.name ?? "seasonal food";

  const plan = [];
  for (let d = 0; d < days; d++) {
    plan.push({
      day: d + 1,
      day_label: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d % 7],
      calorie_target: targetCal,
      meals: {
        breakfast: {
          foods: [pick(fallbackFruit, d), pick(fallbackGrain, d)],
          note: "Start light — fruit gives natural sugars, grain provides sustained energy",
        },
        mid_morning: {
          foods: [pick(fallbackFruit, d + 1), pick(fallbackNut, d)],
          note: "Small snack to maintain blood sugar",
        },
        lunch: {
          foods: [pick(fallbackVeg, d), pick(fallbackDal, d), pick(fallbackGrain, d + 1)],
          note: "Main meal — balanced macros: protein, carbs, and fibre",
        },
        evening: {
          foods: [pick(fallbackFruit, d + 2), pick(fallbackNut, d + 1)],
          note: "Light energy before dinner",
        },
        dinner: {
          foods: [
            pick(fallbackVeg, d + 1),
            pick(proteinSource, d),
            pick(fallbackGrain, d + 2),
          ],
          note: "Lighter than lunch — easier digestion at night",
        },
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
    return {
      name, amount: Math.round(amount * 10) / 10, unit,
      rda_pct: pct,
      status: pct === null ? "no-rda" : pct >= 80 ? "good" : pct >= 40 ? "low" : "deficient",
    };
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

// ── Gemini 2.0 Flash — Route 9 fallback (replaces Workers AI) ────────────────
// Per master plan section 2.4: used ONLY for ambiguous queries (~5-10%).
// NEVER used to supply nutrition facts — all facts come from D1.

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

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          maxOutputTokens: 400,
          temperature: 0.3,
          stopSequences: ["```", "{", "["],
        },
      }),
    }
  );

  if (!resp.ok) {
    console.error("Gemini API error:", resp.status, await resp.text());
    return "";
  }

  const data = await resp.json() as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  // Guard: reject JSON blobs — all nutrition data must come from D1
  if (text.startsWith("{") || text.startsWith("[") || text.includes('"name":')) {
    return "";
  }

  return text;
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(profile: Profile | null, context: AgentContext): string {
  const bmiInfo = profile ? computeBmi(profile) : null;
  const tdee    = profile ? computeTdee(profile) : null;

  return `You are NutriMentor AI — a warm, knowledgeable, and trustworthy nutrition companion built for India.
You are grounded in real food data from a structured database. You NEVER make up nutrition facts.
When you need food or nutrient data, you MUST call the appropriate tool. Do not estimate values from memory.

Your personality:
- Warm and conversational, like a knowledgeable friend who happens to be a nutritionist
- Direct and clear — give the answer first, then explain if needed
- Honest about what you don't know or what falls outside your scope
- Never dismissive — every question deserves a thoughtful response
- Respond naturally to greetings, small talk, and off-topic questions

Your expertise:
- Indian seasonal nutrition based on the 6 Ritu seasons (Vasanta, Grishma, Varsha, Sharad, Hemanta, Shishira)
- Practical diet guidance grounded in ICMR-NIN recommendations
- Ayurvedic food principles — Pitta, Vata, Kapha in relation to seasons
- BMI, calorie estimation, and goal-based diet planning
- Nutrient deficiency identification and food-based solutions

Database coverage: 57 Indian foods across all 6 Ritu seasons with 19 nutrients each.
When a food isn't in the database, say so honestly and suggest the closest alternative.

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
When the user says "this", "it", "this food", or refers vaguely to a food, they mean ${context.current_item.name}.
` : "No food currently selected."}

Current season filter: ${context.current_season ? SEASON_LABELS[context.current_season] ?? context.current_season : "not set"}

Safety rules:
- For medical conditions (diabetes, heart disease, kidney issues), give general food guidance and always add: "Please consult your doctor or dietitian for personalised medical nutrition therapy."
- Never claim to cure or treat any disease
- For mental health topics, respond with empathy and suggest professional support
- Do not give specific medication advice

IMPORTANT: Respond in plain conversational text only. No JSON, no code blocks, no markdown lists — just natural language.
Today is a great day to eat well.`;
}

// ── Unit cleaner ──────────────────────────────────────────────────────────────

function cleanUnit(unit: string): string {
  if (!unit) return "";
  return unit
    .replace(/Â/g, "")
    .replace(/Âµ/g, "µ")
    .replace(/\u00c2\u00b5/g, "µ")
    .replace(/ug$/i, "µg")
    .trim();
}

// ── Direct response builder (no LLM) ─────────────────────────────────────────

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
      const rdaNote = specificNutrient.rda_pct
        ? ` — that's ${specificNutrient.rda_pct}% of the recommended daily amount`
        : "";
      return `${result.name} contains **${specificNutrient.amount} ${unit}** of ${specificNutrient.name} per 100g${rdaNote}.`;
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
    const list = result.foods.slice(0, 5).map((f: any) =>
      `**${f.name}** (${f.amount} ${cleanUnit(f.unit)})`
    ).join(", ");
    return `Best sources of ${result.nutrient}${result.season_filter ? ` in ${SEASON_LABELS[result.season_filter] ?? result.season_filter}` : ""}: ${list}.${result.rda ? ` Daily RDA is ${result.rda.daily_amount} ${cleanUnit(result.rda.unit)}.` : ""}`;
  }

  if (toolName === "build_diet_plan" && result.days?.[0]) {
    const d = result.days[0];
    const m = d.meals;
    return `**Day plan for ${result.season_label}** (target: ~${result.calorie_target} kcal)\n\n🌅 Breakfast: ${m.breakfast?.foods?.join(" + ")}\n🍎 Mid-morning: ${m.mid_morning?.foods?.join(" + ")}\n🍱 Lunch: ${m.lunch?.foods?.join(" + ")}\n🫖 Evening: ${m.evening?.foods?.join(" + ")}\n🌙 Dinner: ${m.dinner?.foods?.join(" + ")}\n\n${result.note}`;
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

// ── Symptom → food advice ─────────────────────────────────────────────────────

const SYMPTOM_MAP: Record<string, string> = {
  "fever":       "For fever, eat light and cooling foods: coconut water, watermelon, curd, moong dal, and fresh fruits. Avoid heavy or oily food. Stay well hydrated. See a doctor if fever persists.",
  "cold":        "For a cold, try ginger tea with honey, turmeric milk, warm soups, and amla or citrus fruits for Vitamin C. Avoid cold drinks and raw foods.",
  "cough":       "For cough, try honey with warm water, ginger-turmeric tea, and steam-cooked vegetables. Avoid dairy and fried foods when symptoms are active.",
  "headache":    "Stay hydrated first. Magnesium-rich foods like almonds, spinach, and banana may help. Ginger tea can ease tension headaches.",
  "dizziness":   "Dizziness often signals low blood sugar or dehydration. Try a banana, dates, or coconut water. Eat small, frequent meals.",
  "nausea":      "Eat small, bland meals: rice, banana, curd, or ginger water. Avoid spicy or strong-smelling foods.",
  "vomit":       "After vomiting, rest 30 minutes, then try small sips of coconut water or ORS. Start with rice, curd, or banana when ready.",
  "weakness":    "For weakness, eat iron-rich foods (spinach, lentils, dates), protein (eggs, paneer, moong dal), and pair with Vitamin C to improve iron absorption.",
  "constipation":"Increase fibre: papaya, guava, sweet potato, oats, and a glass of warm water each morning. Avoid refined foods.",
  "acidity":     "Try cold milk, curd, banana, coconut water, or cucumber. Avoid spicy and fried foods when symptoms are active.",
  "bloating":    "Try fennel water, ginger tea, curd, and cooked vegetables. Eat slowly and avoid carbonated drinks.",
  "anemia":      "Focus on iron-rich foods: spinach, lentils, dates, sesame seeds, bajra, and amla. Pair with Vitamin C sources for better iron absorption.",
  "diabetes":    "Focus on low-GI foods: bitter gourd, fenugreek, oats, brown rice, and non-starchy vegetables. Limit refined carbs. Always follow your doctor's guidance.",
  "sick":        "Choose light, easy-to-digest foods: rice porridge, moong dal, curd, banana, or soups. Stay hydrated. See a doctor if symptoms persist.",
  "tired":       "For fatigue, try iron-rich foods (spinach, dates, bajra), Vitamin B6 sources (banana, oats), and stay well hydrated.",
  "stress":      "Magnesium-rich foods like almonds and spinach may help with stress. Curd, dark chocolate in moderation, and green vegetables are also good choices.",
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

async function getOrCreateSession(db: D1Database, kv: KVNamespace, sessionId: string, profileId?: number) {
  const existing = await db.prepare(`SELECT id FROM sessions WHERE id = ?1`).bind(sessionId).first();
  if (existing) return existing;
  await db.prepare(
    `INSERT INTO sessions (id, profile_id, title, created_at, updated_at)
     VALUES (?1, ?2, 'New session', datetime('now'), datetime('now'))`
  ).bind(sessionId, profileId ?? null).run();
  return { id: sessionId, title: "New session" };
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

// ── Hono app ──────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const frontendUrl = c.env.FRONTEND_URL || "http://localhost:5173";
  const origin = c.req.header("Origin") || "";

  const isAllowed =
    origin === frontendUrl ||
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
  version: "2.1.0",
  ai_backend: "gemini-2.5-flash-lite",
}));

// ── Items / foods ─────────────────────────────────────────────────────────────

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
     WHERE in_.item_id = ?1
     ORDER BY n.name`
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
    expirationTtl: 60 * 60 * 24 * 90, // 90 days
  });
  return c.json({ ok: true });
});

// ── Sessions ──────────────────────────────────────────────────────────────────

app.get("/agent/sessions", async (c) => {
  const profileId = c.req.query("profile_id");
  let q = `SELECT s.id as session_id, s.title, s.updated_at,
           (SELECT content FROM messages WHERE session_id = s.id AND role = 'user' ORDER BY created_at ASC LIMIT 1) as preview
           FROM sessions s`;
  if (profileId) q += ` WHERE s.profile_id = ${parseInt(profileId)}`;
  q += ` ORDER BY s.updated_at DESC LIMIT 20`;
  const result = await c.env.DB.prepare(q).all();
  return c.json(result.results);
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
  // Ensure session exists
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
    `SELECT * FROM ritu_journal WHERE season = ?1`
  ).bind(season).first();
  if (!journal) return c.json({ error: "Season not found" }, 404);

  // Also fetch current season foods
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

// ── Main agent endpoint ───────────────────────────────────────────────────────

app.post("/agent/message", async (c) => {
  const body = await c.req.json<AgentRequest>();
  const { message, context = {} as AgentContext } = body;

  if (!message?.trim()) return c.json({ error: "Empty message" }, 400);

  const sessionId = context.session_id || crypto.randomUUID().replace(/-/g, "");

  // Load profile — KV first (persistent), merge with context payload
  const profileData = await c.env.SESSIONS.get(`profile:${sessionId}`);
  let profile: Profile | null = profileData ? JSON.parse(profileData) : null;

  if (context.profile && Object.keys(context.profile).length > 0) {
    const incoming = context.profile as Profile;
    const hasUsefulData = incoming.height_cm || incoming.weight_kg || incoming.age;
    if (hasUsefulData) {
      profile = { ...profile, ...incoming };
      await c.env.SESSIONS.put(`profile:${sessionId}`, JSON.stringify(profile), {
        expirationTtl: 60 * 60 * 24 * 90,
      });
    }
  }

  // Load selected item context
  const savedCtx = await c.env.SESSIONS.get(`ctx:${sessionId}`);
  const currentItem = savedCtx ? JSON.parse(savedCtx) : context.current_item ?? null;

  const agentContext: AgentContext = {
    session_id: sessionId,
    profile,
    current_item: currentItem,
    current_season: context.current_season ?? "all",
  };

  await getOrCreateSession(c.env.DB, c.env.SESSIONS, sessionId);

  // Load recent conversation history (last 10 messages)
  const historyResult = await c.env.DB.prepare(
    `SELECT role, content FROM messages WHERE session_id = ?1 ORDER BY created_at DESC LIMIT 10`
  ).bind(sessionId).all();
  const history = (historyResult.results as any[]).reverse().map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const aiMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...history,
    { role: "user", content: message },
  ];

  // ── Pre-flight: instant responses (0ms, no AI) ────────────────────────────
  const msgLower = message.toLowerCase().trim();
  const msgClean = msgLower.replace(/[!?.]+$/, "").trim();

  const GREETINGS    = ["hi", "hello", "hey", "hola", "namaste", "howdy", "sup", "yo", "hai"];
  const BYES         = ["bye", "goodbye", "see you", "ciao", "alvida", "tata", "byee", "byebye", "bye bye", "good bye"];
  const THANKS       = ["thanks", "thank you", "thx", "ty", "dhanyawad", "shukriya"];
  const HELP_PHRASES = [
    "what can you do", "what can you do for me", "what are your abilities",
    "what do you do", "how can you help", "what are your features",
    "tell me what you can do", "what can you help with", "as an agent what",
    "what tasks can you", "your capabilities", "what are you capable of",
  ];

  const isBye      = BYES.some(b => msgClean === b || msgClean.startsWith(b + " "));
  const isGreeting = !isBye && (GREETINGS.some(g => msgClean === g || msgClean.startsWith(g + " ")) || (message.trim().length <= 3 && !isBye));
  const isThanks   = THANKS.some(t => msgClean.includes(t));
  const isHelp     = HELP_PHRASES.some(p => msgClean.includes(p));
  const isOk       = ["ok", "okay", "cool", "nice", "great", "good", "fine", "sure", "alright", "got it", "noted"].includes(msgClean);

  const VAGUE = ["this", "it", "this one", "that", "tell me about this", "what is this",
                 "what about this", "about it", "this food", "should i eat this",
                 "is it good", "is this good", "this item"];
  const isVague = VAGUE.includes(msgClean) || VAGUE.some(v => msgClean === v);

  // Helper to build the standard JSON response
  const respond = async (
    msg: string,
    taskType: string,
    extras: Partial<{
      tools_used: string[];
      mode: string;
      next_actions: string[];
      cards: any[];
      citations: string[];
      used_profile: boolean;
      used_selected_item: boolean;
    }> = {}
  ) => {
    const cnt = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?1`
    ).bind(sessionId).first<any>();
    await saveMessage(c.env.DB, sessionId, "user", message);
    await saveMessage(c.env.DB, sessionId, "assistant", msg, taskType);
    if ((cnt?.cnt ?? 0) === 0) await updateSessionTitle(c.env.DB, sessionId, message);
    await c.env.DB.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1`).bind(sessionId).run();

    return c.json({
      session_id: sessionId,
      message: msg,
      task_type: taskType,
      tools_used: extras.tools_used ?? [],
      mode: extras.mode ?? "conversational",
      agent_state: "complete",
      used_profile: extras.used_profile ?? !!profile,
      used_selected_item: extras.used_selected_item ?? false,
      selected_item: currentItem,
      next_actions: extras.next_actions ?? [],
      cards: extras.cards ?? [],
      citations: extras.citations ?? [],
    });
  };

  if (isGreeting) {
    const msg = profile?.name
      ? `Hello ${profile.name}! I'm NutriMentor AI. Ask me about any food, get a seasonal diet plan, compare foods, or tell me what you ate today. What can I help with?`
      : `Hello! I'm NutriMentor AI, your nutrition companion for Indian seasonal eating. Ask me about any food, get a diet plan, compare foods, or tell me what you ate today and I'll check your nutrient gaps.`;
    return respond(msg, "greeting", {
      next_actions: ["Tell me about guava", "Build my day plan", "What can you do?"],
    });
  }

  if (isBye) {
    return respond("Take care! Come back whenever you have nutrition questions. Eat well! 🌿", "farewell");
  }

  if (isThanks) {
    return respond("You're welcome! Ask me anything else about food, nutrition, or your diet.", "smalltalk");
  }

  if (isOk) {
    const msg = currentItem
      ? `Got it! You have **${currentItem.name}** selected. Want me to show its full nutrients, compare it with something, or build a plan around it?`
      : "Sure! Ask me about a food, nutrient, season, or diet goal — I'm here.";
    return respond(msg, "smalltalk", { used_selected_item: !!currentItem });
  }

  if (isHelp) {
    const msg = `Here's what I can do for you:\n\n🔍 **Food lookup** — "Tell me about guava" or "What is paneer?"\n⚖️ **Compare foods** — "Compare mango and banana" or "Which has more protein: egg or paneer?"\n🗓️ **Diet plans** — "Build me a summer diet plan" or "Make a weekly plan for weight loss"\n📊 **Intake analysis** — "I ate banana, oats, and milk today — check my nutrients"\n🌱 **Seasonal suggestions** — "What should I eat in monsoon?" or "Best foods for winter"\n💊 **Nutrient sources** — "Foods rich in iron" or "Best calcium sources in winter"\n🏃 **BMI & calories** — "What is my BMI?" (fill your profile first)\n🤒 **Symptom advice** — "What should I eat when I have a cold?"\n\nSelect a food from the grid on the left, or just ask me anything about nutrition.`;
    return respond(msg, "help", {
      next_actions: ["Tell me about guava", "Build a summer diet plan", "Foods rich in iron"],
    });
  }

  if (isVague && currentItem) {
    const result = await toolFoodLookup(c.env.DB, currentItem.name);
    return respond(buildDirectResponse("food_lookup", result, message), "food_lookup", {
      tools_used: ["food_lookup"],
      mode: "tool-assisted",
      used_selected_item: true,
      next_actions: [`Show all nutrients in ${currentItem.name}`, `Compare ${currentItem.name} with banana`],
      citations: ["NutriMentor food database"],
    });
  }

  if (isVague && !currentItem) {
    return respond("Select a food from the grid on the left first, then ask me about it — I'll tell you everything.", "clarification");
  }

  // BMI — handle directly, no AI needed
  if (msgClean.includes("bmi") || msgClean.includes("body mass index")) {
    if (!profile || (!profile.height_cm && !profile.weight_kg)) {
      return respond(
        "I need your height and weight to calculate your BMI. Fill in your profile using the 👤 icon at the top of the agent panel.",
        "bmi",
        { used_profile: true }
      );
    }
    const bmiResult = computeBmi(profile);
    const tdeeResult = computeTdee(profile);
    if (!bmiResult) {
      return respond(
        "Your profile is missing height or weight. Please fill both in the profile panel (👤 icon).",
        "bmi",
        { used_profile: true }
      );
    }
    const advice =
      bmiResult.label === "underweight" ? "Focus on calorie-dense whole foods like nuts, dairy, legumes, and grains to gain weight healthily." :
      bmiResult.label === "healthy"      ? "You're in a healthy range. Focus on seasonal eating and balanced macros to stay there." :
      bmiResult.label === "overweight"   ? "A moderate calorie deficit with more vegetables, fibre, and lean protein can help. Avoid ultra-processed foods." :
      "Consider consulting a doctor or dietitian for a personalised plan. Focus on whole foods and reduce refined carbs.";
    const bmiMsg = `Your BMI is **${bmiResult.bmi}** — ${bmiResult.label} range.${tdeeResult ? `\nEstimated daily calorie need: **~${tdeeResult} kcal/day** (${profile.activity_level ?? "moderate"} activity).` : ""}\n\n${advice}`;
    return respond(bmiMsg, "bmi", {
      used_profile: true,
      next_actions: ["Build a diet plan for my goal", "What should I eat?"],
      cards: [{ type: "metric", title: "Your BMI", body: `${bmiResult.bmi} — ${bmiResult.label}` }],
      citations: ["Mifflin-St Jeor equation", "WHO BMI classification"],
    });
  }

  // ── Deterministic routing — no LLM for ~90% of queries ───────────────────
  let finalResponse = "";
  let taskType      = "general";
  let toolsUsed: string[] = [];

  const m = msgClean;
  const foodInMsg = await findFoodInMessage(m, c.env.DB);

  const NUTRIENT_KEYWORDS: Record<string, string> = {
    "vitamin c": "Vitamin C", "vitamin a": "Vitamin A", "vitamin d": "Vitamin D",
    "vitamin e": "Vitamin E", "vitamin k": "Vitamin K", "vitamin b6": "Vitamin B6",
    "protein": "Protein", "fiber": "Fiber", "fibre": "Fiber", "iron": "Iron",
    "calcium": "Calcium", "magnesium": "Magnesium", "potassium": "Potassium",
    "zinc": "Zinc", "folate": "Folate", "phosphorus": "Phosphorus",
    "sodium": "Sodium", "fat": "Fat", "carbs": "Carbohydrates", "carbohydrates": "Carbohydrates",
    "sugar": "Sugar", "calories": "Calories", "energy": "Calories",
  };
  const nutrientMentioned = Object.entries(NUTRIENT_KEYWORDS).find(([kw]) => m.includes(kw))?.[1];

  const SEASON_MAP: Record<string, string> = {
    "spring": "spring", "vasanta": "spring",
    "summer": "summer", "grishma": "summer",
    "monsoon": "monsoon", "varsha": "monsoon", "rainy": "monsoon",
    "autumn": "autumn", "sharad": "autumn",
    "prewinter": "prewinter", "hemanta": "prewinter", "pre-winter": "prewinter",
    "winter": "winter", "shishira": "winter",
  };
  const seasonMentioned = Object.entries(SEASON_MAP).find(([kw]) => m.includes(kw))?.[1]
    ?? agentContext.current_season ?? "all";

  const wantsFoodInfo       = !!(foodInMsg && (m.includes("tell me") || m.includes("what is") || m.includes("about") || m.includes("show") || m.includes("info") || m.startsWith(foodInMsg.name.toLowerCase())));
  const wantsNutrients      = !!(foodInMsg && nutrientMentioned);
  const wantsNutrientSources = !!(nutrientMentioned && (m.includes("rich") || m.includes("source") || m.includes("high") || m.includes("best") || m.includes("foods")));
  const wantsCompare        = m.includes("compare") || m.includes(" vs ") || m.includes("versus") || m.includes("difference between") || m.includes("which is better") || m.includes("which has more");
  const wantsDiet           = m.includes("diet") || m.includes("meal plan") || m.includes("day plan") || m.includes("week plan") || m.includes("what to eat") || (m.includes("build") && m.includes("plan"));
  const wantsIntake         = m.includes("i ate") || m.includes("i had") || m.includes("i consumed") || m.includes("for breakfast") || m.includes("for lunch") || m.includes("for dinner") || m.includes("analyze my");
  const wantsSeason         = m.includes("season") || m.includes("ritu") || m.includes("what should i eat in") || (Object.keys(SEASON_MAP).some(k => m.includes(k)) && !foodInMsg);
  const wantsHealth         = !!(foodInMsg && (m.includes("healthy") || m.includes("good for") || m.includes("benefits") || m.includes("should i eat") || m.includes("should i add") || m.includes("is it good")));

  try {
    // ── Route 1: Specific nutrient in a food ─────────────────────────────
    if (wantsNutrients && foodInMsg) {
      const result = await toolFoodLookup(c.env.DB, foodInMsg.name);
      const nutrient = result.nutrients?.find((n: any) => n.name === nutrientMentioned);
      if (nutrient) {
        const unit = cleanUnit(nutrient.unit);
        const rdaNote = nutrient.rda_pct ? ` — that's **${nutrient.rda_pct}%** of the daily recommended amount` : "";
        finalResponse = `**${result.name}** has **${nutrient.amount} ${unit}** of ${nutrientMentioned} per 100g${rdaNote}.`;
      } else {
        const available = result.nutrients?.slice(0, 5).map((n: any) => `${n.name} ${n.amount}${cleanUnit(n.unit)}`).join(", ");
        finalResponse = `I don't have ${nutrientMentioned} data for ${foodInMsg.name}. Available: ${available}.`;
      }
      taskType = "nutrient-lookup";
      toolsUsed = ["food_lookup"];
    }

    // ── Route 2: Food comparison ──────────────────────────────────────────
    else if (wantsCompare) {
      const food1Name = foodInMsg?.name ?? currentItem?.name;
      if (!food1Name) {
        finalResponse = "Tell me which two foods to compare — e.g. 'compare mango and banana'.";
        taskType = "clarification";
      } else {
        const food2Match = await findSecondFoodInMessage(m, food1Name, c.env.DB);
        const food2Name  = food2Match?.name ?? (food1Name !== currentItem?.name ? currentItem?.name : null);
        if (!food2Name || food2Name === food1Name) {
          finalResponse = `I can see **${food1Name}** — which food should I compare it with?`;
          taskType = "clarification";
        } else {
          const result = await toolCompareFoods(c.env.DB, food1Name, food2Name, nutrientMentioned);
          finalResponse = buildDirectResponse("compare_foods", result, message);
          taskType = "compare_foods";
          toolsUsed = ["compare_foods"];
        }
      }
    }

    // ── Route 3: Food lookup / health question ────────────────────────────
    else if (wantsFoodInfo || wantsHealth || (foodInMsg && !wantsDiet && !wantsIntake)) {
      const result = await toolFoodLookup(c.env.DB, foodInMsg!.name);
      finalResponse = buildDirectResponse("food_lookup", result, message);
      if (wantsHealth && result.found) {
        const bmiCtx = profile && computeBmi(profile);
        if (bmiCtx) {
          finalResponse += `\n\nFor your profile (BMI ${bmiCtx.bmi}, ${bmiCtx.label}): `;
          finalResponse += result.calories_per_100g! > 300
            ? `${result.name} is calorie-dense — have it in small portions.`
            : `${result.name} fits well into a balanced diet at ${result.calories_per_100g} kcal/100g.`;
        }
      }
      taskType = "food_lookup";
      toolsUsed = ["food_lookup"];
    }

    // ── Route 4: Nutrient-rich food sources ───────────────────────────────
    else if (wantsNutrientSources && nutrientMentioned) {
      const result = await toolGetNutrientRichFoods(
        c.env.DB, nutrientMentioned,
        seasonMentioned !== "all" ? seasonMentioned : undefined
      );
      finalResponse = buildDirectResponse("get_nutrient_rich_foods", result, message);
      taskType  = "get_nutrient_rich_foods";
      toolsUsed = ["get_nutrient_rich_foods"];
    }

    // ── Route 5: Seasonal foods ───────────────────────────────────────────
    else if (wantsSeason) {
      const result = await toolGetSeasonalFoods(c.env.DB, seasonMentioned);
      finalResponse = buildDirectResponse("get_seasonal_foods", result, message);
      taskType  = "get_seasonal_foods";
      toolsUsed = ["get_seasonal_foods"];
    }

    // ── Route 6: Diet plan ────────────────────────────────────────────────
    else if (wantsDiet) {
      const spokenGoal =
        m.includes("gain") || m.includes("increase weight") ? "gain weight" :
        m.includes("lose") || m.includes("weight loss")      ? "lose weight" :
        m.includes("maintain")                                ? "maintain weight" :
        m.includes("gym") || m.includes("muscle")            ? "muscle gain" :
        undefined;
      const days = m.includes("week") || m.includes("7 day") ? 7 : 1;
      const result = await toolBuildDietPlan(c.env.DB, profile, seasonMentioned, spokenGoal, days);
      finalResponse = buildDirectResponse("build_diet_plan", result, message);
      if (profile?.goal && !spokenGoal) {
        finalResponse += `\n\nThis plan takes your profile goal into account: **${profile.goal}**.`;
      }
      taskType  = "build_diet_plan";
      toolsUsed = ["build_diet_plan"];
    }

    // ── Route 7: Intake analysis ──────────────────────────────────────────
    else if (wantsIntake) {
      const allFoods = await extractFoodsFromText(m, c.env.DB);
      if (allFoods.length === 0) {
        finalResponse = "I couldn't identify specific foods in your message. Try: 'I ate banana, oats, and milk today'.";
        taskType = "clarification";
      } else {
        const result = await toolAnalyzeIntake(c.env.DB, allFoods, profile);
        finalResponse = buildDirectResponse("analyze_intake", result, message);
        taskType  = "analyze_intake";
        toolsUsed = ["analyze_intake"];
      }
    }

    // ── Route 8: Symptom advice ───────────────────────────────────────────
    else if (SYMPTOM_MAP[Object.keys(SYMPTOM_MAP).find(k => m.includes(k)) ?? ""]) {
      const symptomKey = Object.keys(SYMPTOM_MAP).find(k => m.includes(k))!;
      finalResponse = SYMPTOM_MAP[symptomKey];
      taskType = "symptom";
    }

    // ── Route 9: Gemini Flash — genuine NLP fallback (~5-10% of queries) ─
    // Per master plan 2.4: ONLY for language/conversation tasks.
    // Nutrition facts still come from D1, never from Gemini.
    else {
      const geminiKey = c.env.GEMINI_API_KEY ?? "";
      if (geminiKey) {
        try {
          const systemPrompt = buildSystemPrompt(profile, agentContext);
          finalResponse = await callGeminiFlash(message, systemPrompt, geminiKey, history);
        } catch (e) {
          console.error("Gemini Flash error:", e);
          finalResponse = "";
        }
      }

      // Fallback if Gemini fails or key not set
      if (!finalResponse) {
        if (currentItem) {
          const result = await toolFoodLookup(c.env.DB, currentItem.name);
          finalResponse = buildDirectResponse("food_lookup", result, message);
          taskType  = "food_lookup";
          toolsUsed = ["food_lookup"];
        } else {
          finalResponse = `I'm not sure I understood that. Here are some things you can ask:\n\n• "Tell me about spinach"\n• "Compare mango and banana"\n• "Foods rich in iron in winter"\n• "Build a summer diet plan"\n• "I ate banana and oats today"`;
        }
      }
      taskType = "general";
    }

  } catch (err: any) {
    console.error("Agent routing error:", err);
    finalResponse = "Something went wrong on my end. Please try again in a moment.";
  }

  // Save messages + update session
  const msgCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM messages WHERE session_id = ?1`
  ).bind(sessionId).first<any>();

  await saveMessage(c.env.DB, sessionId, "user", message);
  await saveMessage(c.env.DB, sessionId, "assistant", finalResponse, taskType);
  if ((msgCount?.cnt ?? 0) === 0) await updateSessionTitle(c.env.DB, sessionId, message);
  await c.env.DB.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?1`).bind(sessionId).run();

  // Log agent action for observability (Phase 8 analytics use this)
  try {
    await c.env.DB.prepare(
      `INSERT INTO agent_actions (session_id, action_type, action_data, result_summary)
       VALUES (?1, 'request', ?2, ?3)`
    ).bind(
      sessionId,
      JSON.stringify({ message, taskType, tools: toolsUsed }),
      finalResponse.slice(0, 200)
    ).run();
  } catch { /* don't fail the request if logging fails */ }

  return c.json({
    session_id: sessionId,
    message: finalResponse,
    task_type: taskType,
    tools_used: toolsUsed,
    mode: toolsUsed.length > 0 ? "tool-assisted" : "conversational",
    agent_state: "complete",
    used_profile: !!profile,
    used_selected_item: !!currentItem,
    selected_item: currentItem,
    next_actions: [],
    cards: [],
    citations: toolsUsed.length > 0 ? ["NutriMentor food database (ICMR-NIN)"] : [],
  });
});

// ── Diet plan endpoint ────────────────────────────────────────────────────────

app.post("/agent/task/diet-plan", async (c) => {
  const body = await c.req.json();
  const { season, goal, days, profile } = body;
  const result = await toolBuildDietPlan(
    c.env.DB,
    profile ?? null,
    season ?? "all",
    goal,
    Math.min(days ?? 1, 7)
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

// ── Export ────────────────────────────────────────────────────────────────────

export default app;