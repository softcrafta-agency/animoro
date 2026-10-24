import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidArticleCategory,
  isValidFeaturedOrder,
  isValidSearchIntent,
  normalizeArticleKeywords,
  normalizeArticleTags,
} from './article-editor-fields.js';

test('normalizes tags and prevents case-insensitive duplicates', () => {
  assert.deepEqual(
    normalizeArticleTags([' #Action ', 'action', '', '#Drama', 'Drama']),
    ['Action', 'Drama']
  );
});

test('normalizes related keywords and removes duplicates', () => {
  assert.deepEqual(
    normalizeArticleKeywords(' Black Torch, black torch , Jiro Azuma, , supernatural anime, Black Torch '),
    ['Black Torch', 'Jiro Azuma', 'supernatural anime']
  );
});

test('accepts supported search intents only', () => {
  assert.equal(isValidSearchIntent('informational'), true);
  assert.equal(isValidSearchIntent('commercial'), true);
  assert.equal(isValidSearchIntent('unknown'), false);
});

test('accepts registered categories and preserves an existing legacy category', () => {
  const registeredCategories = ['Anime News', 'Romance Anime'];
  assert.equal(isValidArticleCategory('Anime News', registeredCategories), true);
  assert.equal(isValidArticleCategory('Romance Anime', registeredCategories), true);
  assert.equal(isValidArticleCategory('Legacy Category', registeredCategories, 'Legacy Category'), true);
  assert.equal(isValidArticleCategory('Unsupported', registeredCategories), false);
});

test('accepts non-negative whole slider orders only', () => {
  assert.equal(isValidFeaturedOrder('0'), true);
  assert.equal(isValidFeaturedOrder('12'), true);
  assert.equal(isValidFeaturedOrder('-1'), false);
  assert.equal(isValidFeaturedOrder('1.5'), false);
  assert.equal(isValidFeaturedOrder(''), false);
});
