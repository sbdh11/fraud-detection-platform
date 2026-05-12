# ──────────────────────────────────────────────────────────────────────────────
# LITE single-container build — for Hugging Face Spaces (Docker SDK) or any host
# that runs one container.  Everything in one process: FastAPI backend (SQLite +
# file-based MLflow + in-process worker) which also serves the prebuilt static
# Next.js frontend.  See DEPLOY.md.   For the full multi-service setup use
# docker-compose.yml instead.
# ──────────────────────────────────────────────────────────────────────────────

# ---- stage 1: build the static frontend (Next.js `output: export`) ----
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
ENV NEXT_OUTPUT=export
ENV NEXT_PUBLIC_API_BASE=/api
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build        # → /fe/out

# ---- stage 2: backend + static site ----
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=2 \
    NUMBA_CACHE_DIR=/tmp \
    MPLCONFIGDIR=/tmp \
    LITE_MODE=1 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static \
    PORT=7860 \
    TRAIN_ROWS=20000 \
    SIM_INTERVAL_SECONDS=1.5

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY backend/app ./app
COPY --from=frontend /fe/out ./static

# Hugging Face Spaces runs the container as a non-root user — keep these writable.
RUN mkdir -p /app/data && chmod -R 777 /app/data /app/static

EXPOSE 7860
HEALTHCHECK --interval=20s --timeout=5s --start-period=180s --retries=12 \
    CMD curl -fsS http://localhost:7860/api/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860}"]
