from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import PROJECT_NAME, VERSION
from app.database import Base, engine

from app.models import item, nutrient, rda

from app.routes import nutrient as nutrient_routes
from app.routes import item as item_routes
from app.routes import rda as rda_routes
from app.routes import diet as diet_routes
from app.routes import chat as chat_routes

from app.core.food_index import build_food_index


@asynccontextmanager
async def lifespan(app: FastAPI):

    # startup logic
    Base.metadata.create_all(bind=engine)
    build_food_index()

    yield



def create_app() -> FastAPI:
    app = FastAPI(
        title=PROJECT_NAME,
        version=VERSION,
        description="Explainable Nutrition & Diet Planning Platform",
        lifespan=lifespan
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(item_routes.router)
    app.include_router(nutrient_routes.router)
    app.include_router(rda_routes.router)
    app.include_router(diet_routes.router)
    app.include_router(chat_routes.router)
    app.include_router(chat_routes.legacy_router)

    @app.get("/health", tags=["Health"])
    def health_check():
        return {
            "status": "ok",
            "message": "NutriMentor AI backend running 🚀"
        }

    return app


app = create_app()
