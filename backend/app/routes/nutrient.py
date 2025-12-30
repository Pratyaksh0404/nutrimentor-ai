from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.nutrient import Nutrient
from app.schemas.nutrient import NutrientCreate, NutrientResponse

router = APIRouter(prefix="/nutrients", tags=["Nutrients"])


@router.post("/", response_model=NutrientResponse)
def create_nutrient(nutrient: NutrientCreate, db: Session = Depends(get_db)):
    db_nutrient = Nutrient(
        name=nutrient.name,
        amount_per_100g=nutrient.amount_per_100g,
        unit=nutrient.unit,
        item_id=nutrient.item_id
    )
    db.add(db_nutrient)
    db.commit()
    db.refresh(db_nutrient)
    return db_nutrient


@router.get("/item/{item_id}", response_model=list[NutrientResponse])
def get_nutrients_for_item(item_id: int, db: Session = Depends(get_db)):
    return db.query(Nutrient).filter(Nutrient.item_id == item_id).all()
