# Animoro SEO implementation report

## Homepage and Anime List follow-up (source review 2026-11-03)

This follow-up implements the provided Rankify recommendations in the existing website. The original Rankify report exports were not available, so the scores below are the user-provided baseline, not a new measurement. No production deployment or post-deployment Rankify recheck was performed.

| Target | User-provided baseline | Source implementation |
|---|---|---|
| Homepage | SEO 83, GEO 67, AEO 70 | Added a concise site description, connected links to the existing main sections, consistent Organization/WebSite identity, SearchAction for the working site search, and visible FAQ content matching its FAQPage data. |
| Anime List (`/anime-list`) | SEO 87, GEO 53, AEO 28 | Added a 50–60 character title, answer-first definition and browse guidance, source attribution, visible FAQ content with matching schema, collection/breadcrumb data, and result-backed ItemList data only when actual anime results are rendered. |

### Other implementation changes

| File(s) | Change |
|---|---|
| `js/anime-page-seo.js`, `js/anime.js` | Generate collection and breadcrumb data for the list; create an ItemList only from the actual displayed results. Remove list-specific schema and guide/FAQ visibility on anime detail routes. |
| `api/_lib/article-html.js` | Display Animoro as the publisher, display only stored publication/update dates, and emit `dateModified` only when a valid stored update is later than publication. Existing article URLs and stored data are unchanged. |
| `about.html` | Align publisher and FAQ copy with verifiable site sections; remove unsupported editorial/founding claims. |
| `public/llms.txt` | Add an AI-readable site index using implemented routes. Vite build output confirmed the file is copied to `dist/llms.txt`. |
| Static HTML templates, `js/auth-nav.js` | Add intrinsic width and height to static image elements and the dynamically populated profile avatar; retain existing alt text and image assets. |
| `css/style.css` | Style the added Anime List guide and FAQ using existing site conventions. |
| SEO-related tests | Cover homepage and list structured data/content, About FAQ consistency, article dates/publisher, and route expectations. |

### Evidence, limitations, and validation

- Tenrai is identified as the data provider; the Anime List does not claim an unavailable external-data refresh timestamp. A stale-cache notice is shown when the existing cache path is used.
- Publisher identity is Animoro; no person, credentials, publication dates, ratings, or data-refresh dates were invented.
- The working search URL supports the homepage `SearchAction`.
- Existing sitemap generation already limits dynamic article/anime/upcoming entries to published records. Existing canonical routes, robots policy, Firebase/Firestore access rules, and integrations were preserved.
- The article template is server-rendered in `api/_lib/article-html.js`; anime directory/detail metadata is client-rendered in `js/anime.js`. No separate `seo-pages.js` or `seo-renderer.js` implementation was found.
- Validation after these changes: full tests **185 passed, 0 failed**; `npm run lint` passed; `npm run build` passed; all 19 static HTML templates checked had `alt`, `width`, and `height` on every static `<img>`; build output contains `dist/llms.txt`; CRLF-aware `git diff --check` passed.
- The production build still reports the existing `auth` chunk at approximately 891 kB minified. This audit did not restructure authentication or dependencies; no Lighthouse, mobile-browser, Core Web Vitals, or external structured-data validation was run.
- Current production deployment and the original Rankify reports were not independently verified. Do not treat these source changes as live until deployed and rechecked.

**Date:** 2026-10-13  
**Scope:** Evidence-based updates to existing templates, metadata rendering, and anime publishing fields. Existing routes, Firebase integration, publication states, and stored slugs were preserved.

## Deployment status — verified 2026-10-13

The changes below exist in the current worktree. **No deployment was performed; several source changes are not live.**

| Change | Source | Production |
|---|---|---|
| Homepage H1 | Implemented in `index.html` | Not deployed: live homepage HTTP HTML has no H1. |
| Article heading normalization | Implemented in `api/_lib/article-html.js` | Not deployed: tested published article still has two H1s. |
| Anime SEO editor fields | Added to existing admin form and save/load code | Unverified: live anime directory reports no published profiles; no detail page was available. |
| Anime OG/Twitter images | Source selects HTTP(S)-scheme-validated banner then cover | Unverified: no live detail profile to exercise the path; image reachability was not checked. |
| Category Twitter metadata | Added in template and category JavaScript | Not deployed: rendered category has dynamic title/description/query canonical but lacks Twitter metadata. |
| Search/list robots allow | Source removes both `Disallow` directives | Not deployed: live robots response still disallows `/search.html` and `/my-list.html`. |
| Sitemap | No source change | Verified HTTP 200, canonical `www` host; article/category entries and no anime/upcoming detail URLs in this snapshot. |

