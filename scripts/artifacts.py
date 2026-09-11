"""Local, content-addressed inputs and model artefacts; never include credentials."""
from __future__ import annotations

import hashlib
from importlib.metadata import version as package_version
import json
import platform
import shutil
import subprocess
from pathlib import Path

import joblib
import pandas as pd
import sklearn


def frame_hash(frame: pd.DataFrame) -> str:
    return hashlib.sha256(frame.to_csv().encode()).hexdigest()


def code_version() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True,
            cwd=Path(__file__).resolve().parent.parent,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def save_run(directory: Path, result, weather: pd.DataFrame, metadata: dict) -> str:
    directory.mkdir(parents=True, exist_ok=False)
    frames = {"training.csv": result.training_frame, "history.csv": result.history,
              "forecast-weather.csv": weather, "predictions.csv": result.predictions.to_frame()}
    hashes = {}
    for name, frame in frames.items():
        frame.to_csv(directory / name)
        hashes[name] = hashlib.sha256((directory / name).read_bytes()).hexdigest()
    inputs = {name: digest for name, digest in hashes.items() if name != "predictions.csv"}
    version = hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
    joblib.dump(result.model, directory / "model.joblib")
    hashes["model.joblib"] = hashlib.sha256((directory / "model.joblib").read_bytes()).hexdigest()
    source = directory / "source"
    source.mkdir()
    source_hashes = {}
    for file in sorted(Path(__file__).resolve().parent.glob("*.py")):
        shutil.copy2(file, source / file.name)
        source_hashes[file.name] = hashlib.sha256(file.read_bytes()).hexdigest()
    metadata.update(input_data_version=version, files=hashes, code_version=code_version(),
                    source_hashes=source_hashes,
                    dependencies={name: package_version(name) for name in
                                  ["numpy", "scipy", "joblib", "pandas", "scikit-learn", "httpx", "psycopg"]},
                    python=platform.python_version(), pandas=pd.__version__, sklearn=sklearn.__version__)
    (directory / "manifest.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return version
