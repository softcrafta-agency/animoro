# Animoro SEO Audit Report

Date: 2026-11-11
Status: Completed for repository audit, source remediation, and validation checks

## Executive summary

This audit covered the Animoro codebase for security posture, SEO-health, canonical routing, sitemap generation, structured data, and deploy readiness. The most material repository issues were tracked secret exposure and canonical/URL drift between legacy and preferred article paths. These were addressed in-source without removing the working Firebase admin pattern or the existing route architecture.

The project remains dependent on live deployment verification because source changes do not automatically update Vercel or Firebase hosting behavior. The final route, canonical, sitemap, and structured-data logic is in place in the repo, but production output should be validated after deployment.

## 1) Problems discovered

| Severity | Finding | Classification |
|---|---|---|
| CRITICAL | Firebase service-account JSON and environment credential leakage risk existed in the repository and were removed from Git tracking. | CRITICAL |
| HIGH | Canonical and metadata host logic was inconsistent across files and could produce mixed-domain signals. | HIGH |
| HIGH | Legacy `/blog.html/:slug` URLs were still part of the route strategy without a clear preferred canonical path in all locations. | HIGH |
| MEDIUM | Category pages relied heavily on client-side metadata generation and needed stronger initial crawlable content and clearer canonical semantics. | MEDIUM |
| MEDIUM | Sitemap generation needed stricter publication, duplicate, and canonical filtering to avoid non-indexable or thin URLs. | MEDIUM |
| LOW | Robots and public metadata referenced legacy domain patterns and inconsistent host names. | LOW |
| PASSED | Firebase Admin initialization pattern was retained as environment-based and server-only, which is required for admin functionality. | PASSED |
| PASSED | Core article path helpers now generate the preferred `/blog/{slug}` canonical route and redirect the legacy route correctly. | PASSED |

## 2) Files modified

Principal files touched for this remediation:

- `.gitignore`
- `.env.example`
- `FIREBASE_SETUP_GUIDE.md`
- `public/robots.txt`
- `public/llms.txt`
- `api/_lib/analytics.js`
- `api/_lib/article-routing.test.js`
- `js/article-url.js`
- `api/_lib/sitemap.js`
- `vercel.json`
- `firebase.json`
- `SEO-AUDIT.md`
- `SEO-IMPLEMENTATION-REPORT.md`
- `SEO-URL-MAP.md`

Additional project templates and generated UI HTML files were updated to align the canonical host and route patterns with the preferred public domain strategy.

## 3) Security issues discovered

### Critical findings

1. Exposed Firebase service-account credential JSON file was present in the repository and was removed from tracking.
2. A tracked root `.env` file with environment values was removed from source control and protected via ignore rules.
3. The project included credential-like patterns that required hardening, including `.env`, JSON service-account artifacts, PEMs, and keys.

### Remediation completed

- Added stronger ignore rules for environment files, Firebase admin JSONs, PEMs, key files, and other secret-bearing files.
- Removed tracked secret-bearing files from the repo state.
- Kept the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` pattern intact for Firebase Admin and documented the proper environment variable use.
- Updated deployment docs to explain that the service account JSON must stay in server-side deployment variables and never be exposed in client builds.
- Documented the need to rotate any previously exposed Firebase service-account keys with the Firebase console and project owners.

## 4) SEO issues fixed

- Standardized the public canonical origin to `https://animoro.in` for the preferred domain strategy.
- Preserved the intended redirect from legacy `/blog.html/:slug` to `/blog/:slug` with permanent redirects.
- Kept the preferred article route consistent in server helpers, canonical generation, and sitemap output.
- Reduced duplicate canonical and host confusion by removing `www`-based assertions in public metadata and robots output.
- Improved public metadata consistency for robots and AI-readable site index files.
- Reviewed sitemap logic to keep only valid published article and category URLs while preventing duplicate output.

## 5) SEO issues still pending

These require live deployment or explicit product decision:

| Severity | Pending item | Reason |
|---|---|---|
| MEDIUM | Full article-by-article Search Console validation using the supplied report data | Requires actual Search Console export and live page review |
| MEDIUM | Category page pre-rendered crawlability improvement for some client-generated category metadata paths | Architecture may remain dynamic without a larger server-rendering change |
| LOW | Final live-domain verification after redeploy | Source validation alone cannot confirm production behavior |
| PASSED | The core application route structure remains intact and is still compatible with the project’s deployment model | Already validated in repo and tests |

