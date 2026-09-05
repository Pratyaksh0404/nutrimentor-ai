# NutriMentor AI

NutriMentor AI is a nutrition and health mentor for Indian seasonal (Ritu-based) eating, grounded in real food data, personalized diet plans, meal tracking, and a real tool-using AI agent for the questions a lookup table can't answer.

## What NutriMentor AI Actually Is

This is **not** a general-purpose task-executing agent. By design, it works in exactly three domains: **nutrition, health, and medical-adjacent guidance** — with a hard boundary that it always redirects genuine medical/emergency situations to real professionals or emergency services, never attempts to handle them itself.

Within that scope, it *is* a real agent, not a static chatbot:

- It reasons in multiple steps per request — a diet plan question can check your logged deficiencies, today's intake, allergies, and dislikes, then build and explain a plan, all in one turn.
- It has real tool access (Gemini function-calling) into a live nutrition database — every nutrient number, calorie count, and seasonal fact is grounded in a tool call, not invented.
- It runs a semantic RAG layer (Cloudflare Vectorize + Workers AI embeddings) for questions about foods and concepts outside the 57-food database — grounded knowledge retrieval, not model hallucination.
- It remembers you across sessions (preferences, health notes, allergies, profile) via a persistent backend, editable from Settings or just by mentioning things in conversation.
- It requires Google sign-in — your data is tied to your account, synced across devices.
- It maintains a hard safety boundary: emergency-language detection that overrides everything else and directs to real emergency services (112/108), and allergy-safety checks on every food recommendation and meal log.
- It runs a daily background job (Cloudflare cron) that proactively surfaces nutrient patterns without being asked.

---

## Current Status

**Working now:**
- Google Sign-In (forced — nothing renders without a valid session) with cross-device profile sync and 28-day session expiry
- Deterministic router for ~30 common intent types: food lookup, food comparison, diet plan generation (1-day and 7-day with PDF export), meal logging with real-time deficiency analysis, seasonal (Ritu) guidance, nutrient-source search, ingredient substitution, symptom-based food advice, BMI/calorie calculation, memory read/update
- A real Gemini function-calling agent loop, used selectively for the residual questions the router can't cleanly match — combination questions, corrections, conditional/multi-step questions — with real tool access into the same database, not narrative guessing
- Semantic RAG knowledge layer: 113 curated chunks (food profiles, Ayurvedic concepts, food-combining rules, condition-specific guidance, core nutrition science) indexed in Cloudflare Vectorize with real per-answer citations — fills the gaps for the 60%+ of nutrition/health questions that go beyond the 57-food database
- Hard safety layer: medical-emergency detection checked before anything else, allergy warnings on both food recommendations and meal logging
- Persistent user profile and preferences (likes/dislikes/allergies/health notes), editable from Settings or via natural conversation
- Weekly nutrition dashboard: score, 7-day calorie chart, per-nutrient RDA breakdown, day streak, seasonal-match percentage
- Ritu Journal: all 6 Ayurvedic seasons with what to eat/avoid, dosha info, and quick actions
- Daily proactive "morning insight" via scheduled Cloudflare cron job
- Meal Log page with per-day history and individual log deletion
- Per-profile rate limiting (50 messages / 3 hours) and a global Gemini RPM gate — keeps the free-tier API quota from being exhausted under real multi-user load
- Automated eval harness (worker/eval/) — 15 test cases against the live worker, run before any significant deploy, with structured pass/fail checks across message content, tool usage, task_type, and structured response fields
- RAG gap logging — every query that returns no retrieval result is logged for continuous corpus improvement, turning production gaps into a real work queue

**Not started / out of scope:**
- Food label scanner (Phase 6) — cut by design decision, feasible on the current stack but not prioritised
- PWA / offline mode — explicitly declined; the app is deployed and works well online
- Meal log editing via chat — logging and individual deletion work; conversational editing of existing entries is not yet built

---

## Product Goals

- Fast, grounded answers — prefer structured tool/database data over free-form generation wherever a definitive answer exists
- Season-aware, Ayurveda-informed guidance specific to Indian eating patterns
- Personalization that compounds over time: the more you use it, the more it knows about you, without ever inventing what it doesn't actually know
- A real safety floor: never silently ignore an allergy, never leave a described emergency unaddressed
- Zero-cost operation — the entire stack runs on free tiers (Cloudflare Workers, D1, KV, Vectorize, Workers AI, Pages; Gemini API free tier used sparingly, not as a blanket dependency)

---

## Tech Stack

