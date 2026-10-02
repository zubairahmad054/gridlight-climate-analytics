"""Open-Meteo weather client (free, no API key).

Wind speed at 100m hub height, shortwave solar radiation and 2m temperature are
the physical drivers of GB carbon intensity (wind/solar push it down). We use a
single representative central-GB point as a simplification; a future improvement
is a demand/capacity-weighted blend of several points.
"""
from __future__ import annotations

import time
import json
import hashlib
from pathlib import Path

import httpx
import pandas as pd

LAT, LON = 53.0, -1.5  # central GB (simplification)
VARS = "wind_speed_100m,shortwave_radiation,temperature_2m"


def archived_forecast(origin: pd.Timestamp, cache_dir: Path,
                      model: str = "gfs_global", delay_hours: int = 8,
                      *, latitude: float = LAT, longitude: float = LON,
                      previous_runs: int = 0) -> tuple[pd.DataFrame, dict]:
    """Read an eligible archived run; live training may try older missing-run vintages.

    Research callers keep exact-run selection by default. Every fallback still
    predates origin and records the actual vintage; no realised weather is used.
    """
    if previous_runs not in (0, 1, 2):
        raise ValueError("previous_runs must be between zero and two")
    for offset in range(previous_runs + 1):
        try:
            frame, metadata = _archived_run(
                origin - pd.Timedelta(hours=6 * offset), cache_dir, model, delay_hours,
                latitude=latitude, longitude=longitude)
            metadata["previous_runs_used"] = offset
            return frame, metadata
        except httpx.HTTPStatusError as error:
            if error.response.status_code not in (400, 404) or offset == previous_runs:
                raise
            print("Archived weather run unavailable; trying the preceding eligible six-hour run")
    raise RuntimeError("No eligible archived weather run")


def _archived_run(origin: pd.Timestamp, cache_dir: Path,
                      model: str = "gfs_global", delay_hours: int = 8,
                      *, latitude: float = LAT, longitude: float = LON) -> tuple[pd.DataFrame, dict]:
    """Specific archived run, with explicit assumed publication delay.

    Initialisation is NOT availability. No fallback to today's forecast or
    realised weather. Cache raw responses for reproducible experiments.
    """
    if delay_hours < 6:
        raise ValueError("Global weather runs require at least a 6h availability allowance")
    origin = pd.Timestamp(origin).tz_convert("UTC")
    run = (origin - pd.Timedelta(hours=delay_hours)).floor("6h")
    if run < pd.Timestamp("2026-04-02", tz="UTC"):
        raise ValueError("Archived-run experiment supports dates from 2026-04-02")
    url = (
        "https://single-runs-api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}&longitude={longitude}&hourly={VARS}&timezone=UTC"
        f"&models={model}&run={run.strftime('%Y-%m-%dT%H:%M')}&forecast_days=4"
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / (hashlib.sha256(url.encode()).hexdigest() + ".json")
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
    else:
        raw = _get_json(url)
        path.write_text(json.dumps(raw), encoding="utf-8")
    return _to_frame(raw["hourly"]), {
        "source": "Open-Meteo Single Runs", "model": model, "url": url,
        "initialised_at": run.isoformat(),
        "assumed_available_at": (run + pd.Timedelta(hours=delay_hours)).isoformat(),
        "availability_basis": "assumed publication delay; not observed receipt time",
        "snapshot_sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "cache_file": path.name,
    }


def _to_frame(hourly: dict) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "wind": hourly["wind_speed_100m"],
            "solar": hourly["shortwave_radiation"],
            "temp": hourly["temperature_2m"],
        },
        index=pd.to_datetime(hourly["time"], utc=True),
    )


def _get_json(url: str, attempts: int = 4, timeout: float = 60.0) -> dict:
    """GET with retry + exponential backoff. Open-Meteo occasionally drops the TLS
    connection mid-handshake (SSL UNEXPECTED_EOF); a transient blip shouldn't fail
    the whole nightly retrain, so we retry before giving up."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            with httpx.Client(timeout=timeout) as c:
                r = c.get(url)
                r.raise_for_status()
                return r.json()
        except httpx.HTTPError as e:  # covers connect/SSL/timeout/status errors
            if isinstance(e, httpx.HTTPStatusError) and 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                raise  # Missing runs need another vintage, not repeated identical requests.
            last = e
            if i < attempts - 1:
                wait = 2**i  # 1s, 2s, 4s
                print(f"  weather request failed (attempt {i + 1}/{attempts}): {e}; retry in {wait}s")
                time.sleep(wait)
    raise last  # type: ignore[misc]


def fetch_archive(start_date: str, end_date: str, *, latitude: float = LAT,
                  longitude: float = LON) -> pd.DataFrame:
    """Historical hourly weather (ERA5 reanalysis) for YYYY-MM-DD .. YYYY-MM-DD."""
    url = (
        "https://archive-api.open-meteo.com/v1/archive"
        f"?latitude={latitude}&longitude={longitude}&start_date={start_date}&end_date={end_date}"
        f"&hourly={VARS}&timezone=UTC"
    )
    return _to_frame(_get_json(url)["hourly"])


def fetch_forecast(past_days: int = 7, forecast_days: int = 3) -> pd.DataFrame:
    """Recent + future hourly weather (forecast model)."""
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={LAT}&longitude={LON}&hourly={VARS}"
        f"&past_days={past_days}&forecast_days={forecast_days}&timezone=UTC"
    )
    return _to_frame(_get_json(url)["hourly"])


def combined(start_date: str, end_date: str) -> pd.DataFrame:
    """Archive history stitched with the forecast window (forecast wins on overlap).

    Each fetch retries (see _get_json) and is non-fatal on its own: a transient
    outage of one endpoint degrades gracefully to the other rather than failing the
    nightly retrain. (A simultaneous outage of both still surfaces as empty weather —
    rare enough to let the run fail loudly rather than train on no physical driver.)
    """
    try:
        archive = fetch_archive(start_date, end_date)
    except Exception as e:  # noqa: BLE001
        print(f"  weather archive failed ({e}); using forecast window only")
        archive = pd.DataFrame(columns=["wind", "solar", "temp"])
    try:
        fc = fetch_forecast(past_days=7, forecast_days=3)
    except Exception as e:  # noqa: BLE001
        print(f"  weather forecast failed ({e}); using archive history only")
        fc = pd.DataFrame(columns=["wind", "solar", "temp"])
    wx = pd.concat([archive, fc]).sort_index()
    wx = wx[~wx.index.duplicated(keep="last")]
    return wx
