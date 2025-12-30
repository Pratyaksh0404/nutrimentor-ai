from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base


class Nutrient(Base):
    __tablename__ = "nutrients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)  # Vitamin C, Iron, etc.
    amount_per_100g = Column(Float, nullable=False)
    unit = Column(String, nullable=False)

    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)

    item = relationship("Item", back_populates="nutrients")
