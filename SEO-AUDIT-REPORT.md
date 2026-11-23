# Animoro SEO Audit Report

**Audit date:** 2026-11-23

**Scope:** Technical SEO, on-page SEO, structured data, image accessibility/optimization, internal links, and responsive source validation.

**Deployment status:** Changes are in the local worktree and have not been deployed.

## 1. Executive summary

The audit found an overlong homepage description, a homepage FAQ schema without visible FAQs, unoptimized logo image references, incomplete social metadata on several static and dynamically rendered pages, and archive/category metadata that did not distinguish pagination consistently. The SEOQuake missing-alt finding could not be reproduced: all 34 static HTML image elements have `alt`, `width`, and `height` attributes. Dynamic article-body images now preserve an explicitly empty decorative alt and use the article title when an alt is omitted.

Safe fixes were implemented without changing Firestore queries, public URLs, article publishing, or the existing consent-based first-party analytics. Static checks and source-browser responsive checks passed as described below. The Node test suite/build and post-deployment checks remain pending because Node/npm are not installed in this environment and the updated site has not been deployed.

## 2. Original SEOQuake findings

| Finding | Audit result | Status |
|---|---|---|
| Homepage description: 159 characters | Replaced with a 135-character description; Open Graph and Twitter descriptions use the same text. | FIXED |
| 15 images, one missing alt | Could not reproduce on the current live homepage (the prior live inspection found 21 images with alt text). The local project audit found no missing alt on 34 static image elements. | VERIFIED |
| Homepage heading hierarchy | The old H1 was “Latest Articles”; featured story titles were H2s. The page now has a descriptive H1, major sections use H2, and featured story titles render as H3. | FIXED |
| “Anime” keyword density | SEOQuake reported 774 words and 44 uses (5.7%); a separate browser extraction counted about 860 words and the same 44 uses (about 5.1%). Different extraction methods explain the count difference. No authored article text was changed merely to manipulate density. | VERIFIED |
| 78 internal links / 27 unique URLs | A pre-edit crawl checked 40 same-origin URLs: each ultimately returned 200, with one expected legacy-route redirect. Search-page links to upcoming anime now use the canonical route. A post-deployment crawl is still required. | FIXED / PENDING |
| Three oversized `animoro-logo.png` images | The 1152×768, 593,799-byte source remains for compatibility; new UI and social assets reduce the relevant payloads substantially. | FIXED |
| Google Analytics not detected | No GA4/GTM tag or Measurement ID is configured. Existing first-party event analytics is consent-gated; no duplicate tracker was added. | VERIFIED |

## 3. Files inspected

The project is a Vite multi-page HTML/JavaScript site with Vercel API routes and Firebase Hosting rewrites. The audit covered public templates, dynamic article/anime/category/archive rendering, sitemap generation, route configuration, analytics consent, shared styles, image assets, and focused tests.

Key implementation files inspected:

- [index.html](./index.html), [anime.html](./anime.html), [upcoming-anime.html](./upcoming-anime.html), [blogs.html](./blogs.html), [category.html](./category.html), [blog.html](./blog.html), and [my-list.html](./my-list.html)
- [api/_lib/seo-page.js](./api/_lib/seo-page.js), [api/blogs.js](./api/blogs.js), [api/_lib/article-html.js](./api/_lib/article-html.js), and [api/_lib/sitemap.js](./api/_lib/sitemap.js)
- [js/anime.js](./js/anime.js), [js/upcoming-anime.js](./js/upcoming-anime.js), [js/category.js](./js/category.js), [js/manhwa-search.js](./js/manhwa-search.js), and [js/visitor-analytics.js](./js/visitor-analytics.js)
- [firebase.json](./firebase.json), [vercel.json](./vercel.json), the existing robots endpoint, and [sitemap generation/routing](./api/sitemap.js)
- [css/style.css](./css/style.css), [css/responsive.css](./css/responsive.css), and the static public image assets

