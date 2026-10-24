import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { shouldSkipPublicArticleView } from './article-view-policy.js';

const firestoreRules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');

test('skips non-public routes and explicit preview requests', () => {
  assert.equal(shouldSkipPublicArticleView({
    isPublicArticlePage: false,
    isPreviewRequest: false,
    hasAdminMarker: false,
    isAdmin: false,
  }), true);
  assert.equal(shouldSkipPublicArticleView({
    isPublicArticlePage: true,
    isPreviewRequest: true,
    hasAdminMarker: false,
    isAdmin: false,
  }), true);
});

test('skips marked and verified admin sessions, but keeps public visitor views', () => {
  const base = {
    isPublicArticlePage: true,
    isPreviewRequest: false,
    hasAdminMarker: false,
    isAdmin: false,
  };
  assert.equal(shouldSkipPublicArticleView(base), false);
  assert.equal(shouldSkipPublicArticleView({ ...base, isAdmin: true }), true);
  assert.equal(shouldSkipPublicArticleView({ ...base, hasAdminMarker: true }), true);
});

test('Firestore rules prevent admin view writes while preserving public cooldown increments', () => {
  const postRules = firestoreRules.split('match /posts/{postId}')[1]
    .split('match /posts/{postId}/viewers/{visitorId}')[0];
  const viewerRules = firestoreRules.split('match /posts/{postId}/viewers/{visitorId}')[1]
    .split('match /anime/{animeId}')[0];

  assert.match(postRules, /affectedKeys\(\)\.hasAny\(\['views', 'lastViewedAt'\]\)/);
  assert.match(postRules, /!isSuperOrDocAdmin\(\)\s*&&\s*resource\.data\.status == 'published'/);
  assert.match(postRules, /incoming\(\)\.views == existing\(\)\.views \+ 1/);
  assert.match(viewerRules, /allow create: if !isSuperOrDocAdmin\(\)/);
  assert.match(viewerRules, /allow update: if !isSuperOrDocAdmin\(\)/);
  assert.match(viewerRules, /request\.time > resource\.data\.viewedAt \+ duration\.value\(1, 'd'\)/);
});
