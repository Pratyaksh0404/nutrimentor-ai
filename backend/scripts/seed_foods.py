import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.models.item import Item
from app.models.nutrient import Nutrient
from app.models.item_nutrient import ItemNutrient

DATA_PATH = Path("backend/data/foods.json")


def seed_foods():

    db = SessionLocal()

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        foods = json.load(f)

    for food in foods:

        # to check duplicate food
        existing = db.query(Item).filter(
            Item.name.ilike(food["name"])
        ).first()

        if existing:
            print(f"Skipping existing food: {food['name']}")
            continue

        item = Item(
            name=food["name"],
            category=food["category"],
            scientific_name=food.get("scientific_name"),
            season=food["season"],
            calories_per_100g=food["calories_per_100g"],
            image_url=food.get("image_url")
        )

        db.add(item)
        db.commit()
        db.refresh(item)

        nutrients = food.get("nutrients", {})

        for nutrient_name, amount in nutrients.items():

            nutrient = db.query(Nutrient).filter(
                Nutrient.name.ilike(nutrient_name)
            ).first()

            if not nutrient:
                print(f"Nutrient not found in table: {nutrient_name}")
                continue

            item_nutrient = ItemNutrient(
                item_id=item.id,
                nutrient_id=nutrient.id,
                amount_per_100g=amount
            )

            db.add(item_nutrient)

        db.commit()

        print(f"Added food: {food['name']}")

    db.close()


if __name__ == "__main__":
    seed_foods()