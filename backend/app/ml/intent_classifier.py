import torch
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification
from pathlib import Path

MODEL_PATH = Path(__file__).parent / "intent_model"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

tokenizer = DistilBertTokenizerFast.from_pretrained(MODEL_PATH)
model = DistilBertForSequenceClassification.from_pretrained(MODEL_PATH)
model.to(device)
model.eval()


def predict_intent(text: str):
    inputs = tokenizer(
        text,
        truncation=True,
        padding=True,
        return_tensors="pt"
    )

    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.softmax(outputs.logits, dim=1)
    confidence, predicted_class = torch.max(probs, dim=1)

    intent = model.config.id2label[predicted_class.item()]

    return {
        "intent": intent,
        "confidence": float(confidence.item())
    }