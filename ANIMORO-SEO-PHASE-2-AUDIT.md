# Animoro SEO Phase 2 Audit

**Project:** https://www.animoro.in  
**Audit date:** 2026-11-16  
**Production/staging access:** Not used. No production records were read, changed, or deployed.

## Status summary

| Area | Status | Findings | Fix or verification |
|---|---|---|---|
| Analytics same-site referrers | PASS | `www.animoro.in` was treated as an external referrer when the configured site host was `animoro.in`. | `sanitizeReferrer()` now compares normalized hostnames; apex, `www`, and custom-host aliases have regression assertions. |
| Additional SEO Keywords | PARTIAL | Group normalization, payload serialization, emulator persistence, and clear behavior pass. Browser-level Enter/paste/edit/remove events were not exercised. | Kept the existing tag manager; tested exact phrase analysis and the emulator serialization lifecycle. |
| Story and Character Keywords | PARTIAL | Group persistence and advisory context/name-consistency signals are covered. The analyzer cannot establish character identity or canon. | Added context and naming-review recommendations; no character names, powers, or facts are generated. |
| Long-tail SEO Keywords | PARTIAL | Exact phrase presence and explanatory context are checked; question-shaped long tails also require an H2/H3 and a direct contextual answer. This is not semantic query understanding. | Added long-tail completeness checks and recommendations, with no automatic content edits. |
| Question-Based Keywords (AEO) | PARTIAL | H2/H3 placement, the next visible block, first-sentence directness, relevance overlap, and supporting detail are checked. The analyzer cannot fact-check answers. | Tightened answer checks so length or a later keyword mention alone is insufficient. No FAQ answers or structured data are generated. |
| Secondary Keywords / legacy aliases | PARTIAL | `secondaryKeywords`, `keywords`, and `relatedKeywords` are verified in emulator create/edit/reload/clear/publish flows, including legacy fallback. Browser-level editor controls were not exercised. | Verified aliases remain synchronized on saves and legacy values remain available; no migration was run. |
| Keyword/content analysis | PARTIAL | Exact phrase, duplicate/similarity, relevance, title/heading/body coverage, and the new contextual checks are covered by tests. Matching remains lexical and heuristic. | Added advisory recommendations, score calculations, and regression cases; no claims of canon verification or ranking prediction. |
| Firestore persistence | PARTIAL | A local demo-project emulator verified serializer-backed creation, reload, independent updates, individual removal, clearing, legacy preservation, and published visibility. This did not drive the browser editor or production API. | Expanded `scripts/keyword-emulator-integration.js`; all temporary documents and the test Auth user were removed. |
| Firestore index definitions | PARTIAL | Repository indexes define `status` + `secondaryKeywords`, `status` + `keywords`, and `status` + `relatedKeywords` array indexes. Deployed index state was not inspected. | No index or record migration was made. |
| Public SEO rendering | PASS | Existing article-render tests verify visible content, title/description, canonical, Open Graph, BlogPosting/Breadcrumb data, heading behavior, and that planning keywords are not emitted as metadata. | Public rendering modules were not changed; no `meta keywords`, hidden keywords, or generated FAQs were added. Live deployment was not checked. |
| Editorial score display | PASS | Six bounded 0–100 scores and advisory recommendations are wired into the editor; targeted tests validate score bounds and recommendation fields. | Score definitions and limitations are displayed next to the scores. |

`PARTIAL` means the source/tests cover the behavior but a browser-authenticated, staging, or semantic/factual verification remains outstanding.

## 1. Analytics test failure

### Root cause

The failing assertion reproduced with `sanitizeReferrer('https://www.animoro.in/blog/story')`: the function returned `www.animoro.in` instead of an empty host. The default configured host was the apex domain, and the referrer check compared the hostnames without treating the apex and `www` forms as the same site.

### Fix and regression coverage

`sanitizeReferrer()` now normalizes case, a terminal dot, and a leading `www.` on both the referrer hostname and configured site host before comparing them. It still returns the original normalized external hostname for genuine external referrers and rejects invalid/non-HTTP(S) URLs.

