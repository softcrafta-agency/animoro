# Animoro SEO & AEO Keyword Fields Audit

**Audit date:** 2026-11-16  
**Project:** https://www.animoro.in  
**Scope:** Admin article editor, keyword normalization/analysis, article and bulk-edit save paths, Firestore rules/index definitions, and public article rendering.  
**Production verification:** Not performed. No production Firestore records were read or changed, and no deployment was made.

## Status summary

| Feature | Status | Issue | Fix Applied |
|---|---|---|---|
| Additional SEO Keywords | PASS | None found in the add/edit/remove and payload flow. Suggestions remain editorial-only. | Batched punctuation-equivalent duplicate entries are now skipped. |
| Story and Character Keywords | PASS | Relevance checks are lexical and cannot establish whether a character, power, or relationship is factually correct. | Same-batch duplicate prevention and duplicate analysis were corrected; no characters or powers are generated. |
| Long-tail SEO Keywords | PASS | Phrases can be up to the input's 300-character limit; there is no separate per-group count cap. The total article payload has a size guard. | No content insertion or keyword stuffing was added. |
| Question-Based Keywords (AEO) | PARTIAL | H2/H3 and the next visible block are checked, but answer quality/relevance is heuristic, not fact-checking. No FAQ structured data is generated. | Duplicate handling was corrected; no FAQ answers or schema are generated. |
| Secondary Keywords (Optional) | PASS | Existing field compatibility requires maintaining the legacy read fallback. | No migration or destructive rewrite added; existing fallback and clear behavior retained. |
| Keyword Analysis | PARTIAL | Exact phrase coverage is measured, while relevance and answer quality remain editorial heuristics. Literal H1 is represented by the article title in analysis; editor-body H1 is sanitized to H2 on publication. | Same-group punctuation-equivalent duplicates are now reported; phrase boundaries are regression-tested. |
| Firestore Persistence | PARTIAL | The editor and serializer flows were reviewed and serializer tests passed, but an emulator or authenticated browser save/reload was not run during this audit. Production records were not inspected. | Preserved new/existing article payload rules and legacy field synchronization; no article records changed. |
| Public SEO Rendering | PASS | Source and unit tests cover rendered metadata/content, not live deployment behavior. FAQ schema is intentionally absent. | No keyword arrays are emitted as meta keywords or inserted into visible copy. |

## Data-flow audit

### Four grouped fields

- `admin-post-editor.html` contains separate controls for the four groups. `initializeArticleKeywordGroups()` binds each control:
  - Enter and comma commit entries; pasted comma-separated values and line breaks are normalized.
  - Blur commits any remaining input.
  - Each saved tag has Edit and Remove actions. Edit returns that phrase to the input for replacement.
  - Empty phrases are discarded; whitespace is trimmed/collapsed; duplicates are compared case-insensitively and after punctuation normalization.
- `admin-editor.js` loads an existing Firestore document and calls `setValues(post)`. Local recovery stores grouped values and their dirty keys independently.
- `getValues()` includes pending input as well as committed tags. New article payloads include all four arrays, including empty arrays. On updates, a group is serialized only if it exists in the source document or was explicitly edited. This avoids adding empty fields to old records or clearing unrelated groups.
- `submitArticle()` uses the same payload for draft saves and publishing. Existing documents use `updateDoc`; new documents use `addDoc`.
- The grouped fields are editorial guidance. No public rendering code emits them as hidden text, a meta-keywords tag, or FAQ answers.

### Secondary Keywords and legacy fields

- `getArticleSecondaryKeywords()` checks `secondaryKeywords`, then legacy `keywords`, then `relatedKeywords`, selecting the first non-empty normalized value and excluding the primary keyword.
- The main editor and article bulk editor load through that helper. Save payloads synchronize `secondaryKeywords`, combined `keywords`, and `relatedKeywords`. An intentional clear therefore saves empty secondary/related arrays and a primary-only combined array; it does not restore stale legacy terms on the next open.
- Bulk edits include the secondary field. The four grouped fields are not editable in the bulk-edit form; bulk update payloads omit them, so they remain untouched.
- Firestore rules validate the article's core fields but do not constrain these optional keyword fields to a schema. Editor normalization and the article-payload size check are the relevant client-side controls.

### Keyword analysis

