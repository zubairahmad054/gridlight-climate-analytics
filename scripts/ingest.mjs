// No secrets in logs; fail on redirects, HTTP errors and partial ingestion.
const app = new URL(process.env.APP_URL || 'https://invalid.local');
if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash || app.pathname !== '/' || app.hostname === 'invalid.local') {
  throw new Error('APP_URL must be the HTTPS production origin without credentials, query or path');
}
if (!process.env.INGEST_TOKEN) throw new Error('INGEST_TOKEN is required');
const headers = { Authorization: `Bearer ${process.env.INGEST_TOKEN}` };
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const response = await fetch(new URL('/api/ingest', app), {
  method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(65000),
});
if (!response.ok) throw new Error(`Ingestion failed: HTTP ${response.status}. Check deployment protection, schema and server logs.`);
const result = await response.json();
for (const channel of ['observations', 'forecasts', 'generation', 'prices']) {
  if (!(result[channel]?.total > 0)) throw new Error(`Ingestion incomplete: ${channel} returned no records`);
}
if (!result.success) throw new Error('Ingestion reported failure');
console.log('Ingested all four data channels successfully');
