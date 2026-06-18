from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.core.entity_detector import detect_food_entities
from app.core.nutrient_engine import get_foods_rich_in
from app.core.preprocessor import clean_text, is_garbage
from app.core.tools import get_nutrients_for_item
from app.models.item import Item
from app.models.rda import RDA

# ── Season labels ─────────────────────────────────────────────────────────────

SEASON_LABELS = {
    "spring":    "Vasanta Ritu (Spring)",
    "summer":    "Grishma Ritu (Summer)",
    "monsoon":   "Varsha Ritu (Monsoon)",
    "autumn":    "Sharad Ritu (Autumn)",
    "prewinter": "Hemanta Ritu (Pre-winter)",
    "winter":    "Shishira Ritu (Winter)",
    "all":       "all seasons",
}

SEASON_ALIASES: dict[str, str] = {
    "winters": "winter", "winter season": "winter", "cold season": "winter",
    "summers": "summer", "summer season": "summer", "hot season": "summer",
    "monsoons": "monsoon", "rainy season": "monsoon", "rain season": "monsoon", "rainy": "monsoon",
    "autumns": "autumn", "autumn season": "autumn",
    "springs": "spring", "spring season": "spring",
    "prewinters": "prewinter", "pre winter": "prewinter", "hemanta": "prewinter",
    "vasanta": "spring", "grishma": "summer", "varsha": "monsoon",
    "sharad": "autumn", "shishira": "winter",
}

# ── Nutrient keywords (longer/specific first to avoid partial-match bugs) ──────

NUTRIENT_KEYWORDS = [
    "vitamin b6", "vitamin b12", "vitamin b",
    "vitamin a", "vitamin c", "vitamin d", "vitamin e", "vitamin k",
    "protein", "fiber", "fibre", "iron", "calcium", "magnesium",
    "potassium", "phosphorus", "zinc", "folate", "sodium",
    "carbohydrates", "carbs", "fat", "sugar",
]

NUTRIENT_ALIASES: dict[str, str] = {
    "fibre": "Fiber",
    "carbs": "Carbohydrates",
    "vit c": "Vitamin C",
    "vit d": "Vitamin D",
    "vit a": "Vitamin A",
    "vit e": "Vitamin E",
    "vit k": "Vitamin K",
    "vit b6": "Vitamin B6",
    "vitamin b12": "Vitamin B6",
}

# ── Simple intent sets ────────────────────────────────────────────────────────

GREETING_TOKENS = {
    "hi", "hello", "hey", "yo", "namaste", "hola", "howdy", "sup",
    # common typo/repeated variants — fuzzy match via startswith below
}
THANK_TOKENS    = {"thanks", "thank you", "thx", "dhanyawad", "shukriya", "ty", "thankyou", "thank"}
BYE_TOKENS      = {"bye", "goodbye", "see you", "byee", "alvida", "tata", "ciao", "tc"}

IDENTITY_PHRASES = {
    "what is your name", "whats your name", "your name",
    "who are you", "what are you", "who made you", "who built you",
    "are you ai", "are you a bot", "do you have a name",
    "what should i call you", "tell me your name",
}

HELP_PHRASES = {
    "help", "what can you do", "how can you help", "what do you do",
    "what can you do for me", "features", "what are your features",
    "what are your abilities", "what are you capable of",
    "tell me about yourself", "tell me what you can do",
    "what are your tasks", "as an agent what", "what tasks can you do",
    "what do you offer", "show me what you can do",
}

VAGUE_CONTEXT_PHRASES = {
    "this", "that", "it", "this food", "that food",
    "this item", "that item", "this one", "that one",
    "what is this", "tell me about this", "what about this",
    "about this food", "show me this",
    "should i eat this", "should i consume this", "can i eat this",
    "should i add this to my diet", "is this healthy", "is this good",
    "should i have this",
}

# Greetings that are typo-extended versions (hiii, helllooo, etc.)
def _is_extended_greeting(msg: str) -> bool:
    for base in ("hi", "hello", "hey", "hola", "namaste"):
        if msg.startswith(base) and all(c == base[-1] for c in msg[len(base):]):
            return True
    return False

def _is_extended_bye(msg: str) -> bool:
    for base in ("bye", "goodbye", "ciao"):
        if msg.startswith(base) and all(c == base[-1] for c in msg[len(base):]):
            return True
    return False

def _is_extended_sorry(msg: str) -> bool:
    return msg in {"sorry", "ok", "okay", "fine", "alright", "nevermind", "nvm"}

# ── Symptom → food advice map ─────────────────────────────────────────────────