- `article-keyword-analysis.js` extracts visible text blocks while excluding scripts, styles, hidden elements, attributes, and other non-visible markup.
- Phrase comparison normalizes case, Unicode, punctuation, and whitespace, then requires token boundaries. The analysis reports title, introduction, body, conclusion, H2, and H3 coverage. In the public page, the stored title becomes the single visible H1; authored body H1 tags are converted to H2 during sanitization.
- Duplicate/similarity detection compares configured phrases only. Similarity and relevance use token overlap and a small synonym map; they are signals for editor review, not semantic or factual validation.
- AEO questions are matched against H2/H3 headings. The analyzer checks the next visible block for length and token overlap, and flags missing headings, missing/short answers, and weak overlap. It does not assert factual support.
- Suggestions are derived only from phrases the editor entered. The system does not invent character names, abilities, powers, story arcs, answers, or new keyword phrases.

## Root cause and fix

The tag manager compared a batch of new phrases against the existing set but did not add each accepted phrase to that set while processing the batch. Consequently, punctuation-equivalent phrases in one paste (for example, `Black Torch` and `Black-Torch`) could both be added. Analysis also skipped duplicate comparisons when two variants normalized to the same group key, so same-group legacy variants were not reported.

`getUniqueKeywordAdditions()` now updates its normalized set as each candidate is accepted, preventing duplicates both within one pasted batch and across groups. Analysis now reports same-group punctuation-equivalent variants as duplicates while retaining exact phrase boundary matching.

## Public SEO and structured data

- `api/article.js` serves only published article documents and passes the article to `renderArticleDocument()`.
- `api/_lib/article-html.js` sanitizes article content, renders one page H1 from the article title, and retains authored heading hierarchy (with body H1 converted to H2).
- `js/article-seo.js` provides SEO title/description fallbacks. The article renderer emits canonical, description, Open Graph/Twitter metadata, BlogPosting JSON-LD, and breadcrumbs.
- Keyword arrays are not copied into metadata or JSON-LD. No FAQPage schema is emitted, avoiding structured data that could disagree with visible content or current eligibility guidance.
- Unit tests cover SEO title/description, canonical output, visible article content, BlogPosting/BreadcrumbList, and absence of meta keywords. These do not establish that the currently deployed site uses this source.

## Files changed for this audit

- `js/article-keyword-groups.js`
- `js/article-keyword-analysis.js`
- `js/article-keyword-groups.test.js`
- `js/article-keyword-analysis.test.js`
- `ANIMORO-SEO-KEYWORD-FIELDS-AUDIT.md`

The requested production build also refreshed the already-dirty tracked HTML outputs under `dist/` (about, admin-login, admin-post-editor, admin, blog, blogs, category, contact, index, and search). Those paths were already modified before this audit began. The build outputs were left in place; no attempt was made to restore or discard pre-existing work.

## Tests and results

| Check | Result |
|---|---|
| Focused keyword, field fallback, article-handler, and article-rendering tests | PASS — 48 passed, 0 failed |
| `npm test` | FAIL — 284 passed, 1 failed, 285 total |
| `npm run lint` (`tsc --noEmit`) | PASS |
| Production Vite build after the source fix, using a temporary output directory | PASS |

The full-suite failure is `api/_lib/analytics.test.js` at the analytics classification assertion: it expects an empty host but receives `www.animoro.in`. Both the test and related analytics source were already modified in the working tree before this audit. This failure is outside the keyword change and was not altered.

The build emits the existing warning that the minified `auth` chunk exceeds 500 kB. The test runner emits Node's `punycode` deprecation warning. Neither prevented the focused tests, lint, or production build from completing.

## Remaining issues and deployment requirements

1. Run the authenticated editor lifecycle against the Firebase emulator or a dedicated staging project to exercise actual UI save, reload, edit, and clear behavior. The repository has an emulator integration script, but it was not run in this audit.
2. Verify representative legacy and new records in staging before production. No migration is required by these changes; avoid bulk rewriting existing articles.
3. Confirm deployed Firestore indexes are current for the existing `status` plus keyword-array related-post queries, including `relatedKeywords`. The repository index file contains those definitions; deployment state was not verified.
4. Review AEO answers and character/power relevance editorially. Analyzer results are heuristic and do not verify factual support.
5. Resolve the unrelated analytics test failure before treating the full test suite as green.
6. Deploy only through the normal reviewed release process. No deployment, production Firestore access, or live URL verification occurred here.
