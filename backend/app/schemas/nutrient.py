from pydantic import BaseModel


class NutrientBase(BaseModel):
    name: str
    unit: str


class NutrientCreate(NutrientBase):
    pass


class NutrientResponse(NutrientBase):
    id: int

    class Config:
        from_attributes = True


class ItemNutrientResponse(BaseModel):
    name: str
    amount_per_100g: float
    unit: str

    class Config:
        from_attributes = True
