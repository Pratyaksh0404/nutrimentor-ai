from app.core.llm_engine import generate_response
from app.core.memory_store import get_memory, add_to_history
from app.core.tools import get_item_by_name, get_nutrients_for_item
from app.models.item import Item


SYSTEM_PROMPT = """
You are NutriMentor AI.

You are a dedicated AI-powered nutrition mentor.

Identity Rules:
- Your name is NutriMentor AI.
- You were built as a nutrition assistant.
- Never say you are a generic language model.
- Never mention training data or OpenAI.
- If asked who you are, answer briefly: 
  "I am NutriMentor AI, your AI-powered nutrition mentor."

Behavior Rules:
- Keep responses under 2–3 short sentences.
- Avoid numbered lists unless necessary.
- Avoid long explanations.
- Be concise.
- Avoid long explanations.
- Stay medically safe.
- Focus only on nutrition and health topics.
- If asked unrelated questions, gently redirect to nutrition.
"""


def detect_food_in_message(message: str, db):
    """
    Faster food detection:
    Instead of splitting word-by-word,
    check entire message against DB items.
    """
    all_items = db.query(Item).all()
    lower_msg = message.lower()

    for item in all_items:
        if item.name.lower() in lower_msg:
            return item

    return None


def run_agent(message: str, context: dict, db):

    memory = get_memory()

    # Keep only last 2 turns for speed
    recent_history = memory["history"][-2:] if memory["history"] else []

    # Detect food in message
    item = detect_food_in_message(message, db)
    db_info_text = ""

    if item:
        nutrients = get_nutrients_for_item(item.id, db)

        db_info_text += f"Food: {item.name}\n"
        db_info_text += f"Calories per 100g: {item.calories_per_100g}\n"

        if nutrients:
            db_info_text += "Nutrients:\n"
            for n in nutrients:
                db_info_text += f"- {n['name']}: {n['amount']} {n['unit']}\n"

    # Build Messages
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
    ]

    # Inject recent conversation summary (lighter than full replay)
    if recent_history:
        summary_text = ""
        for turn in recent_history:
            summary_text += f"User: {turn['user']}\nAssistant: {turn['assistant']}\n"

        messages.append({
            "role": "system",
            "content": f"""
Recent conversation context:
{summary_text}

Use this to maintain continuity.
"""
        })

    if any(keyword in message.lower() for keyword in ["year", "kg", "male", "female", "weight"]):
        messages.append({
            "role": "system",
            "content": """
    User has provided personal body information.
    Provide practical and actionable nutrition advice.
    Avoid generic textbook responses.
    """
        })

    # Strong grounding if DB info exists
    if db_info_text:
        messages.append({
            "role": "system",
            "content": f"""
You MUST answer strictly using the following database information.

Do NOT add any extra nutrients.
Do NOT guess values.
If information is missing, say:
"That information is not available in the database."

DATABASE INFO:
{db_info_text}
"""
        })

    # Add user message last
    messages.append({"role": "user", "content": message})

    # Generate Response
    response = generate_response(messages)

    # Safety cleanup (identity correction)
    if "language model" in response.lower():
        response = "I am NutriMentor AI, your AI-powered nutrition mentor."

    # Store memory
    add_to_history("default", message, response)

    return response