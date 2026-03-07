from sqlalchemy.orm import Session
from rapidfuzz import process, fuzz
from app.core.food_index import get_food_index, get_food_by_name


def generate_phrases(words, max_len=3):

    phrases = []

    for i in range(len(words)):
        for j in range(i + 1, min(i + max_len + 1, len(words) + 1)):
            phrase = " ".join(words[i:j])
            phrases.append(phrase)

    return phrases


def detect_food_entities(message: str, db: Session = None):

    words = message.lower().split()
    phrases = generate_phrases(words)

    # load food names from in-memory index
    food_names = get_food_index()

    detected_items = []

    for phrase in phrases:

        match = process.extractOne(phrase,food_names,scorer=fuzz.token_sort_ratio)

        if match is None:
            continue

        match_name, score, _ = match

        if score >= 85:

            matched_food = get_food_by_name(match_name)

            if matched_food and matched_food not in detected_items:
                detected_items.append(matched_food)

    return detected_items