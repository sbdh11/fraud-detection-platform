from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_session
from ..services import inference
from ..services.registry import training_status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    db_ok = True
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    mlflow_ok = False
    try:
        import httpx

        async with httpx.AsyncClient(timeout=1.5) as client:
            r = await client.get(settings.mlflow_tracking_uri.rstrip("/") + "/health")
            mlflow_ok = r.status_code < 500
    except Exception:
        mlflow_ok = False

    bundle = inference.get_bundle()
    return {
        "status": "ok" if db_ok else "degraded",
        "app": settings.app_name,
        "database": db_ok,
        "mlflow": mlflow_ok,
        "model_loaded": bundle is not None,
        "active_model": bundle.name if bundle else None,
        "training": training_status(),
    }
