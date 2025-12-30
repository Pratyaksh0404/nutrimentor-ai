from pydantic import BaseModel


class RDABase(BaseModel):
    nutrient_name: str
    daily_amount: float
    unit: str


class RDACreate(RDABase):
    pass


class RDAResponse(RDABase):
    id: int

    class Config:
        from_attributes = True
