"""Train & compare fraud models on synthetic data, log to MLflow, persist the
best one for serving.

Models: XGBoost, LightGBM, RandomForest (baseline).  We do a time-ordered
train/test split (no shuffling — predicting future fraud), handle class
imbalance via class weighting, tune the decision threshold on the test set to
maximise F1, and report ROC-AUC / PR-AUC / precision / recall / F1 / accuracy.
"""
from __future__ import annotations

import datetime as dt
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)

from ..config import settings
from . import mlflow_client
from .features import FEATURE_NAMES, build_feature_frame
from .simulator import Simulator

log = logging.getLogger("fraud.training")

ACTIVE_POINTER = "active_model.json"


@dataclass
class TrainedModel:
    name: str
    estimator: Any
    threshold: float
    metrics: dict[str, float]
    params: dict[str, Any]
    feature_names: list[str] = field(default_factory=lambda: list(FEATURE_NAMES))
    feature_importance: dict[str, float] = field(default_factory=dict)
    n_train: int = 0
    n_test: int = 0
    mlflow_run_id: str | None = None
    artifact_path: str | None = None


# --------------------------------------------------------------------------- #
def _build_estimators(pos_weight: float) -> dict[str, tuple[Any, dict]]:
    est: dict[str, tuple[Any, dict]] = {}

    rf_params = dict(n_estimators=250, max_depth=12, min_samples_leaf=5,
                     class_weight="balanced", n_jobs=-1, random_state=settings.random_state)
    est["RandomForest"] = (RandomForestClassifier(**rf_params), rf_params)

    try:
        from xgboost import XGBClassifier

        xgb_params = dict(n_estimators=400, max_depth=5, learning_rate=0.08,
                          subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0,
                          scale_pos_weight=pos_weight, eval_metric="aucpr",
                          tree_method="hist", n_jobs=-1, random_state=settings.random_state)
        est["XGBoost"] = (XGBClassifier(**xgb_params), xgb_params)
    except Exception as e:  # pragma: no cover
        log.warning("XGBoost unavailable: %s", e)

    try:
        from lightgbm import LGBMClassifier

        lgbm_params = dict(n_estimators=500, num_leaves=48, learning_rate=0.05,
                           subsample=0.9, colsample_bytree=0.9, reg_lambda=1.0,
                           class_weight="balanced", n_jobs=-1, random_state=settings.random_state,
                           verbose=-1)
        est["LightGBM"] = (LGBMClassifier(**lgbm_params), lgbm_params)
    except Exception as e:  # pragma: no cover
        log.warning("LightGBM unavailable: %s", e)

    return est


def _best_threshold(y_true: np.ndarray, scores: np.ndarray) -> float:
    prec, rec, thr = precision_recall_curve(y_true, scores)
    # precision_recall_curve returns len(thr) == len(prec) - 1
    f1 = np.where((prec[:-1] + rec[:-1]) > 0,
                  2 * prec[:-1] * rec[:-1] / (prec[:-1] + rec[:-1] + 1e-12), 0.0)
    if len(thr) == 0:
        return 0.5
    return float(thr[int(np.argmax(f1))])


def _importance(est: Any, names: list[str]) -> dict[str, float]:
    imp = getattr(est, "feature_importances_", None)
    if imp is None:
        return {}
    imp = np.asarray(imp, dtype=float)
    if imp.sum() > 0:
        imp = imp / imp.sum()
    return {n: round(float(v), 6) for n, v in sorted(zip(names, imp), key=lambda kv: -kv[1])}


# --------------------------------------------------------------------------- #
def train_all(rows: int | None = None, *, seed: int | None = None) -> list[TrainedModel]:
    rows = int(rows or settings.train_rows)
    seed = settings.sim_seed if seed is None else seed
    log.info("generating %d synthetic transactions for training", rows)
    sim = Simulator(seed=seed)
    raw = sim.generate_batch(rows)
    y = raw["is_fraud"].astype(int).to_numpy()
    X = build_feature_frame(raw.drop(columns=["is_fraud"]))[FEATURE_NAMES].to_numpy()

    n = len(X)
    n_test = int(n * settings.test_size)
    split = n - n_test
    X_tr, X_te = X[:split], X[split:]
    y_tr, y_te = y[:split], y[split:]
    pos_weight = float((y_tr == 0).sum()) / max(1, int((y_tr == 1).sum()))
    log.info("train=%d test=%d  train_fraud_rate=%.4f  pos_weight=%.1f",
             len(X_tr), len(X_te), y_tr.mean(), pos_weight)

    results: list[TrainedModel] = []
    for name, (est, params) in _build_estimators(pos_weight).items():
        with mlflow_client.run(f"{name}") as mrun:
            est.fit(X_tr, y_tr)
            scores = est.predict_proba(X_te)[:, 1]
            thr = _best_threshold(y_te, scores)
            preds = (scores >= thr).astype(int)
            metrics = {
                "roc_auc": float(roc_auc_score(y_te, scores)) if len(set(y_te)) > 1 else 0.5,
                "pr_auc": float(average_precision_score(y_te, scores)),
                "precision": float(precision_score(y_te, preds, zero_division=0)),
                "recall": float(recall_score(y_te, preds, zero_division=0)),
                "f1": float(f1_score(y_te, preds, zero_division=0)),
                "accuracy": float(accuracy_score(y_te, preds)),
            }
            params_logged = {**params, "threshold": round(thr, 4), "n_train": len(X_tr),
                             "n_test": len(X_te), "rows": rows}
            mrun.log_params(params_logged)
            mrun.log_metrics(metrics)
            mrun.set_tags({"model_family": name, "task": "fraud_detection"})
            tm = TrainedModel(
                name=name, estimator=est, threshold=thr, metrics=metrics, params=params,
                feature_importance=_importance(est, list(FEATURE_NAMES)),
                n_train=len(X_tr), n_test=len(X_te), mlflow_run_id=mrun.run_id,
            )
            results.append(tm)
            log.info("%-13s roc_auc=%.4f pr_auc=%.4f f1=%.3f thr=%.3f",
                     name, metrics["roc_auc"], metrics["pr_auc"], metrics["f1"], thr)
    return results


def persist(models: list[TrainedModel], active_name: str | None = None) -> str:
    """Pickle every trained model; write a pointer to the chosen active model."""
    adir = settings.artifacts_dir
    adir.mkdir(parents=True, exist_ok=True)
    for m in models:
        path = adir / f"model_{m.name}.joblib"
        joblib.dump({"estimator": m.estimator, "threshold": m.threshold,
                     "feature_names": m.feature_names, "name": m.name,
                     "metrics": m.metrics}, path)
        m.artifact_path = str(path)
    if active_name is None:
        active_name = max(models, key=lambda m: m.metrics.get("pr_auc", 0.0)).name
    if active_name not in {m.name for m in models}:
        active_name = models[0].name
    (adir / ACTIVE_POINTER).write_text(json.dumps({
        "name": active_name,
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }))
    log.info("active model = %s", active_name)
    return active_name


def active_model_name() -> str | None:
    p = settings.artifacts_dir / ACTIVE_POINTER
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())["name"]
    except Exception:
        return None


def set_active(name: str) -> None:
    p = settings.artifacts_dir / f"model_{name}.joblib"
    if not p.exists():
        raise FileNotFoundError(f"no trained artifact for {name!r}")
    (settings.artifacts_dir / ACTIVE_POINTER).write_text(json.dumps({
        "name": name, "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
    }))


def have_trained_models() -> bool:
    return bool(list(settings.artifacts_dir.glob("model_*.joblib"))) and active_model_name() is not None
