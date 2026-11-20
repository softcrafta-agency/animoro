# ANIMORO TEST REPORT

## What was wrong

No new defect was assumed before verification. The baseline suite was stable, but article template semantics and authored H1 behavior needed explicit regression coverage.

## What changed

- Added a regression test that verifies authored article H1 content is demoted to H2.
- Repaired article template semantics.
- Rebuilt the production bundle.

## Tests run

| Command | Result |
|---|---|
| `npm test` | 281 passed, 0 failed |
| `npm run build` | Passed; Vite transformed 119 modules |
| `node --test api/_lib/article-html.test.js` | 14 passed, 0 failed |
| `git diff --check` | Diff reported CRLF-at-EOL markers, not source corruption |

## Browser and runtime validation status

The environment did not provide a shared browser page or deployed browser automation session. Therefore the following remain unpassed:

- Homepage browser rendering
- Article browser rendering
- Anime list/detail runtime
- Upcoming calendar runtime
- Admin dashboard runtime
- Mobile viewport measurements at 320, 375, 390 and 430 px
- Tablet and desktop visual checks
- Browser console errors
- Lighthouse/Core Web Vitals
- Live sitemap crawling
- Live redirect/canonical crawling

## Passed

- Unit and integration tests
- Article sanitizer and JSON-LD behavior
- One article H1 regression
- Production build

## Remaining problems

- Perform deployed browser testing on animoro.in.
- Validate public routes and API errors on live configuration.
- Measure and document real Core Web Vitals.
- Exercise admin publishing and image upload in an authorized test environment.