SYMPTOM_FOOD_MAP: dict[str, str] = {
    "fever":        "For fever, prefer light and cooling foods: coconut water, watermelon, curd, moong dal, and fresh fruits. Avoid heavy or oily food. Stay very well hydrated. Consult a doctor if fever persists.",
    "cold":         "During a cold, warm foods help: ginger tea, turmeric milk, warm soups, amla, and citrus fruits for Vitamin C. Avoid cold drinks and raw foods.",
    "cough":        "For a cough, try honey with warm water, ginger-turmeric tea, and steam-cooked vegetables. Avoid dairy and fried foods.",
    "headache":     "For headaches, stay hydrated first. Magnesium-rich foods like almonds, spinach, and banana may help. Ginger tea can ease tension headaches.",
    "dizziness":    "Dizziness can be linked to low blood sugar or dehydration. Try a small banana, coconut water, or dates. Eat small, frequent meals.",
    "nausea":       "For nausea, eat small bland meals: rice, banana, curd, or ginger water. Avoid spicy, fatty, or strong-smelling foods.",
    "vomit":        "After vomiting, rest for 30 minutes, then try small sips of coconut water or ORS. Start with bland foods like rice, curd, or banana.",
    "weakness":     "For weakness, eat iron-rich foods (spinach, lentils, dates), protein (eggs, paneer, moong dal), and Vitamin C to aid iron absorption.",
    "constipation": "For constipation, increase fiber: papaya, guava, sweet potato, oats, and warm water in the morning. Avoid refined foods.",
    "acidity":      "For acidity, try cold milk, curd, banana, coconut water, and cucumber. Avoid spicy and fried foods when symptoms are active.",
    "bloating":     "For bloating, try fennel water, ginger tea, curd, and cooked vegetables. Eat slowly and avoid carbonated drinks.",
    "anemia":       "For anemia, focus on iron-rich foods: spinach, lentils, dates, sesame seeds, bajra, and amla. Pair with Vitamin C sources to improve absorption.",
    "diabetes":     "For diabetes, focus on low-GI foods: bitter gourd, fenugreek, oats, brown rice, and non-starchy vegetables. Limit refined carbs. Always follow your doctor's guidance.",
    "sick":         "When unwell, choose light, easy-to-digest foods: rice porridge, moong dal, curd, banana, or soups. Stay hydrated. Consult a doctor if symptoms persist.",
    "tired":        "For fatigue, try iron-rich foods (spinach, dates, bajra), B6-rich foods (banana, oats), and stay well hydrated.",
    "stress":       "For stress, magnesium-rich foods like almonds and spinach may help. Dark chocolate, curd, and green vegetables are also good choices.",
}

SYMPTOM_KEYWORDS = list(SYMPTOM_FOOD_MAP.keys())


# ── Response builder ──────────────────────────────────────────────────────────

def _response(
    *,
    session_id: str,
    message: str,
    task_type: str,
    mode: str = "tool",
    agent_state: str = "complete",
    used_profile: bool = False,
    used_selected_item: bool = False,
    citations: list | None = None,
    cards: list | None = None,
    next_actions: list | None = None,
    selected_item: dict | None = None,
) -> dict:
    return {
        "session_id": session_id,
        "message": message,
        "mode": mode,
        "task_type": task_type,
        "agent_state": agent_state,
        "used_profile": used_profile,
        "used_selected_item": used_selected_item,
        "citations": citations or [],
        "cards": cards or [],
        "next_actions": next_actions or [],
        "selected_item": selected_item,
    }


def _item_payload(item) -> dict | None:
    if not item:
        return None
    return {"id": item.id, "name": item.name, "season": item.season}


# ── Intent helpers ────────────────────────────────────────────────────────────

def extract_nutrient(msg: str) -> str | None:
    lowered = msg.lower()
    for alias, canonical in NUTRIENT_ALIASES.items():
        if alias in lowered:
            return canonical
    for kw in NUTRIENT_KEYWORDS:
        if kw in lowered:
            name = kw.title()
            if name == "Fibre":
                name = "Fiber"
            if name == "Carbs":
                name = "Carbohydrates"
            return name
    return None


def season_from_message(msg: str) -> str | None:
    for alias, season in sorted(SEASON_ALIASES.items(), key=lambda x: -len(x[0])):
        if alias in msg:
            return season
    words = set(msg.split())
    for season in SEASON_LABELS:
        if season != "all" and season in words:
            return season
    return None


def get_context_item(context: dict | None, db: Session):
    if not context:
        return None
    ci = context.get("current_item")
    if not ci:
        return None
    item_id = ci.get("id")
    if item_id:
        item = db.query(Item).filter(Item.id == item_id).first()
        if item:
            return item
    item_name = ci.get("name")
    if item_name:
        return db.query(Item).filter(Item.name.ilike(item_name)).first()
    return None


def find_foods(msg: str, db: Session) -> list:
    return detect_food_entities(msg, db)


def uses_context_reference(msg: str) -> bool:
    if msg in VAGUE_CONTEXT_PHRASES:
        return True
    return any(phrase in msg for phrase in [
        "about it", "about this", "about that",
        "does it have", "can i eat this", "should i eat this",
        "should i consume this", "should i add this",
        "calories in this", "nutrients in this", "how many calories",
        "is it good", "is this good", "benefits of this",
        "is this healthy", "should i have this",
        "add this to my diet", "include this in",
    ])


def is_calorie_question(msg: str) -> bool:
    return any(t in msg for t in [
        "calorie", "calories", "kcal",
        "how many calories", "how much energy", "energy do i get",
        "energy from", "how much cal",
    ])


def is_season_question(msg: str) -> bool:
    return any(phrase in msg for phrase in [
        "season", "ritu", "best time", "when to eat", "when can i eat",
        "can i eat in", "should i eat in", "good in", "available in",
        "summer", "winter", "monsoon", "autumn", "spring", "prewinter",
    ])


def is_comparison_question(msg: str) -> bool:
    return any(phrase in msg for phrase in [
        "compare", "versus", " vs ", "better", "healthier",
        "difference between", "which is better", "which has more",
    ])


def wants_suggestions(msg: str) -> bool:
    return any(phrase in msg for phrase in [
        "what should i eat", "what to eat", "suggest", "recommend",
        "rich in", "high in", "source of", "sources of", "good source",
        "foods with", "foods that have", "foods containing",
    ])


