import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeArticleSearchText, scoreArticleSearch } from './article-search.js';

test('normalizes case, punctuation, accents, and repeated spaces', () => {
  assert.equal(normalizeArticleSearchText('  Jíro   Azuma—Rago! '), 'jiro azuma rago');
});

test('ranks exact titles ahead of title, keyword, and body matches', () => {
  const exactTitle = { title: 'Black Torch' };
  const titlePhrase = { title: 'Black Torch Anime Story Explained' };
  const keywordMatch = { title: 'A Supernatural Story', secondaryKeywords: ['Black Torch manga'] };
  const bodyMatch = { title: 'A Supernatural Story', content: '<p>Black Torch manga adaptation</p>' };

  assert.ok(scoreArticleSearch(exactTitle, 'Black Torch') > scoreArticleSearch(titlePhrase, 'Black Torch'));
  assert.ok(scoreArticleSearch(titlePhrase, 'Black Torch') > scoreArticleSearch(keywordMatch, 'Black Torch'));
  assert.ok(scoreArticleSearch(keywordMatch, 'Black Torch manga') > scoreArticleSearch(bodyMatch, 'Black Torch manga'));
});

test('matches legacy keywords, primary focus phrases, and basic plural variations', () => {
  assert.ok(scoreArticleSearch({ keywords: ['Jiro Azuma'] }, 'jiro azuma') > 0);
  assert.ok(scoreArticleSearch({ primaryKeyword: 'supernatural anime' }, 'supernatural anime') > 0);
  assert.ok(scoreArticleSearch({ secondaryKeywords: ['anime stories'] }, 'anime story') > 0);
});

test('does not match article content on only one token of a multiword query', () => {
  assert.equal(
    scoreArticleSearch({ title: 'Black Torch', content: 'A manga review.' }, 'Black Torch manga adaptation'),
    0
  );
});

test('does not return body-only matches for common anime-site terms', () => {
  assert.equal(scoreArticleSearch({ title: 'Ninja Battles', content: '<p>An anime story about friendship.</p>' }, 'anime'), 0);
  assert.ok(scoreArticleSearch({ secondaryKeywords: ['anime'] }, 'anime') > 0);
});