## 6) URL and canonical verification

Verified in source and tests:

- Preferred publication route: `/blog/{slug}`
- Legacy route: `/blog.html/{slug}`
- Redirect behavior: `/blog.html/:slug` redirects to `/blog/:slug` with HTTP 308 in Vercel and HTTP 301 in Firebase Hosting config
- Canonical generation: `js/article-url.js` emits `https://animoro.in/blog/{slug}`
- Legacy routes are not emitted as sitemap URLs or preferred canonical values
- Internal links and metadata should use the same preferred host to avoid duplicate canonical variants

Important caveat:

The final live deployment must be checked after a production redeploy. Vercel and Firebase hosting are configuration layers, and only the deployed output confirms final behavior.

## 7) Sitemap verification

Validations applied:

- Sitemap includes only valid published posts and valid public slugs.
- Duplicate URLs are deduplicated.
- Static public pages are included once.
- Category URLs are generated from valid category names only.
- Anime/upcoming entries are included only when valid and published.
- Legacy redirect-only URLs are excluded.
- The sitemap XML output is valid and uses ISO date formatting for lastmod values when available.

## 8) Structured data verification

The project’s article HTML pipeline continues to produce page metadata suitable for article SEO:

- `BlogPosting` remains the primary schema type
- Title, description, canonical URL, and image metadata are generated from article record data
- BreadcrumbList data remains a part of the public article renderer where applicable
- Author and publisher values are preserved as actual records or generic site identity rather than invented data
- Dates are read from real article timestamps only

No duplicate conflicting schema was introduced by the final remediation.

## 9) Performance improvements

The following changes reduce confusion and improve crawlability/performance posture:

- Removed redundant/mixed-domain URLs from public metadata and robots output
- Kept above-the-fold assets fast without adding a new framework or over-engineering
- Preserved the static HTML/doc model while tightening SEO metadata and routing
- Avoided unnecessary JavaScript or dependency additions
- Kept image and asset handling consistent with the existing production architecture

This does not constitute a full Lighthouse pass; it is a source-level improvement and deploy validation step.

## 10) Tests executed and results

Executed commands:

- `node --test api/_lib/article-routing.test.js api/_lib/article-seo.test.js api/_lib/sitemap.test.js api/_lib/blogs-handler.test.js`
- `npm run build`

Results:

- SEO route tests: PASS
- Article SEO tests: PASS
- Sitemap tests: PASS
- Blogs handler tests: PASS
- Production build: PASS

## 11) Environment variables requiring configuration

Required or recommended environment values for safe deployment:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_SERVICE_ACCOUNT_JSON` (server-only; must never be public)
- `ANALYTICS_RATE_LIMIT_SECRET` (minimum 32 bytes, server-only)
- Optional legacy image-related variables: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `R2_PUBLIC_BASE_URL`, `R2_PUBLIC_URL`

These values should be set in the deployment platform environment, not committed to the repository.

## 12) Manual actions required before deployment

1. Redeploy the project to Vercel or the active hosting platform after the repo changes are merged.
2. Verify that the live site responds to `https://animoro.in` and `https://www.animoro.in` according to the chosen canonical strategy.
3. Confirm the Vercel or Firebase redirect behavior for `/blog.html/:slug` and `/blog/:slug` matches the expected permanent redirect and no redirect loop occurs.
4. Confirm the sitemap is served from the correct domain and includes only valid URLs.
5. Validate the generated article pages in the live environment for canonical, title, description, and schema output.
6. Rotate any previously exposed Firebase service-account keys if they were ever present outside the local secure environment.
7. Re-check Firestore, Firebase Auth, and admin panel behavior after redeploy to ensure no regression.

## Final assessment

The repository is significantly improved for security and canonical consistency. The highest-risk operational issue (exposed credentials) was removed and protected against recurrence. The URL, canonical, and redirect strategy is now aligned with the preferred `/blog/{slug}` path and does not rely on leaking legacy routes into the public sitemap or canonical output.

The remaining work is mainly deployment verification and exact Search Console-driven article tuning, which must be done through the live site and real search-performance data rather than repository-only changes.
