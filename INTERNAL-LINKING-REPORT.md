# Animoro Internal Linking Report

**Audit date:** 2026-11-24  
**Evidence:** Live sitemap crawl, browser-rendered representative pages, and source review. No Search Console click or orphan-page data was available.

## Current linking paths

| From | Existing links and destinations | Assessment |
|---|---|---|
| Global header/footer | Shared links to Home, Anime List, Comics & Webcomics, Upcoming Anime, Anime News, Articles, My List, and Anime Airing Today. | Consistent routes; `/anime.html`, `/anime-airing-today`, `/articles`, and `/anime-news` are legacy/alias routes, not duplicate destinations in the sitemap. |
| Homepage | Featured and latest article cards link to published `/blog/{slug}` pages and the article archive. | Homepage contains no airing section, by prior request; keep that separate from the calendar. |
| Article archive/category archive | Article cards link to published articles; category archives use category query URLs and pagination. | Category archive pages are contextually useful, but category metadata depends on JavaScript in the live route. Direct `/api/seo-page?type=category...` returned 503 in this audit. |
| Article detail | Breadcrumbs link Home, Articles, and article categories. Up to four validated, published, deduplicated related article cards are rendered. If a valid `animeSlug` is stored, the article also links to that anime detail. | Strong editorial paths. Related cards are capped and filtered to valid published slugs. |
| Anime List | Filtered catalog cards link to `/anime/{slug}`. The guide section links to Upcoming Anime, Anime Airing Today, Anime News, the article archive, About, and Contact. | Good discovery paths. A representative anime detail returned HTTP 200 with a self-canonical. |
| Anime detail | The client can add up to six related published articles based on title/tag matching across a sample of 36 published posts. | Useful but heuristic: the query has no explicit publication-date ordering and may miss relevant articles outside its sample. Prefer the explicit `animeSlug` relationship when available; retain the heuristic only as a fallback. |
| Anime calendar | Each Tenrai weekly listing links to its anime detail route; editor-published episode schedules are separately labeled. | Contextually relevant links and explicit schedule-source caveats were visible after the schedule loaded. |
| Upcoming Anime | Tenrai upcoming cards link to `/anime/{slug}`, not `/upcoming-anime/{slug}`. | The directory and anime detail routes have distinct roles. Preserve the current route policy unless published Firestore upcoming records establish a separate detail intent. |
| Comics & Webcomics | Featured/list cards link to comics detail routes; detail pages provide breadcrumbs and similar recommendations. | AniList/MangaDex attribution and official-platform limitations are visible. Dynamic detail metadata is correct after client rendering but generic in initial HTML. |

## Verification

- The live sitemap contained 35 URLs; every sitemap URL returned HTTP 200.
- Article pages generally exposed 31 raw same-origin links / 16 unique targets; the character-ranking article exposed 33 / 17. Counts include shared navigation and breadcrumbs, so they are not measures of editorial-link quality.
- The sitemap snapshot contained no `/anime/{slug}` or `/upcoming-anime/{slug}` detail URLs, despite the catalog, calendar, and Upcoming Anime pages rendering links to anime detail routes. The sitemap generator includes published Firestore anime/upcoming records but does not enumerate the Tenrai catalog. The records may still be discoverable via internal links; GSC URL Inspection is required to assess actual indexing.
- No confirmed broken internal link or redirect chain was found among the crawled sitemap URLs and tested aliases. This was not an exhaustive status check of every client-generated catalog link.
- Google `site:` queries were JavaScript-gated; orphan status cannot be established without Search Console data and a full rendered link crawl.

## Recommended actions

1. **High:** Verify the deployed sitemap strategy for Tenrai anime details. Add only valid, canonical public records using a bounded source, or document that internal crawling is the intended discovery path. Do not dump an unbounded upstream catalog into the sitemap.
2. **High:** Confirm deployed category SEO rendering/indexes. Ensure each category response exposes its unique H1, title, description, self-canonical, and crawlable article links before relying on JavaScript rendering.
3. **High:** Ensure Manhwa detail pages return title-specific metadata and canonical in the first HTML response or a reliable prerender path.
4. **Medium:** Use verified article `animeSlug` relations for anime-detail recommendations; make title/tag matching a fallback so older relevant articles are not silently omitted.
5. **Medium:** Add contextual links from filler/watch-order guides to the relevant anime detail, calendar, and related story guide; use descriptive but natural anchors.
6. **Medium:** Link new Manhwa/Webcomics guides to the existing catalog/detail routes, preserving official-source attribution.
7. **Ongoing:** Recheck destination status and canonical after each published route change. Keep category, archive, and detail links pointed at current canonical paths.

No page is labeled orphaned solely from this crawl. Search Console links/coverage and a complete browser-rendered crawl remain **PENDING**.
