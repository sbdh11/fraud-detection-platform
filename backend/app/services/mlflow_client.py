"""Thin MLflow wrapper that degrades gracefully when the tracking server is
unreachable (e.g. local dev without the compose stack)."""
from __future__ import annotations

import contextlib
import logging
from typing import Any

from ..config import settings

log = logging.getLogger("fraud.mlflow")

_AVAILABLE: bool | None = None


def _client():
    global _AVAILABLE
    try:
        import mlflow

        mlflow.set_tracking_uri(settings.mlflow_tracking_uri)
        mlflow.set_experiment(settings.mlflow_experiment)
        _AVAILABLE = True
        return mlflow
    except Exception as e:  # pragma: no cover
        if _AVAILABLE is not False:
            log.warning("MLflow unavailable (%s) — tracking disabled", e)
        _AVAILABLE = False
        return None


@contextlib.contextmanager
def run(name: str):
    """Context manager yielding either an MLflow run wrapper or a no-op shim."""
    mlflow = _client()
    if mlflow is None:
        yield _NoopRun()
        return
    try:
        with mlflow.start_run(run_name=name) as r:
            yield _Run(mlflow, r.info.run_id)
    except Exception as e:  # pragma: no cover
        log.warning("MLflow run failed (%s) — continuing without tracking", e)
        yield _NoopRun()


class _NoopRun:
    run_id: str | None = None

    def log_params(self, *_a, **_k):  # noqa: D401
        pass

    def log_metrics(self, *_a, **_k):
        pass

    def set_tags(self, *_a, **_k):
        pass


class _Run:
    def __init__(self, mlflow, run_id: str) -> None:
        self._mlflow = mlflow
        self.run_id = run_id

    def log_params(self, params: dict[str, Any]) -> None:
        with contextlib.suppress(Exception):
            self._mlflow.log_params(params)

    def log_metrics(self, metrics: dict[str, float]) -> None:
        with contextlib.suppress(Exception):
            self._mlflow.log_metrics({k: float(v) for k, v in metrics.items()})

    def set_tags(self, tags: dict[str, Any]) -> None:
        with contextlib.suppress(Exception):
            self._mlflow.set_tags(tags)