Regression assertions cover:

- `www.animoro.in` and `animoro.in` as same-site aliases.
- Custom apex/`www` host aliases.
- External referrer hostname preservation and invalid URL handling.

The focused analytics suite passes **7/7**. The full suite, including this regression, passes **288/288**.

## 2. Emulator lifecycle verification

The integration script is guarded to require project `demo-animoro-keyword-test` and localhost emulator endpoints. The default full-emulator launch initially could not start Firestore because `127.0.0.1:8080` was already occupied. The listener was confirmed to be the local Firestore Emulator configured for the same demo project and this repository's `firestore.rules`. The test was then run with a fresh Auth Emulator and that local Firestore Emulator; no production endpoint was used.

The extended run passed:

1. Create a draft containing all four keyword groups and secondary keyword aliases.
2. Read the document and reload it through a fresh authenticated Firebase client.
3. Independently update all four groups while preserving other article fields.
4. Remove one individual grouped phrase without changing its sibling.
5. Edit and remove secondary keywords while keeping `secondaryKeywords`, `keywords`, and `relatedKeywords` synchronized.
6. Clear an entire grouped field and verify the other groups remain.
7. Read and update a legacy document containing only `keywords` / `relatedKeywords`, confirming that fallback values and existing content remain intact.
8. Create a published document, verify public read access while draft reads remain denied, and verify all keyword fields.
9. Delete all temporary article documents and the test Auth user.

This is an emulator-backed Firestore serializer/rules test, **not** a browser-driven test of the Admin Article Editor's Enter, comma, Edit, Remove, and Save controls, nor an authenticated staging/API test. Production Firestore was not accessed.

## 3. Content relevance and AEO changes

The new **Content Relevance Analysis** panel is advisory and does not change or rewrite article content. Its recommendations include:

- Weak or missing introduction/topic alignment.
- SEO-title promises (list, comparison, explanation) not reflected in article structure.
- Selected search intent with limited supporting signals; inferred format cues include comparative, explanatory, list-based, and informational.
- Keywords without paragraph context, with insufficient explanation, or with little lexical overlap.
- Long-tail phrases that lack contextual explanation; question-shaped long tails also require an H2/H3 and a direct, informative answer.
- Story/character phrases needing details, similar phrases that may indicate naming inconsistency, and potentially unrelated phrases.
- Unanswered or weakly answered AEO questions.
- Generic/short H2/H3 headings, repeated paragraphs, and absolute/canon-sensitive language that needs source review.

Each recommendation exposes **what is wrong, why it matters, where it occurs, and what the editor should improve**. Dynamic text is rendered through `textContent`. Canon-sensitive wording is flagged only for human review; the tool does not verify anime facts or invent characters, powers, relationships, story arcs, answers, or keywords.

AEO acceptance requires a matching H2/H3, sufficient supporting detail, overall relevant term overlap, and overlap in the first answer sentence. The phrase/term checks remain heuristic; a passing result is not proof that an answer is correct. The system continues to produce no FAQ content or FAQ structured data.

## 4. Editorial score methodology

The UI labels these as editorial scores, **not Google ranking scores or predictions**:

| Score | Calculation |
|---|---|
| Keyword Coverage | Percentage of supplied primary, secondary, and grouped phrases found as complete phrases in the title or visible article text/headings. |
| Search Intent | `35%` introduction/topic-term overlap + `20%` article text volume (capped at 180 meaningful words) + `25%` evidence for selected intent + `20%` SEO-title promise fulfillment. If the title makes no detected format promise, that component is treated as fulfilled. |
| Content Relevance | Mean context score across supplied phrases: explanatory paragraph context scores above title/heading-only mentions and partial lexical overlap. The score does not establish semantic relevance. |
| AEO Coverage | Percentage of entered questions with a matching H2/H3 and a following answer that is direct in its first sentence, sufficiently detailed, and lexically relevant. It does not check factual truth. |
| Heading Quality | H2 presence (`30%`) + descriptive H2/H3 share (`50%`) + valid H3-under-H2 hierarchy (`20%`). |
| Character/Story Coverage | For each entered story/character phrase, paragraph presence contributes up to half the score and explanatory context contributes the remainder. No character or canon database is consulted. |

