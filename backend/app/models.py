from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Integer,
    JSON,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    amount: Mapped[float] = mapped_column(Float)
    merchant_type: Mapped[str] = mapped_column(String(32), index=True)
    location: Mapped[str] = mapped_column(String(48))
    device_type: Mapped[str] = mapped_column(String(16))
    # ground-truth label produced by the simulator (rule + noise) — used for monitoring & retrain
    is_fraud: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    transaction_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    model_name: Mapped[str] = mapped_column(String(32), index=True)
    fraud_probability: Mapped[float] = mapped_column(Float)
    threshold: Mapped[float] = mapped_column(Float)
    predicted_fraud: Mapped[bool] = mapped_column(Boolean, index=True)
    actual_fraud: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    latency_ms: Mapped[float] = mapped_column(Float)
    features: Mapped[dict] = mapped_column(JSON)
    top_factors: Mapped[list] = mapped_column(JSON, default=list)  # [{feature, value, shap}]


class ModelRun(Base):
    __tablename__ = "model_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    model_name: Mapped[str] = mapped_column(String(32), index=True)
    mlflow_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    threshold: Mapped[float] = mapped_column(Float, default=0.5)
    params: Mapped[dict] = mapped_column(JSON, default=dict)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)  # roc_auc, pr_auc, precision, recall, f1, accuracy
    feature_names: Mapped[list] = mapped_column(JSON, default=list)
    feature_importance: Mapped[dict] = mapped_column(JSON, default=dict)  # {feature: gain}
    n_train: Mapped[int] = mapped_column(Integer, default=0)
    n_test: Mapped[int] = mapped_column(Integer, default=0)
    artifact_path: Mapped[str | None] = mapped_column(String(256), nullable=True)


class DriftSnapshot(Base):
    __tablename__ = "drift_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ts: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
    n_reference: Mapped[int] = mapped_column(Integer, default=0)
    n_current: Mapped[int] = mapped_column(Integer, default=0)
    fraud_rate_reference: Mapped[float] = mapped_column(Float, default=0.0)
    fraud_rate_current: Mapped[float] = mapped_column(Float, default=0.0)
    pred_rate_reference: Mapped[float] = mapped_column(Float, default=0.0)
    pred_rate_current: Mapped[float] = mapped_column(Float, default=0.0)
    mean_score_reference: Mapped[float] = mapped_column(Float, default=0.0)
    mean_score_current: Mapped[float] = mapped_column(Float, default=0.0)
    feature_psi: Mapped[dict] = mapped_column(JSON, default=dict)   # {feature: psi}
    overall_psi: Mapped[float] = mapped_column(Float, default=0.0)
    drift_flag: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