def is_health_question(msg: str) -> bool:
    return any(phrase in msg for phrase in [
        "is it good for", "is it healthy", "health benefits",
        "benefits of eating", "why should i eat", "why eat",
        "good for health", "good for body", "nutritional benefits",
    ])


def is_diet_plan_request(msg: str) -> bool:
    return any(phrase in msg for phrase in [
        "diet plan", "diet chart", "meal plan", "day plan",
        "build my plan", "build a plan", "make a diet",
        "what should i eat today", "daily diet", "weekly plan",
    ])


def is_bmi_question(msg: str) -> bool:
    return "bmi" in msg or "body mass index" in msg or "am i overweight" in msg


def is_intake_analysis(msg: str) -> bool:
    return any(phrase in msg for phrase in [
        "i ate", "i had", "i consumed", "i drank",
        "analyze my", "analyse my", "check my diet",
        "today i ate", "for breakfast i", "for lunch i", "for dinner i",
    ])


def detect_symptom(msg: str) -> str | None:
    for symptom in SYMPTOM_KEYWORDS:
        if symptom in msg:
            return symptom
    return None


# ── Formatters ────────────────────────────────────────────────────────────────

def _fmt_nutrients(item, db: Session) -> str:
    nutrients = get_nutrients_for_item(item.id, db)
    if not nutrients:
        return f"I do not have nutrient data for {item.name} yet."
    lines = [f"{item.name} — nutrients per 100g:", f"  Calories: {item.calories_per_100g} kcal"]
    for n in nutrients:
        lines.append(f"  {n['name']}: {n['amount']} {n['unit']}")
    return "\n".join(lines)


def _fmt_summary(item, db: Session) -> str:
    nutrients = get_nutrients_for_item(item.id, db)[:5]
    season_label = SEASON_LABELS.get(item.season or "all", item.season or "not specified")
    lines = [
        f"{item.name} ({item.category}) — {item.calories_per_100g} kcal per 100g",
        f"Season: {season_label}",
        f"Scientific name: {item.scientific_name or 'not available'}",
    ]
    if nutrients:
        key = ", ".join(f"{n['name']} {n['amount']}{n['unit']}" for n in nutrients)
        lines.append(f"Key nutrients: {key}")
    return "\n".join(lines)


def _fmt_season_answer(item, current_season: str | None) -> str:
    item_season = item.season or "all"
    item_label = SEASON_LABELS.get(item_season, item_season)
    if item_season == "all":
        return f"{item.name} is available year-round and suits all seasons."
    if current_season and current_season not in ("all", None):
        current_label = SEASON_LABELS.get(current_season, current_season)
        if current_season == item_season:
            return f"Yes. {item.name} is a {item_label} food — it fits your current season well."
        return (
            f"{item.name} is best in {item_label}. Your current season is {current_label}. "
            "You can still eat it, but seasonal choices are usually the better fit."
        )
    return f"{item.name} is best eaten in {item_label}."


def _fmt_season_list(season: str | None, db: Session, limit: int = 8) -> str:
    if not season or season == "all":
        return "Select a season filter and I can suggest the best foods for that time of year."
    foods = db.query(Item).filter(
        (Item.season == season) | (Item.season == "all")
    ).order_by(Item.category).limit(limit).all()
    if not foods:
        return "I do not have foods listed for that season yet."
    season_label = SEASON_LABELS.get(season, season)
    lines = [f"Good foods for {season_label}:"]
    for f in foods:
        lines.append(f"  {f.name} ({f.category}) — {f.calories_per_100g} kcal/100g")
    return "\n".join(lines)


def _fmt_compare(item1, item2, db: Session, nutrient_filter: str | None = None) -> str:
    def get_all_nutrients(item) -> dict:
        rows = get_nutrients_for_item(item.id, db)
        return {r["name"]: (r["amount"], r["unit"]) for r in rows}

    n1 = get_all_nutrients(item1)
    n2 = get_all_nutrients(item2)

    if nutrient_filter:
        v1 = n1.get(nutrient_filter)
        v2 = n2.get(nutrient_filter)
        if not v1 and not v2:
            return f"I don't have {nutrient_filter} data for either {item1.name} or {item2.name}."
        lines = [f"{nutrient_filter} comparison (per 100g):"]
        lines.append(f"  {item1.name}: {v1[0]} {v1[1]}" if v1 else f"  {item1.name}: no data")
        lines.append(f"  {item2.name}: {v2[0]} {v2[1]}" if v2 else f"  {item2.name}: no data")
        if v1 and v2:
            winner = item1.name if v1[0] > v2[0] else item2.name
            lines.append(f"  Winner: {winner} has more {nutrient_filter}")
        return "\n".join(lines)

    all_keys = sorted(set(n1) | set(n2))
    priority = ["Protein", "Fiber", "Iron", "Calcium", "Vitamin C", "Vitamin D",
                "Magnesium", "Potassium", "Zinc", "Fat", "Carbohydrates", "Sugar"]
    ordered = [k for k in priority if k in all_keys] + [k for k in all_keys if k not in priority]

    lines = [
        f"{item1.name} vs {item2.name} (per 100g)",
        f"  Calories: {item1.calories_per_100g} kcal  |  {item2.calories_per_100g} kcal",
    ]
    for key in ordered[:12]:
        v1 = n1.get(key)
        v2 = n2.get(key)
        if not v1 and not v2:
            continue
        a1 = f"{v1[0]} {v1[1]}" if v1 else "—"
        a2 = f"{v2[0]} {v2[1]}" if v2 else "—"
        lines.append(f"  {key}: {a1}  |  {a2}")

    lines.append("Note: all values are per 100g from NutriMentor database.")
    return "\n".join(lines)


