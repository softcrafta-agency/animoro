# Animoro SEO Metadata Report

**Audit date:** 2026-11-24  
**Scope:** Public sitemap pages, category archives, representative dynamic detail routes, metadata quality, social tags, canonicals, and structured data.

## Findings

- All 35 URLs in the live sitemap returned HTTP 200. No duplicate title or meta description was found among the 18 published articles crawled; article descriptions ranged from 113–160 characters.
- Homepage, Anime List, Upcoming Anime, Calendar, and Manhwa landing metadata are unique and match their main intents.
- Article responses have self-canonicals, `index, follow`, Open Graph/Twitter metadata, one H1, `BlogPosting`, and `BreadcrumbList`.
- Browser-rendered category metadata is unique and self-canonical, but the initial HTML is generic. The direct category SEO API returned 503 during the audit. The public route itself returned 200 and rendered articles in the browser; deployed rewrite/index behavior needs investigation.
- Manhwa detail metadata is unique after browser rendering. Its raw HTML initially returns listing metadata and `/manhwa` canonical; make server/prerender metadata dependable before relying on the detail page’s sitemap inclusion.
- Tenrai Anime detail SSR returned unique title, description, H1, and canonical. Client startup previously rewrote an already valid ID-qualified slug into a malformed duplicate-ID URL; the source fix is recorded in [SEO-IMPLEMENTATION-REPORT.md](./SEO-IMPLEMENTATION-REPORT.md).
- The article generator marked an `Animoro` byline as `Person`. Source now references the existing Organization entity for that brand byline; individual bylines remain `Person`.

## Metadata actions

The “after” entries below are editorial recommendations, not changes to stored Firestore article content. Article metadata is CMS-owned; update it in the publishing workflow only after content and source verification. Do not copy placeholders into production.

| Page | Before title / description | Recommended after | Status |
|---|---|---|---|
| Homepage `/` | `Animoro \| Anime News, Reviews & Guides` — “Animoro brings anime news, reviews, guides, rankings and discovery together, with seasonal picks and upcoming release updates for fans.” | Keep unchanged. Description is 135 characters, one description tag, and matches Open Graph/Twitter. | VERIFIED |
| Anime List `/anime-list` | `Anime List: Explore Anime Series & Genres \| Animoro` — “Explore anime by title, genre, format, airing status, popularity, and available ratings. Browse Animoro's catalogue and open a series for its available details.” | Keep unchanged. Clear catalog intent, source attribution, FAQ, and links to schedule/upcoming pages. | VERIFIED |
| Calendar `/anime-calendar.html` | `Anime Release Calendar — Weekly Broadcasts & Confirmed Episode Schedules \| Animoro` — “Browse Tenrai weekly anime broadcast listings and confirmed episode schedules published by Animoro. Weekly listings are not episode-specific confirmations.” | Keep unchanged. The disclaimer accurately separates recurring broadcasts from confirmed episode dates. | VERIFIED |
| Manhwa detail `/manhwa/the-greatest-estate-developer` | Raw response uses collection title/description and `/manhwa` canonical; browser rendering sets `The Greatest Estate Developer — Manhwa Details \| Animoro` and the title synopsis. | Ensure the same unique values are present in the first HTML response or a deployed prerender/SSR path; retain the self-canonical. | PENDING |
| Category archives | Raw response has generic `Anime Category — Animoro`, generic description and `/category.html` canonical. Browser sets category-specific metadata and query canonical. | Make the existing SSR path operational, then retain the rendered category title, summary and self-canonical. The direct API returned 503; check deployed Firestore index state and logs. | PENDING |
| `/blog/dan-da-dan-season-3-space-globalists-arc` | Description is 113 characters and says “expected 2027 anime storyline.” | Candidate: “Explore DAN DA DAN Season 3's Space Globalists arc, including Vamola, the Kur aliens, key story developments, and what the expected 2027 storyline may adapt.” Preserve “expected” only if the article cites a reliable source; use no unconfirmed release date. | PENDING editorial/source check |
| `/blog/top-5-upcoming-anime-in-october-2026` | `Top 5 Upcoming anime in October 2026 — Animoro` — description begins “October 2026 is looking pretty interesting…” | After updating the article from official sources, consider `5 Upcoming Anime for [Verified Month Year]: Seasons & Release Windows` and “Explore five anime for [verified month and year], with confirmed release windows, returning seasons, and links to official schedule announcements.” Replace both bracketed placeholders only after verification. | PENDING; stale as of 2026-11-24 |
| `/blog/why-was-itachi-forced-to-destroy-his-own-clan` | Description is a comma-separated keyword list beginning “Itachi Uchiha, Itachi Uchiha story, Uchiha Clan massacre…” | Candidate: “Why did Itachi Uchiha destroy the Uchiha clan? Follow the village's political tensions, Shisui's role, Danzo's actions, and the choice that shaped Sasuke.” Verify that each named point is covered accurately in the article. | PENDING CMS edit |
| `/blog/anime-like-naruto` | Visible H1: `Top Best Anime Like Naruto You Should Watch`; SEO title and description are otherwise unique. | Use a natural H1 such as `5 Anime Like Naruto: Action, Rivalries & Friendship`; retain the current title/description unless editorial testing supports a change. | PENDING CMS edit |
| `/blog/top-strongest-anime-villains-of-all-time` | Visible H1: `Top Most Strongest Anime Villains of All Time – Ranked by Power and Abilities`; title tag and description are grammatical. | Correct the H1 to `5 Strongest Anime Villains: Powers and Abilities Ranked`. Keep the page explicitly villain-focused and describe rankings as editorial opinion. | PENDING CMS edit |
| `/blog/kagurabachi-anime-release-date-story-characters-powers-everything-you-need-to-know` | Title promises anime release-date information; description instead summarizes the manga premise and ends with an ellipsis. | Verify adaptation/release status first. Then align title and description to confirmed information; do not imply an announced date without an official source. | PENDING fact-check |
| `/blog/most-powerful-anime-characters-of-all-time` and `/blog/top-strongest-anime-villains-of-all-time` | Both target broad strength/ranking language, but the characters and scope differ. | Keep separate; retain “characters” vs “villains” in title, H1, intro, headings, and internal-link anchors. No merge/canonical/redirect is recommended. | VERIFIED distinction |

