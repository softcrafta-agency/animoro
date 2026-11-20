# ANIMORO IMPROVEMENT REPORT

## What was wrong

The initial audit found a functionally mature but partially over-complex public website. The highest-confidence implementation issues were:

- Article templates used a nested `<main>` element.
- Authored article `<h1>` markup could create multiple H1 headings.
- The homepage lacked a keyboard-accessible skip link and its source `<main>` had no stable target.
- Several homepage navigation links used relative legacy paths.
- The initial audit did not include a browser or deployed-runtime verification phase.

## What changed

- Replaced the article template’s outer `<article>` container with a semantic `<main>` container in `blog.html`.
- Replaced the article renderer’s nested `<main>` with a `<div>` in `api/_lib/article-html.js`.
- Added sanitization that transforms authored `<h1>` tags to `<h2>` tags, preserving one canonical page H1 in `api/_lib/article-html.js`.
- Added a visible-on-focus skip link to the homepage in `index.html`.
- Added the homepage `main-content` target and skip-link styling in `css/style.css`.
- Standardized homepage Articles, My List and Anime Airing Today navigation links to absolute canonical paths in `index.html`.
- Added a focused regression test for demoting authored H1 content in `api/_lib/article-html.test.js`.

Generated `dist/` output was rebuilt after source changes.

## Files modified

- `ANIMORO_AUDIT_REPORT.md`
- `index.html`
- `blog.html`
- `css/style.css`
- `api/_lib/article-html.js`
- `api/_lib/article-html.test.js`
- Vite-generated files under `dist/`

## Testing

- Focused article renderer suite: 14 tests passed, 0 failed.
- Full suite: 281 tests passed, 0 failed.
- Production build: Vite build passed; 119 modules transformed.
- Source whitespace/diff check: no source data corruption detected; generated CRLF files can show CR-at-EOL warnings with `git diff --check`.

## Remaining problems

- Browser-level visual, keyboard and viewport testing has not been completed in this environment.
- No actual Lighthouse or Chrome User Experience report was collected.
- Large auth/admin bundles remain.
- Dynamic public content still depends on Firestore/provider availability.
- Broad UI cleanup should follow browser evidence rather than speculative CSS deletion.

