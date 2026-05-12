"""SHAP-based explanations for tree models, with a graceful fallback to
feature-importance-weighted contributions if SHAP is unavailable."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

log = logging.getLogger("fraud.explainer")

_CACHE: dict[int, Any] = {}  # id(estimator) -> shap.TreeExplainer


def _get_explainer(estimator: Any):
    key = id(estimator)
    if key in _CACHE:
        return _CACHE[key]
    try:
        import shap

        expl = shap.TreeExplainer(estimator)
        _CACHE[key] = expl
        return expl
    except Exception as e:  # pragma: no cover
        log.warning("SHAP TreeExplainer unavailable (%s) — using importance fallback", e)
        _CACHE[key] = None
        return None


def _binary_class_index(estimator: Any) -> int:
    classes = getattr(estimator, "classes_", None)
    if classes is None:
        return 1
    classes = list(classes)
    return classes.index(1) if 1 in classes else len(classes) - 1


def shap_contributions(estimator: Any, feature_names: list[str], x_row: np.ndarray) -> tuple[float, list[dict]]:
    """Return (base_value, [{feature, value, shap}, ...] sorted by |shap| desc)."""
    x_row = np.asarray(x_row, dtype=float).reshape(1, -1)
    expl = _get_explainer(estimator)
    if expl is not None:
        try:
            sv = expl.shap_values(x_row)
            base = expl.expected_value
            if isinstance(sv, list):  # older API: list per class
                ci = _binary_class_index(estimator)
                vals = np.asarray(sv[ci]).reshape(-1)
                base_v = float(np.asarray(base).reshape(-1)[ci]) if np.ndim(base) else float(base)
            else:
                arr = np.asarray(sv)
                if arr.ndim == 3:                     # (n, features, classes)
                    ci = _binary_class_index(estimator)
                    vals = arr[0, :, ci]
                    base_v = float(np.asarray(base).reshape(-1)[ci]) if np.ndim(base) else float(base)
                else:
                    vals = arr.reshape(-1)
                    base_v = float(np.asarray(base).reshape(-1)[0]) if np.ndim(base) else float(base)
            contribs = [
                {"feature": n, "value": round(float(v), 6), "shap": round(float(s), 6)}
                for n, v, s in zip(feature_names, x_row.reshape(-1), vals)
            ]
            contribs.sort(key=lambda d: -abs(d["shap"]))
            return base_v, contribs
        except Exception as e:  # pragma: no cover
            log.warning("SHAP evaluation failed (%s) — using importance fallback", e)

    # ----- fallback: signed importance-weighted "pseudo-shap" -----
    imp = np.asarray(getattr(estimator, "feature_importances_", np.ones(len(feature_names))), dtype=float)
    if imp.sum() > 0:
        imp = imp / imp.sum()
    x = x_row.reshape(-1)
    # centre each feature so the "direction" is meaningful-ish
    pseudo = imp * (np.sign(x) * np.log1p(np.abs(x)))
    contribs = [
        {"feature": n, "value": round(float(v), 6), "shap": round(float(s), 6)}
        for n, v, s in zip(feature_names, x, pseudo)
    ]
    contribs.sort(key=lambda d: -abs(d["shap"]))
    return 0.0, contribs
