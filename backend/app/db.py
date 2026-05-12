from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from .config import settings


class Base(DeclarativeBase):
    pass


def _make_engine():
    if settings.is_sqlite:
        # WAL + busy-timeout: handlers and the worker share one file
        eng = create_async_engine(settings.database_url, future=True, connect_args={"timeout": 30})

        @event.listens_for(eng.sync_engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _rec):  # pragma: no cover
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA synchronous=NORMAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.close()

        return eng
    return create_async_engine(settings.database_url, pool_pre_ping=True, future=True)


engine = _make_engine()
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


@contextlib.asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db(retries: int = 20, delay: float = 2.0) -> None:
    """Create tables, retrying while Postgres comes up."""
    from . import models  # noqa: F401  (register mappers)

    last_err: Exception | None = None
    for _ in range(retries):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return
        except Exception as e:  # pragma: no cover - startup race
            last_err = e
            await asyncio.sleep(delay)
    raise RuntimeError(f"database not reachable after {retries} attempts: {last_err}")
