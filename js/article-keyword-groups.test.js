import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARTICLE_KEYWORD_GROUPS,
  buildArticleKeywordGroupsPayload,
  normalizeKeywordGroupValues,
} from './article-keyword-groups.js';

test('normalizes all keyword groups and removes whitespace/case duplicates', () => {
  const values = normalizeKeywordGroupValues({
    additionalSeoKeywords: ['  Black Torch  ', 'black   torch', 'manga, anime'],
    storyCharacterKeywords: ['Jiro Azuma\nJiro Azuma'],
    longTailKeywords: ['  how the story ends  '],
    questionBasedKeywords: ['Who is Jiro? , who is jiro?'],
  });

  assert.deepEqual(values, {
    additionalSeoKeywords: ['Black Torch', 'manga', 'anime'],
    storyCharacterKeywords: ['Jiro Azuma'],
    longTailKeywords: ['how the story ends'],
    questionBasedKeywords: ['Who is Jiro?'],
  });
});

test('includes every keyword group for a new article, including empty groups', () => {
  const payload = buildArticleKeywordGroupsPayload(
    { additionalSeoKeywords: ['topic'] },
    {},
    [],
    true
  );

  assert.deepEqual(Object.keys(payload), ARTICLE_KEYWORD_GROUPS.map(({ key }) => key));
  assert.deepEqual(payload.additionalSeoKeywords, ['topic']);
  assert.deepEqual(payload.storyCharacterKeywords, []);
});

test('preserves untouched existing fields and omits absent untouched fields on edits', () => {
  const payload = buildArticleKeywordGroupsPayload(
    {
      additionalSeoKeywords: [],
      storyCharacterKeywords: ['new character phrase'],
    },
    { additionalSeoKeywords: ['older keyword'] },
    ['storyCharacterKeywords'],
    false
  );

  assert.deepEqual(payload, {
    additionalSeoKeywords: [],
    storyCharacterKeywords: ['new character phrase'],
  });
  assert.equal(Object.hasOwn(payload, 'longTailKeywords'), false);
  assert.equal(Object.hasOwn(payload, 'questionBasedKeywords'), false);
});

test('does not add missing fields when an older article is edited elsewhere', () => {
  const payload = buildArticleKeywordGroupsPayload({}, {}, [], false);
  assert.deepEqual(payload, {});
});
