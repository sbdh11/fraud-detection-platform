"""Lightweight drift monitoring.

We compare two windows of the system's *own* predictions — a frozen *reference*
window (the earliest N predictions, i.e. the regime the model was deployed into)
and a rolling *current* window (the most-recent N) — using the Population
Stability Index per engineered feature, plus shifts in fraud rate, alert rate
and mean model score.  Keeping both windows in the same observation regime
avoids the apples-to-oranges artefacts of comparing against a synthetic batch.
"""
from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from .features import FEATURE_NAMES

log = logging.getLogger("fraud.drift")

PSI_WARN = 0.10
PSI_ALERT = 0.20
MIN_WINDOW = 80           # need at least this many rows in each window for a meaningful PSI
PSI_CAP = 10.0


def _quantile_edges(vals: np.ndarray, bins: int = 10) -> np.ndarray:
    edges = np.unique(np.quantile(vals, np.linspace(0, 1, bins + 1)))
    if len(edges) < 2:
        edges = np.array([float(np.min(vals)) - 1e-6, float(np.max(vals)) + 1e-6])
    edges = edges.astype(float)
    edges[0], edges[-1] = -np.inf, np.inf
    return edges


def psi(reference_vals: np.ndarray, current_vals: np.ndarray, edges: np.ndarray) -> float:
    eps = 1e-6
    ref_hist, _ = np.histogram(reference_vals, bins=edges)
    cur_hist, _ = np.histogram(current_vals, bins=edges)
    ref_pct = np.clip(ref_hist / max(1, ref_hist.sum()), eps, None)
    cur_pct = np.clip(cur_hist / max(1, cur_hist.sum()), eps, None)
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))


def _rates(rows: list[dict]) -> tuple[float, float, float]:
    """(actual_fraud_rate, predicted_fraud_rate, mean_score) over rows."""
    if not rows:
        return 0.0, 0.0, 0.0
    labelled = [1 if r.get("actual_fraud") else 0 for r in rows if r.get("actual_fraud") is not None]
    fr = float(np.mean(labelled)) if labelled else 0.0
    pr = float(np.mean([1 if r.get("predicted_fraud") else 0 for r in rows]))
    ms = float(np.mean([float(r.get("fraud_probability", 0.0)) for r in rows]))
    return fr, pr, ms


def compute_snapshot(reference_rows: list[dict], current_rows: list[dict]) -> dict:
    """Each row dict needs: ``features`` (dict), ``actual_fraud``,
    ``predicted_fraud``, ``fraud_probability``."""
    n_ref, n_cur = len(reference_rows), len(current_rows)
    fr_ref, pr_ref, ms_ref = _rates(reference_rows)
    fr_cur, pr_cur, ms_cur = _rates(current_rows)
    base = dict(
        n_reference=n_ref, n_current=n_cur,
        fraud_rate_reference=round(fr_ref, 5), fraud_rate_current=round(fr_cur, 5),
        pred_rate_reference=round(pr_ref, 5), pred_rate_current=round(pr_cur, 5),
        mean_score_reference=round(ms_ref, 5), mean_score_current=round(ms_cur, 5),
    )
    if n_ref < MIN_WINDOW or n_cur < MIN_WINDOW:
        return {**base, "feature_psi": {}, "overall_psi": 0.0, "drift_flag": False}

    ref_df = pd.DataFrame([r["features"] for r in reference_rows]).reindex(columns=FEATURE_NAMES).fillna(0.0)
    cur_df = pd.DataFrame([r["features"] for r in current_rows]).reindex(columns=FEATURE_NAMES).fillna(0.0)
    feature_psi: dict[str, float] = {}
    for col in FEATURE_NAMES:
        edges = _quantile_edges(ref_df[col].to_numpy())
        feature_psi[col] = round(min(PSI_CAP, psi(ref_df[col].to_numpy(), cur_df[col].to_numpy(), edges)), 5)
    overall = round(float(np.mean(list(feature_psi.values()))), 5)

    n_lab_cur = sum(1 for r in current_rows if r.get("actual_fraud") is not None)
    fraud_shift = n_lab_cur >= 50 and abs(fr_cur - fr_ref) > max(0.02, 1.5 * max(fr_ref, 1e-6))
    score_shift = abs(ms_cur - ms_ref) > 0.10
    drift_flag = bool(overall >= PSI_ALERT or fraud_shift or score_shift)
    return {**base, "feature_psi": feature_psi, "overall_psi": overall, "drift_flag": drift_flag}
