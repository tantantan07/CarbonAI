# CarbonAI — Round 2 (Indradhanu Hackathon 2026: AI for a Greener Tomorrow)

Team TerraTech. Carbon intelligence for Indian businesses: measure Scope 1/2/3, understand it, and plan cuts that pay back.
**All AI inference runs through our Nugen-aligned model** (hackathon requirement), with LM Studio / Ollama for free local development.

## What changed in Round 2 (mentor feedback → where it lives)

| Mentor point | Implementation |
|---|---|
| Personalised, personified agents with particular scopes | `backend/agents.py` — Terra (guide), Ignis (Scope 1), Volt (Scope 2), Atlas (Scope 3), Sage (CEO), Lex (assurance), Archivist (documents). Each gets the company profile, goals, priorities, budget and the user's expertise level, and **only its own scope's data**. UI: `/app/agents` |
| Smarter ML predictions, module-wise impacts | `backend/ml_engine.py` — peer benchmark (log-normal percentile), Monte Carlo uncertainty (P10–P90), hotspot & data-quality anomaly detection, 5-yr forecast with CEA grid decarbonisation, 1.5 °C gap, readiness score, plain-language equivalents. Every module returns `impacts` |
| More interactive for non-experts | Terra agent, "In everyday terms" (trees, car-km, homes, flights), a "Why this number?" under every figure, expertise-level setting |
| Multiple scenarios, scope + resolution as input | `backend/scenarios.py`, `/app/scenarios` — up to 6 scenarios; each takes scope (all/1/2/3), resolution (monthly/quarterly/yearly), horizon, rollout speed, growth; ranked with a scored recommendation |
| Report generation, multi-format | `backend/reports.py`, `/app/reports` — PDF, Excel (with native charts) and JSON, for CEO or stakeholder audiences, optional AI summary |
| Agent segregates all documents | `backend/documents.py`, `/app/documents` — PDF/XLSX/CSV/DOCX/TXT, sorted by type (incl. mixed records), values extracted with the evidence line |
| PDF or Excel sheet with the user's info | Upload: the CarbonAI Excel template is read cell-by-cell. Download: Excel/PDF reports with profile, inputs, results, scenarios, justifications |
| Switch climate tech | `backend/climate_tech.py`, `/app/climate-tech` — 10 technologies with adoption sliders, capex/saving/payback, MAC curve; flags heat pumps that raise emissions on today's grid |
| Run AI locally / LM Studio | `backend/llm_provider.py` — `LLM_PROVIDER=lmstudio` or `ollama`; or in the UI pick "LM Studio on this computer" (the server builds the prompt, your browser runs it on local LM Studio) |
| Two dashboards: CEO and third party | `/app/ceo` (decisions, ₹, gap, readiness, risk, agent briefing) and `/app/stakeholder` (plain language, method & sources, uncertainty, data quality, disclosure download) |
| Justification of the analysis | Every backend module returns a `justification`; agents must answer as **Answer / Why / Next step**; chats show "What data did this use?" |
| Scroll-based advanced website | `src/pages/Landing.jsx` — Lenis smooth scroll, a pinned scroll-driven carbon column, horizontal agent track, scroll-drawn scenario paths |

Also fixed: the Round-1 `/action-plan` summed raw kWh + litres as "tCO2e"; it now converts with emission factors. The frontend's `/assessment` payload now matches the backend schema.

## Run locally

```bash
# backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add NUGEN_API_KEY + NUGEN_MODEL_ID (Supabase optional)
uvicorn main:app --reload --port 8000

# frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

Sample documents to try the document agent: `samples/` (clearly fictional demo data).

## Nugen: align, deploy, plug in

1. Sign in at platform.nugen.in and create an API key.
2. Align the model, either in the platform UI (no code) or with the script:
   ```bash
   cd nugen && NUGEN_API_KEY=... python align_model.py
   ```
   It uploads `carbonai_domain_alignment.md` (our carbon-accounting domain document), uploads `carbonai_benchmark.json`, creates the alignment on `meta-llama/Llama-3.2-3B-Instruct` (override with `NUGEN_BASE_MODEL`), waits for it, then deploys.
3. Copy the deployed model's ID (Models → Domain-Aligned Models) into `backend/.env` as `NUGEN_MODEL_ID`, and set the same env vars on Render.
4. Check: `GET /health` shows `nugen.configured: true`; every agent reply in the UI shows the provider and model that produced it.

If Nugen is unreachable, answers fall back to the deterministic analytics engine and are labelled "Analytics engine (AI model unreachable)", so demos never break silently.

## Local models (no credits)

LM Studio: load a model, start the server in the Developer tab (enable CORS for browser mode), then either
- set `LLM_PROVIDER=lmstudio` and `LMSTUDIO_MODEL=<id>` in `backend/.env`, or
- choose **LM Studio on this computer** in the app's sidebar.

Remember that prize eligibility needs inference through the Nugen-aligned model, so switch back to Nugen for the final demo.

## API (v2)

`POST /v2/analyze`, `/v2/climate-tech/simulate`, `/v2/scenarios`, `/v2/agents/{id}/chat`, `/v2/agents/{id}/prompt`, `/v2/insights`, `/v2/documents/upload`, `/v2/reports/{pdf|xlsx|json}`; `GET /v2/agents`, `/v2/climate-tech`, `/v2/factors`, `/v2/llm/status`, `/v2/documents/template`. Interactive docs at `/docs`.

Benchmarks and cost figures are indicative reference values for the demo; replace them with sector datasets for production.