No access policy, authentication, Firebase integration, or Firestore rules were changed.

## Changes made

| File | Change |
|---|---|
| `index.html` | Promoted the existing “Latest Articles” heading to H1; same text, class, and layout. |
| `api/_lib/article-html.js` | Normalize H1 tags authored in article body HTML to H2 during safe output rendering, so the page title is the document’s single H1. Stored article content is unchanged. |
| `api/_lib/article-html.test.js` | Updated heading expectations and asserted that sanitized article-body HTML contains no H1. |
| `category.html` | Added base Open Graph title/description and Twitter card/title/description tags. |
| `js/category.js` | Set category-specific Twitter card/title/description to match existing category title, description, canonical, and Open Graph values. |
| `admin.html` | Added optional anime SEO title and description controls. |
| `js/admin-anime.js` | Load and save the optional anime SEO fields without changing slug or publication behavior. |
| `js/anime.js` | Use a validated banner-or-cover image for anime Open Graph and Twitter image metadata. |
| `public/robots.txt` | Allow crawling of the existing `noindex` search and user-list pages so crawlers can observe their page-level exclusion; retain admin/API disallows. |
| `SEO-AUDIT.md` | Recorded scope, evidence, findings, priorities, indexability, structured data, and verification limits. |
| `SEO-URL-MAP.md` | Documented current live sitemap URLs and intentionally excluded route families. |
| `SEO-IMPLEMENTATION-REPORT.md` | This change and validation record. |

## URL and publishing safety

- No routes, URL formats, canonical hosts, article slugs, redirects, or sitemap URL patterns were changed.
- Article SEO fields and article publishing behavior remain unchanged. Anime SEO fields are optional and saved to the existing anime records.
- Upcoming-anime pages remain authenticated and `noindex, nofollow`; no public exposure, new route, or sitemap entry was added.
- No reviews, ratings, facts, release dates, keyword rankings, or article answer copy were fabricated.
- Existing category-based related-article links, article-to-anime links, and anime-to-related-article links remain unchanged.

## Validation

- Production response checks: homepage, representative article, anime directory, category archive, upcoming-anime template, anime calendar, search, user list, and a nonexistent top-level path. The homepage response still has 0 H1 elements.
- Host redirect: apex to `www`, HTTP 308.
- Production `robots.txt`: HTTP 200; sitemap directive points to `https://animoro.in/sitemap.xml`; search/list disallows remain live. The local source allow change is not deployed.
- Production sitemap: HTTP 200 XML; URLs use the canonical `www` host. Published article/category routes were present; anime and upcoming-anime detail routes were absent.
- Browser-rendered category check: dynamic title, description, H1, and query canonical are present; new Twitter metadata is absent in production.
- Category browser check logged a missing composite-index warning and then used the existing fallback query to render category articles; no index or Firestore rules were changed.
- Browser-rendered anime directory check: client page reports no published anime entries; a detail page could not be inspected.
- Browser-rendered article check: page metadata and structured data are present, but the live document still has two H1s; the local correction is not deployed.
- Full automated test run: `node --test` — **39 passed, 0 failed**.
- TypeScript check: `npm run lint` — **passed**.
- Production build: `node_modules\.bin\vite build --outDir=dist-seo-continuation-check --emptyOutDir` — **passed** in an isolated temporary folder, which was removed after validation. Vite reported the 891.73 kB minified `auth` chunk (219.42 kB gzip) warning; no performance score was measured.
- Diff whitespace check: CRLF-aware Git check — **passed**.

## Remaining work / limits

1. Search Console Pages and Queries exports were not present. This report cannot rank URLs by impressions, clicks, CTR, queries, or coverage signals. Supply both exports and date range to complete data-led URL prioritization.
2. No mobile browser, Lighthouse, PageSpeed Insights, or field Core Web Vitals run was available. Mobile performance measurements remain unverified. The large auth chunk should be investigated with route-level loading data before deciding whether to split it.
3. Anime detail SEO metadata and page content are populated client-side. No published records were available to inspect a live detail page. Verify after a profile is published; no Google-rendered HTML inspection was performed.
4. The upcoming-anime surface is intentionally excluded under its current authentication and noindex behavior. Confirm whether that content should become publicly accessible/indexable before changing the access model, robots directives, canonical policy, or sitemap.

