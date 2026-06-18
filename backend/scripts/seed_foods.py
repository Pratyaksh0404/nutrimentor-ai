import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models.item import Item
from app.models.nutrient import Nutrient
from app.models.item_nutrient import ItemNutrient
from app.models.rda import RDA

DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "foods.json"

# ── All nutrients with correct units ─────────────────────────────────────────
NUTRIENT_UNITS = {
    "Vitamin C":      "mg",
    "Iron":           "mg",
    "Calcium":        "mg",
    "Potassium":      "mg",
    "Fiber":          "g",
    "Vitamin A":      "µg",
    "Vitamin B6":     "mg",
    "Magnesium":      "mg",
    "Folate":         "µg",
    "Vitamin E":      "mg",
    "Zinc":           "mg",
    "Phosphorus":     "mg",
    "Protein":        "g",
    "Carbohydrates":  "g",
    "Fat":            "g",
    "Sugar":          "g",
    "Sodium":         "mg",
    "Vitamin D":      "µg",
    "Vitamin K":      "µg",
}

# ── RDA values (ICMR-NIN 2020 adult reference, mixed sex average) ─────────────
RDA_VALUES = [
    ("Vitamin C",     65,    "mg"),
    ("Iron",          17,    "mg"),
    ("Calcium",       1000,  "mg"),
    ("Potassium",     3500,  "mg"),
    ("Fiber",         30,    "g"),
    ("Vitamin A",     900,   "µg"),
    ("Vitamin B6",    1.5,   "mg"),
    ("Magnesium",     340,   "mg"),
    ("Folate",        400,   "µg"),
    ("Vitamin E",     15,    "mg"),
    ("Zinc",          12,    "mg"),
    ("Phosphorus",    700,   "mg"),
    ("Protein",       55,    "g"),
    ("Carbohydrates", 300,   "g"),
    ("Fat",           60,    "g"),
    ("Sodium",        2000,  "mg"),
    ("Vitamin D",     15,    "µg"),
    ("Vitamin K",     120,   "µg"),
]


def ensure_nutrients(db):
    """Make sure every nutrient in NUTRIENT_UNITS exists in the nutrients table."""
    for name, unit in NUTRIENT_UNITS.items():
        existing = db.query(Nutrient).filter(Nutrient.name.ilike(name)).first()
        if not existing:
            db.add(Nutrient(name=name, unit=unit))
            print(f"  [nutrient] Added: {name} ({unit})")
    db.commit()


def ensure_rda(db):
    """Upsert all RDA values."""
    for nutrient_name, daily_amount, unit in RDA_VALUES:
        existing = db.query(RDA).filter(RDA.nutrient_name.ilike(nutrient_name)).first()
        if existing:
            existing.daily_amount = daily_amount
            existing.unit = unit
        else:
            db.add(RDA(nutrient_name=nutrient_name, daily_amount=daily_amount, unit=unit))
            print(f"  [rda] Added: {nutrient_name} = {daily_amount} {unit}")
    db.commit()


def seed_foods():
    db = SessionLocal()

    print("── Step 1: ensuring all nutrients exist ─────────────────────────")
    ensure_nutrients(db)

    print("\n── Step 2: upserting RDA values ─────────────────────────────────")
    ensure_rda(db)

    print("\n── Step 3: seeding foods ────────────────────────────────────────")
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        foods = json.load(f)

    added = 0
    skipped = 0

    for food in foods:
        existing = db.query(Item).filter(Item.name.ilike(food["name"])).first()

        if existing:
            print(f"  [skip] {food['name']} already exists")
            skipped += 1
            continue

        item = Item(
            name=food["name"],
            category=food["category"],
            scientific_name=food.get("scientific_name"),
            season=food["season"],
            calories_per_100g=food["calories_per_100g"],
            image_url=food.get("image_url"),
        )
        db.add(item)
        db.commit()
        db.refresh(item)

        nutrients_data = food.get("nutrients", {})
        linked = 0
        missing_nutrients = []

        for nutrient_name, amount in nutrients_data.items():
            nutrient = db.query(Nutrient).filter(
                Nutrient.name.ilike(nutrient_name)
            ).first()

            if not nutrient:
                missing_nutrients.append(nutrient_name)
                continue

            db.add(ItemNutrient(
                item_id=item.id,
                nutrient_id=nutrient.id,
                amount_per_100g=amount,
            ))
            linked += 1

        db.commit()
        added += 1

        status = f"{linked} nutrients"
        if missing_nutrients:
            status += f" | MISSING: {missing_nutrients}"
        print(f"  [added] {food['name']:25s}  ({food['season']:12s})  {status}")

    db.close()
    print(f"\n── Done ─────────────────────────────────────────────────────────")
    print(f"  Added: {added} foods")
    print(f"  Skipped (already existed): {skipped} foods")


if __name__ == "__main__":
    seed_foods()