The 20 top-level HTML files with logo and/or metadata updates are: [404.html](./404.html), [about.html](./about.html), [account.html](./account.html), [admin-login.html](./admin-login.html), [admin-post-editor.html](./admin-post-editor.html), [admin.html](./admin.html), [anime-calendar.html](./anime-calendar.html), [anime.html](./anime.html), [blog.html](./blog.html), [blogs.html](./blogs.html), [category.html](./category.html), [contact.html](./contact.html), [index.html](./index.html), [login.html](./login.html), [manhwa.html](./manhwa.html), [my-list.html](./my-list.html), [privacy.html](./privacy.html), [register.html](./register.html), [search.html](./search.html), and [upcoming-anime.html](./upcoming-anime.html).

## 4. Issues identified and root causes

1. Homepage copy and metadata used a longer, broader description than needed; the three description fields were not concise.
2. The homepage advertised FAQ structured data without showing those FAQs to visitors.
3. The homepage H1 described the article feed rather than Animoro’s primary subject; featured story titles were one level too high.
4. Several social metadata fields were absent or not updated when dynamic anime, upcoming-anime, category, or archive content changed.
5. Archive category and page variants could retain generic metadata, and the archive H1 did not reflect the selected category.
6. Logo page references used the large source PNG, and some server-rendered/dynamic pages retained the old logo URL.
7. Missing author-supplied alt text in sanitized article bodies received the generic “Article image” fallback, and an explicit empty `alt=""` was also overwritten.
8. Sitemap filtering required published records and valid slugs, but draft-like visibility/status values were not all explicitly rejected.

## 5. Issues fixed

| File/location | Original problem and solution | Verification |
|---|---|---|
| [index.html](./index.html), `<head>` | Replaced the 159-character homepage description with a 135-character description and synchronized Open Graph/Twitter descriptions. Removed stale homepage FAQPage JSON-LD while retaining Organization and WebSite/SearchAction data. | VERIFIED: parsed metadata has one title, description, and canonical; JSON-LD parses. |
| [index.html](./index.html), homepage sections; [js/home.js](./js/home.js) | Replaced “Latest Articles” H1 with “Anime News, Reviews & Guides”; made Featured Stories an H2 and rendered carousel titles as H3. | VERIFIED: one static homepage H1; rendered heading levels inspected in browser. |
| [api/_lib/seo-page.js](./api/_lib/seo-page.js), [api/blogs.js](./api/blogs.js), [js/anime.js](./js/anime.js), [js/upcoming-anime.js](./js/upcoming-anime.js), [js/category.js](./js/category.js), [js/manhwa-search.js](./js/manhwa-search.js) | Added or synchronized dynamic title, description, canonical, Open Graph, and Twitter metadata. Archive category/page variants now receive distinct metadata, canonical URLs, and category H1s. | Focused tests updated; execution pending Node. Static templates and rendered source paths inspected. |
| [api/_lib/seo-page.js](./api/_lib/seo-page.js), [js/category.js](./js/category.js) | Added BreadcrumbList data for server-rendered category pages and the client-rendered fallback, avoiding duplicate schema blocks. | JSON-LD serialization and focused assertions added; execution pending Node. |
| [api/_lib/article-html.js](./api/_lib/article-html.js) | Replaced the generic missing-alt fallback with the article title as context, while preserving explicit `alt=""` for decorative images. Updated the publisher logo URL. | Focused tests added; execution pending Node. Editorially accurate alt text still needs to be supplied by authors for meaningful images. |
| [api/_lib/sitemap.js](./api/_lib/sitemap.js) | Explicitly excludes records marked draft/private/deleted/archived as well as invalid or unpublished records. | Focused tests added; execution pending Node. |
| [search.html](./search.html) | Changed two upcoming-anime links from the legacy `.html` URL to `/upcoming-anime`. | Static internal-link scan found no unresolved local links. Legacy redirect remains configured. |
| [public/animoro-logo-circle.webp](./public/animoro-logo-circle.webp), [public/animoro-logo-social.jpg](./public/animoro-logo-social.jpg), all 20 listed HTML templates, [api/_lib/seo-page.js](./api/_lib/seo-page.js), [api/_lib/article-html.js](./api/_lib/article-html.js), and dynamic metadata scripts | Replaced page/UI and schema references with the optimized circular logo; social previews use the separate JPEG. Kept the original PNG file for compatibility. | VERIFIED: every local image path resolved; all 34 static `<img>` tags include alt and dimensions; optimized assets return 200 from the local source server. |
| [firebase.json](./firebase.json), [vercel.json](./vercel.json) | Added cache headers for the two optimized assets. | VERIFIED: both files parse as JSON. |
| [js/upcoming-anime.js](./js/upcoming-anime.js), `renderUpcomingDetail` | Browser parsing exposed a duplicate `description` declaration after adding social metadata. Renamed the metadata value to `shareDescription`. | FIXED: cache-busted browser module parsing proceeds to the expected unresolved Firebase bare import; full bundled execution awaits Vite/Node. |

