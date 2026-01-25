from sqlalchemy import Column, Integer, String, Float
from sqlalchemy.orm import relationship
from app.database import Base


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    scientific_name = Column(String)
    category = Column(String)
    calories_per_100g = Column(Float)
    season = Column(String)
    image_url = Column(String)

    nutrients = relationship(
        "ItemNutrient",
        back_populates="item",
        cascade="all, delete-orphan"
    )
