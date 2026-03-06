conversation_memory = {
    "history": [],
    "max_history": 10
}


def add_to_history(user_message: str, bot_response: str):
    """
    Store the latest conversation turn.
    """

    conversation_memory["history"].append({
        "user": user_message,
        "assistant": bot_response
    })

    # limit history size
    if len(conversation_memory["history"]) > conversation_memory["max_history"]:
        conversation_memory["history"].pop(0)


def get_recent_history():
    """
    Return recent conversation history.
    """

    return conversation_memory["history"]


def clear_memory():
    """
    Clear conversation memory.
    """

    conversation_memory["history"] = []