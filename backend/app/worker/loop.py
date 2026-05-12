"""In-process asyncio worker: simulate → score → store, plus periodic drift
snapshots and a one-time dashboard backfill.  No Celery/arq/Kafka."""
from __future__ import annotations

import asyncio
import datetime as dt
import logging
import time

import pandas as pd
from sqlalchemy import select

from ..config import settings
from ..db import session_scope
from ..models import DriftSnapshot, Prediction, Transaction
from ..services import drift, inference
from ..services.explainer import shap_contributions
from ..services.features import FEATURE_NAMES, build_feature_frame, compute_features_online
from ..services.simulator import Simulator

log = logging.getLogger("fraud.worker")

# ---- shared, mutable runtime state (read by routers) ----
class _State:
    sim_running: bool = settings.sim_enabled
    interval: float = settings.sim_interval_seconds
    burst: int = settings.sim_burst
    last_drift_at: dt.datetime | None = None
    ticks: int = 0


STATE = _State()
_sim = Simulator(seed=settings.sim_seed + 1)   # != training seed
_HISTORY_LOOKBACK = 60                          # recent txns/user for the feature builder


def get_sim_fraud_rate() -> float:
    return _sim.fraud_rate


def set_sim_fraud_rate(rate: float) -> None:
    _sim.fraud_rate = float(rate)


async def _recent_user_history(session, user_id: str) -> pd.DataFrame:
    rows = (await session.execute(
        select(Transaction).where(Transaction.user_id == user_id)
        .order_by(Transaction.ts.desc()).limit(_HISTORY_LOOKBACK)
    )).scalars().all()
    rows = list(reversed(rows))
    if not rows:
        return pd.DataFrame(columns=["ts", "user_id", "amount", "merchant_type", "location", "device_type"])
    return pd.DataFrame([{
        "ts": r.ts, "user_id": r.user_id, "amount": r.amount,
        "merchant_type": r.merchant_type, "location": r.location, "device_type": r.device_type,
    } for r in rows])


async def process_one_transaction(txn: dict) -> Prediction | None:
    """Persist one transaction + its prediction.  `txn` keys: user_id, amount,
    merchant_type, location, device_type, ts (optional), is_fraud (optional)."""
    ts = txn.get("ts") or dt.datetime.now(dt.timezone.utc)
    async with session_scope() as session:
        history = await _recent_user_history(session, txn["user_id"])
        feats = compute_features_online(history, {**txn, "ts": ts})

        t = Transaction(ts=ts, user_id=txn["user_id"], amount=float(txn["amount"]),
                        merchant_type=txn["merchant_type"], location=txn["location"],
                        device_type=txn["device_type"], is_fraud=bool(txn.get("is_fraud", False)))
        session.add(t)
        await session.flush()  # get t.id

        try:
            res = inference.predict(feats, with_shap=True)
        except RuntimeError as e:
            log.debug("prediction skipped: %s", e)
            return None

        p = Prediction(ts=ts, transaction_id=t.id, user_id=txn["user_id"], model_name=res.model_name,
                       fraud_probability=res.fraud_probability, threshold=res.threshold,
                       predicted_fraud=res.predicted_fraud,
                       actual_fraud=bool(txn["is_fraud"]) if "is_fraud" in txn else None,
                       latency_ms=res.latency_ms, features=feats, top_factors=res.top_factors)
        session.add(p)
        await session.flush()
        return p


def _pred_row(r: Prediction) -> dict:
    return {"features": r.features, "actual_fraud": r.actual_fraud,
            "predicted_fraud": r.predicted_fraud, "fraud_probability": r.fraud_probability}


async def fetch_drift_windows(session) -> tuple[list[dict], list[dict]]:
    w = settings.drift_window
    cur = (await session.execute(select(Prediction).order_by(Prediction.ts.desc()).limit(w))).scalars().all()
    ref = (await session.execute(select(Prediction).order_by(Prediction.ts.asc()).limit(w))).scalars().all()
    return [_pred_row(r) for r in ref], [_pred_row(r) for r in cur]


