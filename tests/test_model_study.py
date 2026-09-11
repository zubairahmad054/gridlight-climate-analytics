import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import pandas as pd

from test_forecasting import fixture
from experiment_models import candidates, direct_forecast, direct_inputs, weather_features, SITES
from forecasting import forecast_at
from model_study import choose_winner, validate_split, finalise, digest
import features as F


class StudyTests(unittest.TestCase):
    def test_split_rejects_overlapping_and_naive_origins(self):
        validate_split(['2026-07-01T03:30Z'],['2026-07-05T03:30Z'])
        for development, final in [(['2026-07-01T03:30Z'],['2026-07-02T03:30Z']),
                                    (['2026-07-01'],['2026-07-05T03:30Z']),
                                    (['2026-07-01T03:30Z','2026-07-02T03:30Z'],['2026-07-05T03:30Z'])]:
            with self.assertRaises(ValueError):
                validate_split(development,final)

    def test_selector_cannot_use_final_rows(self):
        frame=pd.DataFrame([dict(partition='development',model='b',lead_hours=1,prediction=5,actual=4),
                            dict(partition='development',model='a',lead_hours=1,prediction=3,actual=4)])
        self.assertEqual(choose_winner(frame),'a')
        frame.loc[0,'partition']='final'
        with self.assertRaisesRegex(ValueError,'development'):
            choose_winner(frame)

    def test_scaled_ridge_ignores_future_actuals(self):
        intensity,weather,origin=fixture()
        before=forecast_at(intensity,weather,weather,origin,estimator='ridge')
        intensity.loc[intensity.index>origin-pd.Timedelta(minutes=60),'actual']=99999
        after=forecast_at(intensity,weather,weather,origin,estimator='ridge')
        pd.testing.assert_series_equal(before.predictions,after.predictions)

    def test_direct_ignores_future_actuals_and_embargoes_labels(self):
        intensity,weather,origin=fixture()
        before=direct_forecast(intensity,weather,weather,origin,model_params={'n_estimators':2})
        intensity.loc[intensity.index>origin-pd.Timedelta(minutes=60),'actual']=99999
        after=direct_forecast(intensity,weather,weather,origin,model_params={'n_estimators':2})
        pd.testing.assert_series_equal(before.predictions,after.predictions)
        self.assertLessEqual(before.training_frame.index.max(),origin-pd.Timedelta(days=7))

    def test_direct_day_two_lags_are_already_known(self):
        intensity,weather,origin=fixture()
        targets=pd.date_range(origin+pd.Timedelta(minutes=30),periods=96,freq='30min')
        before=direct_inputs(targets,origin,intensity.actual,weather)
        intensity.loc[intensity.index>origin-pd.Timedelta(minutes=60),'actual']=99999
        after=direct_inputs(targets,origin,intensity.actual,weather)
        pd.testing.assert_frame_equal(before,after)
        self.assertEqual(before.lead_hours.iloc[-1],48)

    def test_blend_never_averages_away_missing_locations(self):
        _,weather,_=fixture()
        frames={s:weather.copy() for s in SITES}
        frames['north_sea'].iloc[0,0]=np.nan
        self.assertTrue(pd.isna(weather_features(frames,'blend').iloc[0].wind))
        self.assertIn('wx_scotland_wind',weather_features(frames,'locations'))

    def test_predictors_cannot_include_target(self):
        intensity,weather,origin=fixture()
        with self.assertRaisesRegex(ValueError,'predictor'):
            forecast_at(intensity,weather,weather,origin,feature_columns=['actual'])

    def test_candidate_ids_unique_and_reference_unchanged(self):
        specs=candidates()
        self.assertEqual(len({c['id'] for c in specs}),len(specs))
        self.assertEqual(next(c for c in specs if c['id']=='ours-v2'),{'id':'ours-v2'})

    def test_london_calendar_retains_utc_index(self):
        index=pd.DatetimeIndex(['2026-07-01T00:00Z'])
        utc=F._add_calendar(pd.DataFrame(index=index))
        london=F._add_calendar(pd.DataFrame(index=index), 'Europe/London')
        pd.testing.assert_index_equal(london.index,index)
        self.assertNotEqual(utc.hour_sin.iloc[0],london.hour_sin.iloc[0])

    def test_direct_rejects_missing_forward_weather(self):
        intensity,weather,origin=fixture()
        with self.assertRaisesRegex(ValueError,'Incomplete direct'):
            direct_forecast(intensity,weather,weather.loc[:origin],origin,model_params={'n_estimators':2})

    @patch('model_study.verify_inputs')
    def test_final_is_one_shot_even_after_interruption(self, verify):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)
            (path/'plan.json').write_text('{}')
            (path/'development-predictions.csv').write_text('test')
            (path/'selection.json').write_text(json.dumps({'plan_hash':digest(path/'plan.json'),
                'predictions_hash':digest(path/'development-predictions.csv')}))
            (path/'final-started.json').write_text('{}')
            with self.assertRaisesRegex(ValueError,'already started'):
                finalise(path)

    @patch('model_study.verify_inputs')
    def test_final_rejects_changed_selection_inputs(self, verify):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)
            (path/'plan.json').write_text('{}')
            (path/'selection.json').write_text(json.dumps({'plan_hash':'changed','predictions_hash':'changed'}))
            with self.assertRaisesRegex(ValueError,'changed'):
                finalise(path)


if __name__=='__main__':
    unittest.main()
