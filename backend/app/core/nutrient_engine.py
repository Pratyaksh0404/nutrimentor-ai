from sqlalchemy.orm import Session
from app.models.item_nutrient import ItemNutrient
from app.models.item import Item
from app.models.nutrient import Nutrient


def get_foods_rich_in(nutrient_name: str, db: Session, limit: int = 5, season: str = None):

    nutrient = db.query(Nutrient).filter(
        Nutrient.name.ilike(f"%{nutrient_name}%")
    ).first()

    if not nutrient:
        return None

    query = (
        db.query(Item, ItemNutrient.amount_per_100g)
        .join(ItemNutrient, Item.id == ItemNutrient.item_id)
        .filter(ItemNutrient.nutrient_id == nutrient.id)
    )

    if season and season != "all":
        query = query.filter(Item.season == season)

    results = (
        query
        .order_by(ItemNutrient.amount_per_100g.desc())
        .limit(limit)
        .all()
    )

    foods = []

    for item, amount in results:
        foods.append({
            "food": item.name,
            "amount": amount,
            "unit": nutrient.unit
        })

    return foods
