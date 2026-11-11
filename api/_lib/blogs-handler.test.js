import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createBlogsHandler } from '../blogs.js';

const template = await readFile(new URL('../../blogs.html', import.meta.url), 'utf8');

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

function createServices(posts) {
  return {
    firestore: {
      collection(name) {
        assert.equal(name, 'posts');
        function createQuery(filters = []) {
          return {
            where(field, operator, value) {
              return createQuery([...filters, { field, operator, value }]);
            },
            orderBy() { return createQuery(filters); },
            limit() { return createQuery(filters); },
            async get() {
              const matches = posts.filter(post => filters.every(filter => {
                if (filter.field === 'status') return post.status === filter.value;
                if (filter.field === 'categories') return post.categories?.includes(filter.value);
                if (filter.field === 'category') return post.category === filter.value;
                return true;
              }));
              return {
                docs: matches.map((post, index) => ({
                  id: post.id || String(index),
                  data: () => post,
                })),
              };
            },
          };
        }
        return createQuery();
      },
    },
  };
}

test('renders published article cards in the canonical listing HTML', async () => {
  const handler = createBlogsHandler({
    getServices: () => createServices([
      {
        title: 'Published & Useful',
        slug: 'published-useful',
        status: 'published',
        category: 'Guides',
        excerpt: '<script>alert(1)</script>Useful excerpt.',
        publishedAt: new Date('2026-11-09T12:00:00Z'),
      },
      { title: 'Draft Story', slug: 'draft-story', status: 'draft' },
      { title: 'Missing Slug', status: 'published' },
    ]),
    loadTemplate: async () => template,
    logger: { error() { assert.fail('A valid listing request must not be logged as an error.'); } },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.headers['cache-control'], /s-maxage=60/);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/animoro\.in\/blogs\.html"/);
  assert.match(response.body, /href="\/blog\/published-useful"/);
  assert.match(response.body, /Published &amp; Useful/);
  assert.match(response.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;Useful excerpt\./);
  assert.doesNotMatch(response.body, /Draft Story|Missing Slug|BLOG_ARTICLES/);
});

test('renders category-filtered results from current and legacy category fields', async () => {
  const handler = createBlogsHandler({
    getServices: () => createServices([
      { id: 'array-category', title: 'Array Category', slug: 'array-category', status: 'published', categories: ['Reviews'] },
      { id: 'legacy-category', title: 'Legacy Category', slug: 'legacy-category', status: 'published', category: 'Reviews' },
      { id: 'other-category', title: 'Other Category', slug: 'other-category', status: 'published', category: 'Guides' },
    ]),
    loadTemplate: async () => template,
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { category: 'Reviews' } }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Array Category/);
  assert.match(response.body, /Legacy Category/);
  assert.doesNotMatch(response.body, /Other Category/);
});

test('returns an explicit 503 response when published articles cannot be read', async () => {
  const errors = [];
  const handler = createBlogsHandler({
    getServices() {
      throw new Error('Firestore unavailable');
    },
    logger: { error(...args) { errors.push(args); } },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: {} }, response);

  assert.equal(response.statusCode, 503);
  assert.match(response.body, /Articles Temporarily Unavailable/);
  assert.match(response.body, /noindex, nofollow/);
  assert.equal(errors.length, 1);
});
