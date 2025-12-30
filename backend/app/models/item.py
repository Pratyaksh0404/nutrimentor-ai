from sqlalchemy import Column, Integer, String, Float
from sqlalchemy.orm import relationship
from app.database import Base


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    category = Column(String, nullable=False)
    calories_per_100g = Column(Float, nullable=False)
    season = Column(String, nullable=False)

    nutrients = relationship(
        "Nutrient",
        back_populates="item",
        cascade="all, delete-orphan"
    )
