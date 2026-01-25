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
