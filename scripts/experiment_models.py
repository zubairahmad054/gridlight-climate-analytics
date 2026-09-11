"""Explicit candidates for the controlled study; no live-model promotion."""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor

import features as F
from forecasting import ForecastResult, forecast_at

CALENDAR = [c for c in F.FEATURE_COLUMNS if c not in ['wind', 'solar', 'temp', 'lag_48', 'lag_336']]
LAGS = ['lag_48', 'lag_336']
SITES = {'central': (53.0, -1.5), 'scotland': (56.5, -3.0), 'north_sea': (55.0, 1.5)}
EXTRA = [f'wx_{site}_{v}' for site in SITES if site != 'central' for v in ['wind', 'solar', 'temp']]


def candidates():
    return [
        dict(id='ridge-calendar', estimator='ridge', feature_columns=CALENDAR),
        dict(id='ridge-lags', estimator='ridge', feature_columns=CALENDAR+LAGS),
        dict(id='ridge-full', estimator='ridge'),
        dict(id='ours-v2'),
        dict(id='boosting-shallow', model_params=dict(n_estimators=200, max_depth=2, learning_rate=0.05)),
        dict(id='boosting-london', calendar_timezone='Europe/London'),
        dict(id='boosting-weather-blend', weather_mode='blend'),
        dict(id='boosting-weather-locations', weather_mode='locations', feature_columns=F.FEATURE_COLUMNS+EXTRA),
        dict(id='boosting-direct', strategy='direct', model_params=dict(n_estimators=200, max_depth=2, learning_rate=0.05)),
    ]


def weather_features(frames, mode):
    base = frames['central'][['wind', 'solar', 'temp']].copy()
    if mode == 'blend':
        # Explicit equal-weight proxy: no installed-capacity claims.
        for col in base:
            base[col] = pd.concat([frames[s][col].reindex(base.index) for s in SITES], axis=1).mean(axis=1, skipna=False)
    elif mode == 'locations':
        for site in SITES:
            if site != 'central':
                for col in ['wind', 'solar', 'temp']:
                    base[f'wx_{site}_{col}'] = frames[site][col].reindex(base.index)
    elif mode != 'central':
        raise ValueError(f'Unknown weather mode {mode}')
    return base


def direct_inputs(targets, origin, known, weather):
    """No recursive predictions: every lag is fixed at the issue-time cutoff."""
    cutoff = origin - pd.Timedelta(minutes=60)
    known = known.loc[known.index <= cutoff]
    result = F.build_inference_base(targets, known, weather)
    daily_times = targets - pd.Timedelta(days=1)
    # For day-two targets, use the latest settled daily seasonal analogue.
    daily_times = pd.DatetimeIndex([t if t <= cutoff else t-pd.Timedelta(days=1) for t in daily_times])
    # The settlement boundary can still require one more day back.
    daily_times = pd.DatetimeIndex([t if t <= cutoff else t-pd.Timedelta(days=1) for t in daily_times])
    result['daily_at_issue'] = known.reindex(daily_times).to_numpy()
    result['last_at_issue'] = known.get(cutoff, np.nan)
    result['lead_hours'] = (targets-origin).total_seconds()/3600
    return result


def direct_forecast(intensity, training_weather, forecast_weather, origin, model_params=None,
                    min_training_rows=400):
    origin = pd.Timestamp(origin)
    if origin.tzinfo is None or origin != origin.floor('30min'):
        raise ValueError('Direct origin must be timezone-aware and half-hour aligned')
    origin = origin.tz_convert('UTC')
    if not intensity.index.is_unique:
        raise ValueError('Duplicate intensity timestamps')
    history = intensity.loc[:origin-pd.Timedelta(minutes=60), ['actual']].dropna().sort_index()
    if history.empty or history.index.max() < origin-pd.Timedelta(hours=3):
        raise ValueError('Stale observations')
    train_cutoff = origin-pd.Timedelta(days=7)
    offset = origin-origin.floor('D')
    first = history.index.min().ceil('D')+pd.Timedelta(days=8)+offset
    last = (train_cutoff-pd.Timedelta(hours=48)-offset).floor('D')+offset
    frames = []
    for issue in pd.date_range(first, last, freq='D'):
        targets = pd.date_range(issue+pd.Timedelta(minutes=30), periods=96, freq='30min')
        part = direct_inputs(targets, issue, history.actual, training_weather)
        part['actual'] = history.actual.reindex(targets).to_numpy()
        # Missing historical inputs are excluded explicitly from training only.
        frames.append(part.dropna())
    frame = pd.concat(frames) if frames else pd.DataFrame()
    if len(frame) < min_training_rows or not np.isfinite(frame.to_numpy()).all():
        raise ValueError('Insufficient finite direct training rows')
    columns = [c for c in frame if c != 'actual']
    model = GradientBoostingRegressor(**({'n_estimators': 200, 'max_depth': 2, 'learning_rate': 0.05,
                                         'random_state': 42} | (model_params or {})))
    model.fit(frame[columns], frame.actual)
    targets = pd.date_range(origin+pd.Timedelta(minutes=30), periods=96, freq='30min')
    inputs = direct_inputs(targets, origin, history.actual, forecast_weather)
    if not np.isfinite(inputs.to_numpy()).all():
        raise ValueError('Incomplete direct forecast inputs')
    predicted = pd.Series(np.maximum(0, model.predict(inputs[columns])), index=targets, name='prediction')
    return ForecastResult(predicted, model, frame, history)


def predict_candidate(spec, intensity, training_weather, forecast_weather, origin):
    options = {k:v for k,v in spec.items() if k not in ['id', 'strategy', 'weather_mode']}
    function = direct_forecast if spec.get('strategy') == 'direct' else forecast_at
    return function(intensity, training_weather, forecast_weather, origin, **options)
