import re


MAX_INPUT_LENGTH = 500


def clean_text(text: str) -> str:
    """
    Normalize and clean user input before routing.
    """

    if not text:
        return ""

    # limit input length
    text = text[:MAX_INPUT_LENGTH]

    # lowercase
    text = text.lower()

    # remove special characters except letters/numbers/spaces
    text = re.sub(r"[^a-z0-9\s]", " ", text)

    # collapse multiple spaces
    text = re.sub(r"\s+", " ", text)

    text = text.strip()

    return text


def is_garbage(text: str) -> bool:
    """
    Detect meaningless input like '%%%%%' or '123456'.
    """

    if not text:
        return True

    # if text has no letters
    if not re.search(r"[a-z]", text):
        return True

    return False