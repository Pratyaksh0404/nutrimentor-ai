from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.rda import RDA
from app.schemas.rda import RDACreate, RDAResponse

router = APIRouter(prefix="/rda", tags=["RDA"])


@router.post("/", response_model=RDAResponse)
def create_rda(rda: RDACreate, db: Session = Depends(get_db)):
    db_rda = RDA(
        nutrient_name=rda.nutrient_name,
        daily_amount=rda.daily_amount,
        unit=rda.unit
    )
    db.add(db_rda)
    db.commit()
    db.refresh(db_rda)
    return db_rda


@router.get("/", response_model=list[RDAResponse])
def get_rda(db: Session = Depends(get_db)):
    return db.query(RDA).all()
