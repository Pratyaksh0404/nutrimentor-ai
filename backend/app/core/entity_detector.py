from rapidfuzz import process, fuzz
from app.core.food_index import get_food_index, get_food_by_name

# Words that should never be matched as food names
STOPWORDS = {
    "what", "about", "this", "that", "is", "are", "the", "a", "an",
    "food", "foods", "eat", "eating", "tell", "me", "nutrients", "nutrient",
    "healthy", "good", "bad", "should", "can", "have", "has", "how",
    "much", "many", "does", "do", "its", "it", "my", "your", "for",
    "and", "or", "in", "of", "to", "at", "by", "with", "which",
    "give", "list", "show", "need", "want", "get", "best", "high",
    "rich", "source", "also", "contain", "contains", "know", "like",
    "compare", "versus", "between", "diet", "plan", "meal", "day",
    "season", "ritu", "winter", "summer", "monsoon", "autumn", "spring",
    "prewinter", "all", "every", "any", "some", "many", "few",
    "calorie", "calories", "kcal", "protein", "fiber", "iron", "calcium",
    "vitamin", "zinc", "fat", "sugar", "sodium", "carb", "carbs",
}

# Minimum character length for a phrase to attempt fuzzy match
MIN_PHRASE_LEN = 4

# Fuzzy match threshold — lowered from 88 to catch "chickpeas", "guava" etc.
FUZZY_THRESHOLD = 80


def _is_valid_candidate(phrase: str) -> bool:
    """Reject short words and pure stopwords."""
    if len(phrase) < MIN_PHRASE_LEN:
        return False
    # single-word stopword
    if phrase in STOPWORDS:
        return False
    return True


def generate_phrases(words: list[str], max_len: int = 3) -> list[str]:
    """Generate all n-gram phrases up to max_len from a word list."""
    phrases = []
    for i in range(len(words)):
        for j in range(i + 1, min(i + max_len + 1, len(words) + 1)):
            phrase = " ".join(words[i:j])
            phrases.append(phrase)
    return phrases


def _direct_db_lookup(phrase: str, db) -> object | None:
    """Try exact and partial DB match as a fast fallback."""
    if db is None:
        return None
    from app.models.item import Item
    # exact name match (case-insensitive)
    item = db.query(Item).filter(Item.name.ilike(phrase)).first()
    if item:
        return item
    # partial match only for longer phrases
    if len(phrase) >= 5:
        item = db.query(Item).filter(Item.name.ilike(f"%{phrase}%")).first()
        if item:
            return item
    return None


def detect_food_entities(message: str, db=None) -> list:
    """
    Detect food names in a user message.

    Strategy:
    1. Strip stopwords and build n-gram phrases.
    2. Try rapidfuzz fuzzy match against the food index.
    3. Fall back to direct DB ilike lookup for phrases that fuzz misses.
    4. Deduplicate by item id.
    """
    words = [w for w in message.lower().split() if w not in STOPWORDS]

    if not words:
        return []

    phrases = generate_phrases(words, max_len=3)
    food_names = get_food_index()

    detected: list = []
    seen_ids: set[int] = set()

    for phrase in phrases:
        if not _is_valid_candidate(phrase):
            continue

        # ── fuzzy match ──────────────────────────────────────────────────
        match = process.extractOne(phrase, food_names, scorer=fuzz.token_set_ratio)
        if match:
            match_name, score, _ = match
            if score >= FUZZY_THRESHOLD:
                item = get_food_by_name(match_name)
                if item and item.id not in seen_ids:
                    detected.append(item)
                    seen_ids.add(item.id)
                    continue  # don't also try direct lookup for same phrase

        # ── direct DB fallback ───────────────────────────────────────────
        if db is not None:
            item = _direct_db_lookup(phrase, db)
            if item and item.id not in seen_ids:
                detected.append(item)
                seen_ids.add(item.id)

    return detected