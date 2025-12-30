from sqlalchemy import Column, Integer, String, Float
from app.database import Base


class RDA(Base):
    __tablename__ = "rda"

    id = Column(Integer, primary_key=True, index=True)
    nutrient_name = Column(String, unique=True, nullable=False)
    daily_amount = Column(Float, nullable=False)
    unit = Column(String, nullable=False)
