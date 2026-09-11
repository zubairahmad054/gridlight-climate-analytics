import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const source = readFileSync(new URL('../lib/schedule.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { rankWindows, baselineWindow, windowSavings } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const point = (slot, intensity = 100, price = 20) => ({ target_time: new Date(Date.UTC(2026, 8, 10) + slot * 1800000).toISOString(), intensity, price, marginal: null })

test('missing and duplicate half-hours cannot form a complete run', () => {
  assert.deepEqual(rankWindows([point(0), point(2)], { durationHalfHours: 2 }), [])
  assert.deepEqual(rankWindows([point(0), point(0)], { durationHalfHours: 2 }), [])
})
test('baseline starts at the earliest complete consecutive run', () => {
  const points = [point(0), point(2), point(3)]
  assert.equal(baselineWindow(points, 2).start, point(2).target_time)
  assert.equal(baselineWindow(points, 2).end, point(4).target_time)
})
test('price objectives never substitute an unpriced carbon-only option', () => {
  for (const objective of ['cost', 'balanced']) {
    assert.deepEqual(rankWindows([point(0, 10, null)], { durationHalfHours: 1, objective }), [])
    const ranked = rankWindows([point(0, 10, null), point(1, 100, 20)], { durationHalfHours: 1, objective })
    assert.equal(ranked.length, 1)
    assert.equal(ranked[0].start, point(1).target_time)
  }
})
test('negative tariffs are valid and deadlines include the whole run', () => {
  const ranked = rankWindows([point(0, 100, -5), point(1)], { durationHalfHours: 1, objective: 'cost', deadline: point(1).target_time })
  assert.equal(ranked.length, 1)
  assert.equal(ranked[0].avgPrice, -5)
})
test('invalid carbon readings cannot produce a recommendation', () => {
  for (const value of [NaN, Infinity, -1]) assert.equal(rankWindows([point(0, value)], { durationHalfHours: 1 }).length, 0)
})
test('cheaper but higher-carbon choices report both directions honestly', () => {
  const baseline = baselineWindow([point(0, 100, 30)], 1)
  const choice = baselineWindow([point(1, 200, 10)], 1)
  assert.deepEqual(windowSavings(2, choice, baseline), { co2KgAverage: -0.1, co2KgMarginal: null, costGbp: 0.2 })
})
