"""Feature engineering.

`build_feature_frame` vectorises a time-ordered transaction DataFrame into the
model matrix using only each user's *prior* rows (no lookahead leakage).
`compute_features_online` runs the same function on history+new_row and keeps
the last row, guaranteeing train/serve parity.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .simulator import MERCHANT_RISK

FEATURE_NAMES: list[str] = [
    "log_amount",            # log1p(amount)
    "amount_to_user_mean",   # amount / rolling-mean(last 20) of this user
    "amount_z",              # (amount - mean) / std over last 20 of this user
    "merchant_risk",         # static merchant-category risk score
    "txn_count_1h",          # this user's transactions in the previous hour
    "txn_count_24h",         # ... previous 24h
    "amount_sum_1h",         # this user's spend in the previous hour
    "secs_since_last",       # seconds since this user's previous transaction
    "user_txn_count",        # number of prior transactions for this user
    "is_new_location",       # 1 if user has never transacted from this location
    "location_changed",      # 1 if location differs from the user's previous one
    "hour",                  # hour of day (0-23)
    "is_night",              # 1 if 23:00-05:59
    "is_weekend",            # 1 if Sat/Sun
    "device_atm",            # one-hot: device == atm
    "device_web",            # one-hot: device == web
    "device_pos",            # one-hot: device == pos
]

_RAW_COLS = ["ts", "user_id", "amount", "merchant_type", "location", "device_type"]
_CAP_AMOUNT_RATIO = 50.0


def _ensure_datetime(s: pd.Series) -> pd.Series:
    s = pd.to_datetime(s, utc=True, errors="coerce")
    return s.fillna(pd.Timestamp.now(tz="UTC"))


def _per_user_time_windows(g: pd.DataFrame) -> pd.DataFrame:
    g = g.sort_values("ts").set_index("ts")
    one_h = g["amount"].rolling("3600s").count() - 1.0          # exclude current row
    sum_h = g["amount"].rolling("3600s").sum() - g["amount"]
    one_d = g["amount"].rolling("86400s").count() - 1.0
    g = g.assign(txn_count_1h=one_h.clip(lower=0),
                 amount_sum_1h=sum_h.clip(lower=0),
                 txn_count_24h=one_d.clip(lower=0))
    return g.reset_index()


def build_feature_frame(df: pd.DataFrame) -> pd.DataFrame:
    """Raw transactions → a DataFrame with exactly FEATURE_NAMES (input order kept)."""
    if df.empty:
        return pd.DataFrame(columns=FEATURE_NAMES)

    d = df.copy()
    for c in _RAW_COLS:
        if c not in d.columns:
            raise ValueError(f"missing column {c!r}")
    d["ts"] = _ensure_datetime(d["ts"])
    d["amount"] = pd.to_numeric(d["amount"], errors="coerce").fillna(0.0).clip(lower=0.01)
    d = d.sort_values(["user_id", "ts"]).reset_index(drop=False).rename(columns={"index": "_orig"})

    grp = d.groupby("user_id", sort=False, group_keys=False)

    # prior-window amount stats (shift → exclude current row)
    d["_prev_mean"] = grp["amount"].transform(lambda s: s.rolling(20, min_periods=1).mean().shift(1))
    d["_prev_std"] = grp["amount"].transform(lambda s: s.rolling(20, min_periods=2).std().shift(1))
    d["user_txn_count"] = grp.cumcount().astype(float)
    d["secs_since_last"] = grp["ts"].diff().dt.total_seconds()

    # time-window counts per user
    d = d.groupby("user_id", sort=False, group_keys=False).apply(_per_user_time_windows).reset_index(drop=True)

    # location features
    prev_loc = d.groupby("user_id")["location"].shift(1)
    d["location_changed"] = ((d["location"] != prev_loc) & prev_loc.notna()).astype(float)
    d["is_new_location"] = (~d.groupby("user_id")["location"].transform(lambda s: s.duplicated(keep="first"))).astype(float)

    # first-txn NaN → defaults
    d["_prev_mean"] = d["_prev_mean"].fillna(d["amount"])
    d["_prev_std"] = d["_prev_std"].fillna(0.0)
    d["secs_since_last"] = d["secs_since_last"].fillna(7 * 24 * 3600).clip(lower=0, upper=7 * 24 * 3600)
    d["txn_count_1h"] = d["txn_count_1h"].fillna(0.0)
    d["txn_count_24h"] = d["txn_count_24h"].fillna(0.0)
    d["amount_sum_1h"] = d["amount_sum_1h"].fillna(0.0)
    d["user_txn_count"] = d["user_txn_count"].fillna(0.0)

    # derived
    d["log_amount"] = np.log1p(d["amount"])
    d["amount_to_user_mean"] = (d["amount"] / d["_prev_mean"].replace(0, np.nan)).fillna(1.0).clip(0, _CAP_AMOUNT_RATIO)
    d["amount_z"] = ((d["amount"] - d["_prev_mean"]) / (d["_prev_std"] + 1.0)).clip(-25, 25)
    d["merchant_risk"] = d["merchant_type"].map(MERCHANT_RISK).fillna(0.15)
    ts = d["ts"].dt
    d["hour"] = ts.hour.astype(float)
    d["is_night"] = (((ts.hour >= 23) | (ts.hour < 6))).astype(float)
    d["is_weekend"] = (ts.dayofweek >= 5).astype(float)
    dev = d["device_type"].astype(str)
    d["device_atm"] = (dev == "atm").astype(float)
    d["device_web"] = (dev == "web").astype(float)
    d["device_pos"] = (dev == "pos").astype(float)

    out = d.set_index("_orig")[FEATURE_NAMES].sort_index()
    out.index.name = None
    return out.astype(float)


def compute_features_online(history: pd.DataFrame, new_txn: dict) -> dict:
    """Feature vector for one incoming transaction given the user's recent history."""
    cols = _RAW_COLS
    hist = history[cols].copy() if not history.empty else pd.DataFrame(columns=cols)
    row = {c: new_txn.get(c) for c in cols}
    frame = pd.concat([hist, pd.DataFrame([row])], ignore_index=True)
    feats = build_feature_frame(frame)
    return feats.iloc[-1].to_dict()
