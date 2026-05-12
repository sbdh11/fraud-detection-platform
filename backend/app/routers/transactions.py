from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import Prediction, Transaction
from ..schemas import TransactionOut

router = APIRouter(prefix="/transactions", tags=["transactions"])


@router.get("", response_model=list[TransactionOut])
async def list_transactions(
    session: AsyncSession = Depends(get_session),
    limit: int = Query(50, le=500),
    offset: int = 0,
    user_id: str | None = None,
    fraud_only: bool = False,
):
    stmt = select(Transaction).order_by(Transaction.ts.desc())
    if user_id:
        stmt = stmt.where(Transaction.user_id == user_id)
    if fraud_only:
        stmt = stmt.where(Transaction.is_fraud.is_(True))
    stmt = stmt.limit(limit).offset(offset)
    rows = (await session.execute(stmt)).scalars().all()
    return rows


@router.get("/count")
async def count_transactions(session: AsyncSession = Depends(get_session)) -> dict:
    total = (await session.execute(select(func.count(Transaction.id)))).scalar_one()
    fraud = (await session.execute(
        select(func.count(Transaction.id)).where(Transaction.is_fraud.is_(True))
    )).scalar_one()
    return {"total": int(total), "fraud": int(fraud)}


@router.get("/{txn_id}")
async def get_transaction(txn_id: int, session: AsyncSession = Depends(get_session)) -> dict:
    t = await session.get(Transaction, txn_id)
    if t is None:
        raise HTTPException(404, "transaction not found")
    pred = (await session.execute(
        select(Prediction).where(Prediction.transaction_id == txn_id).order_by(Prediction.ts.desc()).limit(1)
    )).scalars().first()
    return {
        "transaction": TransactionOut.model_validate(t).model_dump(),
        "prediction": {
            "model_name": pred.model_name, "fraud_probability": pred.fraud_probability,
            "threshold": pred.threshold, "predicted_fraud": pred.predicted_fraud,
            "latency_ms": pred.latency_ms, "features": pred.features, "top_factors": pred.top_factors,
        } if pred else None,
    }
