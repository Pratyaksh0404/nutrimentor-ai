from pydantic import BaseModel
from typing import Optional


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
