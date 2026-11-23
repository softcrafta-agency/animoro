# Animoro 30-Day SEO Roadmap

**Proposed window:** 2026-11-25 to 2026-12-24  
**Operating rule:** Do not publish unverified release information, create duplicate search-intent pages, or change redirects without evidence.

## Week 1 — Technical SEO, URL structure, metadata (Days 1–7)

- Export Search Console Pages and Queries for the same date range and property; retain the raw exports and import them using [GSC-IMPORT-TEMPLATE.csv](./GSC-IMPORT-TEMPLATE.csv).
- Use URL Inspection to confirm indexing/canonical selection for `/anime-list`, `/anime-calendar.html`, representative categories, one Manhwa detail, the homepage, and several articles. Do not use `site:` results as a substitute.
- Investigate the 503 from the direct category SEO API. Check production function logs, active Firestore indexes, Vercel/Firebase routing, and the raw response of a category URL. Do not change the query or indexes until the specific deployed failure is known.
- Compare the live sitemap with linked `/anime/{slug}` details. Choose a bounded sitemap policy for Tenrai-derived detail pages; keep only valid public canonical URLs.
- Ask the editor to refresh or retire the October 2026 upcoming-anime article using verified dates. Correct the two identified article H1 grammar issues and rewrite the Itachi meta description in the CMS.
- Deploy the source fixes for ID-qualified anime slugs and Organization bylines after tests pass.

**Exit checks:** no alias loops/chains; sitemap URLs return 200 and self-canonical; dynamic category/Manhwa details have dependable metadata; date-sensitive copy is verified; GSC data is available or its absence is recorded.

## Week 2 — Internal linking and catalog quality (Days 8–14)

- Review internal links from Anime List and calendar cards to anime details, then decide how those pages enter the sitemap.
- Review the related-article heuristic on anime details; prioritize explicit `animeSlug` relations and keep fallback recommendations relevant.
- Add contextual article links to existing Anime List, calendar, category, and Manhwa routes where they directly answer the reader’s next question.
- Review `Anime list` and `Romance Anime` category labels/descriptions. Improve only if those categories remain populated and editorially meaningful.
- Check that article and category pagination preserve self-canonical page URLs and crawlable `rel=prev/next` links where applicable.

**Exit checks:** no broken destination; no links to redirects where a canonical route is available; contextual links are relevant, not keyword-stuffed.

## Week 3 — High-intent editorial publishing (Days 15–21)

- Research the Naruto, One Piece, Bleach, Black Clover, and Boruto filler/canon guide opportunities in [CONTENT-GROWTH-STRATEGY.md](./CONTENT-GROWTH-STRATEGY.md).
- Select only topics supported by a unique reader need and enough authoritative sources; check GSC queries before commissioning overlapping variants.
- Draft one or two prioritized guides with episode/arc tables, transparent classification rules, source links, update date, and contextual links to existing pages.
- Prepare an episode-release update only for a series with verified episode date/time and official India availability. Label IST/timezone and source.
- Do not publish the proposed DAN DA DAN ending explainer until that season/finale exists and the manga chapter mapping is confirmed.

**Exit checks:** human-reviewed copy, unique intent, sourced factual claims, accurate metadata, one H1, valid schema, canonical URL, internal links, and editor approval.

## Week 4 — CTR review, content refresh, indexing and performance (Days 22–30)

- Review new Search Console exports for high impressions/low CTR and pages ranking around positions 5–20. Do not infer priority from impressions alone; inspect query intent and page relevance.
- Make title/description changes only for the matching landing-page query; record before/after values and deployment date.
- Recheck URL Inspection for canonical/indexing signals and request indexing only for meaningful updated pages.
- Recrawl sitemap and internal links; validate redirects, image responses, metadata, and JSON-LD after deployment.
- Measure Lighthouse/PageSpeed and field LCP/INP/CLS on representative mobile and desktop pages before proposing bundle or image changes.
- Review the 30-day results and backlog; do not claim ranking gains from a short observation window.

**Exit checks:** changes and evidence logged, no invented GSC values, no broken routes or structured data, and unresolved items labeled **PENDING**.
