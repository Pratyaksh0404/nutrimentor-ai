from app.models.item import Item
from app.models.item_nutrient import ItemNutrient


def get_item_by_name(name: str, db):
    return db.query(Item).filter(Item.name.ilike(f"%{name}%")).first()


def get_nutrients_for_item(item_id: int, db):
    records = db.query(ItemNutrient).filter(ItemNutrient.item_id == item_id).all()

    nutrients = []
    for r in records:
        nutrients.append({
            "name": r.nutrient.name,
            "amount": r.amount_per_100g,
            "unit": r.nutrient.unit
        })

    return nutrients