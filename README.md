# FraudWatch — Real-Time Fraud Detection Platform

A small but polished, **deployable** machine-learning project: simulated financial
transactions stream in live, a gradient-boosted model scores each one for fraud in
real time, and a dark dashboard lets you watch predictions, inspect **SHAP**
explanations, monitor **drift**, and **compare models** — with experiments tracked
in **MLflow**.

It is deliberately simple: **one FastAPI backend** (with an in-process async worker
for the simulation — no Celery/Kafka/Kubernetes), **one Next.js frontend**,
**Postgres**, and **MLflow**, wired together with **Docker Compose**. Runs on CPU,
comfortably under 8 GB RAM.

> Built to demonstrate ML engineering: feature engineering, model training &
> comparison, real-time inference, monitoring, explainability, and deployment.

---

## What it does

| Area | Implementation |
|---|---|
| **Transaction simulation** | `services/simulator.py` — realistic fake transactions (amount, merchant type, location, device, user, timestamp) with systematic-but-noisy fraud patterns (large amounts, risky merchants, away-from-home, night-time, bursts). |
| **Feature engineering** | `services/features.py` — rolling transaction frequency (1h / 24h), spend windows, transaction velocity / time-since-last, unusual-location & location-change flags, merchant risk score, time-of-day / night / weekend, device one-hots, amount z-score & ratio-to-user-mean. Vectorised, leakage-free, identical code path for training and serving. |
| **Model training** | `services/training.py` — trains **XGBoost**, **LightGBM**, and a **RandomForest** baseline on the same synthetic data; time-ordered train/test split; class-imbalance handling (class weights / `scale_pos_weight`); decision-threshold tuning to maximise F1; reports ROC-AUC, PR-AUC, precision, recall, F1, accuracy. |
| **Experiment tracking** | Every training run logs params + metrics to **MLflow** (experiment `fraud-detection`); model runs are also stored in Postgres and shown on the comparison page. |
| **Real-time inference** | `services/inference.py` + worker loop — each transaction is featurised against the user's recent history, scored, and stored with measured inference latency. Also exposed as `POST /api/predict`. |
| **Explainability** | `services/explainer.py` — **SHAP** `TreeExplainer` for global feature importance and per-prediction attributions (with a graceful importance-based fallback). |
| **Drift monitoring** | `services/drift.py` — **PSI** on each engineered feature plus fraud-rate, alert-rate, and mean-score shifts between the training reference distribution and a rolling window of live predictions; snapshots written every ~30 s. |
| **Dashboard** | Next.js + Tailwind + Recharts — Live Dashboard, Explainability, Drift Monitoring, Model Comparison. |

### Pages

- **Live Fraud Dashboard** (`/`) — KPI tiles, fraud-rate / volume / latency / mean-score charts, a live transaction feed (with verdicts), a fraud-alert feed, simulation on/off, retrain button.
- **Explainability** (`/explainability`) — global feature importance + per-prediction SHAP bars and a feature-value/contribution table; deep-linkable via `?prediction=<id>`.
- **Drift Monitoring** (`/drift`) — overall-PSI timeline, per-feature PSI bars, reference-vs-live fraud rate and model score.
- **Model Comparison** (`/models`) — metrics table across model families, per-metric bar charts, training history, one-click "Activate" to switch the serving model.

---

## Quick start

```bash
# from the repo root
docker compose up -d --build      # or:  make up
```

Then open:

| Service | URL |
|---|---|
| Dashboard (frontend) | http://localhost:3030 |
| API + Swagger docs | http://localhost:8008/docs |
| API health | http://localhost:8008/api/health |
| MLflow UI | http://localhost:5500 |

Ports are configurable via `.env` (see `.env.example`) — the defaults are
deliberately non-standard (`3030 / 8008 / 5544 / 5500`) so the stack doesn't
collide with other things you might be running locally.

On first boot the backend trains the three models on ~30 k synthetic transactions
(≈30–60 s — watch `make backend-logs`), then the simulation starts streaming and
the dashboard comes alive. Trigger a retrain anytime from the UI or:

```bash
curl -X POST http://localhost:8008/api/models/train -H 'content-type: application/json' -d '{}'
```

Useful make targets: `make up`, `make down`, `make clean` (also drops volumes),
`make backend-logs`, `make health`, `make train`.

---

## Local dev (without Docker)

```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install -r requirements.txt
# point at a local Postgres + MLflow, or set DATABASE_URL=sqlite+aiosqlite:///./dev.db (requires aiosqlite)
export DATABASE_URL=postgresql+asyncpg://fraud:fraud@localhost:5544/fraud
export MLFLOW_TRACKING_URI=http://localhost:5500
uvicorn app.main:app --reload --port 8008

# frontend (separate shell)
cd frontend
npm install
NEXT_PUBLIC_API_BASE=http://localhost:8008/api npm run dev   # → http://localhost:3000
```

---

## API surface (selected)

```
GET  /api/health
GET  /api/summary                         # dashboard KPIs
GET  /api/metrics/timeseries?minutes=&buckets=
GET  /api/feed?limit=&fraud_only=         # transactions + predictions for the live feed
POST /api/predict                         # score (and optionally store) a transaction
GET  /api/predictions?limit=&fraud_only=&user_id=
GET  /api/predictions/{id}
GET  /api/transactions  /  /api/transactions/{id}
GET  /api/models  /  /api/models/latest  /  /api/models/active
POST /api/models/train                    # {rows?, set_active?}
POST /api/models/{name}/activate
POST /api/explain                         # SHAP for an ad-hoc transaction
GET  /api/explain/prediction/{id}         # SHAP for a stored prediction
GET  /api/explain/importance              # global feature importance
GET  /api/drift  /  /api/drift/latest  /  POST /api/drift/run
GET  /api/simulation  /  POST /api/simulation  ( {running?, interval_seconds?, burst?} )
```

---

## Deployment notes

- Runs anywhere Docker Compose runs — a single small VPS is plenty (CPU-only,
  no GPU; the whole stack idles well under 8 GB RAM).
- For a public deployment, rebuild the frontend with `NEXT_PUBLIC_API_BASE` set
  to the **public** URL of the backend API (it's inlined at build time), e.g.
  `docker compose build --build-arg NEXT_PUBLIC_API_BASE=https://api.example.com/api frontend`.
  The backend already sends permissive CORS (`CORS_ORIGINS=*` by default; tighten
  it in production).
- Data and trained models persist in the `pgdata`, `mlruns`, and `artifacts`
  Docker volumes. `make clean` (i.e. `docker compose down -v`) wipes them and the
  next boot retrains from scratch.

---

## Project layout

```
backend/
  app/
    main.py               FastAPI app + lifespan (db init, startup training, worker)
    config.py  db.py  models.py  schemas.py
    routers/              health, transactions, predict, models, explain, drift, metrics, simulation
    services/
      simulator.py        synthetic transaction generator
      features.py         vectorised, leakage-free feature pipeline
      training.py         XGBoost / LightGBM / RandomForest + threshold tuning + metrics
      registry.py         training orchestration, ModelRun persistence, active-model switching
      inference.py        active-model loading + real-time prediction
      explainer.py        SHAP TreeExplainer (+ fallback)
      drift.py            PSI + fraud-rate / score drift
      mlflow_client.py    graceful MLflow wrapper
    worker/loop.py         in-process asyncio worker (simulation + scoring + drift snapshots)
frontend/
  app/                    layout + 4 pages (dashboard, explainability, drift, models)
  components/              Sidebar, ui primitives, Recharts wrappers
  lib/api.ts              typed API client
docker-compose.yml  Makefile  .env.example
```
