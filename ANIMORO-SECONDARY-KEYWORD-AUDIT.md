# Animoro Secondary Keyword Audit

**Audit date:** 2026-11-11  
**Scope:** Repository source, attached `blogs.html`, article editor/save paths, article retrieval/rendering, metadata, related-article queries, sitemap and canonical tests.  
**Production access:** No Firebase records, Search Console export, or deployed pages were available in this audit. Findings below are source- and test-based; live article content and production behavior remain unverified.

## 1. Problems discovered

| Severity | Finding |
|---|---|
| HIGH | Existing articles with `secondaryKeywords: []` could lose legacy keyword phrases in the edit form. The nullish fallback treated an empty array as a populated canonical field and never checked `keywords` or `relatedKeywords`. |
| MEDIUM | The related-article query used `secondaryKeywords` and `keywords`, but did not query the supported legacy `relatedKeywords` field. |
| MEDIUM | The editor stored keyword targeting fields but gave no indication whether phrases appeared in authored content or headings. The field could therefore look “saved” without helping an editor use the phrases in the article. |
| LOW | Several canonical assertions expected `www.animoro.in`, while the current article URL helper and sitemap source use `https://animoro.in`. These tests could not validate the current source behavior. |
| PASSED | Admin input supports one phrase per line and comma-separated input. Normalization trims/collapses whitespace and removes case-insensitive duplicates. |
| PASSED | Article creation, normal editing, and bulk editing save `primaryKeyword`, `secondaryKeywords`, and the backward-compatible combined `keywords` array. |
| PASSED | Published article metadata does not emit a `meta keywords` tag or insert targeting fields into structured data. It uses the SEO title/description fields or existing title/excerpt/body fallbacks. |
| PASSED | Article output has one page H1, preserves authored H2/H3 content, and generates canonical, Open Graph/Twitter metadata, BlogPosting, and BreadcrumbList output. |

## 2. Root causes

### Legacy edit fallback

The edit form used nullish coalescing for `secondaryKeywords`. Since an empty array is not nullish, it masked old values stored in `keywords` or `relatedKeywords`. The form now reads the first non-empty normalized value, supports the legacy aliases, and excludes the primary phrase from the secondary list when the old combined `keywords` field is used as a fallback.

### Related links

The server-rendered article handler already queries keyword fields to find related published posts, but it omitted `relatedKeywords`. The query now checks all three supported fields. A Firestore composite index was added for `status` plus `relatedKeywords`.

### Content use versus SEO metadata

Keywords were saved and used for site search/related-post discovery, but were not used to write article text or metadata. Automatically inserting them would risk unnatural copy and metadata duplication. The editor now shows a live editorial-only count of phrases present in article text and H2–H6 headings. It does not insert phrases, alter saved content, or publish them in a meta keywords tag.

## 3. Files modified

- `admin-post-editor.html` — added the editor-only coverage status.
- `js/article-editor-fields.js` — shared keyword save fields, legacy fallback, and content/heading coverage helpers.
- `js/article-editor-fields.test.js` — save normalization, fallback, and coverage tests.
- `js/admin-editor.js` — restored legacy keywords, used shared save fields, and updated coverage status on edits.
- `js/admin-posts.js` — integrated shared keyword behavior with bulk editing.
- `js/admin-bulk-edit.js` — supports field-specific record-to-editor values for legacy keyword restoration.
- `api/article.js` — related-post queries now include the `relatedKeywords` compatibility field.
- `firestore.indexes.json` — added the required related-keyword query index.
- `api/_lib/article-handler.test.js` — legacy related-keyword matching test and apex canonical expectation.
- `api/_lib/article-html.test.js` — authored content, metadata, schema/canonical and no-meta-keywords assertions.
- `api/_lib/blogs-handler.test.js`, `api/_lib/sitemap-handler.test.js`, `api/_lib/sitemap.test.js`, `api/_lib/anime-routing.test.js` — aligned stale canonical expectations with the configured apex canonical host.
- `dist/` — regenerated build output; deployment should still use the normal build pipeline.