def _fmt_health_benefits(item, db: Session) -> str:
    nutrients = get_nutrients_for_item(item.id, db)
    if not nutrients:
        return f"I don't have enough data about {item.name} to explain its benefits."

    BENEFIT_MAP = {
        "Iron":           "supports red blood cell production and prevents anemia",
        "Calcium":        "builds and maintains strong bones and teeth",
        "Vitamin C":      "boosts immunity, aids iron absorption, and supports skin health",
        "Vitamin A":      "supports vision, immune function, and skin health",
        "Vitamin D":      "essential for calcium absorption and bone health",
        "Vitamin E":      "acts as an antioxidant and supports skin and immune health",
        "Vitamin K":      "important for blood clotting and bone metabolism",
        "Magnesium":      "supports muscle function, nerve health, and energy production",
        "Potassium":      "regulates blood pressure and supports heart and muscle function",
        "Fiber":          "aids digestion, feeds gut bacteria, and helps maintain blood sugar",
        "Protein":        "builds and repairs muscles and tissues",
        "Folate":         "essential for cell division and especially important during pregnancy",
        "Zinc":           "supports immunity, wound healing, and reproductive health",
        "Phosphorus":     "works with calcium to build bones and supports energy metabolism",
    }

    top = [n for n in nutrients if n["name"] in BENEFIT_MAP][:5]
    season_label = SEASON_LABELS.get(item.season or "all", item.season or "all seasons")
    lines = [f"{item.name} ({item.calories_per_100g} kcal/100g) — why it is good for you:"]
    for n in top:
        benefit = BENEFIT_MAP.get(n["name"], "supports overall health")
        lines.append(f"  {n['name']} ({n['amount']} {n['unit']}): {benefit}")
    lines.append(f"Best season: {season_label}")
    lines.append("Note: general nutrition guidance, not medical advice.")
    return "\n".join(lines)


def compute_bmi(profile: dict | None) -> tuple:
    if not profile:
        return None, None
    h = profile.get("height_cm")
    w = profile.get("weight_kg")
    if not h or not w or h <= 0:
        return None, None
    bmi = round(w / ((h / 100) ** 2), 1)
    if bmi < 18.5:
        label = "underweight"
    elif bmi < 25:
        label = "healthy"
    elif bmi < 30:
        label = "overweight"
    else:
        label = "obese range"
    return bmi, label


def _estimate_tdee(profile: dict) -> int | None:
    w = profile.get("weight_kg")
    h = profile.get("height_cm")
    age = profile.get("age")
    sex = profile.get("sex", "").lower()
    activity = profile.get("activity_level", "moderate").lower()
    if not all([w, h, age]):
        return None
    if sex in ("male", "m"):
        bmr = 10 * w + 6.25 * h - 5 * age + 5
    else:
        bmr = 10 * w + 6.25 * h - 5 * age - 161
    multipliers = {
        "sedentary": 1.2, "light": 1.375, "moderate": 1.55,
        "high": 1.725, "very high": 1.9,
    }
    return round(bmr * multipliers.get(activity, 1.55))


def _fmt_bmi(bmi: float, label: str, profile: dict) -> str:
    parts = [f"Your BMI is {bmi} — {label} range."]
    details = []
    if profile.get("age"):
        details.append(f"Age: {profile['age']}")
    if profile.get("sex"):
        details.append(f"Sex: {profile['sex']}")
    if profile.get("goal"):
        details.append(f"Goal: {profile['goal']}")
    if details:
        parts.append(" | ".join(details))
    parts.append("BMI is a screening tool, not a diagnosis. Consult a doctor for personalised guidance.")
    return "\n".join(parts)


