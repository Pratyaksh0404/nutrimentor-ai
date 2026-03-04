user_memory = {}

def get_memory(user_id="default"):
    return user_memory.setdefault(user_id, {
        "history": [],
        "goals": [],
        "deficiencies": []
    })

def add_to_history(user_id, user_msg, assistant_msg):
    mem = get_memory(user_id)
    mem["history"].append({
        "user": user_msg,
        "assistant": assistant_msg
    })

    if len(mem["history"]) > 4:
        mem["history"] = mem["history"][-6:]