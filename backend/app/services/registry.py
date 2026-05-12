"""Glue between the (CPU-bound, synchronous) training pipeline and the async
web app / database: runs training off the event loop, persists artifacts,
records ``ModelRun`` rows, and refreshes the live inference bundle."""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import update

from ..db import session_scope
from ..models import ModelRun
from . import inference, training

log = logging.getLogger("fraud.registry")

_TRAINING_LOCK = asyncio.Lock()
_STATUS: dict = {"running": False, "last_finished_at": None, "last_error": None}


def training_status() -> dict:
    return dict(_STATUS)


async def train_and_register(rows: int | None = None, set_active: str | None = None) -> list[dict]:
    async with _TRAINING_LOCK:
        _STATUS.update(running=True, last_error=None)
        try:
            trained = await asyncio.to_thread(training.train_all, rows)
            active_name = await asyncio.to_thread(training.persist, trained, set_active)
            saved: list[dict] = []
            async with session_scope() as session:
                await session.execute(update(ModelRun).values(is_active=False))
                for tm in trained:
                    mr = ModelRun(
                        model_name=tm.name, mlflow_run_id=tm.mlflow_run_id,
                        is_active=(tm.name == active_name), threshold=tm.threshold,
                        params={k: _jsonable(v) for k, v in tm.params.items()},
                        metrics=tm.metrics, feature_names=tm.feature_names,
                        feature_importance=tm.feature_importance,
                        n_train=tm.n_train, n_test=tm.n_test, artifact_path=tm.artifact_path,
                    )
                    session.add(mr)
                    await session.flush()
                    saved.append({"id": mr.id, "model_name": mr.model_name, "is_active": mr.is_active,
                                  "metrics": mr.metrics, "threshold": mr.threshold})
            inference.get_bundle(force=True)
            _STATUS.update(running=False, last_finished_at=_now_iso(), last_error=None)
            log.info("training complete — active=%s", active_name)
            return saved
        except Exception as e:  # pragma: no cover
            _STATUS.update(running=False, last_error=str(e))
            log.exception("training failed: %s", e)
            raise


async def activate(model_name: str) -> None:
    await asyncio.to_thread(training.set_active, model_name)
    async with session_scope() as session:
        await session.execute(update(ModelRun).values(is_active=False))
        await session.execute(update(ModelRun).where(ModelRun.model_name == model_name).values(is_active=True))
    inference.get_bundle(force=True)


async def ensure_model_trained() -> None:
    from sqlalchemy import select

    if training.have_trained_models():
        async with session_scope() as session:
            has_rows = (await session.execute(select(ModelRun.id).limit(1))).first() is not None
        if has_rows:
            inference.get_bundle(force=True)
            log.info("found existing trained model — skipping startup training")
            return
    log.info("no trained model on disk/db — training on startup")
    await train_and_register()


# --------------------------------------------------------------------------- #
def _jsonable(v):
    try:
        import numpy as np

        if isinstance(v, (np.integer,)):
            return int(v)
        if isinstance(v, (np.floating,)):
            return float(v)
    except Exception:
        pass
    return v


def _now_iso() -> str:
    import datetime as dt

    return dt.datetime.now(dt.timezone.utc).isoformat()
