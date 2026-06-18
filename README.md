# NutriMentor AI

NutriMentor AI is a nutrition-focused web product built around seasonal food discovery, explainable nutrient information, diet deficiency analysis, and a context-aware chatbot.

The product direction is to make nutrition guidance feel useful, fast, grounded, and personal, while staying aligned with Indian `Ritu` season concepts and practical food selection.

## Current Status

This repository is in active development.

What is working now:

- Seasonal food explorer UI with a three-column layout.
- Item cards with hover preview and selected-item context.
- Detail panel with scientific name, calories, category, and key nutrients.
- Backend health check and item APIs.
- Chatbot with deterministic answers for many common nutrition prompts.
- Selected-item chat context such as `what is this`, `what nutrients does it have`, and seasonal follow-ups.
- Diet analysis endpoint for consumed items, deficiencies, and food suggestions.
- Local SQLite database and JSON-based food seed data.
- Local ML/LLM assets included in the backend codebase.

What is still in progress:

- Data cleanup and expansion.
- Better image coverage for all foods.
- More robust chatbot logic for broader diet and health questions.
- Personalization features like BMI, profile memory, and saved sessions.
- RAG-based retrieval and response streaming.
- Auth, persistent user history, and deployment hardening.

## Product Goals

NutriMentor AI is being built as a product, not just a demo project. The intended experience is:

- Fast answers for common nutrition questions.
- Minimum hallucination by preferring structured data over free-form generation.
- Season-aware food suggestions.
- Clear and useful nutrient breakdowns.
- Practical diet guidance that can later become personalized.

## Tech Stack

### Frontend

- React 19
- TypeScript
- Vite / Rolldown Vite
- Tailwind CSS
- Axios
- Lucide React

### Backend

- FastAPI
- SQLAlchemy
- SQLite
- Pydantic
- Uvicorn

### ML / AI

- `rapidfuzz` for fuzzy food matching
- `torch` + `transformers` for intent classification assets
- `llama-cpp-python` for local GGUF model inference
- Local Mistral GGUF model in `backend/app/ml/models/mistral.gguf`
- Local DistilBERT intent model in `backend/app/ml/intent_model/`

## Repository Structure

```text
Nutrimentor-Ai/
├── backend/
│   ├── app/
│   │   ├── core/            # routing logic, chat logic, nutrient/diet engines
│   │   ├── ml/              # local intent model + GGUF model assets
│   │   ├── models/          # SQLAlchemy models
│   │   ├── routes/          # FastAPI route modules
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── config.py
│   │   ├── database.py
│   │   └── main.py
│   ├── data/foods.json      # seed food dataset
│   ├── scripts/seed_foods.py
│   ├── nutrimentor.db
│   └── test_intent.py
├── frontend/
│   ├── public/images/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── constants/
│   │   ├── hooks/
│   │   ├── pages/
│   │   ├── types/
│   │   └── main.tsx
│   └── package.json
├── requirements.txt
└── README.md
```

## Frontend Features Implemented

- Seasonal selector with `Ritu` mapping.
- Food grid that updates by season filter.
- Hover preview for food spotlight.
- Click-to-select food for chatbot context.
- Clear selected food from the detail panel.
- Detail panel with:
  - scientific name
  - calories per 100g
  - category
  - key nutrients
- Chat panel connected to backend.
- Backend health-aware loading and error states.

Main frontend screen:

- [frontend/src/pages/Home.tsx](D:/Pratyaksh2/Root/pycharm/Project/Nutrimentor-Ai/frontend/src/pages/Home.tsx)

## Backend Features Implemented

- FastAPI application bootstrap with CORS.
- Health endpoint.
- Item listing by season.
- Item nutrient lookup endpoint.
- RDA create/list endpoints.
- Diet analysis endpoint:
  - consumed nutrient totals
  - nutrient deficiencies
  - suggestion mapping
- Chat endpoint with deterministic routing before any model fallback.
- Food search index built at startup.
- Seed script to populate foods and item-nutrient relations.

Backend entrypoint:

- [backend/app/main.py](D:/Pratyaksh2/Root/pycharm/Project/Nutrimentor-Ai/backend/app/main.py)

## Chatbot Behavior Today

The chatbot is currently designed to prefer structured, instant answers whenever possible.

It already handles:

- greetings and basic conversational prompts
- identity / capability prompts
- selected-item context such as `what is this`
- nutrient lookups for a selected or detected food
- calorie questions
- season suitability questions
- food comparison prompts
- general nutrient source prompts such as `foods rich in protein`
- season-filtered nutrient suggestions such as `what should I eat in winter for protein`

Core chat router:

- [backend/app/core/agent_router.py](D:/Pratyaksh2/Root/pycharm/Project/Nutrimentor-Ai/backend/app/core/agent_router.py)

Important note:

- The current main chat path avoids unnecessary LLM calls for many common prompts.
- Local intent and local LLM assets still exist in the repo because they are part of the broader roadmap, but the current fast path is mostly deterministic.

