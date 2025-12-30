from pydantic import BaseModel
from typing import List


class ConsumedItem(BaseModel):
    item_id: int
    quantity_in_grams: float


class DietAnalysisRequest(BaseModel):
    consumed_items: List[ConsumedItem]