A score of zero can mean that no applicable phrases or questions were entered. Word-count, overlap, heading, title-promise, and answer checks are editorial signals with known false positives/negatives; editors should review the article and sources directly.

## 5. Firestore, bulk editing, and public rendering

- The existing four grouped fields remain separate; update payloads continue to omit untouched absent fields and preserve unrelated article values.
- Secondary keyword compatibility continues to read the non-empty legacy fallback from `secondaryKeywords`, `keywords`, or `relatedKeywords`; the emulator verified legacy fallback and that updating an unrelated field does not clear those arrays.
- Existing bulk editing still uses the shared secondary keyword helpers; grouped keyword fields are not added to bulk editing. No bulk write or migration was performed.
- `firestore.indexes.json` contains the existing `status` plus array indexes for `secondaryKeywords`, `keywords`, and `relatedKeywords`. Firebase Console/deployed index state was not verified.
- The public article renderer was not changed. Existing rendering tests in the full suite cover canonical URL, SEO title/description, Open Graph, visible article content, heading output, and BlogPosting/Breadcrumb structured data; keyword guidance remains private and no `meta keywords` or FAQ schema is emitted.
- No published article content or real Firestore record was changed.

## 6. Files changed for Phase 2

- `api/_lib/analytics.js`
- `api/_lib/analytics.test.js`
- `js/article-keyword-analysis.js`
- `js/article-keyword-analysis.test.js`
- `js/admin-editor.js`
- `admin-post-editor.html`
- `css/admin.css`
- `scripts/keyword-emulator-integration.js`
- `ANIMORO-SEO-PHASE-2-AUDIT.md`

The earlier `ANIMORO-SEO-KEYWORD-FIELDS-AUDIT.md` remains the baseline and was not replaced.

## 7. Validation results

| Check | Result |
|---|---|
| Focused analyzer, field, groups, and analytics tests | PASS — 33 passed, 0 failed |
| `npm test` | PASS — 288 passed, 0 failed |
| `npm run lint` | PASS — `tsc --noEmit` |
| Production Vite build to isolated session output | PASS |
| `npm run build` | PASS — generated standard `dist/` output; existing tracked `dist/` files were already modified in the worktree before this phase. |
| Extended Firebase Auth/Firestore Emulator integration | PASS — all listed assertions passed; temporary test data cleaned up. |
| Browser-driven Admin Article Editor lifecycle | NOT VERIFIED |
| Staging/production Firestore and deployed indexes | NOT VERIFIED |
| Live public-page rendering/deployment | NOT VERIFIED |

The build reports the existing large `auth` chunk warning (>500 kB after minification); it did not fail. Node also reports a `punycode` deprecation warning during emulator/test tooling.

`npm run build` regenerated the ten tracked HTML outputs under `dist/` that were already modified before this phase: `about.html`, `admin-login.html`, `admin-post-editor.html`, `admin.html`, `blog.html`, `blogs.html`, `category.html`, `contact.html`, `index.html`, and `search.html`. They remain modified; no pre-existing worktree changes were restored or discarded.

## 8. Remaining blockers and deployment checklist

1. In a dedicated staging environment, authenticate to the Admin Article Editor and manually verify Enter/comma input, paste, duplicate handling, edit/remove, save/reload, and intentional clearing for all five fields.
2. Repeat a create/draft/update/publish/reopen test through the actual editor and deployed Firestore rules; verify unrelated article fields remain unchanged.
3. Confirm deployed composite indexes match `firestore.indexes.json`, especially `relatedKeywords` and its legacy fallback query.
4. Have an editor review the new relevance/AEO signals on representative articles, including likely false positives/negatives; independently source-check all canon-sensitive claims.
5. Confirm the final built `dist/` artifacts are included only as intended in the normal release process. No deployment was performed or authorized.
