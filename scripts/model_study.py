"""Local-only controlled model study: prepare, develop, then one-shot finalise.

Selection uses development MAE only. Final scoring includes the locked winner,
the existing model and predeclared baselines, never the entire tuning ladder.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
import pandas as pd

from artifacts import frame_hash, save_run
from backtest import read_frame, summarise
from experiment_models import SITES, candidates, predict_candidate, weather_features
import weather as W

ROOT = Path(__file__).resolve().parents[1]
BASELINES = ['persistence', 'seasonal-daily', 'seasonal-weekly']


def write_json(path, data):
    pending = path.with_suffix('.tmp')
    pending.write_text(json.dumps(data, indent=2, allow_nan=False), encoding='utf-8')
    pending.replace(path)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_split(development, final):
    dev, test = list(map(pd.Timestamp, development)), list(map(pd.Timestamp, final))
    if not dev or not test or any(t.tzinfo is None or t != t.floor('30min') for t in dev+test):
        raise ValueError('Nonempty, timezone-aware, half-hour-aligned origins required')
    if len(set(dev+test)) != len(dev+test) or max(dev)+pd.Timedelta(hours=48) >= min(test):
        raise ValueError('Development targets must end before the final origin')
    for group in [sorted(dev), sorted(test)]:
        if any(b-a < pd.Timedelta(hours=48) for a,b in zip(group,group[1:])):
            raise ValueError('Within-partition forecast windows must not overlap')


def choose_winner(predictions):
    if set(predictions.partition) != {'development'}:
        raise ValueError('Selection accepts development predictions only')
    scores = [r for r in summarise(predictions) if r['horizon']=='0-48h']
    return min(scores, key=lambda r:(r['mae'],r['model']))['model']


def prepare(directory, intensity_path, source_experiment, final_origins):
    source_report = json.loads((source_experiment/'report.json').read_text(encoding='utf-8'))
    development = [f['origin'] for f in source_report['folds']]
    validate_split(development, final_origins)
    intensity = read_frame(intensity_path)
    if not intensity.index.is_unique:
        raise ValueError('Duplicate observations')
    # Coverage-only inspection of held-out targets; no values used for selection.
    for origin in map(pd.Timestamp, development+final_origins):
        targets = pd.date_range(origin+pd.Timedelta(minutes=30), periods=96, freq='30min')
        if not np.isfinite(intensity.actual.reindex(targets).to_numpy()).all():
            raise ValueError(f'Incomplete evaluation targets at {origin}')
    directory.mkdir(parents=True, exist_ok=False)
    (directory/'inputs').mkdir()
    intensity.to_csv(directory/'inputs/intensity.csv')
    source = directory/'source'
    source.mkdir()
    for file in Path(__file__).parent.glob('*.py'):
        shutil.copy2(file, source/file.name)
    plan = dict(schema_version=1, study_id=directory.name, created_at=pd.Timestamp.now(tz='UTC').isoformat(),
                development=development, final=final_origins, candidates=candidates(), baselines=BASELINES,
                selection='Lowest development MAE across all 96 leads; lexical model ID breaks ties. Baselines are eligible.',
                sites={k:list(v) for k,v in SITES.items()}, intensity_hash=frame_hash(intensity),
                source_hashes={f.name:digest(f) for f in source.glob('*.py')},
                assumptions=source_report['assumptions']+[
                    'Final dates were reserved before this study; their descriptive analytics have already been seen.',
                    'Final score is a one-window retrospective check, not a prospective or year-round claim.',
                    'Multi-site blend uses equal weights, not installed capacity; points are geographic hypotheses.',
                    'Direct model pools lead times with issue-time lags; training weather is embargoed reanalysis.',
                    'No NESO comparison without valid forecast vintages. No production promotion.'])
    write_json(directory/'plan.json',plan)
    end = (max(map(pd.Timestamp,development+final_origins))-pd.Timedelta(days=7)).strftime('%Y-%m-%d')
    def archive(site):
        lat,lon = SITES[site]
        frame = W.fetch_archive(intensity.index.min().strftime('%Y-%m-%d'),end,latitude=lat,longitude=lon)
        frame.to_csv(directory/f'inputs/training-{site}.csv')
    with ThreadPoolExecutor(max_workers=3) as executor:
        list(executor.map(archive,SITES))
    for i, origin in enumerate(development+final_origins):
        for site,(lat,lon) in SITES.items():
            frame, provenance = W.archived_forecast(pd.Timestamp(origin), ROOT/'artifacts/weather-cache',latitude=lat,longitude=lon)
            if pd.Timestamp(provenance['assumed_available_at']) > pd.Timestamp(origin):
                raise ValueError('Unavailable weather vintage')
            frame.to_csv(directory/f'inputs/forecast-{i}-{site}.csv')
            write_json(directory/f'inputs/forecast-{i}-{site}.json',provenance)
        print(f'Prepared weather {i+1}/{len(development+final_origins)}',flush=True)
    write_json(directory/'inputs.json',{p.name:digest(p) for p in (directory/'inputs').iterdir()})
    print(f'Prepared {directory}',flush=True)


def verify_inputs(directory, plan):
    for name, expected in json.loads((directory/'inputs.json').read_text()).items():
        if digest(directory/'inputs'/name) != expected:
            raise ValueError(f'Changed study input: {name}')
    for name, expected in plan['source_hashes'].items():
        if digest(Path(__file__).parent/name) != expected:
            raise ValueError(f'Study code changed since preparation: {name}. Start a new study.')


def baseline_predictions(history, targets):
    known = history.actual
    daily = known.copy()
    values = {name:[] for name in BASELINES}
    for target in targets:
        weekly = known.get(target-pd.Timedelta(days=7),np.nan)
        day = daily.get(target-pd.Timedelta(days=1),np.nan)
        if pd.isna(day):
            day=weekly
        daily.loc[target]=day
        for name,value in zip(BASELINES,[known.iloc[-1],day,weekly]):
            if not np.isfinite(value):
                raise ValueError('Missing baseline input')
            values[name].append(value)
    return {k:pd.Series(v,index=targets) for k,v in values.items()}


def evaluate(directory, plan, partition, specs):
    intensity = read_frame(directory/'inputs/intensity.csv')
    training = {site:read_frame(directory/f'inputs/training-{site}.csv') for site in SITES}
    records, metadata = [], []
    all_origins = plan['development']+plan['final']
    for origin_string in plan[partition]:
        origin = pd.Timestamp(origin_string)
        i = all_origins.index(origin_string)
        forward = {site:read_frame(directory/f'inputs/forecast-{i}-{site}.csv') for site in SITES}
        # Explicitly remove all post-cutoff observations before candidate fitting.
        history = intensity.loc[:origin-pd.Timedelta(minutes=60)].dropna(subset=['actual'])
        targets = pd.date_range(origin+pd.Timedelta(minutes=30),periods=96,freq='30min')
        outputs = baseline_predictions(history,targets)
        for spec in specs:
            mode = spec.get('weather_mode','central')
            result = predict_candidate(spec,history,weather_features(training,mode),weather_features(forward,mode),origin)
            if not result.predictions.index.equals(targets):
                raise ValueError('Candidate targets differ')
            manifest = dict(origin=origin_string,partition=partition,candidate=spec,
                            training_rows=len(result.training_frame),training_cutoff=result.training_frame.index.max().isoformat(),
                            calendar_timezone=spec.get('calendar_timezone','UTC'))
            save_run(directory/'runs'/partition/str(i)/spec['id'],result,weather_features(forward,mode),manifest)
            metadata.append({k:manifest[k] for k in ['origin','candidate','training_rows','training_cutoff']})
            outputs[spec['id']] = result.predictions
            print(f'{partition} {origin.date()} {spec["id"]} finished',flush=True)
        actual = intensity.actual.reindex(targets)
        for name,predictions in outputs.items():
            for t,value in predictions.items():
                records.append(dict(partition=partition,origin=origin_string,target_time=t.isoformat(),model=name,
                                    lead_hours=(t-origin).total_seconds()/3600,prediction=float(value),actual=float(actual.loc[t])))
    predictions = pd.DataFrame(records)
    if not np.isfinite(predictions[['prediction','actual']].to_numpy()).all():
        raise ValueError('Nonfinite evaluation data')
    predictions.to_csv(directory/f'{partition}-predictions.csv',index=False)
    write_json(directory/f'{partition}-runs.json',metadata)
    return predictions


def develop(directory):
    plan = json.loads((directory/'plan.json').read_text())
    verify_inputs(directory,plan)
    if (directory/'selection.json').exists():
        raise ValueError('Selection is already locked; do not tune on this study again')
    predictions = evaluate(directory,plan,'development',plan['candidates'])
    winner = choose_winner(predictions)
    write_json(directory/'selection.json',dict(winner=winner,locked_at=pd.Timestamp.now(tz='UTC').isoformat(),
               plan_hash=digest(directory/'plan.json'),predictions_hash=digest(directory/'development-predictions.csv')))
    publish(directory,plan,predictions,None)


def finalise(directory):
    plan = json.loads((directory/'plan.json').read_text())
    verify_inputs(directory,plan)
    lock = json.loads((directory/'selection.json').read_text())
    if lock['plan_hash'] != digest(directory/'plan.json') or lock['predictions_hash'] != digest(directory/'development-predictions.csv'):
        raise ValueError('Selection inputs changed after locking')
    if (directory/'final-started.json').exists():
        raise ValueError('Final check already started; do not reuse this holdout to tune')
    write_json(directory/'final-started.json',dict(selection_hash=digest(directory/'selection.json'),started_at=pd.Timestamp.now(tz='UTC').isoformat()))
    selected = [c for c in plan['candidates'] if c['id'] in {lock['winner'],'ours-v2'}]
    final = evaluate(directory,plan,'final',selected)
    publish(directory,plan,pd.read_csv(directory/'development-predictions.csv'),final)


def publish(directory, plan, development, final):
    selection=json.loads((directory/'selection.json').read_text())
    report=dict(schema_version=1,study_id=directory.name,generated_at=pd.Timestamp.now(tz='UTC').isoformat(),
                status='complete' if final is not None else 'development_complete',winner=selection['winner'],
                selection=plan['selection'],development_origins=plan['development'],final_origins=plan['final'],
                candidates=plan['candidates'],assumptions=plan['assumptions'],development=summarise(development),
                final=summarise(final) if final is not None else [],promotion='Not promoted; live model unchanged.')
    if final is not None:
        scores={r['model']:r['mae'] for r in report['final'] if r['horizon']=='0-48h'}
        report['final_improvement_pct']=100*(scores['ours-v2']-scores[selection['winner']])/scores['ours-v2'] if scores['ours-v2'] else None
    write_json(directory/'report.json',report)
    write_json(directory.parent/'latest.json',report)
    print(json.dumps({k:report.get(k) for k in ['study_id','status','winner','final_improvement_pct']},indent=2),flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage',choices=['prepare','develop','finalise'])
    parser.add_argument('--study',required=True,type=Path)
    parser.add_argument('--intensity-csv',type=Path)
    parser.add_argument('--source-backtest',type=Path)
    parser.add_argument('--final-origin',action='append')
    args=parser.parse_args()
    if args.stage=='prepare':
        if not all([args.intensity_csv,args.source_backtest,args.final_origin]):
            parser.error('prepare needs intensity-csv, source-backtest and final-origin')
        prepare(args.study,args.intensity_csv,args.source_backtest,args.final_origin)
    elif args.stage=='develop':
        develop(args.study)
    else:
        finalise(args.study)


if __name__=='__main__':
    main()
