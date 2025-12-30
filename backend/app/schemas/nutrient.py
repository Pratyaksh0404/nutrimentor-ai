from pydantic import BaseModel


class NutrientBase(BaseModel):
    name: str
    amount_per_100g: float
    unit: str


class NutrientCreate(NutrientBase):
    item_id: int


class NutrientResponse(NutrientBase):
    id: int
    item_id: int

    class Config:
        from_attributes = True
