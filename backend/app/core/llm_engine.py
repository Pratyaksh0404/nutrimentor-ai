from llama_cpp import Llama
from pathlib import Path

MODEL_PATH = Path(__file__).parent.parent / "ml" / "models" / "mistral.gguf"

llm = None


def get_llm():
    global llm

    if llm is None:
        llm = Llama(
            model_path=str(MODEL_PATH),
            n_ctx=1024,
            n_threads=4,
            n_gpu_layers=0
        )

    return llm


SYSTEM_PROMPT = """
You are NutriMentor AI, an AI-powered nutrition mentor.

Rules:
- Keep answers very short.
- Maximum 2 sentences.
- Focus on nutrition advice.
- Do not mention being an AI model.
"""


def generate_response(message: str, history=None):
    llm = get_llm()
    prompt = SYSTEM_PROMPT + "\n"

    if history:
        for turn in history[-3:]:
            prompt += f"User: {turn['user']}\n"
            prompt += f"Assistant: {turn['assistant']}\n"

    prompt += f"User: {message}\nAssistant:"

    output = llm(
        prompt,
        max_tokens=40,
        temperature=0.5,
        stop=["User:"]
    )

    return output["choices"][0]["text"].strip()