"""Synthetic transaction generator: labelled training batches plus a live stream.

Fraud is injected with noisy patterns (big amount, risky merchant, away-from-home,
night-time, bursts) so features carry signal without being trivially separable.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

MERCHANT_RISK: dict[str, float] = {
    "grocery": 0.04,
    "restaurant": 0.07,
    "subscription": 0.08,
    "retail": 0.12,
    "fuel": 0.10,
    "atm": 0.20,
    "travel": 0.26,
    "electronics": 0.32,
    "transfer": 0.45,
    "gambling": 0.70,
    "crypto": 0.82,
}
MERCHANTS = list(MERCHANT_RISK)
RISKY_MERCHANTS = ["crypto", "gambling", "transfer", "electronics", "travel"]

LOCATIONS = [
    "New York", "San Francisco", "Chicago", "Austin", "Seattle", "Boston",
    "Miami", "Denver", "Atlanta", "Los Angeles", "London", "Berlin",
    "Singapore", "Toronto", "Lagos", "Dubai", "Mumbai", "Sao Paulo",
]
DEVICES = ["mobile", "web", "pos", "atm"]


@dataclass
class _User:
    user_id: str
    home: str
    typical_amount: float
    merchants: list[str]
    device: str


@dataclass
class Simulator:
    n_users: int = 400
    fraud_rate: float = 0.018          # per-event prob; with bursts → ~3-5% of rows
    seed: int = 42
    rng: np.random.Generator = field(init=False)
    users: list[_User] = field(init=False)
    _burst_queue: list[dict] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self.rng = np.random.default_rng(self.seed)
        self.users = []
        for i in range(self.n_users):
            self.users.append(
                _User(
                    user_id=f"u{i:04d}",
                    home=self.rng.choice(LOCATIONS[:14]),  # most users are domestic-ish
                    typical_amount=float(np.exp(self.rng.normal(3.4, 0.6))),  # ~$30 median
                    merchants=list(self.rng.choice(MERCHANTS, size=self.rng.integers(3, 7), replace=False)),
                    device=self.rng.choice(DEVICES, p=[0.55, 0.25, 0.15, 0.05]),
                )
            )

    # ------------------------------------------------------------------ #
    def _user(self) -> _User:
        return self.users[int(self.rng.integers(0, len(self.users)))]

    def _normal_txn(self, u: _User, ts: dt.datetime) -> dict:
        amount = max(0.5, float(u.typical_amount * np.exp(self.rng.normal(0.0, 0.45))))
        merchant = self.rng.choice(u.merchants)
        if merchant == "atm":
            amount = float(self.rng.choice([20, 40, 60, 80, 100, 200]))
        location = u.home if self.rng.random() < 0.9 else self.rng.choice(LOCATIONS)
        device = u.device if self.rng.random() < 0.85 else self.rng.choice(DEVICES)
        is_fraud = self.rng.random() < 0.004  # rare looks-normal fraud
        return dict(user_id=u.user_id, amount=round(amount, 2), merchant_type=str(merchant),
                    location=str(location), device_type=str(device), ts=ts, is_fraud=bool(is_fraud))

    def _fraud_txn(self, u: _User, ts: dt.datetime) -> dict:
        camouflaged = self.rng.random() < 0.15   # 15% looks legit
        if camouflaged:
            amount = max(0.5, float(u.typical_amount * np.exp(self.rng.normal(0.3, 0.5))))
            merchant = self.rng.choice(u.merchants)
            location = u.home if self.rng.random() < 0.6 else self.rng.choice(LOCATIONS)
            device = self.rng.choice(DEVICES)
        else:
            amount = float(u.typical_amount * self.rng.uniform(3.0, 16.0))
            merchant = self.rng.choice(RISKY_MERCHANTS, p=[0.30, 0.25, 0.25, 0.12, 0.08])
            location = self.rng.choice([loc for loc in LOCATIONS if loc != u.home])
            device = self.rng.choice(["web", "atm", "mobile"], p=[0.55, 0.30, 0.15])
        return dict(user_id=u.user_id, amount=round(amount, 2), merchant_type=str(merchant),
                    location=str(location), device_type=str(device), ts=ts, is_fraud=True)

    # ------------------------------------------------------------------ #
    def generate_batch(self, n: int, *, days: int = 30) -> pd.DataFrame:
        """Return a labelled DataFrame of `n` transactions spanning `days`."""
        start = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)
        span = days * 24 * 3600
        rows: list[dict] = []
        i = 0
        while i < n:
            u = self._user()
            base_ts = start + dt.timedelta(seconds=float(self.rng.uniform(0, span)))
            if self.rng.random() < self.fraud_rate:
                burst = int(self.rng.integers(1, 5))   # fraud arrives in bursts
                for b in range(burst):
                    if i >= n:
                        break
                    ts = base_ts + dt.timedelta(seconds=float(self.rng.exponential(40) * b))
                    if self.rng.random() < 0.55:       # skew fraud to late-night
                        ts = ts.replace(hour=int(self.rng.integers(0, 6)))
                    rows.append(self._fraud_txn(u, ts))
                    i += 1
            else:
                rows.append(self._normal_txn(u, base_ts))
                i += 1
        df = pd.DataFrame(rows).sort_values("ts").reset_index(drop=True)
        # label noise: a few missed frauds + a few false reports
        is_f = df["is_fraud"].to_numpy(dtype=bool)
        miss = (self.rng.random(len(df)) < 0.05) & is_f
        false_report = (self.rng.random(len(df)) < 0.004) & ~is_f
        df.loc[miss, "is_fraud"] = False
        df.loc[false_report, "is_fraud"] = True
        return df

    def generate_recent(self, n: int, *, minutes: float = 120.0) -> list[dict]:
        """A short, recent-timestamped stream (for warming up an empty dashboard)."""
        now = dt.datetime.now(dt.timezone.utc)
        start = now - dt.timedelta(minutes=minutes)
        span = minutes * 60.0
        rows: list[dict] = []
        i = 0
        while i < n:
            u = self._user()
            base_ts = start + dt.timedelta(seconds=float(self.rng.uniform(0, span)))
            if self.rng.random() < self.fraud_rate:
                burst = int(self.rng.integers(1, 4))
                for b in range(burst):
                    if i >= n:
                        break
                    rows.append(self._fraud_txn(u, base_ts + dt.timedelta(seconds=3.0 * b)))
                    i += 1
            else:
                rows.append(self._normal_txn(u, base_ts))
                i += 1
        rows.sort(key=lambda r: r["ts"])
        return rows

    # ------------------------------------------------------------------ #
    # live stream
    # ------------------------------------------------------------------ #
    def tick(self) -> dict:
        """Return one transaction for the live stream (now-stamped)."""
        if self._burst_queue:
            return self._burst_queue.pop(0)
        now = dt.datetime.now(dt.timezone.utc)
        u = self._user()
        if self.rng.random() < self.fraud_rate:
            burst = int(self.rng.integers(1, 4))
            txns = [self._fraud_txn(u, now + dt.timedelta(seconds=2.0 * b)) for b in range(burst)]
            self._burst_queue = txns[1:]
            return txns[0]
        return self._normal_txn(u, now)
