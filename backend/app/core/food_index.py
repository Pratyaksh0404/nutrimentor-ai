from app.database import SessionLocal
from app.models.item import Item

FOOD_INDEX = []
FOOD_NAME_MAP = {}


def build_food_index():

    global FOOD_INDEX
    global FOOD_NAME_MAP

    db = SessionLocal()

    foods = db.query(Item).all()

    FOOD_INDEX = []
    FOOD_NAME_MAP = {}

    for food in foods:
        name = food.name.lower()

        FOOD_INDEX.append(name)
        FOOD_NAME_MAP[name] = food

    db.close()

    print(f"Loaded {len(FOOD_INDEX)} foods into search index")


def get_food_index():
    return FOOD_INDEX


def get_food_by_name(name):
    return FOOD_NAME_MAP.get(name)