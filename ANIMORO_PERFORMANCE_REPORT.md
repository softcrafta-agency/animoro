# ANIMORO PERFORMANCE REPORT

## What was wrong

Baseline build evidence showed a 891 kB auth chunk and a 154 kB admin chunk. The homepage and public cards also rely on dynamic data and images. No actual deployed Lighthouse or Chrome Core Web Vitals measurements were available from the source audit.

## What changed

- Added no heavy runtime dependencies or libraries.
- Improved article semantic markup without adding rendering work.
- Preserved existing lazy loading and explicit dimensions in dynamic anime/article cards.
- Preserved R2/Firebase image delivery.
- Rebuilt the production bundle after changes.

## Files modified

- `api/_lib/article-html.js`
- `blog.html`
- `index.html`
- `css/style.css`

## Testing

- Production build passed with Vite.
- Full test suite passed: 280 tests.

## Build observations

- Auth bundle: approximately 891 kB before gzip, 219 kB gzip reported.
- Admin bundle: approximately 155 kB before gzip, 43 kB gzip reported.
- Admin post-editor bundle: approximately 74 kB before gzip.
- Main homepage-related chunks remain module/fingerprint build output.
- Vite reports a 500 kB chunk-size warning for auth-related code.

## Passed checks

- Build completes successfully.
- Source changes do not introduce additional dependencies.
- Article semantic and accessibility changes add negligible bundle cost.

## Remaining problems

- No actual LCP, INP or CLS values were measured.
- Verify real mobile and desktop network waterfalls with Lighthouse or Web Vitals.
- Consider lazy-loading auth/admin/editor features behind routes.
- Audit dynamic cover dimensions and compression in database/R2 records.
- Avoid the generic fallback image where a real editorial image is unavailable.

