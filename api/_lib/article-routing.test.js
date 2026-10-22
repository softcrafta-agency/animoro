import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { getArticlePath, getCanonicalArticleUrl } from '../../js/article-url.js';

const vercelConfig = JSON.parse(await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'));
const firebaseConfig = JSON.parse(await readFile(new URL('../../firebase.json', import.meta.url), 'utf8'));

test('article path and canonical use the preferred slug route', () => {
  const article = { title: 'Story', slug: 'best-magic-fantasy-anime' };

  assert.equal(getArticlePath(article), '/blog/best-magic-fantasy-anime');
  assert.equal(
    getCanonicalArticleUrl(article),
    'https://www.animoro.in/blog/best-magic-fantasy-anime'
  );
});

test('Vercel permanently redirects legacy paths before serving the new article route', () => {
  const redirect = vercelConfig.redirects.find(item => item.source === '/blog.html/:slug');
  const rewrite = vercelConfig.rewrites.find(item => item.source === '/blog/:slug');

  assert.deepEqual(redirect, {
    source: '/blog.html/:slug',
    destination: '/blog/:slug',
    statusCode: 308,
  });
  assert.deepEqual(rewrite, {
    source: '/blog/:slug',
    destination: '/api/article',
  });
  assert.equal(vercelConfig.rewrites.some(item => item.source === '/blog.html/:slug'), false);
});

test('Firebase Hosting permanently redirects old paths and rewrites the new route to the article shell', () => {
  const redirect = firebaseConfig.hosting.redirects.find(item => item.source === '/blog.html/:slug');
  const rewrite = firebaseConfig.hosting.rewrites.find(item => item.source === '/blog/**');

  assert.deepEqual(redirect, {
    source: '/blog.html/:slug',
    destination: '/blog/:slug',
    type: 301,
  });
  assert.deepEqual(rewrite, {
    source: '/blog/**',
    destination: '/blog.html',
  });
  assert.equal(firebaseConfig.hosting.rewrites.some(item => item.source === '/blog.html/**'), false);
});
