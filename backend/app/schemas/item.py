from pydantic import BaseModel
from typing import Optional
from typing import List
from app.schemas.nutrient import NutrientResponse

class ItemBase(BaseModel):
    name: str
    scientific_name: Optional[str] = None
    category: str
    calories_per_100g: float
    season: str
    image_url: Optional[str] = None


class ItemCreate(ItemBase):
    pass


class ItemResponse(ItemBase):
    id: int

    class Config:
        from_attributes = True


class ItemNutrientAmount(BaseModel):
    nutrient: NutrientResponse
    amount_per_100g: float


class ItemWithNutrientsResponse(ItemResponse):
    nutrients: List[ItemNutrientAmount] = []