## 6. Before-and-after comparison

- Homepage description: **159 → 135 characters**, shared by standard, Open Graph, and Twitter descriptions.
- Homepage H1: **“Latest Articles” → “Anime News, Reviews & Guides”**; featured titles now use H3.
- Homepage FAQ schema: **removed** because no corresponding FAQs were visible.
- Logo assets: source PNG **593,799 bytes**; circular UI WebP **6,214 bytes** (about **98.95% smaller**); social JPEG **63,757 bytes** (about **89.26% smaller**).
- Static images: **34 checked; 0 missing alt; 0 missing width/height; 0 unresolved local image paths**.
- Search page: upcoming links now use the canonical route; legacy redirect remains for existing inbound links.

## 7. Technical SEO improvements

- Static-page audit covered 20 root HTML files. Ten static indexable templates each have exactly one title, description, and canonical. `blog.html` is intentionally a server-rendered article template whose metadata is injected at request time.
- Search, authentication, admin, and personal-list pages retain their intended `noindex` behavior. `my-list.html` is private/personal content and should not be indexed.
- Canonicals are updated for dynamic anime, upcoming-anime, category, article archive, paginated archive, and article responses. The SearchAction target `/search.html?q={search_term_string}` matches the actual search parameter.
- Existing HTTPS, robots, sitemap, and hosting routes were not replaced. A pre-edit live check found the robots and sitemap endpoints accessible; post-deployment status still needs confirmation.
- Article/archive APIs continue to filter for published content. Sitemap generation now explicitly rejects draft-like statuses/visibility markers and invalid slugs.

## 8. On-page SEO improvements

- The homepage now communicates the site’s primary topic in its H1 and concise description. Related terms (news, reviews, guides, rankings, discovery, seasonal picks, releases) are used naturally.
- No authored article content was removed or rewritten to reduce keyword density artificially.
- Dynamic archive and category headings, titles, descriptions, canonicals, and social metadata now reflect the active category/page rather than the generic template.
- Existing page content, URLs, Firestore queries, APIs, and publishing flows were preserved.

## 9. Image optimization results

- UI logo: [public/animoro-logo-circle.webp](./public/animoro-logo-circle.webp), 384×384 RGBA; shared CSS applies a circular crop at header, drawer, footer, and authentication placements.
- Social preview: [public/animoro-logo-social.jpg](./public/animoro-logo-social.jpg), 1200×800 RGB.
- All 34 static HTML images have alt text and intrinsic width/height. The SEOQuake missing-alt item was not identifiable on the current live page.
- Dynamic article-body images are lazy-loaded and async-decoded by the existing sanitizer. Missing alt text gets article-title context; an explicit empty alt remains empty. This cannot replace accurate author-written descriptions.
- The main header logo is not lazy-loaded. No broad image `srcset` change was made; dynamic catalog images and cover sources remain managed by existing data/rendering paths.

## 10. Structured data validation

- Static JSON-LD blocks in all root HTML files parse successfully.
- Homepage retains one Organization and one WebSite entity; the Organization logo points to the circular WebP. SearchAction was verified against the implemented `q` search parameter.
- Homepage FAQPage data was removed because it did not match visible content. FAQ schemas on other pages were left in place where corresponding visible FAQ content exists.
- Article rendering continues to emit BlogPosting/BreadcrumbList data. Category pages now include BreadcrumbList data. No unsupported Anime schema type or invented ratings/reviews were added.
- Dynamic structured data uses JSON serialization and escapes `<` where inserted into script content. Full schema validation against deployed responses remains pending.

## 11. Internal linking results

