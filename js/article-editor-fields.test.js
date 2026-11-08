import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getArticleCategories,
  isValidArticleCategory,
  isValidArticleCategories,
  isValidFeaturedOrder,
  isValidSearchIntent,
  normalizeArticleCategories,
  normalizeArticleKeywords,
  normalizeArticleTags,
} from './article-editor-fields.js';

test('normalizes tags and prevents case-insensitive duplicates', () => {
  assert.deepEqual(
    normalizeArticleTags([' #Action ', 'action', '', '#Drama', 'Drama']),
    ['Action', 'Drama']
  );
});

test('normalizes legacy comma-separated keywords and removes duplicates', () => {
  assert.deepEqual(
    normalizeArticleKeywords(' Black Torch, black torch , Jiro Azuma, , supernatural anime, Black Torch '),
    ['Black Torch', 'Jiro Azuma', 'supernatural anime']
  );
});

test('normalizes newline-separated keywords and removes duplicates', () => {
  assert.deepEqual(
    normalizeArticleKeywords(' Black Torch\nJiro Azuma\r\nblack torch, supernatural anime\n'),
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

test('normalizes multi-category selections and prevents duplicates', () => {
  assert.deepEqual(
    normalizeArticleCategories([' Reviews ', 'Anime News', 'reviews', '', null]),
    ['Reviews', 'Anime News']
  );
  assert.deepEqual(getArticleCategories({ category: 'Legacy' }), ['Legacy']);
  assert.deepEqual(getArticleCategories({ category: ['Reviews', 'Anime News'] }), ['Reviews', 'Anime News']);
  assert.deepEqual(
    getArticleCategories({ category: 'Reviews', categories: ['Anime News', 'Reviews'] }),
    ['Anime News', 'Reviews']
  );
});

test('validates selected categories while preserving saved categories not in the registry', () => {
  const registeredCategories = ['Anime News', 'Reviews'];
  assert.equal(isValidArticleCategories(['Anime News', 'Reviews'], registeredCategories), true);
  assert.equal(isValidArticleCategories(['Saved Legacy'], registeredCategories, ['Saved Legacy']), true);
  assert.equal(isValidArticleCategories(['Unsupported'], registeredCategories), false);
  assert.equal(isValidArticleCategories([], registeredCategories), false);
});

test('accepts non-negative whole slider orders only', () => {
  assert.equal(isValidFeaturedOrder('0'), true);
  assert.equal(isValidFeaturedOrder('12'), true);
  assert.equal(isValidFeaturedOrder('-1'), false);
  assert.equal(isValidFeaturedOrder('1.5'), false);
  assert.equal(isValidFeaturedOrder(''), false);
});
