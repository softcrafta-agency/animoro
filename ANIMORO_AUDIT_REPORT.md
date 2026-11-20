# ANIMORO AUDIT REPORT

Date: 2026-11-20
Scope: complete source audit, baseline build and test run
Status: initial audit complete; implementation not started

## Executive summary

The project is a Vite-built static and server-rendered website with public HTML pages, JavaScript modules, Vercel API functions, Firebase/Firestore integration, Jikan and comics providers, and Cloudflare R2 support. The baseline build and test suite are healthy:

- `npm run build`: passed; Vite completed successfully.
- `npm test`: passed; 280 tests passed, 0 failed.
- The working tree was clean before this audit.

The architecture is substantial and already includes route rewrites, article/server SEO rendering, sitemap generation, admin authorization, R2/Firebase image handling, and a broad test suite. The highest-priority audit risks are no-JavaScript indexability for dynamic cards, large bundles, inconsistent canonical/route patterns, static accessibility details, and limited production runtime/performance evidence.

## Baseline evidence

| Check | Result | Evidence |
|---|---|---|
| Production build | Passed | Vite transformed 119 modules and generated `dist/` successfully |
| Automated tests | Passed | 280 tests passed, 0 failed |
| Homepage routes | Present | `/`, `/anime-list`, `/manhwa`, `/upcoming-anime`, `/blogs.html`, `/anime-calendar.html` |
| Server article routes | Present | `/blog/:slug` rewrites to `/api/article` |
| Server detail routes | Present | `/anime/:slug*` and `/upcoming-anime/:slug*` use SEO API rendering |
| Sitemap | Present | `/sitemap.xml` rewrites to `/api/sitemap` |
| Robots | Present | `/public/robots.txt` allows public crawling and disallows private/admin/API areas |

## Findings