### Backend — Cloudflare Workers
- **Hono** — routing framework
- **TypeScript** (strict mode)
- **D1** — SQLite-compatible edge database (57-food nutrient dataset, meal logs, user facts, sessions, knowledge chunks for RAG)
- **KV** — session state, user profiles, rate-limit counters, response caching
- **Vectorize** — semantic vector index for the RAG knowledge layer (1024-dimension, bge-large-en-v1.5)
- **Workers AI** — text embeddings for RAG ingestion and query (@cf/baai/bge-large-en-v1.5), not used for text generation
- **Cron Triggers** — daily scheduled job for proactive insights
- **Gemini API** (`gemini-2.5-flash-lite`) — function-calling agent loop, used selectively; `thinkingConfig: { thinkingBudget: 0 }` set explicitly to prevent thinking tokens consuming the output budget

### Frontend — Cloudflare Pages
- **React 19** + **TypeScript**
- **Vite** (Rolldown)
- **Tailwind CSS**
- **jsPDF + html2canvas** — client-side diet plan PDF export
- **Lucide React** — icons
- **Axios** — API client with auth-token interceptor

---

## Architecture — why it's built this way

This project went through several architecture iterations, each driven by a real, measured production problem:

1. **Pure deterministic routing** (regex/keyword-based intent matching): fast and free, but felt exactly like what it was — a lookup table — for anything not explicitly pattern-matched.
2. **Gemini as the primary classifier for every message**: measured at 1.14% success rate under real testing load (429/503 errors from the shared free-tier quota). Reverted.
3. **A full agentic tool-calling loop as the primary path for every message**: technically sound, but tool-calling loops fire multiple sequential API calls per single user message — measured at 12.06% success rate (119 rate-limit errors out of 141 requests in one session) once real usage volume hit it.
4. **Current architecture**: the deterministic router runs first and handles the large majority of traffic — free, instant, zero external dependency. The Gemini agent loop (real function-calling into the same deterministic tools, plus semantic RAG retrieval) is reserved for the residual messages the router genuinely can't match. This keeps API call volume sustainable on a free tier while still giving harder conversational cases — corrections, combinations, multi-step reasoning, general health/nutrition questions — a grounded, tool-using answer instead of either a wrong lookup-table guess or an ungrounded hallucination risk.

The lesson carried forward: prefer the free, deterministic path wherever a definitive answer exists; reserve the LLM for genuine reasoning gaps; always keep a working fallback under whichever layer is "primary"; and design so any single external dependency (Gemini) going down degrades gracefully, not catastrophically.

---

## Security

- Google OAuth 2.0 sign-in is required — the app does not render without a confirmed session
- All 19 personal-data API routes require a valid session token; `profile_id` is always derived server-side from the verified session, never trusted from the client
- Ownership checks on every profile/facts/meals operation — a guessed or leaked ID cannot read or modify another user's data
- Per-profile and global Gemini rate limiting via KV — prevents both abusive individual users and concurrent multi-user spikes from exhausting the shared quota
- Session tokens expire after 28 days

## Repository Structure

```text
Nutrimentor-Ai/
├── worker/                      # Cloudflare Worker (backend)
│   ├── src/
│   │   ├── index.ts             # Hono app, routes, deterministic router, all deterministic tools
│   │   ├── agentLoop.ts         # Gemini function-calling agent loop + tool declarations/dispatcher
│   │   ├── auth.ts              # Google OAuth flow, session management, requireAuth middleware
│   │   ├── rateLimit.ts         # Per-profile and global Gemini rate limiting
│   │   ├── rag.ts               # RAG: embedding, ingestion, semantic retrieval (Vectorize + D1)
│   │   ├── rag_routes.ts        # Admin routes for corpus management
│   │   └── sessionMemory.ts     # (built, not yet wired in — rolling session summary)
│   ├── eval/
│   │   ├── run.js               # Eval harness runner
│   │   └── cases.json           # 15 test cases against the live worker
│   ├── schema.sql               # D1 schema
│   ├── rag_seed_corpus.json     # 113-chunk curated knowledge base (seeded once)
│   └── wrangler.toml
├── frontend/
│   ├── src/
│   │   ├── pages/               # AuthGate, Home, Dashboard, MealLog, RituJournal, Settings
│   │   ├── components/
│   │   │   ├── chat/            # ChatBox and supporting components
│   │   │   ├── food/            # Food grid, cards, detail panel
│   │   │   ├── season/          # Season selector
│   │   │   └── layout/, common/, footer/
│   │   ├── hooks/               # useChat, useDashboard, useItems, useSeason, useBackendHealth
│   │   ├── api/
│   │   │   ├── client.ts        # Axios instance with auth-token interceptor
│   │   │   ├── apiFetch.ts      # Auth-aware fetch wrapper for non-Axios call sites
│   │   │   └── config.ts        # API base URL
│   │   └── utils/generateDietPDF.ts
│   └── package.json
└── README.md
```

