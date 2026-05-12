# Deploying FraudWatch

Two ways to run it:

| Mode | What runs | When to use |
|---|---|---|
| **Full stack** (`docker-compose.yml`) | 4 containers: backend + frontend + Postgres + MLflow | local dev, a VPS, anything that runs Docker Compose |
| **LITE** (root `Dockerfile`) | **1 container**: FastAPI (SQLite + file-MLflow + in-process worker) that also serves the prebuilt static frontend | **Hugging Face Spaces** or any one-container PaaS — and it's **free** |

---

## 0. Test it locally first

If you've run `docker compose up -d --build`, it's already live:

| | URL |
|---|---|
| Dashboard | http://localhost:3030 |
| API + Swagger | http://localhost:8008/docs |
| MLflow UI | http://localhost:5500 |

`docker compose ps` to check health, `docker compose logs -f backend` to watch it, `docker compose down` to stop (`-v` to also wipe the DB + trained models).

Or test the **LITE** container the same way it'll run on a Space:

```bash
docker build -t fraudwatch-lite .
docker run --rm -p 7860:7860 fraudwatch-lite
# → open http://localhost:7860   (API docs at /docs)
```

First boot trains 3 models on synthetic data (~20–40 s on a laptop) then backfills ~300 recent transactions, so the dashboard isn't empty.

---

## 1. Deploy free on Hugging Face Spaces

A Space *is* a git repo; HF builds the Dockerfile in it and runs the container. Free tier: 2 vCPU / 16 GB RAM, CPU-only, sleeps after ~48 h idle (wakes in ~1 min on the next request). **No free persistent disk** — fine here: the app retrains + backfills on every boot, so each cold start is just a fresh demo.

### Steps

1. Create a free account at <https://huggingface.co>, then a write token at <https://huggingface.co/settings/tokens> (role: **write**).
2. Create a new Space: <https://huggingface.co/new-space> → pick **SDK = Docker**, template **Blank**, visibility **Public** (or Private), name it e.g. `fraud-detection-platform`. (The `README.md` in this repo already carries the `sdk: docker` / `app_port: 7860` config block HF needs — it'll be respected when you push.)
3. Push this repo's contents to the Space's git remote:

   ```bash
   cd C:\Users\Admin\fraud-detection
   git remote add space https://huggingface.co/spaces/<your-hf-username>/fraud-detection-platform
   git push space master:main          # HF Spaces default branch is "main"
   ```

   When git asks for a password, paste the **write token** (username = your HF username).
   *(Or, instead of git: on the Space page → "Files" → upload the folder. Git is easier.)*

4. The Space build starts automatically (watch the **Logs** tab). It runs the root `Dockerfile`: builds the static frontend, installs the Python deps, starts uvicorn on port 7860. First build ≈ 5–10 min; first boot then trains the models (~1–2 min on the free CPU — the page shows "no model" until done).
5. Open `https://<your-hf-username>-fraud-detection-platform.hf.space` — the dashboard. API docs at `…/docs`.

### Optional Space settings

- **Variables / secrets** (Space → Settings): everything works out of the box, but you can tune `TRAIN_ROWS` (default `20000` — lower = faster cold start), `SIM_INTERVAL_SECONDS` (default `1.5`), `SIM_SEED`, `DRIFT_WINDOW`, etc. — same names as in `.env.example`.
- **Persistent storage** (paid add-on, ~$5/mo): if you want the DB + MLflow runs to survive restarts, attach storage and set `DATA_DIR=/data` (the LITE Dockerfile already points SQLite + MLflow + model artifacts under `$DATA_DIR`).
- **Hardware**: free CPU is plenty; no GPU needed.

### What "LITE" changes vs the full stack

- Postgres → **SQLite** (`/app/data/fraud.db`, WAL mode).
- MLflow server → **file-based MLflow store** (`file:///app/data/mlruns`) — tracking still works (runs + params + metrics logged); there's just no separate MLflow web UI. The Model Comparison page is unaffected (it reads metrics from the DB).
- Frontend → built with `output: export` (static HTML) and served by FastAPI at `/`; the API is same-origin at `/api`, so no CORS.
- One process: `uvicorn app.main:app` on `:7860`. Everything else (transaction simulation, scoring, drift snapshots) runs in the in-process asyncio worker, exactly as in the full stack.

Toggle it yourself with the `LITE_MODE=1` env var (the root Dockerfile sets it).

---

## 2. Other free / cheap hosts

- **Fly.io** — the free allowance covers one small always-on VM (+ a tiny managed Postgres if you want to keep that split). Deploy the LITE `Dockerfile` (`fly launch` → it detects the Dockerfile; set the internal port to 7860, or just run the full uvicorn). More setup than a Space but no idle sleep.
- **Render** — free Web Service from the LITE `Dockerfile` works, but the free tier spins down after 15 min idle → ~50 s cold start when someone opens it (worse than HF's 48 h). Render's free Postgres also expires after 90 days.
- **A small VPS** (Hetzner CX22 ≈ €4.5/mo, Oracle Cloud Always-Free ARM = $0) — `git clone` then `docker compose up -d` (the full 4-service stack). Put **Caddy** in front for automatic HTTPS and to reverse-proxy `/api` → the backend, so you don't have to rebuild the frontend per-domain. This is the closest to "exactly how it runs locally".

For a split deploy (Vercel frontend + container backend + managed Postgres) you'd also: set `NEXT_PUBLIC_API_BASE` to the public backend URL (it's inlined at build time), set `DATABASE_URL` to the managed Postgres async URL, set `CORS_ORIGINS` to the frontend origin (it's `*` by default), and either disable MLflow or point `MLFLOW_TRACKING_URI` at a hosted one.
