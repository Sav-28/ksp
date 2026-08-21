"""
Crime-volume forecasting with an honest, measured accuracy.

The previous forecast was a 3-month moving average with a trend nudge and NO
evaluation — so there was no way to say whether it was any good. This module
adds several candidate forecasters and scores them all with **walk-forward
one-step-ahead backtesting** (train on months 1..t, predict month t+1, step
forward), then selects the best by MAE and reports the error alongside a naive
baseline.

Deliberately implemented in pure Python (no numpy/sklearn at runtime) so it works
on the slim cloud build, exactly like the offender-risk model.

Why simple models: with only ~2 years of monthly history a high-capacity model
would overfit. Reporting a measured error against a baseline is more defensible
than an unvalidated complex model.
"""
from typing import List, Dict, Any, Optional, Callable, Tuple

# Need at least this much history before we start scoring predictions.
MIN_TRAIN = 8


# --------------------------------------------------------------------------
# Candidate forecasters. Each takes the history so far and returns the
# prediction for the NEXT month.
# --------------------------------------------------------------------------
def _naive(h: List[float]) -> float:
    """Baseline: next month equals this month."""
    return h[-1]


def _mean3(h: List[float]) -> float:
    """Mean of the last three months (smooths noise)."""
    w = h[-3:]
    return sum(w) / len(w)


def _drift(h: List[float]) -> float:
    """Last value plus the average month-over-month change."""
    if len(h) < 2:
        return h[-1]
    return h[-1] + (h[-1] - h[0]) / (len(h) - 1)


def _seasonal_naive(h: List[float]) -> float:
    """Same month last year — captures annual seasonality when available."""
    return h[-12] if len(h) >= 12 else _mean3(h)


def _linear_trend(h: List[float], window: int = 6) -> float:
    """Least-squares straight line over the last `window` months, extrapolated."""
    w = h[-window:]
    n = len(w)
    if n < 2:
        return w[-1]
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(w) / n
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return my
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, w)) / denom
    return my + slope * (n - mx)


def _ma_trend(h: List[float]) -> float:
    """The previous production heuristic, kept so we can show the comparison."""
    if len(h) < 3:
        return h[-1]
    last3 = h[-3:]
    return sum(last3) / 3 + (last3[-1] - last3[0]) / 2


def _damped_trend(h: List[float], alpha: float = 0.5) -> float:
    """Mean of the last 3 months plus a damped trend — conservative."""
    base = _mean3(h)
    if len(h) < 4:
        return base
    trend = (h[-1] - h[-4]) / 3.0
    return base + alpha * trend


def _ses(h: List[float], alpha: float = 0.5) -> float:
    """Simple exponential smoothing: recent months weighted more, smoothly."""
    level = h[0]
    for y in h[1:]:
        level = alpha * y + (1 - alpha) * level
    return level


def _holt(h: List[float], alpha: float = 0.5, beta: float = 0.2,
          phi: float = 0.85) -> float:
    """
    Holt's linear trend with damping — a standard, well-understood forecaster.

    Tracks a level and a trend, and damps the trend (phi < 1) so it does not
    extrapolate a short-term ramp indefinitely.
    """
    if len(h) < 2:
        return h[-1]
    level = h[0]
    trend = h[1] - h[0]
    for y in h[1:]:
        prev_level = level
        level = alpha * y + (1 - alpha) * (level + phi * trend)
        trend = beta * (level - prev_level) + (1 - beta) * phi * trend
    return level + phi * trend


def _wma3(h: List[float]) -> float:
    """Weighted mean of the last three months (3:2:1, most recent heaviest)."""
    w = h[-3:]
    if len(w) < 3:
        return sum(w) / len(w)
    return (3 * w[-1] + 2 * w[-2] + 1 * w[-3]) / 6.0


METHODS: Dict[str, Callable[[List[float]], float]] = {
    "naive": _naive,
    "mean3": _mean3,
    "wma3": _wma3,
    "drift": _drift,
    "seasonal_naive": _seasonal_naive,
    "linear_trend": _linear_trend,
    "ma_trend": _ma_trend,
    "damped_trend": _damped_trend,
    "ses": _ses,
    "holt_damped": _holt,
}

BASELINE = "naive"


# --------------------------------------------------------------------------
# Backtesting
# --------------------------------------------------------------------------
def _errors(actual: List[float], pred: List[float]) -> Dict[str, float]:
    n = len(actual)
    if n == 0:
        return {"mae": 0.0, "rmse": 0.0, "mape": 0.0}
    abs_err = [abs(a - p) for a, p in zip(actual, pred)]
    sq_err = [(a - p) ** 2 for a, p in zip(actual, pred)]
    pct = [abs(a - p) / a * 100 for a, p in zip(actual, pred) if a]
    return {
        "mae": round(sum(abs_err) / n, 2),
        "rmse": round((sum(sq_err) / n) ** 0.5, 2),
        "mape": round(sum(pct) / len(pct), 1) if pct else 0.0,
    }


def backtest(series: List[float], min_train: int = MIN_TRAIN) -> Dict[str, Any]:
    """
    Walk-forward one-step-ahead evaluation of every candidate method.

    For each t >= min_train: fit/predict using only series[:t] (no peeking at the
    future) and compare against the true series[t]. Returns per-method errors,
    the selected best method, and its improvement over the naive baseline.
    """
    if len(series) < min_train + 2:
        return {"available": False,
                "reason": f"need at least {min_train + 2} months of history, "
                          f"have {len(series)}"}

    per_method: Dict[str, Dict[str, float]] = {}
    for name, fn in METHODS.items():
        preds, actuals = [], []
        for t in range(min_train, len(series)):
            history = series[:t]
            try:
                preds.append(max(0.0, float(fn(history))))
                actuals.append(float(series[t]))
            except Exception:
                continue
        if actuals:
            per_method[name] = _errors(actuals, preds)

    if not per_method:
        return {"available": False, "reason": "backtest produced no predictions"}

    best = min(per_method, key=lambda m: per_method[m]["mae"])
    base_mae = per_method.get(BASELINE, {}).get("mae", 0.0)
    best_mae = per_method[best]["mae"]
    improvement = round((base_mae - best_mae) / base_mae * 100, 1) if base_mae else 0.0

    return {
        "available": True,
        "method": best,
        "metrics": per_method[best],
        "baseline": {"method": BASELINE, **per_method.get(BASELINE, {})},
        "improvement_over_baseline_pct": improvement,
        "evaluated_months": len(series) - min_train,
        "all_methods": per_method,
        "validation": "walk-forward one-step-ahead (expanding window)",
    }


def forecast_next(series: List[float], method: Optional[str] = None) -> Optional[float]:
    """Predict the next month using `method` (defaults to the backtest winner)."""
    if not series:
        return None
    if method is None:
        bt = backtest(series)
        method = bt.get("method", "mean3") if bt.get("available") else "mean3"
    fn = METHODS.get(method, _mean3)
    try:
        return max(0.0, round(float(fn(series))))
    except Exception:
        return None


def split_complete_months(monthly: List[Dict[str, Any]],
                          current_month: str) -> Tuple[List[Dict[str, Any]],
                                                       Optional[Dict[str, Any]]]:
    """
    Separate a trailing PARTIAL month from the complete history.

    The current calendar month is still accumulating records, so including it
    would drag the trend down and corrupt both the backtest and the forecast.
    """
    if monthly and monthly[-1].get("month") == current_month:
        return monthly[:-1], monthly[-1]
    return monthly, None
