# Animoro SEO audit

**Audit date:** 2026-10-13  
**Production origin:** `https://www.animoro.in/`  
**Scope:** Repository source and configuration, production HTML/HTTP responses, `robots.txt`, and the live XML sitemap.  
**Search Console data:** No Pages or Queries export was present in the repository or workspace files inspected. Findings below are based on observed implementation and live responses, not Search Console performance claims.

**Deployment verification update (2026-10-13):** The source fixes below are present locally, but production still serves the old homepage/article heading output and robots rules. Category title, description, and query canonical are visible after browser rendering; its new Twitter metadata is absent. The live anime directory reports no published profiles, so no detail page was available to verify client-generated metadata.

**Article routing update (2026-10-22):** The source now generates `/blog/{slug}` links and canonicals, redirects the legacy `/blog.html/{slug}` route, and emits the new article route in the sitemap. These changes are local and require deployment before production behavior changes. The canonical host remains `www.animoro.in` because the apex domain permanently redirects there.

## Executive summary

The live site uses Vercel for public delivery, static HTML templates with Firebase client rendering for anime directories/details, and a server-rendered Vercel function for article pages. `www.animoro.in` is the canonical host; requests to `animoro.in` return HTTP 308 to `www`. The live sitemap is served successfully at `/sitemap.xml`.

The confirmed content-structure issues were a missing homepage H1 and multiple H1 elements on a published article. Corresponding source fixes exist but are not deployed. Optional anime SEO title/description fields are also present in source but could not be verified on production.

## Findings and actions

| Priority | Finding and evidence | Action / status |
|---|---|---|
| High | The production homepage had no H1 in its HTML. Its first major content heading was “Latest Articles”. | Promoted that existing heading to H1, retaining its text, class, placement, and appearance. |
| High | A live published article contained the page-title H1 plus a second H1 in the article body. | Article-body H1 elements are now rendered as H2, leaving the article title as the single page H1. Editor content is not rewritten in Firestore. |
| Medium | Anime detail metadata already supported `seoTitle` and `seoDescription`, but the anime admin form did not expose or save those fields. | Added optional admin fields and persistence. Anime metadata continues to fall back to the title and synopsis when editors leave them blank. |
| Medium | Anime detail Open Graph image metadata used the raw cover URL and had no Twitter image tag, despite safe image URL handling elsewhere. | Metadata now selects a validated banner image or cover image for Open Graph and Twitter; malformed/unsupported values are not added. |
| Medium | Category metadata was updated by client code, but category pages did not set Twitter title/description/card metadata. | Added matching Twitter tags to the base template and category-specific client metadata. The canonical remains the existing category query URL. |
| Review before changing policy | Upcoming-anime pages carry `noindex, nofollow`; the browser code requires sign-in, Firestore reads require an authenticated user, and those URLs are omitted from the sitemap. | Left this behavior intact. Exposing these pages to search would require an explicit access/indexing decision and coordination with Firestore rules; it is not safe to remove the directives alone. |
| Unable to prioritize | No Search Console Pages/Queries exports were available. | URL prioritization by impressions, clicks, CTR, or query data remains pending. No performance values or keyword priorities were inferred. |

## Technical review

### Routing, canonical URLs, and status

- At the time of the 2026-10-13 production inspection, public article URLs used `/blog.html/{slug}` and were server-rendered by `api/article.js`; the rendered canonical URL matched the requested article URL. Article HTML included a canonical, Open Graph/Twitter metadata, `BlogPosting`, and `BreadcrumbList`.
- Anime detail URLs use the existing `/anime.html/{slug}` route. Client code sets title, description, canonical, social metadata, and `TVSeries` JSON-LD after loading a published Firestore record. The initial HTTP response is the shared HTML template, so the per-anime metadata is not present until JavaScript runs.
- Category pages use `/category.html?category=...`; client code sets category-specific title, description, canonical, and social metadata. The sitemap uses these same query URLs.
- The sitemap and page canonicals use `https://www.animoro.in`. The apex host returned a permanent 308 redirect to `www`.
- Representative production checks returned HTTP 200 for the homepage, article, anime/category directories, and static informational pages; `/sitemap.xml` and `/robots.txt` returned 200. A nonexistent top-level path returned 404 with `noindex, nofollow`.
- The article handler has automated coverage for missing/unpublished articles returning 404. Browser-executed status behavior for unknown anime slugs was not tested in this audit.
- At the time of the 2026-10-13 audit, no existing page URL or route had been renamed, introduced, or migrated.

### Indexability and crawl directives

