from llama_cpp import Llama
from pathlib import Path

MODEL_PATH = Path(__file__).parent.parent / "ml" / "models" / "mistral.gguf"

llm = Llama(
    model_path=str(MODEL_PATH),
    n_ctx=768,
    n_threads=8,
    n_batch=32,
    verbose=False
)

def generate_response(messages):
    output = llm.create_chat_completion(
        messages=messages,
        temperature=0.15,
        top_p=0.9,
        max_tokens=60
    )
    return output["choices"][0]["message"]["content"].strip()