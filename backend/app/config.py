from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Core ---
    app_name: str = "Real-Time Fraud Detection Platform"
    api_prefix: str = "/api"
    cors_origins: str = "*"

    # --- Database ---
    database_url: str = "postgresql+asyncpg://fraud:fraud@db:5432/fraud"

    # --- MLflow ---
    mlflow_tracking_uri: str = "http://mlflow:5000"
    mlflow_experiment: str = "fraud-detection"

    # --- Model artifacts ---
    artifacts_dir: Path = Path(__file__).resolve().parent / "ml" / "artifacts"

    # --- Simulation ---
    sim_enabled: bool = True
    sim_interval_seconds: float = 1.5          # seconds between simulated transactions
    sim_burst: int = 1                          # transactions generated per tick
    sim_seed: int = 42

    # --- Training ---
    train_on_startup: bool = True
    train_rows: int = 30_000                    # synthetic rows used to train
    test_size: float = 0.2
    random_state: int = 42

    # --- Drift ---
    drift_window: int = 500                     # most-recent N predictions used as "current" window
    drift_interval_seconds: float = 30.0

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.artifacts_dir.mkdir(parents=True, exist_ok=True)
    return s


settings = get_settings()
