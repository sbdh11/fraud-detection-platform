"""Loading the active model and producing predictions / explanations."""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any

import joblib
import numpy as np

from ..config import settings
from .explainer import shap_contributions
from .features import FEATURE_NAMES
from .training import ACTIVE_POINTER, active_model_name

log = logging.getLogger("fraud.inference")
_LOCK = threading.Lock()


@dataclass
class ModelBundle:
    name: str
    estimator: Any
    threshold: float
    feature_names: list[str]
    metrics: dict[str, float]


_BUNDLE: ModelBundle | None = None
_POINTER_MTIME: float = 0.0


def _pointer_path():
    return settings.artifacts_dir / ACTIVE_POINTER


def _load_bundle(name: str) -> ModelBundle:
    path = settings.artifacts_dir / f"model_{name}.joblib"
    blob = joblib.load(path)
    return ModelBundle(name=blob["name"], estimator=blob["estimator"],
                       threshold=float(blob["threshold"]), feature_names=list(blob["feature_names"]),
                       metrics=dict(blob.get("metrics", {})))


def get_bundle(force: bool = False) -> ModelBundle | None:
    """Return the active model bundle, reloading if the active-pointer changed."""
    global _BUNDLE, _POINTER_MTIME
    with _LOCK:
        p = _pointer_path()
        if not p.exists():
            return _BUNDLE
        mtime = p.stat().st_mtime
        if force or _BUNDLE is None or mtime != _POINTER_MTIME:
            name = active_model_name()
            if name is None:
                return _BUNDLE
            try:
                _BUNDLE = _load_bundle(name)
                _POINTER_MTIME = mtime
                log.info("loaded active model %s (threshold=%.3f)", _BUNDLE.name, _BUNDLE.threshold)
            except Exception as e:  # pragma: no cover
                log.error("failed to load model %s: %s", name, e)
        return _BUNDLE


def list_artifacts() -> list[str]:
    return sorted(p.stem.replace("model_", "") for p in settings.artifacts_dir.glob("model_*.joblib"))


def _vectorise(features: dict) -> np.ndarray:
    return np.array([[float(features.get(n, 0.0)) for n in FEATURE_NAMES]], dtype=float)


@dataclass
class PredictionResult:
    model_name: str
    fraud_probability: float
    threshold: float
    predicted_fraud: bool
    latency_ms: float
    top_factors: list[dict]


def predict(features: dict, *, top_k: int = 6, with_shap: bool = True) -> PredictionResult:
    bundle = get_bundle()
    if bundle is None:
        raise RuntimeError("no active model — train one first (POST /api/models/train)")
    x = _vectorise(features)
    t0 = time.perf_counter()
    proba = float(bundle.estimator.predict_proba(x)[0, 1])
    latency_ms = (time.perf_counter() - t0) * 1000.0
    top_factors: list[dict] = []
    if with_shap:
        try:
            _, contribs = shap_contributions(bundle.estimator, bundle.feature_names, x[0])
            top_factors = contribs[:top_k]
        except Exception as e:  # pragma: no cover
            log.warning("shap top-factors failed: %s", e)
    return PredictionResult(
        model_name=bundle.name, fraud_probability=proba, threshold=bundle.threshold,
        predicted_fraud=bool(proba >= bundle.threshold), latency_ms=round(latency_ms, 3),
        top_factors=top_factors,
    )


def explain(features: dict, *, model_name: str | None = None) -> dict:
    if model_name and model_name in list_artifacts():
        bundle = _load_bundle(model_name)
    else:
        bundle = get_bundle()
    if bundle is None:
        raise RuntimeError("no active model")
    x = _vectorise(features)
    proba = float(bundle.estimator.predict_proba(x)[0, 1])
    base, contribs = shap_contributions(bundle.estimator, bundle.feature_names, x[0])
    return {
        "model_name": bundle.name,
        "base_value": round(float(base), 6),
        "prediction": round(proba, 6),
        "features": {n: float(features.get(n, 0.0)) for n in bundle.feature_names},
        "contributions": contribs,
    }
