from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "NutriMentor AI backend is running 🚀"}
