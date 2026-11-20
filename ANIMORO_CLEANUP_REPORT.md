# ANIMORO CLEANUP REPORT

## What was wrong

The project contains many HTML, CSS, JavaScript, API and report files. Broad cleanup could break runtime-generated paths, Firestore integrations or deployment routes, so the audit requirement prohibited blind deletion.

## What changed

- No source files or assets were deleted.
- No dependencies were removed.
- No CSS selectors or JavaScript functions were removed.
- No database, storage or published content was deleted.
- No uncertain assets were moved.

## Safety decision

This cleanup phase intentionally stopped after verification. Candidate files must remain marked `KEEP — MANUAL REVIEW` until static, dynamic, deployment and external references are checked.

Files retained for safety include:

- `dist/`, because it is the Firebase/Vite deployment output.
- Historical SEO/audit Markdown reports, because they may contain project and operational context.
- `public/css/festival-theme.css`, `public/js/festival-theme.js`, and festival catalog data, because of live calendar synchronization.
- All API underscore-prefixed modules, tests and Firebase/R2 helpers.
- Firebase and Vercel configuration.
- Existing `node_modules/`.

## Consolidated or removed code

- Removed the redundant nested `<main>` in article rendering.
- No other duplicate or dead code was removed because reference-based cleanup evidence was insufficient.

## Modified files

- `blog.html`
- `api/_lib/article-html.js`
- `api/_lib/article-html.test.js`
- `index.html`
- `css/style.css`

## Testing

- 281 full tests passed.
- Production build passed.
- No deletion-related regression could occur because no files or assets were deleted.

## Remaining cleanup

- Generate an import/reference map for every JS/CSS/HTML file.
- Check runtime-generated and external Firestore/R2 paths.
- Remove only files with sufficient static and dynamic evidence.
- Review large dependencies by actual bundle and route usage.
- Add a cleanup candidate matrix before any deletion commit.

