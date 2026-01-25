from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class ItemNutrient(Base):
    __tablename__ = "item_nutrients"

    id = Column(Integer, primary_key=True, index=True)

    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    nutrient_id = Column(Integer, ForeignKey("nutrients.id"), nullable=False)

    amount_per_100g = Column(Float, nullable=False)

    item = relationship(
        "Item",
        back_populates="nutrients"
    )

    nutrient = relationship(
        "Nutrient",
        back_populates="items"
    )
