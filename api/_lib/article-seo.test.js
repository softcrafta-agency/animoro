import assert from 'node:assert/strict';
import test from 'node:test';
import { getArticleSeo } from '../../js/article-seo.js';

test('uses a distinct short description from the article body when summaries are empty', () => {
  assert.deepEqual(getArticleSeo({
    title: 'Top 5 Anime in India',
    excerpt: ' ',
    content: '<p>Discover the standout fantasy series &amp; films to watch.</p><script>Ignore this text.</script>',
  }), {
    title: 'Top 5 Anime in India',
    description: 'Discover the standout fantasy series & films to watch.',
  });
});

test('custom SEO values override defaults and clearing them restores generated values', () => {
  const post = {
    title: 'Top 5 Anime in India',
    excerpt: 'A concise article summary for readers.',
    seoTitle: 'Best Anime in India – Top 5 Must Watch Anime',
    seoDescription: 'A custom search description.',
  };

  assert.deepEqual(getArticleSeo(post), {
    title: 'Best Anime in India – Top 5 Must Watch Anime',
    description: 'A custom search description.',
  });
  assert.deepEqual(getArticleSeo({ ...post, seoTitle: '', seoDescription: '' }), {
    title: 'Top 5 Anime in India',
    description: 'A concise article summary for readers.',
  });
});

test('limits generated descriptions without altering custom descriptions', () => {
  const generated = getArticleSeo({
    title: 'Long story',
    excerpt: `${'A useful summary. '.repeat(20)}`,
  }).description;
  const custom = getArticleSeo({
    title: 'Long story',
    seoDescription: 'A'.repeat(200),
  }).description;

  assert.ok(generated.length <= 160);
  assert.equal(custom.length, 200);
});
