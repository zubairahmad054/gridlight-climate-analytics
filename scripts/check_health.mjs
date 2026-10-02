const url = new URL(process.env.APP_URL || 'https://invalid.local');
if (url.protocol !== 'https:' || url.hostname === 'invalid.local' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must be the production HTTPS origin');
const headers = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const result = await fetch(new URL('/api/health', url), { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
const body = await result.json().catch(() => {
  throw new Error(`Pipeline freshness check failed: HTTP ${result.status}. Health endpoint returned invalid JSON.`);
});
if (!result.ok || body.status !== 'healthy') {
  // Log only known check names; never echo response bodies or URLs.
  const channels = ['observations', 'model', 'official', 'generation', 'prices', 'analytics', 'training_history'];
  const stale = channels.filter(key => body.checks?.[key]?.fresh === false);
  const details = stale.length ? ` Stale channels: ${stale.join(', ')}.` : '';
  throw new Error(`Pipeline freshness check failed: HTTP ${result.status}.${details} Inspect /api/health and the Vercel logs.`);
}
console.log('All operational data freshness checks passed');
