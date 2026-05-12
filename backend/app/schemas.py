from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field


# ---------- transactions ----------
class TransactionIn(BaseModel):
    user_id: str
    amount: float = Field(gt=0)
    merchant_type: str
    location: str
    device_type: str
    ts: dt.datetime | None = None


class TransactionOut(BaseModel):
    id: int
    ts: dt.datetime
    user_id: str
    amount: float
    merchant_type: str
    location: str
    device_type: str
    is_fraud: bool

    class Config:
        from_attributes = True


# ---------- predictions ----------
class TopFactor(BaseModel):
    feature: str
    value: float
    shap: float


class PredictionOut(BaseModel):
    id: int
    ts: dt.datetime
    transaction_id: int | None
    user_id: str
    model_name: str
    fraud_probability: float
    threshold: float
    predicted_fraud: bool
    actual_fraud: bool | None
    latency_ms: float
    features: dict
    top_factors: list[TopFactor]

    class Config:
        from_attributes = True


class PredictRequest(BaseModel):
    user_id: str
    amount: float = Field(gt=0)
    merchant_type: str
    location: str
    device_type: str
    ts: dt.datetime | None = None
    store: bool = True


class PredictResponse(BaseModel):
    user_id: str
    model_name: str
    fraud_probability: float
    threshold: float
    predicted_fraud: bool
    latency_ms: float
    features: dict
    top_factors: list[TopFactor]
    prediction_id: int | None = None


# ---------- models / experiments ----------
class ModelRunOut(BaseModel):
    id: int
    ts: dt.datetime
    model_name: str
    mlflow_run_id: str | None
    is_active: bool
    threshold: float
    params: dict
    metrics: dict
    feature_names: list[str]
    feature_importance: dict
    n_train: int
    n_test: int

    class Config:
        from_attributes = True


class TrainRequest(BaseModel):
    rows: int | None = None
    set_active: str | None = None  # model name to activate; defaults to best PR-AUC


# ---------- explainability ----------
class ExplainResponse(BaseModel):
    model_name: str
    base_value: float
    prediction: float
    features: dict
    contributions: list[TopFactor]


# ---------- drift ----------
class DriftSnapshotOut(BaseModel):
    id: int
    ts: dt.datetime
    n_reference: int
    n_current: int
    fraud_rate_reference: float
    fraud_rate_current: float
    pred_rate_reference: float
    pred_rate_current: float
    mean_score_reference: float
    mean_score_current: float
    feature_psi: dict
    overall_psi: float
    drift_flag: bool

    class Config:
        from_attributes = True


# ---------- dashboard ----------
class DashboardSummary(BaseModel):
    active_model: str | None
    threshold: float
    total_transactions: int
    total_predictions: int
    fraud_alerts: int
    fraud_rate: float
    avg_latency_ms: float
    p95_latency_ms: float
    precision: float | None
    recall: float | None
    roc_auc: float | None
    simulation_running: bool
    last_drift_psi: float | None
    last_drift_flag: bool | None
