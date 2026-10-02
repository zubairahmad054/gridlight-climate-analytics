"""Wait briefly for settled observations before dashboard refresh or training."""
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from _shared import connect


def check_observations(attempts=3, sleep=time.sleep, ingest=subprocess.run):
    for attempt in range(attempts):
        with connect() as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            latest = conn.execute("""SELECT max(timestamp) FROM carbon_intensity
                WHERE actual IS NOT NULL AND timestamp <= now() - interval '60 minutes'""").fetchone()[0]
        now = datetime.now(timezone.utc)
        if latest is not None and now - timedelta(hours=3) <= latest <= now:
            print(f"Settled observations are fresh: latest actual {latest.isoformat()}")
            return
        print(f"Settled observations stale: latest actual {latest.isoformat() if latest else 'missing'}; "
              f"checked at {now.isoformat()} (attempt {attempt + 1}/{attempts})", flush=True)
        if attempt + 1 < attempts:
            sleep(30 * (attempt + 1))
            # Ingestion is an upsert; retry to capture delayed upstream actuals.
            ingest(["node", str(Path(__file__).with_name("ingest.mjs"))], check=True)
    raise RuntimeError("Carbon Intensity API actuals remain more than three hours stale; "
                       "retaining the last good report and model. Retry after upstream recovery.")


if __name__ == "__main__":
    check_observations()
