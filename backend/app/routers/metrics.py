from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_session
from ..models import DriftSnapshot, ModelRun, Prediction, Transaction
from ..schemas import DashboardSummary
from ..services import inference
from ..worker.loop import STATE

router = APIRouter(tags=["metrics"])


def _percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = max(0, min(len(s) - 1, int(round(q * (len(s) - 1)))))
    return float(s[k])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(session: AsyncSession = Depends(get_session)):
    bundle = inference.get_bundle()
    total_tx = int((await session.execute(select(func.count(Transaction.id)))).scalar_one())
    total_pred = int((await session.execute(select(func.count(Prediction.id)))).scalar_one())
    alerts = int((await session.execute(
        select(func.count(Prediction.id)).where(Prediction.predicted_fraud.is_(True))
    )).scalar_one())

    recent_lat = (await session.execute(
        select(Prediction.latency_ms).order_by(Prediction.ts.desc()).limit(500)
    )).scalars().all()
    lat = [float(x) for x in recent_lat]
    avg_lat = sum(lat) / len(lat) if lat else 0.0

    # precision / recall over the labelled predictions we have
    labelled = (await session.execute(
        select(Prediction.predicted_fraud, Prediction.actual_fraud)
        .where(Prediction.actual_fraud.isnot(None)).order_by(Prediction.ts.desc()).limit(5000)
    )).all()
    tp = sum(1 for p, a in labelled if p and a)
    fp = sum(1 for p, a in labelled if p and not a)
    fn = sum(1 for p, a in labelled if (not p) and a)
    precision = tp / (tp + fp) if (tp + fp) else None
    recall = tp / (tp + fn) if (tp + fn) else None

    active_run = (await session.execute(
        select(ModelRun).where(ModelRun.is_active.is_(True)).order_by(ModelRun.ts.desc()).limit(1)
    )).scalars().first()
    roc_auc = active_run.metrics.get("roc_auc") if active_run else (bundle.metrics.get("roc_auc") if bundle else None)

    last_drift = (await session.execute(
        select(DriftSnapshot).order_by(DriftSnapshot.ts.desc()).limit(1)
    )).scalars().first()

    fraud_rate = (alerts / total_pred) if total_pred else 0.0
    return DashboardSummary(
        active_model=bundle.name if bundle else None,
        threshold=bundle.threshold if bundle else 0.5,
        total_transactions=total_tx, total_predictions=total_pred, fraud_alerts=alerts,
        fraud_rate=round(fraud_rate, 5), avg_latency_ms=round(avg_lat, 3),
        p95_latency_ms=round(_percentile(lat, 0.95), 3),
        precision=round(precision, 4) if precision is not None else None,
        recall=round(recall, 4) if recall is not None else None,
        roc_auc=round(roc_auc, 4) if roc_auc is not None else None,
        simulation_running=STATE.sim_running,
        last_drift_psi=last_drift.overall_psi if last_drift else None,
        last_drift_flag=last_drift.drift_flag if last_drift else None,
    )


@router.get("/metrics/timeseries")
async def metrics_timeseries(session: AsyncSession = Depends(get_session),
                             minutes: int = Query(30, le=720), buckets: int = Query(30, le=120)):
    """Bucketed fraud-rate / volume / latency / mean-score over the last `minutes`."""
    now = dt.datetime.now(dt.timezone.utc)
    since = now - dt.timedelta(minutes=minutes)
    rows = (await session.execute(
        select(Prediction.ts, Prediction.predicted_fraud, Prediction.latency_ms, Prediction.fraud_probability)
        .where(Prediction.ts >= since).order_by(Prediction.ts.asc())
    )).all()
    width = max(1.0, (minutes * 60) / buckets)
    agg: dict[int, dict] = {}
    for ts, pf, lat, prob in rows:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=dt.timezone.utc)
        b = int((ts - since).total_seconds() // width)
        a = agg.setdefault(b, {"n": 0, "fraud": 0, "lat": 0.0, "score": 0.0})
        a["n"] += 1
        a["fraud"] += 1 if pf else 0
        a["lat"] += float(lat)
        a["score"] += float(prob)
    series = []
    for b in range(buckets):
        bucket_start = since + dt.timedelta(seconds=b * width)
        a = agg.get(b)
        if a and a["n"]:
            series.append({"t": bucket_start.isoformat(), "count": a["n"],
                           "fraud_count": a["fraud"], "fraud_rate": round(a["fraud"] / a["n"], 4),
                           "avg_latency_ms": round(a["lat"] / a["n"], 3),
                           "mean_score": round(a["score"] / a["n"], 4)})
        else:
            series.append({"t": bucket_start.isoformat(), "count": 0, "fraud_count": 0,
                           "fraud_rate": 0.0, "avg_latency_ms": 0.0, "mean_score": 0.0})
    return {"minutes": minutes, "buckets": buckets, "series": series}