async def _maybe_snapshot_drift() -> None:
    now = dt.datetime.now(dt.timezone.utc)
    if STATE.last_drift_at and (now - STATE.last_drift_at).total_seconds() < settings.drift_interval_seconds:
        return
    async with session_scope() as session:
        ref_rows, cur_rows = await fetch_drift_windows(session)
        snap = await asyncio.to_thread(drift.compute_snapshot, ref_rows, cur_rows)
        session.add(DriftSnapshot(**snap))
    STATE.last_drift_at = now
    if snap["drift_flag"]:
        log.warning("DRIFT detected: overall_psi=%.3f fraud_rate %.3f->%.3f mean_score %.3f->%.3f",
                    snap["overall_psi"], snap["fraud_rate_reference"], snap["fraud_rate_current"],
                    snap["mean_score_reference"], snap["mean_score_current"])


def _backfill_rows(bundle, n: int) -> list[tuple[dict, dict, float, list]]:
    """CPU-bound backfill prep (runs in a thread)."""
    stream = _sim.generate_recent(n, minutes=120.0)
    raw = pd.DataFrame(stream)
    feats_df = build_feature_frame(raw.drop(columns=["is_fraud"]))[FEATURE_NAMES]
    X = feats_df.to_numpy()
    t0 = time.perf_counter()
    probas = bundle.estimator.predict_proba(X)[:, 1]
    per_row_ms = (time.perf_counter() - t0) * 1000.0 / max(1, len(X))
    out = []
    for i, txn in enumerate(stream):
        feats = {k: float(v) for k, v in feats_df.iloc[i].to_dict().items()}
        p = float(probas[i])
        top: list = []
        if p >= bundle.threshold:  # only explain alerts
            try:
                _, contribs = shap_contributions(bundle.estimator, bundle.feature_names, X[i])
                top = contribs[:6]
            except Exception:
                top = []
        out.append((txn, feats, p, top, round(per_row_ms, 3)))
    return out


async def _backfill_if_empty(n: int = 300) -> None:
    """Warm an empty dashboard with a short recent history of scored transactions."""
    bundle = inference.get_bundle()
    if bundle is None:
        return
    async with session_scope() as session:
        if (await session.execute(select(Prediction.id).limit(1))).first() is not None:
            return
    log.info("backfilling %d recent transactions for the dashboard", n)
    rows = await asyncio.to_thread(_backfill_rows, bundle, n)
    async with session_scope() as session:
        for txn, feats, proba, top, lat in rows:
            t = Transaction(ts=txn["ts"], user_id=txn["user_id"], amount=float(txn["amount"]),
                            merchant_type=txn["merchant_type"], location=txn["location"],
                            device_type=txn["device_type"], is_fraud=bool(txn.get("is_fraud", False)))
            session.add(t)
            await session.flush()
            session.add(Prediction(
                ts=txn["ts"], transaction_id=t.id, user_id=txn["user_id"], model_name=bundle.name,
                fraud_probability=proba, threshold=bundle.threshold, predicted_fraud=bool(proba >= bundle.threshold),
                actual_fraud=bool(txn["is_fraud"]) if "is_fraud" in txn else None,
                latency_ms=lat, features=feats, top_factors=top,
            ))
    log.info("backfill complete (%d transactions)", len(rows))


async def run_worker(stop: asyncio.Event) -> None:
    log.info("worker loop started (sim_running=%s interval=%.2fs)", STATE.sim_running, STATE.interval)
    try:
        await _backfill_if_empty()
    except Exception as e:  # pragma: no cover
        log.warning("backfill failed: %s", e)

    while not stop.is_set():
        try:
            if STATE.sim_running:
                for _ in range(max(1, STATE.burst)):
                    txn = _sim.tick()
                    await process_one_transaction(txn)
                    STATE.ticks += 1
                await _maybe_snapshot_drift()
        except Exception as e:  # pragma: no cover - keep the loop alive
            log.exception("worker iteration error: %s", e)
        try:
            await asyncio.wait_for(stop.wait(), timeout=max(0.2, STATE.interval))
        except asyncio.TimeoutError:
            pass
    log.info("worker loop stopped")