No separate `seo-renderer.js` exists in the repository. Article metadata and structured data are rendered by `api/_lib/article-html.js` using `js/article-seo.js`.

## 4. Fixes implemented

- Centralized keyword payload generation so article create/edit and bulk edit keep the same Firestore field names:
  - `primaryKeyword`: normalized primary phrase.
  - `secondaryKeywords`: normalized supporting phrases.
  - `keywords`: backward-compatible combined array.
- Saves the legacy `relatedKeywords` alias in sync, so deliberately clearing phrases does not restore stale legacy values on the next edit.
- Kept both line-separated and comma-separated input formats.
- Removed duplicate phrases case-insensitively and collapsed internal whitespace.
- Added legacy read fallback for `keywords` and `relatedKeywords`, including when the newer field is an empty array.
- Added a live editorial coverage count for phrases occurring in the article body and in H2–H6 headings. It is advisory and never changes article text.
- Extended related-post lookup to the legacy `relatedKeywords` field and added its Firestore index.
- Kept keyword fields out of SEO title/description, JSON-LD, and meta keywords. SEO title and description continue to use explicit editor values or existing title/excerpt/body fallbacks.
- Updated stale test expectations to assert the source-configured `https://animoro.in` canonical host. This validates repository configuration; it does not prove live DNS/redirect behavior.

## 5. Tests performed and results

### Targeted tests

Ran article field, article SEO/rendering, handler, routing, blogs listing, and sitemap tests:

- **56 passed**
- **0 failed**

Coverage includes newline and comma parsing, duplicate removal, new/edit payload shape, legacy keyword restoration, editor coverage calculation, related-post matching, article HTML metadata, structured data, canonical output, and sitemap URLs.

### Full verification

- `npm test` — **259 passed, 0 failed**
- `npm run lint` — **passed**
- `npm run build` — **passed**

The test run emitted Node's existing `punycode` deprecation warning. The build emitted the existing large-chunk warning for the `auth` bundle (about 891 kB minified); neither warning was caused by the keyword changes.

No live Firestore write/read, admin login, Search Console validation, external schema validator, or deployed endpoint check was run.

## 6. Before-and-after examples

### Editing a legacy record

**Before:** `secondaryKeywords: []`, `keywords: ["Black Torch", "Jiro Azuma"]` reopened with an empty secondary-keyword field because the empty array blocked fallback.

**After:** The edit form restores `Jiro Azuma` as a secondary phrase, while excluding the primary `Black Torch` phrase from the secondary list. If the editor then intentionally clears the phrases, all supported fields are saved consistently and the stale legacy terms do not return.

### Input formats

**Before and after:** `Jiro Azuma, supernatural anime` and:

```text
Jiro Azuma
supernatural anime
```

both normalize to:

```json
["Jiro Azuma", "supernatural anime"]
```

Repeated values differing only by case and extra whitespace are stored once.

### Published article

**Before:** Keyword phrases were saved but did not help authors see whether they had been used in article copy.

**After:** The editor can report, for example, “2 of 3 phrases appear in the article and 1 in a heading.” This is an editorial aid only; no content is generated and no `meta keywords` tag is emitted.

## 7. Remaining issues and manual actions

1. Deploy the new `relatedKeywords` composite index with the normal Firestore index deployment process before relying on related-post queries for legacy `relatedKeywords` records.
2. Verify representative old and new article records through the live admin editor after deployment. No production Firestore data was inspected or modified here.
3. Check live article pages for title, description, canonical, Open Graph/Twitter, H1/H2, BlogPosting, BreadcrumbList, and related links after deployment.
4. Review actual published article copy manually. The system reports phrase presence but cannot judge factual relevance, naturalness, or whether an internal link is editorially appropriate.
5. The supplied attachment was `blogs.html`, which is an article-listing template rather than article records or a Search Console export. Actual target slugs, titles, descriptions, and article-level keyword placement therefore could not be audited from that attachment.
6. No Google ranking or indexing improvement is claimed. Search Console evidence and post-deployment measurements are required for those conclusions.

**Deployment status:** Not deployed.
