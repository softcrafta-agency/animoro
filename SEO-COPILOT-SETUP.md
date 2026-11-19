# SEO Copilot setup and rollback

## Configure the server

1. Create a Groq API key and choose a currently supported production model from the [Groq model catalog](https://console.groq.com/docs/models).
2. Set `GROQ_API_KEY` and `GROQ_MODEL` in the Vercel server environment. The API checks the configured model against Groq's model catalog; model IDs are intentionally not embedded in the application.
3. Optionally set `GROQ_INPUT_COST_PER_MILLION` and `GROQ_OUTPUT_COST_PER_MILLION` to current account pricing. Without both values, token usage is still recorded but estimated cost is shown as unavailable.
4. Optionally configure Search Console with `GSC_SERVICE_ACCOUNT_JSON` and `GSC_SITE_URL`. Grant the service account read access to that exact URL-prefix or domain property. Search Console remains unavailable when either setting or property access is missing; the Copilot does not infer impression, click, CTR, or position data.
5. Set `SEO_COPILOT_RATE_LIMIT` if the default of 20 analyses per administrator per 10-minute window needs adjustment. Avoid `VITE_` prefixes: all Groq and Search Console credentials must remain server-only.
6. Deploy the updated Firestore rules, indexes, and TTL field overrides with the repository's existing Firebase deployment process. TTL deletion of cache and rate-limit records is optional cleanup, not part of correctness.

The API also requires the existing Firebase Admin server credential configuration and admin authorization used by the other server APIs. Keep every service credential in the deployment secret store.

## Data and migration behavior

- No article, view, Search Console, or legacy keyword records are deleted or migrated.
- Existing SEO titles, descriptions, canonical URL generation, structured data, sitemap generation, and publishing remain independent of Copilot analysis.
- New analysis, recommendation, cache, and rate-limit records use separate `seo_analyses`, `seo_recommendations`, `seo_copilot_cache`, and `seo_copilot_rate_limits` collections.
- Client Firestore access to those collections is denied; the admin-authenticated API uses the server Admin SDK.
- Existing primary/secondary and grouped keyword UI and editor heuristic analysis are removed. Bulk edits and article saves no longer write those manual keyword values. Public readers continue to receive any historical fields as stored.
- A new unsaved editor uses an opaque temporary article ID. On its first successful save, the authenticated API links its analysis history and recommendation decisions to the persisted article. If this linking request fails, the article remains saved and the editor reports the history-linking issue.
- Article view totals come from the existing `posts.views` counter. Recent trends use consented `analytics_events` records of type `page_view`; these can be incomplete when visitors decline analytics. They are never presented as Search Console metrics.

## Rollback

1. Disable the Smart SEO Copilot navigation/panel or revert the application deployment to the previous version.
2. Remove the Groq and optional Search Console environment variables to disable external analysis.
3. Restore prior Firestore rules/index configuration only if necessary for the former application version.
4. Keep all `seo_*` records and legacy article keyword fields. They are independent of article publishing and can be retained for later recovery; do not delete collections as part of rollback.

The Groq analysis is advisory, uses a six-hour content cache, and is never published or inserted into article content without an explicit editor action.
