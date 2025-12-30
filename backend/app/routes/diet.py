from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.diet import DietAnalysisRequest
from app.models.item import Item
from app.models.rda import RDA
from app.core.nutrition_engine import compute_deficiencies

router = APIRouter(prefix="/diet", tags=["Diet Analysis"])


@router.post("/analyze")
def analyze_diet(request: DietAnalysisRequest, db: Session = Depends(get_db)):
    consumed_totals = {}

    for consumed in request.consumed_items:
        item = db.query(Item).filter(Item.id == consumed.item_id).first()
        if not item:
            continue

        for nutrient in item.nutrients:
            amount = (
                nutrient.amount_per_100g * consumed.quantity_in_grams / 100
            )
            consumed_totals[nutrient.name] = (
                consumed_totals.get(nutrient.name, 0) + amount
            )

    rda_values = db.query(RDA).all()
    deficiencies = compute_deficiencies(consumed_totals, rda_values)

    return {
        "consumed_nutrients": consumed_totals,
        "deficiencies": deficiencies
    }
