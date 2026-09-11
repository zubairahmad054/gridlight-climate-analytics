import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { test } from "node:test"
import { PGlite } from "@electric-sql/pglite"

const migrationDir = new URL("../db/migrations/", import.meta.url)

async function database() {
  const db = new PGlite()
  for (const name of readdirSync(migrationDir).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(new URL(name, migrationDir), "utf8"))
  }
  return db
}

async function run(db, model, available, targets) {
  const id = randomUUID()
  await db.query(`INSERT INTO forecast_runs
    (run_id, model_version, issued_at, available_at, input_data_version)
    VALUES ($1, $2, $3, $3, 'fixture')`, [id, model, available])
  for (const [target, value] of targets) {
    await db.query("INSERT INTO forecast_predictions VALUES ($1, $2, $3)", [id, target, value])
  }
  return id
}

test("migration is additive, repeatable, and overlapping forecasts remain separate", async () => {
  const db = await database()
  try {
    await db.exec("INSERT INTO forecasts (target_time, predicted_intensity, model_version) VALUES ('2026-08-02Z', 42, 'legacy')")
    const first = await run(db, "ours-v2", "2026-08-01T00:00Z", [["2026-08-02T00:00Z", 100]])
    await run(db, "ours-v2", "2026-08-01T12:00Z", [["2026-08-02T00:00Z", 130]])
    await db.exec(readFileSync(new URL("006_forecast_runs.sql", migrationDir), "utf8"))
    assert.equal((await db.query("SELECT * FROM forecasts")).rows.length, 1)
    assert.equal((await db.query("SELECT * FROM forecast_predictions")).rows.length, 2)
    assert.equal((await db.query("SELECT predicted_intensity FROM forecast_predictions WHERE run_id=$1", [first])).rows[0].predicted_intensity, 100)
    await assert.rejects(db.query("INSERT INTO forecast_predictions VALUES ($1,'2026-08-02T00:00Z',999)", [first]), /duplicate key/)
  } finally { await db.close() }
})

test("paired scoring rejects future/stale NESO snapshots and matches target and origin", async () => {
  const db = await database()
  try {
    await db.exec(`INSERT INTO carbon_intensity(timestamp, actual) VALUES
      ('2026-08-02T06:00Z',100), ('2026-08-02T07:00Z',100), ('2026-08-02T08:00Z',100)`)
    await run(db, "ours-v2", "2026-08-01T00:00Z", [
      ["2026-08-02T06:00Z", 120], ["2026-08-02T07:00Z", 120], ["2026-08-02T08:00Z",120]])
    await run(db, "neso-fw48h", "2026-07-31T23:30Z", [["2026-08-02T06:00Z", 110]])
    await run(db, "neso-fw48h", "2026-07-31T23:45Z", [["2026-08-02T06:00Z", 105]])
    await run(db, "neso-fw48h", "2026-08-01T00:01Z", [["2026-08-02T06:00Z", 999], ["2026-08-02T07:00Z",999]])
    await run(db, "neso-fw48h", "2026-07-31T22:59Z", [["2026-08-02T08:00Z",999]])
    const { rows } = await db.query("SELECT * FROM paired_forecast_errors")
    assert.equal(rows.length, 1)
    assert.equal(rows[0].ours_error, 20)
    assert.equal(rows[0].neso_error, 5)
    assert.equal(Number(rows[0].lead_hours), 30)
  } finally { await db.close() }
})

test("failed snapshot transaction cannot leave a partial run", async () => {
  const db = await database()
  try {
    const id = randomUUID()
    await assert.rejects(db.transaction(async (tx) => {
      await tx.query(`INSERT INTO forecast_runs (run_id,model_version,issued_at,available_at,input_data_version)
        VALUES ($1,'ours-v2','2026-08-01Z','2026-08-01Z','test')`, [id])
      await tx.query("INSERT INTO forecast_predictions VALUES ($1,'2026-08-02Z',-1)", [id])
    }))
    assert.equal((await db.query("SELECT * FROM forecast_runs")).rows.length, 0)
  } finally { await db.close() }
})
