from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import ModelRun
from ..schemas import ModelRunOut, TrainRequest
from ..services import inference
from ..services.registry import activate, train_and_register, training_status

router = APIRouter(prefix="/models", tags=["models"])


@router.get("", response_model=list[ModelRunOut])
async def list_model_runs(session: AsyncSession = Depends(get_session), limit: int = 50):
    rows = (await session.execute(
        select(ModelRun).order_by(ModelRun.ts.desc()).limit(limit)
    )).scalars().all()
    return rows


@router.get("/latest", response_model=list[ModelRunOut])
async def latest_run_per_model(session: AsyncSession = Depends(get_session)):
    """Most recent ModelRun for each model family (for the comparison page)."""
    rows = (await session.execute(select(ModelRun).order_by(ModelRun.ts.desc()))).scalars().all()
    seen: dict[str, ModelRun] = {}
    for r in rows:
        seen.setdefault(r.model_name, r)
    return list(seen.values())


@router.get("/active")
async def active_model(session: AsyncSession = Depends(get_session)) -> dict:
    bundle = inference.get_bundle()
    run = (await session.execute(
        select(ModelRun).where(ModelRun.is_active.is_(True)).order_by(ModelRun.ts.desc()).limit(1)
    )).scalars().first()
    return {
        "active_model": bundle.name if bundle else None,
        "threshold": bundle.threshold if bundle else None,
        "metrics": bundle.metrics if bundle else None,
        "run": ModelRunOut.model_validate(run).model_dump() if run else None,
        "training": training_status(),
    }


@router.post("/train")
async def train(req: TrainRequest, background: BackgroundTasks) -> dict:
    if training_status()["running"]:
        raise HTTPException(409, "training already in progress")
    background.add_task(train_and_register, req.rows, req.set_active)
    return {"status": "training_started", "rows": req.rows, "set_active": req.set_active}


@router.post("/{model_name}/activate")
async def activate_model(model_name: str, session: AsyncSession = Depends(get_session)) -> dict:
    available = inference.list_artifacts()
    if model_name not in available:
        raise HTTPException(404, f"unknown model {model_name!r}; available: {available}")
    await activate(model_name)
    return {"status": "activated", "active_model": model_name}