## Advanced Organic SEO Audit (2026-11-24)

This section supersedes earlier route observations where they conflict with the current live crawl. In particular, `/upcoming-anime` is currently public, indexable, and present in the sitemap; the prior statement that it is authenticated/noindex is historical and not current production behavior.

### Executive summary

- The live sitemap contains 35 URLs: 10 static/collection routes, 7 category archives, and 18 published articles. All 35 returned HTTP 200.
- `/anime.html` already redirects permanently to `/anime-list`. `/anime-list` and `/anime-calendar.html` serve distinct catalog vs schedule intents. The homepage has no airing section, consistent with the earlier request.
- Category metadata and Manhwa detail metadata become unique after browser JavaScript runs, but their initial HTML remains generic. The direct category SEO API returned 503; the public category route itself returned 200 and rendered correctly. Verify deployed SSR/routing/index behavior.
- Anime List, calendar, and Upcoming Anime expose Tenrai detail links, but the live sitemap snapshot contains no `/anime/{slug}` detail entries. The source sitemap uses published Firestore records and does not enumerate Tenrai records.
- Two focused source fixes were made: preserve ID-qualified anime slugs when building canonical paths, and identify Animoro article bylines as the existing Organization entity instead of `Person`.
- No Search Console export or reliable Google indexing evidence was available. No search volume, keyword difficulty, clicks, impressions, CTR, or position figures were invented.

### Implementation changes

| File/location | Original issue | Implemented change | Verification |
|---|---|---|---|
| [js/anime-url.js](./js/anime-url.js), `getAnimeSlug` | A valid `slug--MALID` value failed the base-slug-only validator. When the detail page initialized, canonical-path generation normalized the identifier into the title and appended the ID a second time. | Accept valid detail slugs as well as base slugs, preserving their canonical URL. | **FIXED in source.** Focused regression test added; Node/npm are unavailable, so execution is **PENDING**. Production remains unchanged until deployment. |
| [js/anime-page-seo.test.js](./js/anime-page-seo.test.js) | No regression test covered a detail slug already containing its stable ID. | Added a test for `/anime/oha-suta-dai-go-gakuen--65485` canonical preservation. | Test source reviewed; execution **PENDING** because Node is unavailable. |
| [api/_lib/article-html.js](./api/_lib/article-html.js), BlogPosting author | Live article data uses `Animoro`/`animoro` bylines, but the renderer typed every non-empty byline as `Person`. | Map the Animoro brand byline to the existing `https://www.animoro.in/#organization` entity. Keep other named bylines as `Person`; no author names were changed. | **FIXED in source.** Focused test added; execution **PENDING** because Node/npm are unavailable. |
| [api/_lib/article-html.test.js](./api/_lib/article-html.test.js) | No assertion covered organization vs person authors. | Assert that Animoro links to the Organization entity and an individual remains a Person. | Test source reviewed; execution **PENDING**. |
| [SEO-URL-INVENTORY.md](./SEO-URL-INVENTORY.md) | No current, route-level inventory tied to the latest live sitemap/browser evidence. | Added 35-page inventory, inferred intent, metadata, canonicals, H1s, indexability, internal-link counts, dynamic-route notes, and cannibalization assessment. | **VERIFIED** against live responses/source; GSC/indexing evidence remains **PENDING**. |
| [SEO-METADATA-REPORT.md](./SEO-METADATA-REPORT.md) | No consolidated current metadata comparison and fact-check queue. | Added before/after candidates for stale/weak metadata while keeping Firestore-owned copy unchanged. | **VERIFIED** from live metadata. CMS edits are **PENDING** editorial approval/source checks. |
| [CONTENT-GROWTH-STRATEGY.md](./CONTENT-GROWTH-STRATEGY.md) | No de-duplicated content opportunity set grounded in existing pages. | Added nine intent-specific proposals with audience, phrases, length ranges, internal links, and fact-check/differentiation criteria. | **VERIFIED** as a strategy artifact; no content was auto-published. |
| [INTERNAL-LINKING-REPORT.md](./INTERNAL-LINKING-REPORT.md) | No current map of directory/article/category/detail linking. | Documented link paths, counts, sitemap gap, and prioritized link improvements. | **VERIFIED** for sampled live pages; exhaustive generated-link status crawl is **PENDING**. |
| [ANIMORO-30-DAY-SEO-ROADMAP.md](./ANIMORO-30-DAY-SEO-ROADMAP.md) | No staged, measurable implementation order. | Added a four-week roadmap with verification gates and no fabricated performance targets. | **VERIFIED** as a planning artifact. |
| [GSC-IMPORT-TEMPLATE.csv](./GSC-IMPORT-TEMPLATE.csv) | No Search Console CSV export was available. | Added a header-only import template; no sample metrics are populated. | **VERIFIED**; import awaits owner-provided exports. |

