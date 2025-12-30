from pydantic import BaseModel


class ItemBase(BaseModel):
    name: str
    category: str
    calories_per_100g: float
    season: str



class ItemCreate(ItemBase):
    pass


class ItemResponse(ItemBase):
    id: int

    class Config:
        from_attributes = True
