const url = new URL(process.env.APP_URL || 'https://invalid.local');
if (url.protocol !== 'https:' || url.hostname === 'invalid.local' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must be the production HTTPS origin');
const headers = {};
if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const result = await fetch(new URL('/api/health', url), { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
if (!result.ok) throw new Error(`Pipeline freshness check failed: HTTP ${result.status}. Inspect /api/health and the Vercel logs.`);
const body = await result.json();
if (body.status !== 'healthy') throw new Error('Pipeline is not healthy');
console.log('All operational data freshness checks passed');
