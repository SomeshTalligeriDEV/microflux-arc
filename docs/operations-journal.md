# Operations Journal

This file tracks practical operational notes and deployment learnings.



- Journal initialized to keep deployment learnings practical and reusable.

- Confirm Render API availability with /health before debugging frontend behavior.

- Check SPA routing: static files must be served before fallback rewrite rules.

- Standardize frontend API root variable as VITE_API_URL for clarity.

- After frontend deploy, always test with hard refresh to bypass stale bundles.

- Validate Access-Control-Allow-Origin against expected production domains.

- Suggested smoke order: health -> UI load -> API call -> deep link route.

- Verify JS assets return application/javascript, not HTML fallback.

- Keep rollback plan ready before applying aggressive config edits.

- Vite env vars are build-time values; redeploy after env updates.

- Prefer curl -I and concise probes for quick deployment diagnostics.

- White-screen path: inspect HTML script tag -> fetch JS asset -> verify type.

- Require successful npm run build before shipping config changes.

- Track non-blocking warnings separately from true deployment blockers.

- Validate final alias/domain mapping right after production deployment.

- Keep one-line curl snippets handy for health and CORS verification.

- Use filesystem handling before catch-all route in Vercel SPA apps.

- Reproduce CORS checks locally to confirm behavior before server redeploy.

- Test deep links directly (e.g. /approve/<token>) in production.

- Confirm new deploy hash and asset URLs to avoid cache confusion.

- For low-risk updates, docs-only commits reduce accidental runtime impact.

- Keep commits scoped and readable; one concern per commit.

- Production validation matrix: availability, correctness, performance, recoverability.
