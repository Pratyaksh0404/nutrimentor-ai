// ── Phase 3.5: Intent Dispatcher ──────────────────────────────────────────────
// Takes parsed intents, executes them in parallel against D1, synthesises response.
// This replaces the 25-flag if-else chain in index.ts routing.

import type { ParsedIntent, ParsedMessage } from "./intentParser";

// Must stay identical to getISTDateString() in index.ts — duplicated here because
// this is a separate module. India Standard Time (UTC+5:30) is the canonical
// "today" for this app; see index.ts for why (streak-calculation bug, fixed 2026-07-02).
function getISTDateString(daysAgo = 0): string {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  return new Date(Date.now() + IST_OFFSET_MS - daysAgo * 86400000).toISOString().split("T")[0];
}

export interface DispatchContext {
  db: D1Database;
  kv: KVNamespace;
  geminiKey: string;
  profileId: string;
  sessionId: string;
  profile: any | null;
  userFacts: any;
  currentItem: any | null;
  currentSeason: string;
  history: Array<{ role: string; content: string }>;
  systemPrompt: string;
}

export interface IntentResult {
  intent: ParsedIntent;
  text: string;
  taskType: string;
  toolsUsed: string[];
  planData?: any;
  wantsPdf?: boolean;
  mealLogged?: boolean;
}