## API Overview

Base URL: `https://nutrimentor-worker.nutrimentor.workers.dev/`

All routes marked **[auth]** require an `Authorization: Bearer <token>` header.

### Public
- `GET /health`
- `GET /items`, `GET /items/:id`, `GET /items/:id/nutrients`
- `GET /nutrients`
- `GET /ritu`, `GET /ritu/:season`
- `GET /auth/google/start`, `GET /auth/google/callback`, `GET /auth/me`, `POST /auth/logout`

### Agent [auth]
- `POST /agent/message` — main chat endpoint (deterministic router + selective agent loop fallback)
- `POST /agent/context/select`, `POST /agent/context/clear`
- `GET /agent/sessions`, `GET /agent/sessions/:id`
- `GET /agent/morning/:profile_id`
- `GET /agent/season-check/:profile_id`
- `POST /agent/task/diet-plan`, `POST /agent/task/swap`
- `POST /agent/task/analyze-intake` (public — stateless calculation)

### Profile & Preferences [auth]
- `GET /profile/:session_id`, `POST /profile/:session_id`
- `GET /facts/:profile_id`, `POST /facts/:profile_id`, `DELETE /facts/:profile_id`, `DELETE /facts/:profile_id/all`

### Meals [auth]
- `POST /meals/log`, `DELETE /meals/:log_id`
- `GET /meals/today/:profile_id`, `GET /meals/week/:profile_id`
- `GET /nutrition-score/:profile_id`

---
## Local Setup

### Prerequisites
- Node.js 18+ and npm
- Cloudflare account (free tier) with Workers, D1, KV, Vectorize, and Pages enabled
- Google Cloud project with OAuth 2.0 credentials configured
- Gemini API key (free tier)

### 1. Clone

```bash
git clone https://github.com/Pratyaksh0404/nutrimentor-ai.git
cd Nutrimentor-Ai
```

### 2. Worker setup

```powershell
cd worker
npm install
npx wrangler d1 execute nutrimentor-db --file=schema.sql --remote
npx tsc --noEmit
wrangler secret put GEMINI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler deploy
```

Seed the RAG corpus (one-time):
```powershell
# Add the seed endpoint temporarily (see rag_routes.ts), deploy, then:
node scripts/seed_rag.js
# Remove the seed endpoint and redeploy
```

### 3. Frontend setup

```powershell
cd frontend
npm install
npm run build
npx wrangler pages deploy dist --project-name=nutrimentor-ai
```

### 4. Run the eval harness (before any significant deploy)

```powershell
cd worker
# One-time KV seed for the eval profile (see worker/eval/run.js header for the command)
cd eval
$env:EVAL_TOKEN="eval-harness-token-do-not-share"; node run.js
```
---
## Database Notes

- **D1** holds the 57-food nutrient dataset, `meal_logs`, `user_facts`, `messages`/`sessions`, `auth_identities`, and `knowledge_chunks` (RAG corpus text)
- **Vectorize** holds the embedding vectors for the RAG corpus — separate from D1 chunk text, looked up by ID after a similarity search
- **KV** holds user profiles (keyed by profile_id), session tokens (keyed by `auth_session:<token>`), and rate-limit counters
- `auth_identities` is what makes cross-device sync work: Google sign-in resolves a `google_id` to a stable `profile_id`, so signing in from a new device finds the same data instead of starting fresh
- `meal_logs.profile_id` is a legacy column; `session_id` is the actual identifier used in practice — documented in the code where it matters

## Known Limitations

- The Gemini agent loop's answer quality for open-ended health/nutrition questions depends on the underlying model and is an ongoing area of tuning, not a solved problem. The RAG layer significantly extends the range of grounded answers, but questions outside both the 57-food database and the 113-chunk corpus still fall back to model knowledge
- `gemini-2.5-flash-lite` on the free tier has a real ~15 RPM ceiling — the global rate gate (10 RPM conservative limit) protects the quota from burst, but at sustained high traffic, a paid tier or a different free-tier model would be needed
- KV rate-limit counters are not strictly atomic — under genuine simultaneous concurrent requests, counts can be off by 1-2. The conservative limit absorbs this
- Settings is currently not reachable from the mobile tab bar (Foods / Agent / Log only) — sign-out and profile editing require desktop or direct URL navigation
- The eval harness currently covers 15 cases; edge cases and new features should add matching test cases before shipping

## Vision

A nutrition and health mentor that's honest about what it knows and doesn't know, grounded in real data wherever a real answer exists, genuinely agentic within its actual scope, and reliable enough — on a genuinely free stack — to use every day, not just to demo once.

---

## Author
### Pratyaksh Agrawal
