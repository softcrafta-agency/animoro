import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidArticleCategory,
  isValidFeaturedOrder,
  normalizeArticleTags,
} from './article-editor-fields.js';

test('normalizes tags and prevents case-insensitive duplicates', () => {
  assert.deepEqual(
    normalizeArticleTags([' #Action ', 'action', '', '#Drama', 'Drama']),
    ['Action', 'Drama']
  );
});

test('accepts supported categories only', () => {
  assert.equal(isValidArticleCategory('Anime News'), true);
  assert.equal(isValidArticleCategory('Unsupported'), false);
});

test('accepts non-negative whole slider orders only', () => {
  assert.equal(isValidFeaturedOrder('0'), true);
  assert.equal(isValidFeaturedOrder('12'), true);
  assert.equal(isValidFeaturedOrder('-1'), false);
  assert.equal(isValidFeaturedOrder('1.5'), false);
  assert.equal(isValidFeaturedOrder(''), false);
});
