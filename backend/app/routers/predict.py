from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Prediction
from ..schemas import PredictRequest, PredictResponse, PredictionOut
from ..services import inference
from ..services.features import compute_features_online
from ..worker.loop import _recent_user_history, process_one_transaction

router = APIRouter(tags=["predictions"])


@router.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest, session: AsyncSession = Depends(get_session)):
    bundle = inference.get_bundle()
    if bundle is None:
        raise HTTPException(503, "no active model — train one first (POST /api/models/train)")
    txn = req.model_dump()
    store = txn.pop("store", True)
    ts = txn.get("ts") or dt.datetime.now(dt.timezone.utc)
    txn["ts"] = ts

    if store:
        p = await process_one_transaction(txn)
        if p is None:
            raise HTTPException(503, "model unavailable")
        return PredictResponse(
            user_id=p.user_id, model_name=p.model_name, fraud_probability=p.fraud_probability,
            threshold=p.threshold, predicted_fraud=p.predicted_fraud, latency_ms=p.latency_ms,
            features=p.features, top_factors=p.top_factors, prediction_id=p.id,
        )

    history = await _recent_user_history(session, txn["user_id"])
    feats = compute_features_online(history, txn)
    res = inference.predict(feats, with_shap=True)
    return PredictResponse(
        user_id=txn["user_id"], model_name=res.model_name, fraud_probability=res.fraud_probability,
        threshold=res.threshold, predicted_fraud=res.predicted_fraud, latency_ms=res.latency_ms,
        features=feats, top_factors=res.top_factors, prediction_id=None,
    )


@router.get("/predictions", response_model=list[PredictionOut])
async def list_predictions(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(50, le=500),
    offset: int = 0,
    fraud_only: bool = False,
    user_id: str | None = None,
):
    stmt = select(Prediction).order_by(Prediction.ts.desc())
    if fraud_only:
        stmt = stmt.where(Prediction.predicted_fraud.is_(True))
    if user_id:
        stmt = stmt.where(Prediction.user_id == user_id)
    rows = (await session.execute(stmt.limit(limit).offset(offset))).scalars().all()
    return rows


@router.get("/predictions/alerts", response_model=list[PredictionOut])
async def recent_alerts(session: AsyncSession = Depends(get_session), limit: int = Query(20, le=200)):
    rows = (await session.execute(
        select(Prediction).where(Prediction.predicted_fraud.is_(True)).order_by(Prediction.ts.desc()).limit(limit)
    )).scalars().all()
    return rows


@router.get("/feed")
async def transaction_feed(session: AsyncSession = Depends(get_session),
                           limit: int = Query(40, le=300), fraud_only: bool = False):
    """Recent transactions joined with their prediction — what the live feed renders."""
    from ..models import Transaction

    stmt = (
        select(Prediction, Transaction)
        .join(Transaction, Transaction.id == Prediction.transaction_id)
        .order_by(Prediction.ts.desc()).limit(limit)
    )
    if fraud_only:
        stmt = stmt.where(Prediction.predicted_fraud.is_(True))
    rows = (await session.execute(stmt)).all()
    out = []
    for p, t in rows:
        out.append({
            "prediction_id": p.id, "transaction_id": t.id, "ts": p.ts.isoformat(),
            "user_id": t.user_id, "amount": t.amount, "merchant_type": t.merchant_type,
            "location": t.location, "device_type": t.device_type,
            "model_name": p.model_name, "fraud_probability": p.fraud_probability,
            "threshold": p.threshold, "predicted_fraud": p.predicted_fraud,
            "actual_fraud": p.actual_fraud, "latency_ms": p.latency_ms,
            "top_factors": p.top_factors,
        })
    return out


@router.get("/predictions/{pred_id}", response_model=PredictionOut)
async def get_prediction(pred_id: int, session: AsyncSession = Depends(get_session)):
    p = await session.get(Prediction, pred_id)
    if p is None:
        raise HTTPException(404, "prediction not found")
    return p
