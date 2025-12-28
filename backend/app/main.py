from fastapi import FastAPI
from app.config import PROJECT_NAME, VERSION


def create_app() -> FastAPI:
    app = FastAPI(
        title=PROJECT_NAME,
        version=VERSION,
        description="Explainable Nutrition & Diet Planning Platform"
    )

    @app.get("/health", tags=["Health"])
    def health_check():
        return {
            "status": "ok",
            "message": "NutriMentor AI backend running 🚀"
        }

    return app


app = create_app()
