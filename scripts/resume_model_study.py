"""Recover interrupted development without changing the registered study or models.

Reuses only complete, hash-verified run artifacts. Partial directories are rejected,
never overwritten. Final evaluation and its one-shot guard remain in model_study.py.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil

import numpy as np
import pandas as pd

from artifacts import save_run
from backtest import read_frame
from experiment_models import SITES, predict_candidate, weather_features
from model_study import baseline_predictions, choose_winner, digest, publish, verify_inputs, write_json


def resume(directory):
    plan=json.loads((directory/'plan.json').read_text())
    verify_inputs(directory,plan)
    if (directory/'selection.json').exists():
        raise ValueError('Selection already locked; use finalise, not another development run')
    shutil.copy2(__file__,directory/'source'/'resume_model_study.py')
    write_json(directory/'recovery.json',dict(started_at=pd.Timestamp.now(tz='UTC').isoformat(),
               source_sha256=digest(Path(__file__)),reason='Resume interrupted development; plan and model source unchanged'))
    intensity=read_frame(directory/'inputs/intensity.csv')
    training={s:read_frame(directory/f'inputs/training-{s}.csv') for s in SITES}
    records,metadata=[],[]
    for i,origin_string in enumerate(plan['development']):
        origin=pd.Timestamp(origin_string)
        history=intensity.loc[:origin-pd.Timedelta(minutes=60)].dropna(subset=['actual'])
        targets=pd.date_range(origin+pd.Timedelta(minutes=30),periods=96,freq='30min')
        outputs=baseline_predictions(history,targets)
        forward={s:read_frame(directory/f'inputs/forecast-{i}-{s}.csv') for s in SITES}
        for spec in plan['candidates']:
            path=directory/'runs'/'development'/str(i)/spec['id']
            if path.exists():
                manifest=json.loads((path/'manifest.json').read_text())
                if manifest['candidate']!=spec or pd.Timestamp(manifest['origin'])!=origin:
                    raise ValueError(f'Artifact does not match registered candidate: {path}')
                for name,expected in manifest['files'].items():
                    if digest(path/name)!=expected:
                        raise ValueError(f'Changed run artifact: {path/name}')
                predictions=read_frame(path/'predictions.csv').prediction
                action='reused'
            else:
                mode=spec.get('weather_mode','central')
                weather=weather_features(forward,mode)
                result=predict_candidate(spec,history,weather_features(training,mode),weather,origin)
                manifest=dict(origin=origin_string,partition='development',candidate=spec,
                              training_rows=len(result.training_frame),training_cutoff=result.training_frame.index.max().isoformat(),
                              calendar_timezone=spec.get('calendar_timezone','UTC'))
                save_run(path,result,weather,manifest)
                predictions=result.predictions
                action='fitted'
            if not predictions.index.equals(targets) or not np.isfinite(predictions).all():
                raise ValueError('Invalid saved prediction targets')
            outputs[spec['id']]=predictions
            metadata.append({k:manifest[k] for k in ['origin','candidate','training_rows','training_cutoff']})
            print(f'development {origin.date()} {spec["id"]}: {action}',flush=True)
        for name,predictions in outputs.items():
            for t,value in predictions.items():
                records.append(dict(partition='development',origin=origin_string,target_time=t.isoformat(),model=name,
                                    lead_hours=(t-origin).total_seconds()/3600,prediction=float(value),actual=float(intensity.loc[t,'actual'])))
    predictions=pd.DataFrame(records)
    predictions.to_csv(directory/'development-predictions.csv',index=False)
    write_json(directory/'development-runs.json',metadata)
    write_json(directory/'selection.json',dict(winner=choose_winner(predictions),locked_at=pd.Timestamp.now(tz='UTC').isoformat(),
               plan_hash=digest(directory/'plan.json'),predictions_hash=digest(directory/'development-predictions.csv')))
    publish(directory,plan,predictions,None)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--study',required=True,type=Path)
    resume(parser.parse_args().study)
