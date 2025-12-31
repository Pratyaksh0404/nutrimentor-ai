from fastapi import FastAPI
from app.config import PROJECT_NAME, VERSION
from app.database import Base, engine
from app.models import item,nutrient,rda
from app.routes import nutrient as nutrient_routes
from app.routes import item as item_routes
from app.routes import rda as rda_routes
from app.routes import diet as diet_routes
from app.routes import chat as chat_routes


def create_app() -> FastAPI:
    app = FastAPI(
        title=PROJECT_NAME,
        version=VERSION,
        description="Explainable Nutrition & Diet Planning Platform"
    )

    Base.metadata.create_all(bind=engine)

    app.include_router(item_routes.router)
    app.include_router(nutrient_routes.router)
    app.include_router(rda_routes.router)
    app.include_router(diet_routes.router)
    app.include_router(chat_routes.router)

    @app.get("/health", tags=["Health"])
    def health_check():
        return {
            "status": "ok",
            "message": "NutriMentor AI backend running 🚀"
        }

    return app


app = create_app()
