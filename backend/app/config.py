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

    # --- LITE single-container mode (env LITE_MODE): SQLite + file-MLflow + static frontend ---
    lite_mode: bool = False
    data_dir: Path = Path("/app/data")           # writable scratch dir (LITE)
    static_dir: Path = Path("/app/static")       # exported Next.js site (LITE)

    # --- Database / MLflow (empty → derived from lite_mode) ---
    database_url: str = ""
    mlflow_tracking_uri: str = ""
    mlflow_experiment: str = "fraud-detection"

    # --- Model artifacts ---
    artifacts_dir: Path = Path(__file__).resolve().parent / "ml" / "artifacts"

    # --- Simulation ---
    sim_enabled: bool = True
    sim_interval_seconds: float = 1.5            # seconds between simulated transactions
    sim_burst: int = 1                            # transactions generated per tick
    sim_seed: int = 42

    # --- Training ---
    train_on_startup: bool = True
    train_rows: int = 30_000                      # synthetic rows used to train
    test_size: float = 0.2
    random_state: int = 42

    # --- Drift ---
    drift_window: int = 500                       # most-recent N predictions = "current" window
    drift_interval_seconds: float = 30.0

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def _resolve_derived(self) -> None:
        if self.lite_mode:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            if not self.database_url:
                self.database_url = f"sqlite+aiosqlite:///{(self.data_dir / 'fraud.db').as_posix()}"
            if not self.mlflow_tracking_uri:
                self.mlflow_tracking_uri = f"file://{(self.data_dir / 'mlruns').as_posix()}"
            self.artifacts_dir = self.data_dir / "artifacts"
        else:
            if not self.database_url:
                self.database_url = "postgresql+asyncpg://fraud:fraud@db:5432/fraud"
            if not self.mlflow_tracking_uri:
                self.mlflow_tracking_uri = "http://mlflow:5000"
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s._resolve_derived()
    return s


settings = get_settings()
