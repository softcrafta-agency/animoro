# Animoro SEO URL map

**Snapshot date:** 2026-10-30
**Canonical host:** `https://www.animoro.in`  
**Source:** Repository sitemap generation, canonical tags, and hosting configuration. Search Console data was not supplied, so this map makes no claims about Google indexing or deindexing.

## URLs in the generated sitemap

The sitemap contains the homepage, article directory, About, Contact, Privacy, categories represented by published articles, and published articles with valid stored slugs. Its canonical origin remains `https://www.animoro.in`.

Anime records and Upcoming Anime records are not queried or emitted during sitemap generation.

## Removed URL families

The production sitemap response checked on 2026-10-30 still contained `/anime` and `/anime-calendar.html`; it contained no anime detail or Upcoming Anime URLs. The source changes below are not deployed.

| URL family | Source behavior after deployment |
|---|---|
| `/anime` | Anime directory, build entry, rewrites, redirects, and internal links removed. Expected HTTP 404. |
| `/anime.html/{slug}` | Anime detail page and route handling removed. All 25 deleted detail URLs are expected to return HTTP 404. |
| `/upcoming-anime.html`, `/upcoming-anime.html/{slug}`, `/upcoming-anime/{slug}` | Public pages, build entry, navigation, and route handling removed. Expected HTTP 404. |
| `/anime-calendar.html` | Removed because its only schedule source was the `upcomingAnime` collection and its cards linked to deleted Upcoming Anime details. |

Upcoming Anime records and their admin manager remain in Firestore; no collection or unrelated admin functionality was deleted. Admin preview links to removed public detail routes were removed.

## Remaining route and crawler notes

- Published articles retain `/blog/{slug}` URLs. Legacy `/blog.html/{slug}` URLs retain their existing Vercel 308 and Firebase Hosting 301 redirects.
- `robots.txt` continues to allow crawlers to request removed paths and retains its sitemap directive. This lets crawlers observe the expected 404 responses.
- Missing files are expected to return 404 on Vercel and Firebase Hosting after deployment; local source/configuration checks do not verify deployed status codes.
- Check the deployed sitemap and route statuses after deployment. Google Search Console must be consulted to determine crawl, indexing, or removal status.
