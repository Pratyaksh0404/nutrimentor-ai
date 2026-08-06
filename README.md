# NutriMentor AI

NutriMentor AI is a nutrition and health mentor for Indian seasonal (Ritu-based) eating, grounded food data, personalized diet plans, meal tracking, and a real tool-using AI agent for the questions a lookup table can't answer.

## What NutriMentor AI Actually Is

This is **not** a general-purpose task-executing agent — it doesn't book flights, send emails, or manage your calendar, and it isn't trying to. By design, it works in exactly three domains: **nutrition, health, and medical-adjacent guidance** (with a hard boundary that it always redirects genuine medical/emergency situations to real professionals or emergency services, never attempts to handle them itself).

Within that scope, it *is* a real agent, not a static chatbot:

- It reasons in multiple steps per request — e.g. a diet plan question can check your logged deficiencies, today's intake, allergies, and dislikes, then build and explain a plan, all in one turn.
- It has real tool access (Gemini function-calling) into a live nutrition database, not free-form generation — every nutrient number, calorie count, and seasonal fact is grounded in a tool call, not invented.
- It remembers you across sessions (preferences, health notes, allergies, profile) via a persistent backend, editable from Settings or just by mentioning things in conversation.
- It runs a daily background job (Cloudflare cron) that proactively surfaces nutrient patterns without being asked.
- It maintains a hard safety boundary: emergency-language detection that overrides everything else and directs to real emergency services, and allergy-safety checks on every food recommendation and every meal log.

## Current Status

**Working now:**
- Deterministic router (fast, free, zero external calls) for the ~30 common intent types: food lookup, food comparison, diet plan generation (1-day and 7-day, with PDF export), meal logging with real-time deficiency analysis, seasonal (Ritu) guidance, nutrient-source search, ingredient substitution, symptom-based food advice, BMI/calorie calculation, memory read/update.
- A real Gemini function-calling agent loop, used selectively for the residual questions the router can't cleanly match — combination questions ("can I eat X and Y together"), corrections, conditional/multi-step questions — with real tool access into the same database, not narrative guessing.
- Hard safety layer: medical-emergency detection (checked before anything else, redirects to 112/108), allergy warnings on both food recommendations and meal logging.
- Persistent user profile and preferences (likes/dislikes/allergies/health notes), editable from a Settings page or via natural conversation, kept in sync between both.
- Weekly nutrition dashboard: score, 7-day calorie chart, per-nutrient RDA breakdown, day streak, seasonal-match percentage.
- Ritu Journal: all 6 Ayurvedic seasons with what to eat/avoid, dosha info, and quick actions.
- Daily proactive "morning insight" via a scheduled Cloudflare cron job.
- Meal Log page with per-day history.

