import test from 'node:test'
import assert from 'node:assert/strict'

let attempt = 0
async function runScript(file, env, response) {
  const before = { ...process.env }
  const originalFetch = globalThis.fetch
  Object.assign(process.env, { APP_URL: 'https://example.test', INGEST_TOKEN: 'test-only-placeholder' }, env)
  let options
  globalThis.fetch = async (_url, init) => { options = init; return response }
  try {
    await import(new URL(`../scripts/${file}?test=${attempt++}`, import.meta.url))
    return options
  } finally {
    globalThis.fetch = originalFetch
    for (const key of Object.keys(process.env)) if (!(key in before)) delete process.env[key]
    Object.assign(process.env, before)
  }
}

test('ingestion refuses missing credentials before sending a request', async () => {
  await assert.rejects(runScript('ingest.mjs', { INGEST_TOKEN: '' }), /required/)
})
test('ingestion refuses HTTP and URL-embedded credentials', async () => {
  for (const APP_URL of ['http://example.test', 'https://user:password@example.test']) {
    await assert.rejects(runScript('ingest.mjs', { APP_URL }), /HTTPS/)
  }
})
test('partial HTTP-success ingestion fails the scheduled job', async () => {
  await assert.rejects(runScript('ingest.mjs', {}, { ok: true, json: async () => ({ success: true, observations: { total: 48 }, forecasts: { total: 0 } }) }), /forecasts/)
})
test('complete ingestion succeeds and never follows credential-bearing redirects', async () => {
  const body = { success: true, ...Object.fromEntries(['observations','forecasts','generation','prices'].map(k => [k, { total: 48 }])) }
  const options = await runScript('ingest.mjs', {}, { ok: true, json: async () => body })
  assert.equal(options.redirect, 'error')
})
test('health checker fails an unhealthy deployment', async () => {
  await assert.rejects(runScript('check_health.mjs', {}, { ok: false, status: 503 }), /freshness check failed/)
})
