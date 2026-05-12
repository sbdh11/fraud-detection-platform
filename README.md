---
title: Real-Time Fraud Detection Platform
emoji: 🛡️
colorFrom: indigo
colorTo: red
sdk: docker
app_port: 7860
pinned: false
short_description: Real-time fraud scoring with SHAP & drift monitoring
---

# FraudWatch — Real-Time Fraud Detection Platform

A deployable ML project: simulated card transactions stream in, a gradient-boosted
model scores each one for fraud in real time, and a dashboard shows the live feed,
SHAP explanations, drift, and a model comparison. One FastAPI backend (+ in-process
async worker), one Next.js frontend, PostgreSQL, MLflow — wired with Docker Compose.
CPU-only, runs on ~8 GB RAM.

Built to demonstrate: feature engineering · model training & comparison (XGBoost /
LightGBM / RandomForest, time-ordered split, class weighting, threshold tuning,
MLflow tracking) · real-time inference · SHAP explainability · PSI drift monitoring
· deployment. No Kubernetes, no Kafka, no microservice sprawl.

## Pages

- **Live Dashboard** — KPIs, fraud-rate / volume / latency / score charts, live transaction feed, alert feed, simulation toggle, retrain.
- **Explainability** — global feature importance + per-prediction SHAP attributions.
- **Drift Monitoring** — PSI per engineered feature, fraud-rate / score shifts vs the deploy-time window, plus a "stress test" knob.
- **Model Comparison** — metrics table (ROC-AUC / PR-AUC / precision / recall / F1 / accuracy), per-metric bars, training history, one-click model switch.

## Run

```bash
docker compose up -d --build      # or: make up
```

| | URL |
|---|---|
| Dashboard | http://localhost:3030 |
| API + Swagger | http://localhost:8008/docs |
| MLflow | http://localhost:5500 |

First boot trains the three models on synthetic data (~30–60 s) then backfills the
dashboard. `docker compose down` to stop (`-v` also wipes data + trained models).
Ports are configurable via `.env` (see `.env.example`).

## Deploy

See **[DEPLOY.md](DEPLOY.md)**. A **LITE single-container build** (root `Dockerfile`
— SQLite + file-based MLflow + the static frontend served by FastAPI on port 7860)
deploys **free on Hugging Face Spaces**; Fly.io / Render / VPS options are covered too.

## Stack

FastAPI · Python 3.11 · Next.js 14 + Tailwind + Recharts · PostgreSQL · MLflow ·
XGBoost / LightGBM / scikit-learn · SHAP · Docker Compose.

## Layout

```
backend/app/   main.py · config.py · db.py · models.py · schemas.py
  routers/     health, transactions, predict, models, explain, drift, metrics, simulation
  services/    simulator, features, training, registry, inference, explainer, drift, mlflow_client
  worker/      loop.py — in-process worker: simulate → score → store + drift snapshots
frontend/app/  4 pages · components/ (ui primitives, Charts) · lib/api.ts
docker-compose.yml · Dockerfile (LITE) · Makefile · .env.example · DEPLOY.md
```