| Severity | Area | Affected files / evidence | Problem | Recommended fix | Status |
|---|---|---|---|---|---|
| Critical | SEO/runtime rendering | `js/home.js`, `js/anime-directory.js`, `js/upcoming-anime.js`, article/archive API templates | Major homepage/list/detail content is populated by client JavaScript or API data. Public pages can lose useful content when Firebase/API calls fail or crawl rendering is unavailable. | Add server-safe fallbacks or verified prerendered content for critical public lists; preserve useful empty/error states and canonical metadata. | Open |
| Critical | Article template | `blog.html`, `api/_lib/article-html.js`, `api/article.js` | The static template may rely on server replacement for one canonical H1 and article markup. Invalid or failed database rendering must not expose a misleading or empty article shell. | Verify every article response has one H1, unique canonical, article metadata, breadcrumb data, and noindex 404 behavior. | Open |
| High | Bundle size | `package.json`, Vite build output | Build reports a 891 kB auth bundle and several 154 kB/73 kB admin chunks, with a chunk size warning. | Review route-specific imports and lazy-load Firebase/admin/SEO/editor features where safe. | Open |
| High | Image optimization | `index.html`, `js/home.js`, `js/ui.js`, public/R2 assets | Static logo is 650 kB in the build output; dynamic article/anime cards depend on upstream/R2 image sizes and may lack explicit dimensions in every render path. | Audit image dimensions and formats, lazy-load below-the-fold cards, verify LCP image priority, and retain R2 delivery. | Open |
| High | Canonical consistency | `anime.html`, `vercel.json`, `firebase.json`, `public/robots.txt`, API sitemap code | Legacy and clean routes coexist. Static canonicals must exactly match actual rewrites and redirects. | Crawl canonical/redirect combinations and normalize internal links to clean canonical routes. | Open |
| High | Homepage hierarchy/UI | `index.html`, `js/home.js`, `css/style.css`, `css/responsive.css` | The homepage has a meaningful H1, but its hero, cards, sidebars, and loading states need visual and behavioral verification across 320–430 px and tablet widths. | Refine existing components rather than rebuilding; verify card ratios, overflow, loading, empty and error states. | Open |
| High | Static accessibility | `index.html`, public HTML files, `js/ui.js`, `css/style.css` | Some dynamically generated image markup and interactive controls need systematic alt text, labels, focus, and keyboard review. | Add/verify alt text, focus-visible states, semantic regions, button types, and drawer behavior. | Open |
| High | Mobile navigation | `index.html`, `js/ui.js`, `css/responsive.css` | Shared mobile navigation/drawer behavior is substantial and may interact with fixed bottom navigation, drawer overflow, and keyboard focus. | Test at 320, 375, 390, 430 px and verify Escape, focus restoration, and outside/backdrop dismissal. | Open |
| High | Article experience | `blog.html`, `api/_lib/article-html.js`, `js/article-content.js`, `js/blog.js` | Article metadata and related content are implemented in server/client code, but static template and dynamic heading/TOC behavior need end-to-end validation. | Verify breadcrumb, TOC, H2/H3 hierarchy, previous/next behavior, related links, sharing, dates, authors, and image alt text. | Open |
| Medium | Heading hierarchy | `blog.html` (no static H1 found), 404 template, page-specific templates | Static blog and some templates do not contain visible source H1 markup; dynamic rendering is required to supply it. | Ensure exactly one meaningful H1 on every public 200 response and logical H2/H3 nesting. | Open |
| Medium | Internal links | Public HTML and navigation | Navigation mixes `/`, relative `.html`, clean routes and legacy routes. This increases duplicate URL and redirect risk. | Standardize public internal links on canonical route patterns while preserving compatibility redirects. | Open |
| Medium | Empty/loading states | `js/home.js`, `js/anime-directory.js`, `js/upcoming-anime.js`, `js/manhwa-home.js` | States exist, but copy and retry behavior vary and should be verified against real provider/database failures. | Standardize retry, empty, and unavailable states without inventing content. | Open |
| Medium | JavaScript keyboard behavior | `js/home.js`, `js/ui.js`, `js/anime-directory.js` | Global slider keyboard handling and dynamic controls require keyboard/focus review. | Limit global handlers to active components and ensure controls have clear focus indicators and semantic labels. | Open |
| Medium | CSS maintainability | `css/style.css`, `css/responsive.css`, `css/admin.css`, `css/manhwa.css` | Broad component CSS and inline styles increase conflict and cleanup risk; unused selectors cannot be safely deleted until runtime references are verified. | Use reference-based cleanup only after static/dynamic class and admin routes are mapped. | Open |
| Medium | Dependency footprint | `package.json`, `package-lock.json`, build output | React, Express, Firebase, Tailwind, Lucide, Motion and other packages coexist in a primarily static Vite site. Actual usage and chunk impact need verification. | Map imports and remove only dependencies with no static/dynamic/API/build usage. | Open |
| Medium | API reliability | `api/*.js`, `api/_lib/*.js` | Broad provider coverage exists, but each endpoint should be checked for timeout, invalid response, cache and private-data behavior. | Continue existing test pattern and verify timeout, 4xx/5xx, malformed upstream and cache headers. | Open |
| Medium | Security | `firestore.rules`, `storage.rules`, `api/_lib/admin-auth.js`, `.env.example` | Admin and analytics rules are documented and tested, but hard-coded email/UID admin checks and private environment variables need review without weakening access. | Preserve server/admin verification, audit role rules, and confirm no private values are exposed in client bundle or HTML. | Open |
| Medium | Firestore query efficiency | `js/home.js`, `js/blog.js`, `api/article.js`, `api/blogs.js` | Article, trending and related queries may require indexes or fallback behavior, and repeated page loads can issue overlapping requests. | Cache/reuse optimized feeds, preserve index fallback, and verify no unnecessary reads. | Open |
| Medium | Sitemap quality | `api/_lib/sitemap.js`, `api/sitemap.js`, `public/robots.txt` | Static and dynamic URLs are deduplicated, but output must be verified against published records and indexability rules. | Crawl sitemap URLs and exclude private, draft, archived, redirecting and 404 targets. | Open |
| Low | Cleanup | root HTML/CSS/JS, `dist/`, backup-like reports | Generated `dist/` and multiple historical SEO/audit documents exist. Candidate files must not be deleted until deployment and external references are verified. | Mark candidates after reference checks; keep uncertain files. | Open |
| Low | Measurement | homepage, public pages | No browser Lighthouse/Web Vitals evidence is present in the source audit. | Measure against deployed URLs at mobile/desktop widths and document actual LCP/INP/CLS. | Open |

