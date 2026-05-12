from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Prediction
from ..schemas import ExplainResponse, PredictRequest
from ..services import inference
from ..services.features import compute_features_online
from ..worker.loop import _recent_user_history

router = APIRouter(prefix="/explain", tags=["explainability"])


@router.post("", response_model=ExplainResponse)
async def explain_transaction(
    req: PredictRequest,
    model_name: str | None = None,
    session: AsyncSession = Depends(get_session),
):
    if inference.get_bundle() is None:
        raise HTTPException(503, "no active model — train one first")
    txn = req.model_dump()
    txn.pop("store", None)
    txn["ts"] = txn.get("ts") or dt.datetime.now(dt.timezone.utc)
    history = await _recent_user_history(session, txn["user_id"])
    feats = compute_features_online(history, txn)
    return inference.explain(feats, model_name=model_name)


@router.get("/prediction/{pred_id}", response_model=ExplainResponse)
async def explain_prediction(pred_id: int, model_name: str | None = None,
                             session: AsyncSession = Depends(get_session)):
    p = await session.get(Prediction, pred_id)
    if p is None:
        raise HTTPException(404, "prediction not found")
    if inference.get_bundle() is None:
        raise HTTPException(503, "no active model")
    return inference.explain(p.features, model_name=model_name or p.model_name)


@router.get("/importance")
async def global_feature_importance(session: AsyncSession = Depends(get_session)) -> dict:
    """Feature importance of the active model (from its ModelRun row)."""
    from sqlalchemy import select

    from ..models import ModelRun

    run = (await session.execute(
        select(ModelRun).where(ModelRun.is_active.is_(True)).order_by(ModelRun.ts.desc()).limit(1)
    )).scalars().first()
    if run is None:
        raise HTTPException(404, "no active model run")
    return {"model_name": run.model_name, "feature_importance": run.feature_importance,
            "feature_names": run.feature_names}
