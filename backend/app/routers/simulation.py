from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from ..worker.loop import STATE, get_sim_fraud_rate, set_sim_fraud_rate

router = APIRouter(prefix="/simulation", tags=["simulation"])


class SimConfig(BaseModel):
    running: bool | None = None
    interval_seconds: float | None = Field(default=None, gt=0.1, le=30)
    burst: int | None = Field(default=None, ge=1, le=20)
    # crank this up (e.g. 0.10) to push the operational distribution and watch the
    # drift detector react — handy for demos.
    fraud_rate: float | None = Field(default=None, ge=0.0, le=0.5)


def _state_dict() -> dict:
    return {"running": STATE.sim_running, "interval_seconds": STATE.interval,
            "burst": STATE.burst, "fraud_rate": round(get_sim_fraud_rate(), 4), "ticks": STATE.ticks}


@router.get("")
async def get_simulation() -> dict:
    return _state_dict()


@router.post("")
async def set_simulation(cfg: SimConfig) -> dict:
    if cfg.running is not None:
        STATE.sim_running = cfg.running
    if cfg.interval_seconds is not None:
        STATE.interval = cfg.interval_seconds
    if cfg.burst is not None:
        STATE.burst = cfg.burst
    if cfg.fraud_rate is not None:
        set_sim_fraud_rate(cfg.fraud_rate)
    return _state_dict()


@router.post("/start")
async def start_simulation() -> dict:
    STATE.sim_running = True
    return _state_dict()


@router.post("/stop")
async def stop_simulation() -> dict:
    STATE.sim_running = False
    return _state_dict()
