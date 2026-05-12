---
title: Real-Time Fraud Detection Platform
emoji: 🛡️
colorFrom: indigo
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---


# Real-Time Fraud Detection Platform

A tool for **scoring card transactions for fraud in real time**, not a toy classifier. Fake
transactions stream in continuously, an ML model flags the suspicious ones live, and you can inspect
why it decided that, watch for drift, and compare models.

### Preview

![Demo](assets/demo.gif)
*Live scoring, explanations, drift, model comparison*

![Live Dashboard](assets/dashboard.png)
*Live fraud dashboard*

![Explainability](assets/explainability.png)
*Per-prediction SHAP attributions*

![Drift](assets/drift.png)
*Drift monitoring*

## What you can do

- **Watch** : a live feed of transactions with fraud probability and the model's verdict, plus a feed of alerts.
- **Explain** : global feature importance, and for any prediction the SHAP contributions that pushed it toward fraud or legit.
- **Compare models** : XGBoost vs LightGBM vs a RandomForest baseline on the same data (ROC-AUC, PR-AUC, precision, recall, F1); switch the live model with one click.
- **Monitor drift** : PSI on every engineered feature plus fraud-rate and score shifts vs the deploy-time window. A "stress test" button bumps the simulated fraud rate so you can watch the detector react.
- **Retrain** : kick off a fresh training run from the UI; every run is logged to MLflow.

## How it works

A generator produces realistic fake transactions (amount, merchant, location, device, user, time)
with noisy fraud patterns. Each one is turned into ~17 features (rolling transaction frequency, spend
windows, velocity, unusual-location flags, merchant risk, time-of-day, ...), scored by the active
gradient-boosted model, and stored with its latency. A background worker drives the loop and writes
drift snapshots periodically. Same feature code runs at train time and serve time.

## Run it locally

You need Docker. `make` is optional.

```bash
cp .env.example .env     # optional: tweak ports / TRAIN_ROWS / etc.
make up                  # or: docker compose up -d --build
```

App at http://localhost:3030, API docs at http://localhost:8008/docs, MLflow at :5500. First boot
trains the three models on synthetic data (about a minute) then backfills the dashboard. `make down`
to stop (`make clean` also drops the volumes).

## How it's built

Python / FastAPI backend (SQLAlchemy + Postgres, an in-process async worker for the simulation, no
Celery / Kafka / Kubernetes), XGBoost / LightGBM / scikit-learn with class weighting and threshold
tuning, SHAP for explanations, PSI for drift, MLflow for experiment tracking. Frontend is Next.js +
Tailwind + Recharts. Everything's in `docker-compose.yml`. There's also a one-container `Dockerfile`
(SQLite + file-based MLflow + the static frontend) for small or free hosts.

## Deploy

Three options : Hugging Face Spaces (one container, free), Render or Fly.io, or a single VM with
docker-compose. See **[DEPLOY.md](DEPLOY.md)**.