## API Overview

Base URL used by the frontend:

- `http://localhost:8000`

### Health

- `GET /health`

### Items

- `GET /items/`
- `GET /items/?season=summer`
- `POST /items/`
- `GET /items/{item_id}/nutrients`

### Nutrients

- `POST /nutrients/`
- `GET /nutrients/item/{item_id}`

### RDA

- `GET /rda/`
- `POST /rda/`

### Diet

- `POST /diet/analyze`

### Chat

- `POST /chat/`

Example chat payload:

```json
{
  "message": "what nutrients does it have",
  "context": {
    "current_item": {
      "id": 4,
      "name": "Tomato",
      "season": "summer"
    },
    "current_season": "summer"
  }
}
```

## Data and Local Assets

Current repository data/assets include:

- `backend/data/foods.json` as the main food seed file
- `backend/nutrimentor.db` as the current SQLite database
- `backend/nutrimentor_backup.db` as a backup snapshot
- local food images inside `frontend/public/images/`
- local GGUF and intent model assets inside `backend/app/ml/`

Important observations:

- The seed file currently contains duplicate food entries for some foods.
- Some foods still have missing or incomplete image coverage.
- Some units/data values still need cleanup and normalization.

## Local Setup

### Prerequisites

- Python 3.10+ or compatible virtual environment
- Node.js and npm available in `PATH`
- Windows PowerShell works fine for the current setup

### 1. Clone the repository

```bash
git clone https://github.com/Pratyaksh0404/nutrimentor-ai.git
cd Nutrimentor-Ai
```

### 2. Backend setup

Create and activate a virtual environment if needed:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install backend dependencies:

```powershell
python -m pip install -r requirements.txt
```

Run the backend:

```powershell
cd backend
uvicorn app.main:app --reload
```

Backend docs and health:

- `http://127.0.0.1:8000/docs`
- `http://127.0.0.1:8000/health`

### 3. Frontend setup

In a new terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend local URL is typically:

- `http://127.0.0.1:5173`

## Database Notes

- The backend uses SQLite at `backend/nutrimentor.db`.
- Tables are auto-created on startup through SQLAlchemy metadata.
- Food search index is built during backend startup.
- The food seed script expects nutrients to already exist in the nutrient table before linking them to items.

Seed script:

- [backend/scripts/seed_foods.py](D:/Pratyaksh2/Root/pycharm/Project/Nutrimentor-Ai/backend/scripts/seed_foods.py)

## Development Commands

### Frontend

```powershell
cd frontend
npm run dev
npm run build
```

### Backend

```powershell
cd backend
uvicorn app.main:app --reload
```

### Optional checks used during development

```powershell
cd frontend
node node_modules\typescript\bin\tsc -b
node node_modules\vite\bin\vite.js build
```

## Current Limitations

- No authentication or user accounts yet.
- No persistent user-specific chat history yet.
- No BMI or profile personalization yet.
- No streaming chat responses yet.
- No RAG knowledge base yet.
- Data quality still needs cleanup and normalization.
- Some images are missing.
- The checked-in local model assets are heavy and not deployment-friendly in their current form.
- The frontend is product-functional, but the UI/UX still needs refinement for a polished public release.

## Roadmap

### Phase 1: Stabilize chatbot logic

- Improve deterministic routing further
- reduce edge-case misclassification
- keep unnecessary LLM calls near zero

### Phase 2: Data reliability

- clean food dataset
- remove duplicates
- normalize nutrients and units
- expand image coverage
- improve scientific names and season mappings

### Phase 3: Product UX

- improve food card interactions
- improve responsive layout
- improve detail panel and chat feel
- fix remaining visual inconsistencies

### Phase 4: Personalization

- user profile
- BMI calculation
- diet intake tracking
- RDA-aware personalized guidance

### Phase 5: RAG + streaming

- retrieval-based nutrition knowledge layer
- faster grounded explanations
- typing / streaming chat experience

### Phase 6: Deployment

- production-friendly architecture
- model and infra strategy
- hosting and maintenance plan

## Known Gaps To Address Next

- Better handling of broad general nutrition prompts without overextending beyond the database.
- Cleanup of mojibake / unit encoding issues in some nutrient outputs.
- More complete test coverage for backend routing and frontend interactions.
- Replacement of placeholder/template docs in subfolders where needed.

## Verification Status

This repo has recently been verified locally for:

- backend import/startup
- frontend TypeScript build
- frontend Vite production build
- chat context selection and clearing
- deterministic chatbot responses for several common prompts

Testing is still mostly manual and needs stronger automated coverage.

## Vision

NutriMentor AI is being shaped into a nutrition product that is:

- visually strong
- fast for common questions
- grounded in structured food data
- season-aware
- progressively personalized

The long-term goal is a trustworthy nutrition companion that feels practical enough to use, not just interesting enough to demo.