### Cannibalization, metadata and technical findings

- `/anime.html` → `/anime-list` is an existing 301; `/anime` → `/anime-list` is 308. No additional redirect is recommended.
- `/anime-calendar.html` is a schedule surface, while `/anime-list` is a searchable/filterable catalog. Keep both; the homepage does not contain an airing block.
- The “strongest villains” and “most powerful characters” articles have related but distinct scope and lists. Keep separate and make the scope explicit in H1/introduction.
- Category browser rendering updates title, description, H1, canonical, social metadata, and article links. Initial HTML is generic. A direct `/api/seo-page?type=category...` request returned 503; deployed Firestore indexes and function logs need review. The local index file includes category-related indexes, but production index state was not verified.
- Manhwa details are included in the sitemap and receive title-specific metadata after client data loads. Initial HTML uses the collection canonical/metadata. Reliable server/prerender metadata is a **PENDING** deployment/architecture improvement.
- The article set has 18 distinct titles and descriptions; descriptions are 113–160 characters. Editorial fixes are pending for the expired October 2026 list, keyword-list Itachi snippet, grammar errors in two H1s, and title/description alignment on Kagurabachi.
- `robots.txt` is accessible and disallows admin/API paths. Search and My List return `noindex, nofollow` and are excluded from the sitemap. Search Console access was not verified.
- Public aliases tested were single-hop. The 35 sitemap URLs all returned 200. This does not constitute a complete status check of every client-rendered external image or generated detail link.

### Structured data, analytics and performance

- Article pages expose `BlogPosting` and `BreadcrumbList`; homepage Organization/WebSite/SearchAction data and visible FAQ schemas were reviewed. The Animoro author-entity correction is described above.
- Category BreadcrumbList is created client-side and exists in the source SSR path; verify the deployed SSR response after the 503 is resolved.
- Existing first-party analytics is consent-based. No GA4/GTM Measurement ID was found or supplied; no duplicate analytics script was added. If GA4 is desired, the owner must supply the actual `G-...` ID and consent requirements.
- The existing performance report records ~891 kB Auth and ~155 kB Admin bundles. No current LCP/INP/CLS, Lighthouse, or PageSpeed measurements were available. Performance changes beyond prior measured logo payload reductions are not claimed.

### Validation and limitations

- **Live:** sitemap endpoint 200; 35 sitemap destinations returned 200; known redirects were single-hop; representative category, anime detail, calendar, upcoming list, article, and Manhwa detail rendered in the browser.
- **Observed production issue:** direct category SEO API response 503; category page route still rendered after client JavaScript. Investigate deployment logs/index state; no backend or Firestore query was changed.
- **Observed production issue:** before the local fix, a Tenrai detail link changed from `/anime/oha-suta-dai-go-gakuen--65485` to a duplicated-ID path during client startup. Source fix and regression test are not deployed.
- **Source checks:** `git diff --check` passed. Node/npm are unavailable in this environment, so automated tests, TypeScript lint, and build were not run for this change.
- **Not verified:** Google indexing/canonical selection, Search Console metrics, all generated links/images, browser console errors, deployed post-change routes, or current Core Web Vitals.

### Required follow-up

1. Run the focused and full tests, lint, and build in an environment with the project’s Node 22 toolchain; deploy after passing.
2. Verify production anime URL preservation and Article structured-data author type after deployment.
3. Resolve the category SSR 503 and compare raw/rendered category metadata; check the deployed Firestore indexes.
4. Decide whether and how to include valid Tenrai-linked anime details in the sitemap.
5. Refresh the October article and apply the editorial metadata fixes in the publishing workflow after sourcing.
6. Supply Search Console Pages/Queries exports and use URL Inspection for indexing/canonical evidence.
7. Measure current mobile/desktop LCP, INP, CLS and image requests before further performance changes.
