from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import relationship

from app.database import Base


class Nutrient(Base):
    __tablename__ = "nutrients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    unit = Column(String, nullable=False)

    items = relationship(
        "ItemNutrient",
        back_populates="nutrient",
        cascade="all, delete-orphan"
    )