- Production `robots.txt` allows public crawling and points to the live sitemap, but still disallows `/my-list.html` and `/search.html` even though both pages declare `noindex`. The current source removes these two disallows; that source change is not deployed.
- Search, account/list, and admin surfaces are marked `noindex` in their page templates where applicable. Admin/API paths remain disallowed. Production currently prevents crawlers from observing the search/list `noindex` tags; the source adjustment must be deployed and rechecked before that changes.
- The upcoming-anime template is also `noindex, nofollow`, requires authentication in its browser initializer, and has no sitemap entries. This is internally consistent with the current access model and was deliberately preserved.
- The live sitemap contains canonical static pages, categories with published articles, and published articles. No anime detail or upcoming-anime URLs appeared in this response. The source sitemap implementation filters to published records.
- Anime detail content and metadata load client-side. Browser inspection found no published anime records in the directory, so final detail metadata, canonical, and JSON-LD remain unverified in production.

### Titles, descriptions, headings, and social metadata

- Static public pages inspected generally have distinct titles and descriptions. The article template generates per-article metadata from editor-provided SEO values, then falls back to the article title/excerpt.
- Source anime pages use authored SEO values when available and otherwise use title/synopsis. Admin controls for those values are present locally; production runtime is unverified due to no published profile.
- Rendered production category metadata includes dynamic title, description, and query canonical. Category-specific Twitter metadata exists in source but is absent from the live page.
- The rendered `Anime News` category logged a missing Firestore composite-index warning for its ordered category query, then loaded articles through the existing fallback query. This fallback works in the observed session; query/index performance was not benchmarked.
- Article title, excerpt, and body content remain authored. No generic answer copy or factual claims were added. Where an article directly answers a question, editors can lead with a concise answer in their existing content; the implementation does not auto-generate an answer block.
- The existing article renderer creates related-article links by category and a related-anime link when a valid published anime profile is associated with the post. Anime profiles already select related published articles by explicit anime slug, title, and tags.
- The upcoming-anime surface is authentication-gated and noindex, so it was not given additional crawl-oriented cross-links.

### Structured data and images

- The homepage includes `WebSite` structured data with a `SearchAction` and publisher information.
- Article output includes `BlogPosting` and `BreadcrumbList` structured data. Existing tests exercise the rendered structure.
- Anime profile pages add `TVSeries` structured data client-side from available profile fields. No review/rating, release-date, or other unsupported structured data was added.
- Article covers are eagerly loaded with dimensions and high fetch priority; article-body and related-card images use lazy loading and async decoding. Anime and upcoming cards also set dimensions and lazy loading; detail covers load eagerly.
- Article image upload flows already compress covers/embedded images and store image metadata; this work did not change image storage or publishing behavior.
- The production build reports a minified `auth` JavaScript chunk of 891.73 kB (219.42 kB gzip), above Vite's 500 kB warning threshold. This is a build-time bundle observation, not a measured page transfer or Core Web Vitals result; assess route-level loading before considering a code-splitting change.

### Mobile performance and validation limits

- Source inspection confirms responsive CSS is bundled, and common content cards use lazy-loaded images with width/height attributes. Main article covers intentionally load eagerly because they are the primary content image.
- No mobile browser session, Lighthouse run, PageSpeed Insights report, or field Core Web Vitals report was available. Mobile layout behavior, LCP/INP/CLS measurements, and performance scores therefore remain unverified; no score is claimed.

## URL priorities pending Search Console

The confirmed technical fixes above were selected from reproducible production/source evidence, not inferred traffic data. To prioritize existing URLs by search demand and coverage, supply the Search Console **Pages** and **Queries** exports (include the export date range and property). See [SEO-URL-MAP.md](./SEO-URL-MAP.md) for the current route inventory.

## Deployment verification update — 2026-10-13

The earlier “Action / status” descriptions refer to local source changes, not live production. No deployment occurred during this verification.

| Check | Local source | Production result | Status |
|---|---|---|---|
| Homepage H1 | Existing “Latest Articles” is H1 in `index.html`. | HTTP 200 response has 0 H1 elements. | Not deployed |
| Article heading hierarchy | Article body H1 tags are converted to H2 in `api/_lib/article-html.js`. | Tested published article still has 2 H1 elements. | Not deployed |
| Anime SEO fields | Existing admin form has optional title/description controls and save/load logic. | Browser-rendered anime directory reports no published entries; no detail record is available. | Source present; production behavior unverified |
| Anime OG/Twitter images | Source selects an HTTP(S)-scheme-validated banner or cover. | No published detail record is available to verify image tags or image reachability. | Source present; production behavior unverified |
| Category Twitter metadata | Base template and client code set Twitter fields. | Rendered category has dynamic title, description, and query canonical, but no Twitter card/title/description. | Not deployed |
| Search/list crawl visibility | `public/robots.txt` no longer disallows these `noindex` routes. | Live `robots.txt` still disallows `/search.html` and `/my-list.html`. | Not deployed |
| Sitemap | No local sitemap change. | HTTP 200, canonical `www` host, current article/category URLs; no anime/upcoming detail URLs. | Verified for this snapshot |

Upcoming anime remains authenticated, noindex, and excluded from the sitemap in both source and production observations. No access or Firestore rules were changed.