def _fmt_diet_plan(msg: str, db: Session, profile: dict | None) -> str:
    target_season = season_from_message(msg) or "all"
    vegetarian = "vegetarian" in msg or " veg " in msg

    # Spoken goal in the message overrides stored profile goal
    spoken_goal = None
    if any(w in msg for w in ["increase my weight", "gain weight", "bulk up", "weight gain"]):
        spoken_goal = "gain weight"
    elif any(w in msg for w in ["lose weight", "weight loss", "reduce weight", "slim"]):
        spoken_goal = "lose weight"
    elif "maintain" in msg and "weight" in msg:
        spoken_goal = "maintain weight"

    goal = spoken_goal or (profile.get("goal", "") if profile else "")
    tdee = _estimate_tdee(profile) if profile else None

    # Calorie target adjusted by goal
    if tdee:
        if goal == "gain weight":
            calorie_target = tdee + 400
        elif goal == "lose weight":
            calorie_target = tdee - 400
        else:
            calorie_target = tdee
    else:
        calorie_target = None

    # Post-workout / gym context
    post_workout = any(w in msg for w in ["gym", "workout", "exercise", "training", "post workout"])

    # Produce: pick reasonably calorie-dense items (>=20 kcal), sorted by density descending
    q = db.query(Item).filter(
        Item.category.in_(["fruit", "vegetable"]),
        Item.calories_per_100g >= 20,
    )
    if target_season != "all":
        q = q.filter((Item.season == target_season) | (Item.season == "all"))
    produce = q.order_by(Item.calories_per_100g.desc()).limit(8).all()
    fruits  = [i for i in produce if i.category == "fruit"][:3]
    veggies = [i for i in produce if i.category == "vegetable"][:3]

    protein_cats = ["legume", "dairy", "nut", "grain"]
    if not vegetarian:
        protein_cats += ["protein"]
    proteins = db.query(Item).filter(Item.category.in_(protein_cats)).limit(5).all()

    season_label   = SEASON_LABELS.get(target_season, "this season")
    goal_note      = f" • Goal: {goal}" if goal else ""
    tdee_note      = f"\nEstimated calorie target: ~{calorie_target} kcal/day" if calorie_target else ""
    veg_note       = " (vegetarian)" if vegetarian else ""

    bfast_fruit    = fruits[0].name if fruits else (produce[0].name if produce else "a seasonal fruit")
    bfast_pro      = proteins[0].name if proteins else "oats"
    snack          = fruits[1].name if len(fruits) > 1 else bfast_fruit
    lunch_veg      = veggies[0].name if veggies else (produce[0].name if produce else "vegetables")
    lunch_pro      = proteins[0].name if proteins else "dal"
    dinner_pro     = proteins[1].name if len(proteins) > 1 else lunch_pro
    dinner_grain   = next((i.name for i in proteins if i.category == "grain"), "brown rice")

    if post_workout:
        return (
            f"Post-workout plan — {season_label}{veg_note}{goal_note}{tdee_note}\n\n"
            f"Right after training:  Banana or dates for quick energy\n"
            f"Main meal (within 2h): {lunch_veg} with {lunch_pro} — high protein focus\n"
            f"Evening snack:         {snack} + a handful of nuts\n"
            f"Dinner:                {dinner_pro} with {dinner_grain} — lighter portion\n\n"
            "Prioritise protein + carbs within 1–2h of training to support muscle recovery."
        )

    return (
        f"Day plan — {season_label}{veg_note}{goal_note}{tdee_note}\n\n"
        f"Breakfast:    {bfast_fruit} + {bfast_pro}\n"
        f"Mid-morning:  {snack} or a handful of nuts\n"
        f"Lunch:        {lunch_veg} with {lunch_pro}\n"
        f"Evening:      Herbal tea + {snack}\n"
        f"Dinner:       {dinner_pro} with {dinner_grain} and vegetables\n\n"
        "General guideline only. For exact portions, update your profile or consult a nutritionist."
    )


def _fmt_intake_analysis(msg: str, db: Session) -> str:
    foods = detect_food_entities(msg, db)
    if not foods:
        return (
            "I couldn't detect specific foods in your message. "
            "Try: 'I ate banana, oats, and milk today'."
        )

    totals: dict = {}
    for food in foods:
        for n in get_nutrients_for_item(food.id, db):
            name = n["name"]
            if name not in totals:
                totals[name] = [0.0, n["unit"]]
            totals[name][0] += n["amount"]

    rda_rows = {r.nutrient_name: r.daily_amount for r in db.query(RDA).all()}
    total_cal = sum(f.calories_per_100g for f in foods)
    food_names = ", ".join(f.name for f in foods)

    lines = [
        f"Intake summary for: {food_names}",
        f"Total calories (rough): ~{total_cal} kcal",
    ]

    deficiencies = []
    for name, (amount, unit) in sorted(totals.items()):
        rda = rda_rows.get(name)
        if rda:
            pct = round((amount / rda) * 100)
            flag = " ✓" if pct >= 80 else f"  ({pct}% of daily RDA)"
            lines.append(f"  {name}: {amount:.1f} {unit}{flag}")
            if pct < 50:
                deficiencies.append(name)
        else:
            lines.append(f"  {name}: {amount:.1f} {unit}")

    if deficiencies:
        lines.append(f"\nPossible gaps today: {', '.join(deficiencies)}")
        lines.append("Consider adding foods rich in these nutrients to your next meal.")

    lines.append("\nNote: estimates assume ~100g of each food mentioned.")
    return "\n".join(lines)


def _fmt_nutrient_rich_foods(nutrient: str, db: Session, season: str | None) -> str:
    rich = get_foods_rich_in(nutrient, db, season=season)
    if not rich:
        return f"I don't have enough data to list foods rich in {nutrient} for that filter."
    season_label = SEASON_LABELS.get(season) if season and season != "all" else None
    header = f"Foods rich in {nutrient}"
    if season_label:
        header += f" for {season_label}"
    lines = [f"{header} (per 100g):"]
    for f in rich:
        lines.append(f"  {f['food']}: {f['amount']} {f['unit']}")
    return "\n".join(lines)


def _format_capabilities() -> str:
    return (
        "I am NutriMentor AI Agent — a nutrition copilot built around Indian Ritu seasons and real food data.\n\n"
        "I can:\n"
        "  Look up nutrients for any food in my database\n"
        "  Compare two foods side by side\n"
        "  Suggest foods rich in a specific nutrient, filtered by season\n"
        "  Show seasonal food recommendations (all 6 Ritu seasons)\n"
        "  Calculate your BMI and daily calorie estimate from your profile\n"
        "  Build a practical day meal plan based on your season and goal\n"
        "  Analyse what you ate today and flag nutrient gaps\n"
        "  Suggest foods for common symptoms like fever, headache, or weakness\n"
        "  Explain the health benefits of any food\n\n"
        "Try: 'tell me about guava', 'compare spinach and broccoli', "
        "'foods rich in iron in winter', 'I ate banana and oats today', "
        "or 'build a summer diet plan'."
    )


# ── Main router ───────────────────────────────────────────────────────────────

