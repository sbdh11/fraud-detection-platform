from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import DriftSnapshot
from ..schemas import DriftSnapshotOut

router = APIRouter(prefix="/drift", tags=["drift"])


@router.get("", response_model=list[DriftSnapshotOut])
async def list_drift(session: AsyncSession = Depends(get_session), limit: int = Query(100, le=500)):
    rows = (await session.execute(
        select(DriftSnapshot).order_by(DriftSnapshot.ts.desc()).limit(limit)
    )).scalars().all()
    return list(reversed(rows))  # chronological for charting


@router.get("/latest", response_model=DriftSnapshotOut)
async def latest_drift(session: AsyncSession = Depends(get_session)):
    row = (await session.execute(
        select(DriftSnapshot).order_by(DriftSnapshot.ts.desc()).limit(1)
    )).scalars().first()
    if row is None:
        raise HTTPException(404, "no drift snapshot yet")
    return row


@router.post("/run", response_model=DriftSnapshotOut)
async def run_drift_now(session: AsyncSession = Depends(get_session)):
    """Force a drift snapshot immediately (otherwise produced on a timer)."""
    import asyncio

    from ..services import drift
    from ..worker.loop import fetch_drift_windows

    ref_rows, cur_rows = await fetch_drift_windows(session)
    snap = await asyncio.to_thread(drift.compute_snapshot, ref_rows, cur_rows)
    obj = DriftSnapshot(**snap)
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return obj
