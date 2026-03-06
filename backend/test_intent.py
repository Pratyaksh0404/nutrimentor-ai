from app.core.entity_detector import detect_food_entities
from app.database import SessionLocal
from app.core.memory_store import add_to_history, get_recent_history


db = SessionLocal()

message = "compare apple and banana"

foods = detect_food_entities(message, db)
add_to_history("i lack vitamin c", "eat oranges")
add_to_history("i hate oranges", "try kiwi")

print(get_recent_history())
for food in foods:
    print(food.name)