def route_message(
    message: str,
    db: Session,
    *,
    session_id: str,
    context: dict | None = None,
) -> dict:
    context = context or {}
    msg = clean_text(message)

    if not msg or is_garbage(msg):
        return _response(
            session_id=session_id,
            message="I couldn't understand that. Ask me about a food, nutrient, season, BMI, or diet task.",
            task_type="clarification",
            next_actions=["Tell me about a food", "Compare two foods", "Build a day plan"],
        )

    profile        = context.get("profile")
    current_season = season_from_message(msg) or context.get("current_season")
    context_item   = get_context_item(context, db)
    nutrient       = extract_nutrient(msg)
    tokens         = set(msg.split())

    # ── 1. Greetings, thanks, farewells ──────────────────────────────────────
    is_greeting = (tokens & GREETING_TOKENS and len(tokens) <= 3) or _is_extended_greeting(msg)
    if is_greeting:
        return _response(
            session_id=session_id,
            message="Hello! I am NutriMentor AI. Select a food or ask a nutrition question.",
            task_type="greeting",
            next_actions=["What can you do?", "Tell me about guava", "Build my day plan"],
            selected_item=_item_payload(context_item),
        )

    if tokens & THANK_TOKENS or _is_extended_sorry(msg):
        return _response(
            session_id=session_id,
            message="No problem! Ask me anything about food or nutrition.",
            task_type="smalltalk",
            selected_item=_item_payload(context_item),
        )

    if tokens & BYE_TOKENS or _is_extended_bye(msg):
        return _response(
            session_id=session_id,
            message="Take care! Come back anytime for nutrition guidance.",
            task_type="smalltalk",
            selected_item=_item_payload(context_item),
        )

    # ── 2. Identity / help ────────────────────────────────────────────────────
    if msg in IDENTITY_PHRASES or any(p in msg for p in IDENTITY_PHRASES):
        return _response(
            session_id=session_id,
            message="I am NutriMentor AI Agent — a nutrition copilot for season-aware food and diet guidance. I work from structured food data, not guesses.",
            task_type="identity",
            next_actions=["What can you do?", "Select a food", "Build my day plan"],
            selected_item=_item_payload(context_item),
        )

    if msg in HELP_PHRASES or any(p in msg for p in HELP_PHRASES):
        return _response(
            session_id=session_id,
            message=_format_capabilities(),
            task_type="help",
            next_actions=["Tell me about guava", "Compare mango and banana", "Foods rich in iron in winter"],
            selected_item=_item_payload(context_item),
        )

    # ── 3. BMI ────────────────────────────────────────────────────────────────
    if is_bmi_question(msg):
        bmi, label = compute_bmi(profile)
        if bmi is None:
            return _response(
                session_id=session_id,
                message="I need your height and weight to calculate BMI. Add them in your profile panel.",
                task_type="bmi",
                next_actions=["Open profile", "Ask for a diet plan"],
                selected_item=_item_payload(context_item),
            )
        tdee = _estimate_tdee(profile) if profile else None
        tdee_note = f"\nEstimated daily calorie need: ~{tdee} kcal" if tdee else ""
        return _response(
            session_id=session_id,
            message=_fmt_bmi(bmi, label, profile or {}) + tdee_note,
            task_type="bmi",
            used_profile=True,
            citations=["Mifflin-St Jeor equation", "WHO BMI classification"],
            cards=[{"type": "metric", "title": "Your BMI", "body": f"{bmi} — {label}"}],
            next_actions=["Build a diet plan for my goal", "What should I eat?"],
            selected_item=_item_payload(context_item),
        )

    # ── 4. Symptom → food advice ──────────────────────────────────────────────
    symptom = detect_symptom(msg)
    if symptom:
        return _response(
            session_id=session_id,
            message=SYMPTOM_FOOD_MAP[symptom],
            task_type="symptom-advice",
            citations=["NutriMentor general nutrition guidelines"],
            next_actions=["Show me foods with Vitamin C", "What to eat this season", "Build a light meal plan"],
            selected_item=_item_payload(context_item),
        )

    # ── 5. Intake analysis ────────────────────────────────────────────────────
    if is_intake_analysis(msg):
        return _response(
            session_id=session_id,
            message=_fmt_intake_analysis(msg, db),
            task_type="intake-analysis",
            citations=["NutriMentor nutrient database", "ICMR-NIN RDA values"],
            next_actions=["What am I missing?", "Build a plan to close these gaps", "Show foods rich in iron"],
            selected_item=_item_payload(context_item),
        )

    # ── 6. Diet plan ──────────────────────────────────────────────────────────
    if is_diet_plan_request(msg):
        return _response(
            session_id=session_id,
            message=_fmt_diet_plan(msg, db, profile),
            task_type="diet-plan",
            used_profile=bool(profile),
            citations=["NutriMentor food database"],
            cards=[{"type": "plan", "title": "Day plan", "body": "Breakfast → Mid-morning → Lunch → Evening → Dinner"}],
            next_actions=["Analyse what I ate", "Show foods for this season", "Update my profile"],
            selected_item=_item_payload(context_item),
        )

    # ── 7. Detect food entities, resolve vague references ─────────────────────
    foods = find_foods(msg, db)

    if not foods and context_item and uses_context_reference(msg):
        foods = [context_item]

    # ── 8. Nutrient-rich suggestions (nutrient + suggestion intent) ───────────
    if nutrient and wants_suggestions(msg):
        rich = get_foods_rich_in(nutrient, db, season=current_season)
        top_names = ", ".join(f["food"] for f in (rich or [])[:4])
        return _response(
            session_id=session_id,
            message=_fmt_nutrient_rich_foods(nutrient, db, current_season),
            task_type="nutrient-suggestion",
            citations=["NutriMentor nutrient database"],
            cards=[{"type": "ranked-list", "title": f"Top {nutrient} sources", "body": top_names}],
            next_actions=["Compare two of these foods", "Tell me about one of them", "Show seasonal foods"],
            selected_item=_item_payload(context_item),
        )

    # ── 9. Food comparison ────────────────────────────────────────────────────
    two_foods = (
        len(foods) >= 2
        or (len(foods) == 1 and context_item and context_item.id != foods[0].id and is_comparison_question(msg))
    )
    if two_foods:
        f1 = foods[0]
        f2 = foods[1] if len(foods) >= 2 else context_item
        return _response(
            session_id=session_id,
            message=_fmt_compare(f1, f2, db, nutrient_filter=nutrient),
            task_type="comparison",
            used_selected_item=(len(foods) == 1 and context_item is not None),
            citations=["NutriMentor food database"],
            cards=[{
                "type": "comparison",
                "title": f"{f1.name} vs {f2.name}",
                "body": f"{f1.calories_per_100g} kcal vs {f2.calories_per_100g} kcal per 100g",
            }],
            next_actions=[f"Tell me more about {f1.name}", f"Is {f1.name} good in {current_season or 'winter'}?"],
            selected_item=_item_payload(context_item),
        )

    # ── 10. Single food questions ─────────────────────────────────────────────
    if len(foods) == 1:
        item = foods[0]
        used_ctx = context_item is not None and context_item.id == item.id

        if is_calorie_question(msg):
            return _response(
                session_id=session_id,
                message=f"{item.name} has {item.calories_per_100g} kcal per 100g.",
                task_type="calories",
                citations=["NutriMentor food database"],
                cards=[{"type": "metric", "title": item.name, "body": f"{item.calories_per_100g} kcal / 100g"}],
                next_actions=[f"Show all nutrients in {item.name}", f"Compare {item.name} with another food"],
                selected_item=_item_payload(item),
            )

        if nutrient:
            nutrient_rows = get_nutrients_for_item(item.id, db)
            for row in nutrient_rows:
                if row["name"].lower() == nutrient.lower():
                    rda_row = db.query(RDA).filter(RDA.nutrient_name.ilike(nutrient)).first()
                    rda_note = ""
                    if rda_row:
                        pct = round((row["amount"] / rda_row.daily_amount) * 100)
                        rda_note = f" — {pct}% of the daily RDA ({rda_row.daily_amount} {rda_row.unit})"
                    return _response(
                        session_id=session_id,
                        message=f"{item.name} has {row['amount']} {row['unit']} of {nutrient} per 100g{rda_note}.",
                        task_type="nutrient-lookup",
                        citations=["NutriMentor nutrient database"],
                        cards=[{"type": "metric", "title": f"{item.name} — {nutrient}", "body": f"{row['amount']} {row['unit']} per 100g"}],
                        next_actions=[f"Show all nutrients in {item.name}", f"Compare {item.name} with another food"],
                        selected_item=_item_payload(item),
                        used_selected_item=used_ctx,
                    )
            return _response(
                session_id=session_id,
                message=f"I don't have {nutrient} data for {item.name} in my database.",
                task_type="nutrient-lookup",
                citations=["NutriMentor nutrient database"],
                next_actions=[f"Show all nutrients in {item.name}", f"Foods rich in {nutrient}"],
                selected_item=_item_payload(item),
            )

        if is_season_question(msg):
            return _response(
                session_id=session_id,
                message=_fmt_season_answer(item, current_season),
                task_type="season-guidance",
                citations=["NutriMentor seasonal food database"],
                next_actions=[f"Show all foods for {current_season or 'winter'}", f"Nutrients in {item.name}"],
                selected_item=_item_payload(item),
                used_selected_item=used_ctx,
            )

        if is_health_question(msg):
            return _response(
                session_id=session_id,
                message=_fmt_health_benefits(item, db),
                task_type="food-benefits",
                citations=["NutriMentor nutrient database"],
                next_actions=[f"Show full nutrients for {item.name}", f"Compare {item.name} with another food"],
                selected_item=_item_payload(item),
                used_selected_item=used_ctx,
            )

        if any(w in msg for w in ["nutrient", "nutrition", "vitamins", "minerals", "contain", "have", "has"]):
            return _response(
                session_id=session_id,
                message=_fmt_nutrients(item, db),
                task_type="food-lookup",
                citations=["NutriMentor nutrient database"],
                cards=[{"type": "food", "title": item.name, "body": f"{item.category} | {item.calories_per_100g} kcal/100g"}],
                next_actions=[f"Compare {item.name} with another food", f"Is {item.name} good in this season?"],
                selected_item=_item_payload(item),
                used_selected_item=used_ctx,
            )

        # Default: full food summary
        return _response(
            session_id=session_id,
            message=_fmt_summary(item, db),
            task_type="food-lookup",
            citations=["NutriMentor food database", "NutriMentor nutrient database"],
            cards=[{"type": "food", "title": item.name, "body": f"{item.category} | {item.calories_per_100g} kcal/100g"}],
            next_actions=[
                f"Show all nutrients in {item.name}",
                f"Compare {item.name} with another food",
                f"Is {item.name} good in {current_season or 'winter'}?",
            ],
            selected_item=_item_payload(item),
            used_selected_item=used_ctx,
        )

    # ── 11. Season list / nutrient-season cross-query ─────────────────────────
    if is_season_question(msg) or wants_suggestions(msg):
        if nutrient:
            rich = get_foods_rich_in(nutrient, db, season=current_season)
            top_names = ", ".join(f["food"] for f in (rich or [])[:4])
            return _response(
                session_id=session_id,
                message=_fmt_nutrient_rich_foods(nutrient, db, current_season),
                task_type="nutrient-suggestion",
                citations=["NutriMentor nutrient database"],
                cards=[{"type": "ranked-list", "title": f"{nutrient} sources", "body": top_names}],
                next_actions=["Tell me about one of these foods", "Compare two of them"],
                selected_item=_item_payload(context_item),
            )
        return _response(
            session_id=session_id,
            message=_fmt_season_list(current_season, db),
            task_type="season-guidance",
            citations=["NutriMentor seasonal food database"],
            next_actions=["Tell me about one of these foods", "Show foods rich in protein", "Build a day plan"],
            selected_item=_item_payload(context_item),
        )

    # ── 12. Near-miss handlers before generic fallback ───────────────────────

    # "which is better for me?" / "which should i choose?" after a comparison
    if any(p in msg for p in ["which is better", "which one is better", "which should i", "which is healthier", "now which"]):
        if context_item:
            return _response(
                session_id=session_id,
                message=(
                    f"Based on your profile, the better choice depends on your goal.\n"
                    f"Currently selected: {context_item.name} ({context_item.calories_per_100g} kcal/100g).\n"
                    "Ask me to compare it with a specific food and I can show you a detailed breakdown."
                ),
                task_type="clarification",
                next_actions=[f"Compare {context_item.name} with another food", "Build a day plan", "What is my BMI?"],
                selected_item=_item_payload(context_item),
            )
        return _response(
            session_id=session_id,
            message="Select two foods to compare and I can tell you which is better for a specific goal or nutrient.",
            task_type="clarification",
            next_actions=["Compare mango and banana", "Compare spinach and broccoli"],
            selected_item=_item_payload(context_item),
        )

    # "are you accurate?" / trust questions
    if any(p in msg for p in ["are you accurate", "how accurate", "is your data", "can i trust", "are you reliable"]):
        return _response(
            session_id=session_id,
            message=(
                "All nutrition values in NutriMentor are sourced from ICMR-NIN (Indian Council of Medical Research) "
                "and USDA databases. They represent per-100g values for whole foods.\n"
                "The data is structured and deterministic — I don't generate or guess nutrition values. "
                "For clinical or therapeutic nutrition, always consult a registered dietitian."
            ),
            task_type="identity",
            next_actions=["Tell me about a food", "Compare two foods"],
            selected_item=_item_payload(context_item),
        )

    # "can i eat pizza / burger / junk food?" — out-of-DB food
    if any(p in msg for p in ["pizza", "burger", "junk", "fast food", "chips", "fries", "noodles", "pasta", "bread"]):
        return _response(
            session_id=session_id,
            message=(
                "NutriMentor focuses on whole natural foods aligned with Indian Ritu seasons. "
                "Processed and packaged foods like pizza or burgers are outside the scope of this database.\n"
                "For occasional treats, moderation is the general guidance. "
                "Ask me about a whole food alternative instead."
            ),
            task_type="out-of-scope",
            next_actions=["Show foods for this season", "Build a day plan", "Tell me about oats"],
            selected_item=_item_payload(context_item),
        )

    # "is X good for diabetic / heart / kidney patient?" — medical condition framing
    if any(p in msg for p in ["diabetic", "diabetes", "heart patient", "kidney", "blood pressure", "hypertension", "cholesterol"]):
        # Try to find a food in the message and give its summary with a medical disclaimer
        foods = find_foods(msg, db)
        if foods:
            item = foods[0]
            summary = _fmt_summary(item, db)
            return _response(
                session_id=session_id,
                message=(
                    f"{summary}\n\n"
                    "Note: NutriMentor provides general nutrition information, not medical advice. "
                    "For condition-specific dietary guidance, please consult a doctor or registered dietitian."
                ),
                task_type="food-lookup",
                citations=["NutriMentor food database"],
                next_actions=[f"Show all nutrients in {item.name}", "Tell me about another food"],
                selected_item=_item_payload(item),
            )
        return _response(
            session_id=session_id,
            message=(
                "For condition-specific dietary guidance (diabetes, heart disease, kidney conditions), "
                "NutriMentor can share general food information, but always follow your doctor's advice.\n"
                "Ask me about a specific food and I can show you its nutrients."
            ),
            task_type="out-of-scope",
            next_actions=["Tell me about bitter gourd", "Foods rich in fiber", "Build a day plan"],
            selected_item=_item_payload(context_item),
        )

    # ── 13. Generic fallback ──────────────────────────────────────────────────
    return _response(
        session_id=session_id,
        message=(
            "I work best with direct nutrition questions. Try:\n"
            "  'Tell me about guava'\n"
            "  'Compare spinach and broccoli'\n"
            "  'Foods rich in calcium in winter'\n"
            "  'I ate banana, oats and milk today'\n"
            "  'Build a monsoon meal plan'\n"
            "  'What is my BMI?'"
        ),
        task_type="clarification",
        next_actions=["Tell me about a food", "Compare two foods", "Build a day plan", "What can you do?"],
        selected_item=_item_payload(context_item),
    )