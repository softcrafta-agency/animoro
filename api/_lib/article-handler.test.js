import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createArticleHandler } from '../article.js';

const template = await readFile(new URL('../../blog.html', import.meta.url), 'utf8');

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
      return body;
    },
  };
}

function createServices(article) {
  const firestore = {
    collection(name) {
      return {
        where() { return this; },
        orderBy() { return this; },
        limit() { return this; },
        async get() {
          if (name === 'posts') {
            return { docs: article ? [{ id: 'article-1', data: () => article }] : [] };
          }
          return { docs: [] };
        },
      };
    },
  };
  return { firestore };
}

test('returns complete HTML and cache headers for a published article', async () => {
  const handler = createArticleHandler({
    getServices: () => createServices({
      title: 'Published Story',
      slug: 'published-story',
      status: 'published',
      content: '<p>Published article body.</p>',
      category: '',
    }),
    loadTemplate: async () => template,
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { slug: 'published-story' }, url: '/api/article?slug=published-story' }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.headers['cache-control'], /s-maxage=60/);
  assert.match(response.body, /<h1 class="article-page-title">Published Story<\/h1>/);
  assert.match(response.body, /Published article body\./);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blog\.html\/published-story"/);
});

test('returns 404 for missing and unpublished articles', async () => {
  for (const article of [null, {
    title: 'Draft',
    slug: 'draft',
    status: 'draft',
    content: '<p>Private content.</p>',
  }]) {
    const handler = createArticleHandler({
      getServices: () => createServices(article),
      loadTemplate: async () => template,
    });
    const response = createResponse();

    await handler({ method: 'GET', query: { slug: article?.slug || 'missing' }, url: '/api/article' }, response);

    assert.equal(response.statusCode, 404);
    assert.match(response.headers['cache-control'], /no-store/);
    assert.match(response.body, /<meta name="robots" content="noindex, nofollow">/);
    assert.doesNotMatch(response.body, /Private content/);
  }
});

test('rejects malformed slugs without querying Firestore', async () => {
  let didReadFirestore = false;
  const handler = createArticleHandler({
    getServices: () => {
      didReadFirestore = true;
      return createServices(null);
    },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { slug: '../admin' }, url: '/api/article' }, response);

  assert.equal(response.statusCode, 404);
  assert.equal(didReadFirestore, false);
});
