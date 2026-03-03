from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.item import Item
from app.schemas.item import ItemCreate, ItemResponse
from app.models.item_nutrient import ItemNutrient
from app.schemas.nutrient import ItemNutrientResponse

router = APIRouter(prefix="/items", tags=["Items"])


@router.post("/", response_model=ItemResponse)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    db_item = Item(
        name=item.name,
        category=item.category,
        calories_per_100g=item.calories_per_100g,
        season=item.season
    )

    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.get("/", response_model=list[ItemResponse])
def get_items(
    season: Optional[str] = Query(default=None),
    db: Session = Depends(get_db)
):
    query = db.query(Item)

    if season and season != "all":
        query = query.filter(Item.season == season)

    return query.all()


@router.get("/{item_id}/nutrients", response_model=list[ItemNutrientResponse])
def get_item_nutrients(item_id: int, db: Session = Depends(get_db)):
    nutrients = (
        db.query(ItemNutrient)
        .filter(ItemNutrient.item_id == item_id)
        .all()
    )

    return [
        {
            "name": n.nutrient.name,
            "amount_per_100g": n.amount_per_100g,
            "unit": n.nutrient.unit
        }
        for n in nutrients
    ]

