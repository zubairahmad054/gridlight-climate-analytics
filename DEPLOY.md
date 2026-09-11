# Deployment runbook

The current deployment and scheduling instructions are in
[docs/publishing.md](docs/publishing.md).

Use the new Gridlight repository as an independent Next.js Vercel project.
Do not copy private environment files into Git. Do not run database migrations
inside a Vercel build. The original database is shared with the legacy project,
so coordinate its scheduled-writer handover before enabling the new jobs.

Status on 11 September 2026: additive migrations 006 and 007 are applied;
the new Vercel project and production workflow activation still require setup.
