from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.diet import DietAnalysisRequest
from app.models.item import Item
from app.models.rda import RDA
from app.core.nutrition_engine import (
    compute_consumed_nutrients,
    compute_deficiencies,
)
from app.core.suggestion_engine import suggest_foods_for_deficiency

router = APIRouter(prefix="/diet", tags=["Diet Analysis"])


@router.post("/analyze")
def analyze_diet(request: DietAnalysisRequest, db: Session = Depends(get_db)):
    consumed_totals = compute_consumed_nutrients(
        request.consumed_items, db
    )

    rda_values = db.query(RDA).all()
    deficiencies = compute_deficiencies(consumed_totals, rda_values)

    suggestions = {}
    all_items = db.query(Item).all()

    for deficiency in deficiencies:
        nutrient = deficiency["nutrient"]
        suggestions[nutrient] = suggest_foods_for_deficiency(
            nutrient,
            deficiency["deficit"],
            all_items
        )

    return {
        "consumed_nutrients": consumed_totals,
        "deficiencies": deficiencies,
        "suggestions": suggestions
    }