- The pre-edit crawl checked 40 same-origin URLs; all ultimately returned HTTP 200. One legacy `/upcoming-anime.html` URL redirected once to `/upcoming-anime`; no redirect chain was observed.
- A local static scan found no unresolved file-backed internal links. Dynamic `/blog/*`, `/anime/*`, and `/upcoming-anime/*` links are generated from validated stored slugs and existing route rewrites.
- The Search page’s two upcoming-anime links now use the canonical route. No new links to nonexistent pages were introduced.
- The live crawl predates these changes; link/status verification after deployment is pending.

## 12. Performance findings

- The measured logo payload reductions are documented above. Logo dimensions are explicit in HTML; below-the-fold article-body images retain lazy loading. Social metadata uses a dedicated preview image.
- Existing font preconnects and existing application behavior were preserved.
- No Lighthouse/PageSpeed run or field LCP, INP, or CLS measurement was available. Performance improvements beyond the measurable logo payload reduction are therefore not claimed.

## 13. Tests performed

| Check | Result |
|---|---|
| Python static HTML audit: 20 templates, metadata counts, image alt/dimensions, local assets, JSON-LD | VERIFIED: no malformed static JSON-LD, missing static alt/dimensions, or unresolved local image paths. |
| JSON parsing of `firebase.json` and `vercel.json` | VERIFIED. |
| XML/config source inspection for sitemap/robots and public route behavior | Existing implementation retained; live endpoint checks were pre-edit. |
| Browser source-layout pass: 9 routes/templates × 7 sizes (1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 390×844, 360×800) | VERIFIED: no horizontal overflow; logo loaded; desktop navigation remained visible at widths above 1100px and mobile menu control appeared at/below the breakpoint. Dynamic data/cards were not populated by the local static server. |
| `git -c core.whitespace=cr-at-eol diff --check` | VERIFIED. The setting accounts for the Windows CRLF working-tree checkout. |
| `node --test` / build | PENDING: Node and npm are unavailable in this environment. |
| Browser console/runtime | PENDING: raw-source server cannot resolve bare `firebase/*` imports or run API routes without Vite/Node. It exposed and helped fix the duplicate declaration in `js/upcoming-anime.js`; post-fix parsing reached the expected missing Firebase import. No claim is made that dynamic runtime errors are clear. |
| Live crawl after code changes | PENDING: no deployment occurred. |

Focused tests were added or updated in [api/_lib/article-html.test.js](./api/_lib/article-html.test.js), [api/_lib/blogs-handler.test.js](./api/_lib/blogs-handler.test.js), [api/_lib/seo-page.test.js](./api/_lib/seo-page.test.js), [api/_lib/sitemap.test.js](./api/_lib/sitemap.test.js), [js/anime-page-seo.test.js](./js/anime-page-seo.test.js), and [js/nav-search.test.js](./js/nav-search.test.js). They have not been executed locally.

## 14. Remaining issues

- **PENDING:** Run the full test suite and production build under the project’s supported Node 22 environment.
- **PENDING:** Deploy, then crawl the live sitemap and every important canonical route; verify response codes, redirects, metadata, structured data, images, and browser console.
- **PENDING:** Verify data-driven cards, article pages, anime detail pages, publishing, and admin behavior against the real Vite/API/Firestore environment.
- **PENDING:** Run Lighthouse/PageSpeed and collect LCP/INP/CLS measurements.
- **PENDING:** Editorial alt text is still needed for meaningful article images whose authors omit it. The article-title fallback is contextual, not a visual description.
- **NOT APPLICABLE:** No Anime-specific schema was added because a suitable supported type was not established.

## 15. Exact manual actions required

1. Run `npm test` and `npm run build` in CI or a Node 22 development environment; resolve any failures before deployment.
2. Deploy the changes, then re-run the live URL/sitemap/robots/link crawl and verify the optimized image URLs return the expected content types and dimensions.
3. Use a browser with the deployed Vite/API environment to check dynamic article, anime, category, and upcoming-anime metadata and the admin/article-publishing flows.
4. If GA4 is desired, provide the site owner’s real **GA4 Measurement ID (`G-...`)**. Do not invent one. Review consent and privacy disclosures before adding the tag; the existing first-party consent-based analytics should not be duplicated.
5. Run Lighthouse/PageSpeed after deployment and record real lab/field performance results; no Core Web Vitals score is inferred from this source audit.