// ── Execute a single intent ───────────────────────────────────────────────────
async function executeOneIntent(
  intent: ParsedIntent,
  ctx: DispatchContext,
  toolFns: Record<string, Function>
): Promise<IntentResult> {
  const { type } = intent;

  try {
    switch (type) {

      case "greeting": {
        const name = ctx.profile?.name;
        const hasProfile = ctx.userFacts.dislikes.length > 0 || ctx.userFacts.likes.length > 0;
        const text = name
          ? `Hello ${name}! What can I help you with today?`
          : hasProfile
          ? `Hello! I'm NutriMentor AI. I remember your preferences. What can I help with?`
          : `Hello! I'm NutriMentor AI, your nutrition companion for Indian seasonal eating. Ask me about any food, get a diet plan, or tell me what you ate today.`;
        return { intent, text, taskType: "greeting", toolsUsed: [] };
      }

      case "farewell":
        return { intent, text: "Take care! Come back whenever you have nutrition questions. Eat well! 🌿", taskType: "farewell", toolsUsed: [] };

      case "thanks":
        return { intent, text: "You're welcome! Ask me anything about food or nutrition.", taskType: "smalltalk", toolsUsed: [] };

      case "food_lookup": {
        const foodName = intent.foods?.[0]?.name ?? "";
        if (!foodName) return { intent, text: "Which food would you like to know about?", taskType: "clarification", toolsUsed: [] };
        const result = await toolFns.foodLookup(foodName);
        return {
          intent,
          text: toolFns.buildDirectResponse("food_lookup", result, foodName),
          taskType: "food_lookup",
          toolsUsed: ["food_lookup"],
        };
      }

      case "diet_advice": {
        const food = intent.foods?.[0];
        if (!food) return { intent, text: "Which food are you asking about?", taskType: "clarification", toolsUsed: [] };
        const result = await toolFns.foodLookup(food.name);
        if (!result.found) return { intent, text: `I don't have ${food.name} in my database.`, taskType: "clarification", toolsUsed: [] };
        const isDisliked = ctx.userFacts.dislikes.some((d: string) => result.name?.toLowerCase().includes(d.toLowerCase()));
        if (isDisliked) {
          return { intent, text: `You've told me you don't like **${result.name}** — I'd suggest alternatives. What nutritional benefit are you looking for?`, taskType: "diet_advice", toolsUsed: ["food_lookup"] };
        }
        const goal = ctx.userFacts.goal || ctx.profile?.goal || "balanced";
        const cal = result.calories_per_100g ?? 0;
        const verdict = (goal.includes("lose") && cal > 300) ? "⚠️ In moderation" : "✅ Yes, include it";
        const reason = goal.includes("lose") && cal > 300
          ? `It's calorie-dense at ${cal} kcal/100g — keep portions small.`
          : `At ${cal} kcal/100g it fits your ${goal} goal well.`;
        return {
          intent,
          text: `${verdict} — **${result.name}** is a good addition. ${reason}\n\nJust say "build my diet plan" and I'll include it.`,
          taskType: "diet_advice",
          toolsUsed: ["food_lookup"],
        };
      }

      case "compare": {
        const foods = intent.foods ?? [];
        if (foods.length < 2) {
          return { intent, text: "Tell me which two foods to compare — e.g. 'compare mango and banana'.", taskType: "clarification", toolsUsed: [] };
        }
        const result = await toolFns.compareFoods(foods[0].name, foods[1].name);
        return {
          intent,
          text: toolFns.buildDirectResponse("compare_foods", result, `compare ${foods[0].name} and ${foods[1].name}`),
          taskType: "compare_foods",
          toolsUsed: ["compare_foods"],
        };
      }

      case "intake_log": {
        const foods = intent.foods ?? [];
        if (foods.length === 0) return { intent, text: "I couldn't identify what you ate. Try: 'I ate 2 eggs and a glass of milk for breakfast'.", taskType: "clarification", toolsUsed: [] };

        const foodNames = foods.map(f => f.name);
        const amountsG = foods.map(f => f.amount_g ?? 100);
        const mealSlot = intent.meal_slot ?? "general";

        // Analyse
        const result = await toolFns.analyzeIntake(foodNames, amountsG);
        let text = toolFns.buildDirectResponse("analyze_intake", result, "");

        // Show what was understood
        const portionSummary = foods.map(f => `${f.name} (${f.amount_g ?? 100}g)`).join(", ");
        text = `Portions understood: ${portionSummary}.\n\n${text}`;

        // Log to D1
        const today = getISTDateString();
        const loggedNames: string[] = [];
        for (const food of foods) {
          const item = await ctx.db.prepare(`SELECT id FROM items WHERE name LIKE ?1 LIMIT 1`).bind(`%${food.name}%`).first<any>();
          if (item) {
            await ctx.db.prepare(
              `INSERT INTO meal_logs (profile_id, session_id, logged_date, item_id, amount_g, meal_slot, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))`
            ).bind(ctx.profileId, ctx.sessionId, today, item.id, food.amount_g ?? 100, mealSlot).run();
            loggedNames.push(`${food.name} (${food.amount_g ?? 100}g)`);
          }
        }
        if (loggedNames.length > 0) text += `\n\n✅ Logged: ${loggedNames.join(", ")}.`;

        return { intent, text, taskType: "analyze_intake", toolsUsed: ["analyze_intake"], mealLogged: true };
      }

      case "diet_plan": {
        const season = intent.season ?? ctx.currentSeason ?? "all";
        // Vegetarian preference can live in user_facts (from conversation) even when
        // profile.dietary_preference isn't set — bug found in production, fixed 2026-07-02.
        const isVegUser = ctx.userFacts.dietary === "vegetarian" || ctx.userFacts.dietary === "vegan" || ctx.userFacts.dietary === "jain";
        const dislikesWithNonVeg = isVegUser
          ? [...ctx.userFacts.dislikes, "chicken breast", "salmon", "egg"]
          : ctx.userFacts.dislikes;
        const profileForPlan = isVegUser
          ? { ...(ctx.profile ?? {}), dietary_preference: ctx.userFacts.dietary }
          : ctx.profile;
        const result = await toolFns.buildDietPlan(season, profileForPlan, dislikesWithNonVeg);
        const isPdf = intent.context?.includes("pdf") ?? false;
        let text = toolFns.buildDirectResponse("build_diet_plan", result, "");
        if (isPdf && result.days?.length === 7) text += "\n\n📄 Your 7-day PDF is ready to download.";
        return {
          intent,
          text,
          taskType: "build_diet_plan",
          toolsUsed: ["build_diet_plan"],
          planData: result,
          wantsPdf: isPdf && result.days?.length === 7,
        };
      }

      case "seasonal_info": {
        const season = intent.season ?? ctx.currentSeason;
        const result = await toolFns.getSeasonalFoods(season);
        const journal = await ctx.db.prepare(
          `SELECT title, description, eat_more, avoid, dosha, ayurvedic_note FROM ritu_journal WHERE season = ?1`
        ).bind(season).first<any>();
        let text = toolFns.buildDirectResponse("get_seasonal_foods", result, "");
        if (journal) {
          text = `**${journal.title}**\n\n${journal.description}`;
          if (journal.dosha) text += ` Governed by the **${journal.dosha}** dosha.`;
          if (journal.eat_more) text += `\n\n✅ **Eat more:** ${journal.eat_more}.`;
          if (journal.avoid) text += `\n\n❌ **Avoid:** ${journal.avoid}.`;
        }
        return { intent, text, taskType: "get_seasonal_foods", toolsUsed: ["get_seasonal_foods"] };
      }

      case "seasonal_avoid": {
        const season = intent.season ?? ctx.currentSeason;
        const journal = await ctx.db.prepare(
          `SELECT avoid, eat_more, dosha FROM ritu_journal WHERE season = ?1`
        ).bind(season).first<any>();
        const text = journal?.avoid
          ? `In this season, avoid: **${journal.avoid}**.${journal.dosha ? ` (aggravates **${journal.dosha}** dosha)` : ""}\n\nInstead focus on: ${journal.eat_more}.`
          : "Generally avoid heavy, fried, or stale foods. Focus on fresh, seasonal produce.";
        return { intent, text, taskType: "season_info", toolsUsed: [] };
      }

      case "current_season": {
        const season = ctx.currentSeason;
        const label = toolFns.seasonLabel(season);
        const journal = await ctx.db.prepare(
          `SELECT title, description, dosha, eat_more, avoid FROM ritu_journal WHERE season = ?1`
        ).bind(season).first<any>();
        let text = `We are currently in **${label}**.`;
        if (journal) {
          text += `\n\n${journal.description}`;
          if (journal.dosha) text += ` Governed by the **${journal.dosha}** dosha.`;
          if (journal.eat_more) text += `\n\n✅ Eat more: ${journal.eat_more}.`;
          if (journal.avoid) text += `\n\n❌ Avoid: ${journal.avoid}.`;
        }
        return { intent, text, taskType: "season_info", toolsUsed: [] };
      }

      case "nutrient_query": {
        const nutrient = intent.nutrient ?? "";
        const season = intent.season ?? ctx.currentSeason;
        if (!nutrient) return { intent, text: "Which nutrient are you asking about? e.g. 'foods rich in iron'.", taskType: "clarification", toolsUsed: [] };
        const result = await toolFns.getNutrientRichFoods(nutrient, season);
        return {
          intent,
          text: toolFns.buildDirectResponse("get_nutrient_rich_foods", result, nutrient),
          taskType: "get_nutrient_rich_foods",
          toolsUsed: ["get_nutrient_rich_foods"],
        };
      }

      case "memory_read": {
        const facts = ctx.userFacts;
        const lines: string[] = [];
        if (facts.dislikes.length)     lines.push(`🚫 Dislikes: ${facts.dislikes.join(", ")}`);
        if (facts.likes.length)        lines.push(`✅ Likes: ${facts.likes.join(", ")}`);
        if (facts.dietary)             lines.push(`🥗 Dietary preference: ${facts.dietary}`);
        if (facts.health_notes.length) lines.push(`🏥 Health notes: ${facts.health_notes.join(", ")}`);
        if (facts.allergies.length)    lines.push(`⚠️ Allergies: ${facts.allergies.join(", ")}`);
        if (facts.goal)                lines.push(`🎯 Fitness goal: ${facts.goal}`);
        if (ctx.profile?.age)          lines.push(`👤 Age: ${ctx.profile.age}, Sex: ${ctx.profile.sex ?? "not set"}`);
        if (ctx.profile?.height_cm)    lines.push(`📏 Height: ${ctx.profile.height_cm}cm, Weight: ${ctx.profile.weight_kg}kg`);
        const text = lines.length
          ? `Here's what I know about you:\n\n${lines.join("\n")}\n\nI use this to personalise your diet plans and suggestions. Tell me anything new and I'll remember it.`
          : "I don't know much about you yet! Tell me your food preferences, health goals, or dietary restrictions and I'll remember them.";
        return { intent, text, taskType: "memory_recall", toolsUsed: [] };
      }

      case "preference_set": {
        // Already handled by extractAndStoreFacts (Gemini entity extraction)
        const foods = intent.foods ?? [];
        const likes = foods.filter(f => f.sentiment === "like").map(f => f.name);
        const dislikes = foods.filter(f => f.sentiment === "dislike").map(f => f.name);
        const allergies = foods.filter(f => f.sentiment === "allergy").map(f => f.name);
        const parts: string[] = [];
        if (likes.length) parts.push(`✅ Noted likes: ${likes.join(", ")}`);
        if (dislikes.length) parts.push(`🚫 Noted dislikes: ${dislikes.join(", ")}`);
        if (allergies.length) parts.push(`⚠️ Noted allergies: ${allergies.join(", ")}`);
        const text = parts.length
          ? `Got it! I've updated your preferences:\n${parts.join("\n")}\n\nI'll use this in all your future plans.`
          : "Noted! I've updated your preferences.";
        return { intent, text, taskType: "preference_update", toolsUsed: [] };
      }

      case "meal_suggestion": {
        const slot = intent.meal_slot ?? "general";
        const season = intent.season ?? ctx.currentSeason;
        const foods = await toolFns.getSeasonalFoods(season);
        const filtered = (foods.foods ?? [])
          .filter((f: any) => !ctx.userFacts.dislikes.some((d: string) => f.name.toLowerCase().includes(d.toLowerCase())))
          .slice(0, 5);
        const slotLabel = { breakfast: "breakfast", mid_morning: "mid-morning snack", lunch: "lunch", evening: "evening snack", dinner: "dinner", general: "meal" }[slot] ?? "meal";
        const suggestions = filtered.map((f: any) => `**${f.name}** (${f.calories_per_100g} kcal/100g)`).join(", ");
        const text = suggestions
          ? `Good options for your ${slotLabel}: ${suggestions}.\n\nAll are good seasonal choices for ${toolFns.seasonLabel(season)}.`
          : `For your ${slotLabel}, focus on light, seasonal foods. Try building a full day plan for personalised suggestions.`;
        return { intent, text, taskType: "meal_suggestion", toolsUsed: ["get_seasonal_foods"] };
      }

      case "salad_suggestion": {
        const season = intent.season ?? ctx.currentSeason;
        const label = toolFns.seasonLabel(season);
        // Get seasonal veggies, fruits, and proteins from DB
        const vegs = await ctx.db.prepare(
          `SELECT name, calories_per_100g FROM items WHERE category='vegetable' AND (season=?1 OR season='all') ORDER BY RANDOM() LIMIT 6`
        ).bind(season).all();
        const proteins = await ctx.db.prepare(
          `SELECT name FROM items WHERE category IN ('legume','dairy') AND (season=?1 OR season='all') ORDER BY RANDOM() LIMIT 3`
        ).bind(season).all();
        const vegList = (vegs.results as any[]).map(v => v.name).join(", ");
        const protList = (proteins.results as any[]).map(p => p.name).join(", ");
        const text = `Here's a **${label} salad** tailored for you:\n\n🥗 **Vegetables:** ${vegList || "Cucumber, Tomato, Onion"}\n💪 **Protein:** ${protList || "Chickpeas, Paneer"}\n🥣 **Dressing:** Curd + lemon + mint + a pinch of salt (probiotic, light, seasonal)\n🌿 **Herbs:** Coriander, mint\n\n**Why these?** ${season === "monsoon" ? "During Varsha Ritu, prefer cooked/semi-cooked vegetables — raw salads can tax digestion. Lightly steam the veggies." : "Seasonal vegetables are at peak nutrition and freshness right now."}`;
        return { intent, text, taskType: "general", toolsUsed: [] };
      }

      case "bmi_query": {
        const bmiResult = toolFns.computeBmi(ctx.profile);
        const tdee = toolFns.computeTdee(ctx.profile);
        if (!bmiResult) return { intent, text: "I need your height and weight to calculate BMI. Tell me: 'I am 170cm and 65kg'.", taskType: "bmi", toolsUsed: [] };
        const text = `Your BMI is **${bmiResult.bmi}** — ${bmiResult.label} range.${tdee ? `\nEstimated daily calorie need: **~${tdee} kcal/day**.` : ""}\n\n${bmiResult.bmi < 18.5 ? "Focus on calorie-dense, nutrient-rich foods." : bmiResult.bmi < 25 ? "You're in a healthy range! Focus on seasonal eating and balanced macros." : "A moderate calorie deficit with more vegetables and lean protein can help."}`;
        return { intent, text, taskType: "bmi", toolsUsed: [] };
      }

      case "symptom_query": {
        const SYMPTOM_MAP: Record<string, string> = {
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
        const SYMPTOM_ALIASES: Record<string, string> = {
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
        const rawContext = (intent.context ?? "").toLowerCase();
        const normContext = Object.entries(SYMPTOM_ALIASES).reduce(
          (acc, [alias, canon]) => acc.replace(new RegExp(`\\b${alias}\\b`, "g"), canon), rawContext
        );
        const match = Object.keys(SYMPTOM_MAP).find(s => normContext.includes(s));
        const text = match ? SYMPTOM_MAP[match] : await toolFns.geminiNarrative(`Nutrition advice for: ${intent.context}`);
        return { intent, text, taskType: "symptom_advice", toolsUsed: [] };
      }

      // ── Added 2026-07-02: gap found in production testing, not in original spec ──
      case "nutrient_in_food": {
        const food = intent.foods?.[0];
        const nutrient = intent.nutrient ?? "";
        if (!food || !nutrient) {
          return { intent, text: "Which food and which nutrient? e.g. 'how much vitamin B6 does tofu have'.", taskType: "clarification", toolsUsed: [] };
        }
        const result: any = await toolFns.foodLookup(food.name);
        if (!result.found) return { intent, text: `I couldn't find **${food.name}** in my database.`, taskType: "clarification", toolsUsed: [] };
        const row = (result.nutrients ?? []).find((n: any) => (n.name ?? "").toLowerCase() === nutrient.toLowerCase());
        const text = row
          ? `**${result.name}** has **${row.amount}${row.unit}** of ${nutrient} per 100g` + (row.rda_pct != null ? ` (${row.rda_pct}% of daily RDA).` : ".")
          : `I don't have **${nutrient}** data for **${result.name}** specifically. What I do have per 100g: `
            + (result.nutrients ?? []).slice(0, 5).map((n: any) => `${n.name} ${n.amount}${n.unit}`).join(", ") + ".";
        return { intent, text, taskType: "nutrient_in_food", toolsUsed: ["food_lookup"] };
      }

      // ── Added 2026-07-02: gap found in production testing, not in original spec ──
      case "availability": {
        const food = intent.foods?.[0];
        const season = intent.season ?? ctx.currentSeason;
        if (!food) return { intent, text: "Which food would you like to check?", taskType: "clarification", toolsUsed: [] };
        const item = await ctx.db.prepare(`SELECT name, season FROM items WHERE LOWER(name) = ?1 LIMIT 1`).bind(food.name.toLowerCase()).first<any>();
        if (!item) return { intent, text: `I couldn't find **${food.name}** in my database.`, taskType: "clarification", toolsUsed: [] };
        const askedLabel = toolFns.seasonLabel(season);
        let text: string;
        if (item.season === "all") {
          text = `Yes! **${item.name}** is available year-round, including ${askedLabel}. 🌿`;
        } else if (item.season === season) {
          text = `Yes! **${item.name}** is in peak season during ${askedLabel} — the best time to eat it fresh. ✅`;
        } else {
          text = `**${item.name}** is best in **${toolFns.seasonLabel(item.season)}**, not ${askedLabel}. You may find cold-stored stock, but it won't be at peak freshness or nutrition.`;
        }
        return { intent, text, taskType: "seasonal_availability", toolsUsed: ["food_lookup"] };
      }

      // ── Added 2026-07-02: gap found in production testing, not in original spec ──
      case "memory_update": {
        const food = intent.foods?.[0];
        if (!food) return { intent, text: "Which food would you like to update?", taskType: "clarification", toolsUsed: [] };
        const norm = food.name.toLowerCase().trim();
        const op = intent.memory_op ?? "remove";
        const bucket = intent.remove_from ?? "dislikes";
        try {
          if (op === "add") {
            const factType = bucket === "dislikes" ? "dislike" : bucket === "allergies" ? "allergy" : "preference";
            // Mutual exclusion — a food can't be in both likes and dislikes
            const oppositeType = factType === "dislike" ? "preference" : factType === "preference" ? "dislike" : null;
            if (oppositeType) {
              await ctx.db.prepare(`DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = ?2 AND LOWER(fact_key) LIKE ?3`)
                .bind(ctx.profileId, oppositeType, `%${norm}%`).run();
            }
            await ctx.db.prepare(
              `INSERT OR IGNORE INTO user_facts (profile_id, fact_type, fact_key, fact_value, source, created_at, updated_at)
               VALUES (?1,?2,?3,?3,'conversation',datetime('now'),datetime('now'))`
            ).bind(ctx.profileId, factType, norm).run();
          } else {
            const types = bucket === "both" ? ["dislike", "preference"] : bucket === "dislikes" ? ["dislike"] : bucket === "allergies" ? ["allergy"] : ["preference"];
            for (const t of types) {
              await ctx.db.prepare(`DELETE FROM user_facts WHERE profile_id = ?1 AND fact_type = ?2 AND LOWER(fact_key) LIKE ?3`)
                .bind(ctx.profileId, t, `%${norm}%`).run();
            }
          }
        } catch { /* non-fatal */ }
        const text = op === "add"
          ? `Got it! Added **${norm}** to your ${bucket}.`
          : `Got it! I've removed **${norm}** from your ${bucket === "both" ? "likes and dislikes" : bucket}.`;
        return { intent, text, taskType: "memory_update", toolsUsed: [] };
      }

      // ── Added 2026-07-02: gap found in production testing, not in original spec ──
      case "calorie_query": {
        const today = getISTDateString();
        const rows = await ctx.db.prepare(
          `SELECT i.name, ml.amount_g, ml.meal_slot, i.calories_per_100g
           FROM meal_logs ml JOIN items i ON i.id = ml.item_id
           WHERE (ml.profile_id = ?1 OR ml.session_id = ?2) AND ml.logged_date = ?3
           ORDER BY ml.created_at ASC`
        ).bind(ctx.profileId, ctx.sessionId, today).all();
        const logs = rows.results as any[];
        const totalCal = Math.round(logs.reduce((s, l) => s + (l.calories_per_100g * l.amount_g / 100), 0));
        const targetCal = toolFns.computeTdee(ctx.profile) ?? 2000;
        if (logs.length === 0) {
          return { intent, text: "No meals logged yet today. Tell me what you ate and I'll track your calories.", taskType: "calorie_query", toolsUsed: [] };
        }
        const wantsBreakdown = /what(?: all)? did i eat|what have i (?:eaten|had)/i.test(intent.context ?? "");
        let text: string;
        if (wantsBreakdown) {
          const bySlot: Record<string, string[]> = {};
          for (const l of logs) (bySlot[l.meal_slot ?? "meal"] ??= []).push(l.name);
          const lines = Object.entries(bySlot).map(([slot, foods]) => `**${slot}**: ${foods.join(", ")}`);
          text = `Today you've had:\n\n${lines.join("\n")}\n\nTotal: ~${totalCal} kcal out of your ~${targetCal} kcal target.`;
        } else {
          text = `Today you've had **~${totalCal} kcal** out of your **~${targetCal} kcal** target. You have ~${Math.max(0, targetCal - totalCal)} kcal remaining.`;
        }
        return { intent, text, taskType: "calorie_query", toolsUsed: [] };
      }

      // ── Was in IntentType union with NO case — fell through to generic Gemini
      // narrative, silently bypassing the Phase 4 swap engine entirely. Fixed 2026-07-02.
      case "swap_request": {
        const food = intent.foods?.[0];
        if (!food) return { intent, text: "Which food would you like a substitute for?", taskType: "clarification", toolsUsed: [] };
        const season = intent.season ?? ctx.currentSeason;
        const isVegUser = ctx.userFacts.dietary === "vegetarian" || ctx.userFacts.dietary === "vegan" || ctx.userFacts.dietary === "jain";
        const alts = await toolFns.findIngredientSwap(food.name, season, ctx.userFacts.dislikes, isVegUser);
        const text = alts.length > 0
          ? `No **${food.name}**? Here are the best swaps for ${toolFns.seasonLabel(season)} with a similar nutrient profile:\n\n`
            + alts.map((a: any) => `🔄 **${a.food}** — also rich in ${a.shared_nutrient} (${a.amount}${a.unit}/100g)`).join("\n")
            + `\n\nUse roughly the same quantity as you would ${food.name}.`
          : `I couldn't find **${food.name}** in my database to compute a swap. Tell me which nutrient you're after and I'll suggest sources.`;
        return { intent, text, taskType: "ingredient_swap", toolsUsed: ["food_lookup", "get_nutrient_rich_foods"] };
      }

      case "follow_up": {
        // Expand on the last substantive assistant message
        const lastAsst = [...ctx.history].reverse().find(h => h.role === "assistant" && h.content.length > 50);
        if (!lastAsst) return { intent, text: "What would you like to know more about?", taskType: "clarification", toolsUsed: [] };
        const text = await toolFns.geminiNarrative(
          `The user said: "${intent.context ?? "tell me more"}"\nYour previous answer was: "${lastAsst.content.slice(0, 400)}"\nExpand helpfully in 100 words. Be specific.`
        );
        return { intent, text: text || lastAsst.content, taskType: "follow_up", toolsUsed: [] };
      }

      default: // general
        const text = await toolFns.geminiNarrative(intent.context ?? "");
        return { intent, text: text || "I'm not sure I understood that. Try asking about a specific food, diet plan, or your nutrition goals.", taskType: "general", toolsUsed: [] };
    }
  } catch (err) {
    console.error(`executeOneIntent error for ${type}:`, err);
    return { intent, text: "Something went wrong on my end. Please try again in a moment.", taskType: "error", toolsUsed: [] };
  }
}

// ── Synthesise multiple results into one response ─────────────────────────────
function synthesiseResults(results: IntentResult[]): IntentResult {
  if (results.length === 1) return results[0];

  const primary = results.find(r => r.intent.is_primary) ?? results[0];
  const secondary = results.filter(r => !r.intent.is_primary && !["greeting", "farewell", "thanks"].includes(r.intent.type));

  // Build text parts
  const parts: string[] = [];

  // Greeting prefix
  const greet = results.find(r => r.intent.type === "greeting");
  if (greet) parts.push(greet.text.split("!")[0] + "!");

  // Thanks acknowledgement (1 sentence)
  const thanks = results.find(r => r.intent.type === "thanks");
  if (thanks) parts.push("You're welcome!");

  // Primary response
  parts.push(primary.text);

  // Secondary responses (with connectors)
  for (const sec of secondary.slice(0, 2)) {
    const connector = {
      meal_suggestion: "\n\n💡 Also, for your next meal:",
      seasonal_info:   "\n\n🌿 Season tip:",
      diet_advice:     "\n\n📋 Diet advice:",
      food_lookup:     "\n\nAbout that food:",
    }[sec.intent.type as string] ?? "\n\nAlso:";
    parts.push(connector + " " + sec.text);
  }

  // Farewell suffix
  const farewell = results.find(r => r.intent.type === "farewell");
  if (farewell) parts.push("\n\nTake care! Come back whenever you have questions. 🌿");

  // Collect all metadata
  const allTools = [...new Set(results.flatMap(r => r.toolsUsed))];
  const planResult = results.find(r => r.planData);

  return {
    intent: primary.intent,
    text: parts.join(" ").trim(),
    taskType: primary.taskType,
    toolsUsed: allTools,
    planData: planResult?.planData,
    wantsPdf: results.some(r => r.wantsPdf),
    mealLogged: results.some(r => r.mealLogged),
  };
}

// ── Main dispatch function ────────────────────────────────────────────────────
export async function dispatchIntents(
  parsed: ParsedMessage,
  ctx: DispatchContext,
  toolFns: Record<string, Function>
): Promise<IntentResult> {
  const { intents } = parsed;

  // Execute all intents in parallel
  const results = await Promise.all(
    intents.map(intent => executeOneIntent(intent, ctx, toolFns))
  );

  return synthesiseResults(results);
}