## Redirect and canonical policy

Production aliases are one-hop and should remain unchanged: `/anime.html` → `/anime-list` (301), `/anime` → `/anime-list` (308), `/anime-airing-today` → `/anime-calendar.html` (308), `/articles` → `/blogs.html` (308), `/anime-news` → the Anime News category (308), and `/upcoming-anime.html` → `/upcoming-anime` (301). No replacement URL or redirect chain is justified by this audit.

Search and personal-list pages return `noindex, nofollow` and are excluded from the sitemap. Admin/auth pages are also noindex or access-controlled. Keep those directives.

## Structured data and social metadata

- Homepage: Organization and WebSite/SearchAction; the SearchAction uses the implemented `/search.html?q=...` route. No homepage FAQ schema is needed without visible FAQs.
- Anime List: CollectionPage, BreadcrumbList and visible FAQPage; data-backed ItemList is added from displayed results.
- Articles: BlogPosting and BreadcrumbList; existing stored dates and bylines only. The Animoro organization-byline correction is **FIXED in source, test added, execution pending**.
- Categories: BreadcrumbList and route metadata are set in client rendering; SSR availability is **PENDING**.
- Comics: CollectionPage/BreadcrumbList and detail ComicSeries/BreadcrumbList after rendering. Detail first-response metadata is **PENDING**.
- No unsupported Anime schema type, invented rating, review, author, date, or release platform was added.
- GA4/GTM was not detected. Existing consent-based first-party analytics remains; no second tracker was installed. If GA4 is wanted, the owner must provide the real `G-...` Measurement ID and consent requirements.

## Search Console data

No Search Console CSV/export was present. The repository has an optional, server-only Search Console integration via `GSC_SERVICE_ACCOUNT_JSON` and `GSC_SITE_URL`; this audit could not verify deployed credentials or property access. Google `site:` results were JavaScript-gated, so indexing status remains **PENDING** URL Inspection in Search Console.

Import template: [GSC-IMPORT-TEMPLATE.csv](./GSC-IMPORT-TEMPLATE.csv). No clicks, impressions, CTR, positions, search volumes, or keyword difficulty were invented.
