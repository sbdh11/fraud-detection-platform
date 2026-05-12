from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .routers import (
    drift as drift_router,
    explain as explain_router,
    health as health_router,
    metrics as metrics_router,
    models as models_router,
    predict as predict_router,
    simulation as simulation_router,
    transactions as transactions_router,
)
from .services.registry import ensure_model_trained
from .worker.loop import run_worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("fraud.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("starting %s", settings.app_name)
    await init_db()

    if settings.train_on_startup:
        try:
            await ensure_model_trained()
        except Exception as e:  # pragma: no cover
            log.exception("startup training failed (continuing without a model): %s", e)

    stop = asyncio.Event()
    worker_task = asyncio.create_task(run_worker(stop), name="fraud-worker")
    app.state.stop_event = stop
    app.state.worker_task = worker_task
    try:
        yield
    finally:
        log.info("shutting down")
        stop.set()
        worker_task.cancel()
        with_suppress = (asyncio.CancelledError,)
        try:
            await asyncio.wait_for(worker_task, timeout=5)
        except (*with_suppress, asyncio.TimeoutError):
            pass


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_api = settings.api_prefix
app.include_router(health_router.router, prefix=_api)
app.include_router(transactions_router.router, prefix=_api)
app.include_router(predict_router.router, prefix=_api)
app.include_router(models_router.router, prefix=_api)
app.include_router(explain_router.router, prefix=_api)
app.include_router(drift_router.router, prefix=_api)
app.include_router(metrics_router.router, prefix=_api)
app.include_router(simulation_router.router, prefix=_api)


@app.get(_api)
async def api_info() -> dict:
    return {"app": settings.app_name, "docs": "/docs", "api": _api, "health": f"{_api}/health",
            "lite_mode": settings.lite_mode}


# LITE mode: serve the exported static frontend (mounted last so /api/* + /docs win)
if settings.lite_mode and settings.static_dir.exists():
    from fastapi.staticfiles import StaticFiles

    app.mount("/", StaticFiles(directory=str(settings.static_dir), html=True), name="frontend")
    log.info("serving static frontend from %s", settings.static_dir)
else:
    @app.get("/")
    async def root() -> dict:
        return {"app": settings.app_name, "docs": "/docs", "api": _api, "health": f"{_api}/health"}
