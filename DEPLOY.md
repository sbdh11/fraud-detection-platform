# Deploying FraudWatch

Two ways to run it.

* **Full stack** (`docker compose`): four containers (backend, frontend, Postgres, MLflow). For local dev or a VPS.
* **LITE** (root `Dockerfile`): one container. FastAPI with SQLite, a file based MLflow store, and the in process worker, also serving the static frontend on port 7860. For **Hugging Face Spaces** or any one container PaaS, and it's free.

## Run locally

`docker compose up -d --build` (or `make up`), then:

| | URL |
|:--|:--|
| Dashboard | http://localhost:3030 |
| API + Swagger | http://localhost:8008/docs |
| MLflow | http://localhost:5500 |

`docker compose ps` for status, `docker compose logs -f backend` to watch, `docker compose down` to stop (`-v` also wipes data and trained models). First boot trains the models (about a minute) then backfills the dashboard.

Test the LITE container the way it runs on a Space:

```bash
docker build -t fraudwatch-lite .
docker run --rm -p 7860:7860 fraudwatch-lite      # open http://localhost:7860
```

## Hugging Face Spaces (free)

A Space is a git repo HF builds the Dockerfile in. Free tier: 2 vCPU / 16 GB RAM, CPU only, sleeps after ~48 h idle (wakes in about a minute). No free persistent disk, which is fine here: the app retrains and backfills on every boot.

1. Make a free account at huggingface.co, then a **write token** at huggingface.co/settings/tokens.
2. Create a Space at huggingface.co/new-space: **SDK : Docker**, template **Blank**, name it (e.g. `fraud-detection-platform`). This repo's `README.md` already carries the `sdk: docker` / `app_port: 7860` header HF needs.
3. Push the repo to the Space:
   ```bash
   git remote add space https://huggingface.co/spaces/<your-hf-user>/fraud-detection-platform
   git push space master:main         # paste the write token when asked for a password
   ```
4. HF builds the root `Dockerfile` automatically (Logs tab, roughly 5 to 10 min), then first boot trains the models (1 to 2 min on the free CPU).
5. Open `https://<your-hf-user>-fraud-detection-platform.hf.space`. API docs at `…/docs`.

Tune `TRAIN_ROWS`, `SIM_INTERVAL_SECONDS`, etc. under Space : Settings : Variables (names match `.env.example`). For data that survives restarts, attach the paid persistent storage add on and set `DATA_DIR=/data`. Flip the Space to public (Settings : Change visibility) so the link works for anyone.

**What LITE changes vs the full stack:** Postgres becomes SQLite (WAL); the MLflow server becomes a file based store (tracking still works, no separate MLflow UI; the Model Comparison page reads metrics from the DB); the frontend is built with `output: export` (static HTML) and served by FastAPI at `/`, same origin as the API at `/api`, so no CORS; everything runs in one `uvicorn` process on port 7860 with the same in process worker. Toggled by `LITE_MODE=1` (the root Dockerfile sets it).

## Other hosts

* **Fly.io**: the free allowance covers one small always on VM. Deploy the LITE `Dockerfile` (`fly launch`). No idle sleep.
* **Render**: a free Web Service from the LITE `Dockerfile` works, but the free tier spins down after 15 min idle (roughly a 50 s cold start).
* **A small VPS** (Hetzner ≈ €4.5/mo, Oracle Cloud Always Free = $0): `git clone` then `docker compose up -d` (the full stack). Put Caddy in front for HTTPS and to proxy `/api` to the backend, so you don't rebuild the frontend per domain.

Split deploy (Vercel frontend + container backend + managed Postgres): set `NEXT_PUBLIC_API_BASE` to the public backend URL (inlined at build), `DATABASE_URL` to the managed Postgres async URL, `CORS_ORIGINS` to the frontend origin, and disable MLflow or point `MLFLOW_TRACKING_URI` at a hosted one.