## Static observations

### Public HTML

- Public pages generally contain a source H1, including home, anime, blogs, category, search, account, auth, manhwa, upcoming and legal pages.
- `blog.html` is a server template and does not contain a static H1 in its source; the article API must supply exactly one in successful responses.
- Several pages use inline `style` attributes; these do not inherently break SEO or accessibility but reduce stylesheet consistency.
- Public HTML uses the intended brand fonts and explicit viewport metadata, but font and CSS delivery should be measured rather than assumed optimal.
- The static HTML has many generated and dynamic containers, but only real browser/runtime testing can verify duplicate IDs and invalid markup.

### Routes and metadata

- Vercel rewrites clean article, anime, upcoming, manhwa and category routes to server/static destinations.
- `vercel.json` contains canonical host redirects and page-specific 301/308 redirects.
- Sitemap generation includes static pages, published posts, published anime, published upcoming anime and categories.
- Robots disallows `/api/` while explicitly allowing `/api/tenrai`; API crawling settings are mostly appropriate for private endpoints.
- Search pages may be crawlable because of static routes; indexability should be verified page-by-page.

### Performance

- Vite build succeeds but reports the auth/admin bundles as large.
- The build copies and fingerprints assets, and Vercel caching rules exist for `/assets/*`, favicons and the logo.
- Homepage content loading includes Firestore dynamic imports and API-first featured feeds.
- Repeated database requests and provider calls need browser/runtime verification.

### Accessibility and mobile

- Mobile navigation tests and bottom-navigation styles already exist.
- Public pages have a viewport, language attribute and some button/label work.
- No-JavaScript browser evidence is not yet available.
- Dynamic card and drawer markup needs automated and manual checks for alt text, focus, ARIA state and contrast.

### Security and reliability

- Firestore rules separate public reads, owner writes and administrator operations.
- Public view increments and analytics have server/rules constraints.
- Contact submissions have strict schema validation.
- Private API credentials are documented as server-only variables.
- The rule set should not be modified without deployment verification; no production rules were changed during audit.

## Initial critical fix list

1. Verify server-rendered article and detail responses on real records and 404/503 paths.
2. Crawl clean and legacy routes to confirm canonical, redirect and status behavior.
3. Verify homepage, archive, anime and upcoming empty/loading/error states.
4. Measure bundles and actual Core Web Vitals on deployed URLs.
5. Audit dynamic image dimensions, alt text and below-the-fold loading.
6. Test mobile drawer, bottom navigation and card overflow at required widths.
7. Verify sitemap URLs against 200 responses and canonical URLs.
8. Defer cleanup and deletions until reference and deployment checks pass.

## Verification performed

- Inspected repository structure, package scripts, public HTML/CSS/JavaScript, API modules, Vercel/Firebase configuration and security rules.
- Ran `npm test` and `npm run build`.
- Reviewed route, metadata, sitemap, robots, bundle and heading evidence.
- No source files or data were changed.
- No Firestore documents or articles were deleted.

## Remaining work

The remaining implementation phases must be based on actual browser and deployed-runtime evidence. Critical route and SEO fixes should precede broad visual changes. Any cleanup must preserve dynamically loaded, externally referenced and production-deployed assets.