**In progress / not started:**
- RAG-based knowledge layer for general nutrition/health questions beyond the 57-food database (currently these get either a database-grounded answer, an honest "not in my database," or a general-knowledge answer from the agent loop with no retrieval grounding).
- Google Auth and persistent multi-device accounts (currently guest/local-device profiles via a stable browser-generated ID).
- Meal log editing/deletion via chat (currently log-only; individual entries can't yet be removed conversationally).
- Broader automated test coverage — testing has been manual, transcript-driven, against real usage patterns.

## Product Goals

- Fast, grounded answers — prefer structured tool/database data over free-form generation wherever a definitive answer exists.
- Season-aware, Ayurveda-informed guidance specific to Indian eating patterns.
- Personalization that compounds over time: the more you use it, the more it knows about you, without ever inventing what it doesn't actually know.
- A real safety floor: never silently ignore an allergy, never leave a described emergency unaddressed.
- Zero-cost operation — the entire stack runs on free tiers (Cloudflare Workers, D1, KV, Pages; Gemini API free tier used sparingly, not as a blanket dependency).

## Tech Stack

### Backend — Cloudflare Workers
- **Hono** — routing framework
- **TypeScript**
- **D1** — SQLite-compatible edge database (57-food nutrient dataset, meal logs, user facts, sessions)
- **KV** — session state, user profiles, response caching
- **Cron Triggers** — daily scheduled job for proactive insights
- **Gemini API** (`gemini-2.5-flash-lite`) — function-calling agent loop, used selectively, not as a blanket per-message dependency (see [Architecture](#architecture--why-its-built-this-way) below)

### Frontend — Cloudflare Pages
- **React 19** + **TypeScript**
- **Vite** (Rolldown)
- **Tailwind CSS**
- **jsPDF + html2canvas** — client-side diet plan PDF export
- **Lucide React** — icons

## Architecture — why it's built this way

This project went through several architecture iterations, each driven by a real, measured production problem — worth documenting honestly rather than presenting the current state as the plan from day one:

1. **Pure deterministic routing** (regex/keyword-based intent matching): fast and free, but felt exactly like what it was — a lookup table — for anything not explicitly pattern-matched.
2. **Gemini as the primary classifier for every message**: measured at a 1.14% success rate under real testing load (429/503 errors from the shared free-tier quota). Reverted.
3. **A full agentic tool-calling loop as the primary path for every message**: technically sound, but tool-calling loops fire multiple sequential API calls per single user message — measured at 12.06% success rate (119 rate-limit errors out of 141 requests in one session) once real usage volume hit it.
4. **Current architecture**: the deterministic router runs first and handles the large majority of traffic — for free, instantly, with zero external dependency. The Gemini agent loop (real function-calling into the same deterministic tools, not bare narrative generation) is reserved for the residual messages the router genuinely can't match. This keeps API call volume sustainable on a free tier while still giving the harder conversational cases — corrections, combinations, multi-step reasoning — a grounded, tool-using answer instead of either a wrong lookup-table guess or an ungrounded hallucination risk.

The lesson carried forward: prefer the free, deterministic path wherever a definitive answer exists; reserve the LLM for genuine reasoning gaps; and always keep a working fallback under whichever layer is "primary" at the time.

## Repository Structure

```text
Nutrimentor-Ai/
├── worker/                      # Cloudflare Worker (backend)
│   ├── src/
│   │   ├── index.ts             # Hono app, routes, deterministic router, all deterministic tools
│   │   ├── agentLoop.ts         # Gemini function-calling agent loop + tool declarations/dispatcher
│   │   ├── intentParser.ts      # (unused in current hot path — see file header)
│   │   ├── intentDispatcher.ts  # (unused in current hot path — see file header)
│   │   └── sessionMemory.ts     # (built, not yet wired in — rolling session summary)
│   ├── schema.sql               # D1 schema
│   ├── *.sql                    # migrations
│   └── wrangler.toml
├── frontend/
│   ├── src/
│   │   ├── pages/                # Home, Dashboard, MealLog, RituJournal, Settings
│   │   ├── components/
│   │   │   ├── chat/              # Chat panel (read-only profile display, session list, PDF trigger)
│   │   │   ├── food/               # Food grid, cards, detail panel
│   │   │   ├── season/             # Season selector
│   │   │   └── layout/, common/, footer/
│   │   ├── hooks/                 # useChat, useDashboard, useItems, useSeason, useBackendHealth
│   │   ├── utils/generateDietPDF.ts
│   │   └── api/                   # config + client
│   └── package.json
└── README.md
```

## API Overview

Base URL: your deployed Worker (`https://nutrimentor-worker.nutrimentor.workers.dev/`).

### Health & Items
- `GET /health`
- `GET /items`, `GET /items/:id`, `GET /items/:id/nutrients`
- `GET /nutrients`

### Agent
- `POST /agent/message` — main chat endpoint (deterministic router + selective agent loop fallback)
- `POST /agent/context/select`, `POST /agent/context/clear`
- `GET /agent/sessions`, `GET /agent/sessions/:id`
- `GET /agent/morning/:profile_id` — proactive daily insight
- `GET /agent/season-check/:profile_id`
- `POST /agent/task/diet-plan`, `POST /agent/task/swap`, `POST /agent/task/analyze-intake`

### Profile & Preferences
- `GET /profile/:session_id`, `POST /profile/:session_id`
- `GET /facts/:profile_id`, `POST /facts/:profile_id`, `DELETE /facts/:profile_id`, `DELETE /facts/:profile_id/all`

### Meals
- `POST /meals/log`, `DELETE /meals/:log_id`
- `GET /meals/today/:profile_id`, `GET /meals/week/:profile_id`
- `GET /nutrition-score/:profile_id`

### Seasonal (Ritu Journal)
- `GET /ritu`, `GET /ritu/:season`

## Local Setup

### Prerequisites
- Node.js and npm
- A Cloudflare account (free tier) with Workers, D1, KV, and Pages enabled
- A Gemini API key (free tier)

### 1. Clone

```bash
git clone https://github.com/Pratyaksh0404/nutrimentor-ai.git
cd Nutrimentor-Ai
```

### 2. Worker (backend) setup

```powershell
cd worker
npm install
npx wrangler d1 execute nutrimentor-db --file=schema.sql   # first-time setup
npx tsc --noEmit                                            # type-check before deploying
wrangler deploy
```

Set secrets (Gemini key, etc.) via `wrangler secret put GEMINI_API_KEY` or your `wrangler.toml` bindings.

### 3. Frontend setup

```powershell
cd frontend
npm install
npm run build
npx wrangler pages deploy dist --project-name=nutrimentor-ai
```

For local development: `npm run dev` (frontend) and `wrangler dev` (worker) in separate terminals.

## Database Notes

- D1 (SQLite-compatible) holds the 57-food nutrient dataset, `meal_logs`, `user_facts` (preferences/health notes/allergies), and `messages`/`sessions` (chat history).
- User profile (age/height/weight/goal/activity level) is stored in **KV**, not D1, keyed by a stable browser-generated profile ID — this is what enables guest-mode personalization without requiring accounts.
- `meal_logs.profile_id` is genuinely unused (a legacy integer FK to a `profiles` table that guest users never populate) — `session_id` is the actual identifier column in practice. This is intentional, not an oversight; it's documented in the code where it matters.

## Known Limitations

- No authentication — every user is a "guest" identified by a browser-local ID. Multi-device sync isn't possible without logging in, which isn't built yet.
- No RAG/retrieval layer — questions about foods or conditions outside the 57-food database get either an honest "not in my database," or a general-knowledge answer from the agent loop with no retrieval grounding (i.e., it's using the model's own training knowledge for that fraction of answers, not verified data).
- Meal log entries can't be individually deleted via chat yet (logging-only).
- Single shared Gemini API key on the free tier — the deterministic-first architecture keeps this sustainable, but it's still a shared quota, not dedicated capacity.
- The agent loop's answer quality depends on the underlying Gemini model and is an ongoing area of tuning, not a solved problem.

## Vision

A nutrition and health mentor that's honest about what it knows and doesn't know, grounded in real data wherever a real answer exists, genuinely agentic within its actual scope, and reliable enough — on a genuinely free stack — to use every day, not just to demo once.

## Author
### Pratyaksh Agrawal