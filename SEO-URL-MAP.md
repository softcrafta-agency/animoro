# Animoro SEO URL map

**Snapshot date:** 2026-10-22
**Canonical host:** `https://www.animoro.in`  
**Source:** Production `/sitemap.xml`, production canonical tags, repository routing configuration. Search Console Pages/Queries exports were not found, so this map includes no click, impression, CTR, ranking, or query data.

The source now uses `/blog/{slug}` for public article URLs. Hosting redirects for legacy URLs and the updated sitemap are configured locally; production must be redeployed before these changes are live.

## Public URLs in the live sitemap

| Existing URL | Page type | Indexing/canonical notes |
|---|---|---|
| `/` | Homepage | Canonical is the `www` root. |
| `/blogs.html` | Article directory | Canonical is the existing directory URL. |
| `/anime.html` | Anime directory | Canonical is the existing directory URL. |
| `/anime-calendar.html` | Release calendar | Canonical is the existing calendar URL. |
| `/about.html` | About | Canonical is the existing page URL. |
| `/contact.html` | Contact | Canonical is the existing page URL. |
| `/category.html?category=Anime%20News` | Category archive | Query-specific canonical is applied by category-page JavaScript. |
| `/category.html?category=Recommendations` | Category archive | Query-specific canonical is applied by category-page JavaScript. |
| `/category.html?category=Reviews` | Category archive | Query-specific canonical is applied by category-page JavaScript. |
| `/blog/top-5-upcoming-anime-in-october-2026` | Published article | New source route; canonical is the same article URL. |
| `/blog/black-clover-spade-kingdom-arc-asta-yuno-noelle-lucifero` | Published article | New source route; canonical is the same article URL. |
| `/blog/best-magic-fantasy-anime-you-should-definitely-watch` | Published article | New source route; canonical is the same article URL. |
| `/blog/best-sports-anime-you-should-definitely-watch` | Published article | New source route; canonical is the same article URL. |
| `/blog/why-does-choso-consider-yuji-his-brother-the-truth-explained` | Published article | New source route; canonical is the same article URL. |
| `/blog/kagurabachi-anime-release-date-story-characters-powers-everything-you-need-to-know` | Published article | New source route; canonical is the same article URL. |
| `/blog/why-is-ichigo-the-strongest-character-in-bleach-yhwach-soul-society` | Published article | New source route; canonical is the same article URL. |
| `/blog/why-was-itachi-forced-to-destroy-his-own-clan` | Published article | New source route; canonical is the same article URL. |

The sitemap also contains published anime detail URLs when those records exist. The current sitemap response inspected for this audit contained no anime details.

## Existing URL families not listed in the sitemap

| Existing URL family | Current behavior | Decision |
|---|---|---|
| `/upcoming-anime.html` and `/upcoming-anime.html/{slug}` | Template emits `noindex, nofollow`; browser initialization requires sign-in; Firestore requires a signed-in user for published upcoming records. | Keep out of sitemap and do not remove the noindex directive without an explicit public-access/indexing decision. |
| `/search.html` | `noindex, nofollow`; currently disallowed by production `robots.txt`. The local source removes that disallow, but it has not been deployed. | Intentionally excluded. Production currently cannot observe the page-level directive; recheck after approved deployment. |
| `/my-list.html` | `noindex, nofollow`; user-specific page; currently disallowed by production `robots.txt`. The local source removes that disallow, but it has not been deployed. | Intentionally excluded. Production currently cannot observe the page-level directive; recheck after approved deployment. |
| Login, register, account, and admin pages | Authentication/administration surfaces; noindex where configured; admin paths disallowed in `robots.txt`. | Intentionally excluded. |
| `/category.html` with other category values | Same existing category template and query route; the sitemap includes only categories represented by published posts at generation time. | Do not create alternate path forms. Category-specific title/canonical/social values are client-rendered. |
| `/blog.html/{slug}` | Legacy article URL. Vercel redirects with HTTP 308 and Firebase Hosting with HTTP 301 to `/blog/{slug}`. | Retained only as a redirect source; do not emit it in links or sitemap. |
| `/anime.html/{slug}` | Existing client-rendered anime detail route. Profile metadata/canonical are set after the Firestore record loads. | Preserve current route and stored slugs. |

## Host and route consistency

- `https://animoro.in/` permanently redirects to `https://www.animoro.in/` with HTTP 308.
- The sitemap, `robots.txt` sitemap directive, and source canonical helpers use `https://www.animoro.in`.
- The article path changes from `/blog.html/{slug}` to `/blog/{slug}`. Article slugs and the existing www canonical host are unchanged.
- Verify the production redirect, article response, and live sitemap after redeployment; local source/config tests do not verify deployed behavior.
- URL-level performance prioritization must be completed after the Search Console exports are supplied.
