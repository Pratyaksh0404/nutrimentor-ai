from sqlalchemy.orm import Session
from app.models.item import Item
from rapidfuzz import process, fuzz


def detect_food_entities(message: str, db: Session):
    """
    Detect food items mentioned in the message using fuzzy matching.
    Returns a list of matched Item objects.
    """

    message_words = message.lower().split()

    foods = db.query(Item).all()
    food_names = [food.name.lower() for food in foods]

    detected_items = []

    for word in message_words:

        # find the best fuzzy match
        match, score, index = process.extractOne(word,food_names,scorer=fuzz.ratio)

        # only accept strong matches
        if score >= 85:
            matched_food = foods[index]

            # avoid duplicates
            if matched_food not in detected_items:
                detected_items.append(matched_food)

    return detected_items