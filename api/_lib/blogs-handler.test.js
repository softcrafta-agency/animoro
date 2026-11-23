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
          let maximum = Infinity;
          return {
            where(field, operator, value) {
              return createQuery([...filters, { field, operator, value }]);
            },
            orderBy() { return createQuery(filters); },
            limit(value) { maximum = value; return this; },
            async get() {
              const matches = posts.filter(post => filters.every(filter => {
                if (filter.field === 'status') return post.status === filter.value;
                if (filter.field === 'categories') return post.categories?.includes(filter.value);
                if (filter.field === 'category') return post.category === filter.value;
                return true;
              }));
              return {
                docs: matches
                  .sort((left, right) => new Date(right.publishedAt || 0) - new Date(left.publishedAt || 0))
                  .slice(0, maximum)
                  .map((post, index) => ({
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
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blogs\.html"/);
  assert.match(response.body, /<title>Anime News, Reviews &amp; Guides \| Animoro<\/title>/);
  assert.match(response.body, /href="\/blog\/published-useful"/);
  assert.match(response.body, /Published &amp; Useful/);
  assert.match(response.body, /&lt;script&gt;alert\(1\)&lt;\/script&gt;Useful excerpt\./);
  assert.doesNotMatch(response.body, /Draft Story|Missing Slug|BLOG_ARTICLES/);
  assert.doesNotMatch(response.body, /BLOG_PAGINATION/);
});

test('renders crawlable pagination links with distinct page canonicals', async () => {
  const posts = Array.from({ length: 20 }, (_, index) => ({
    id: `post-${index + 1}`,
    title: `Article ${index + 1}`,
    slug: `article-${index + 1}`,
    status: 'published',
    publishedAt: new Date(`2026-11-${String(20 - index).padStart(2, '0')}T12:00:00Z`),
  }));
  const handler = createBlogsHandler({
    getServices: () => createServices(posts),
    loadTemplate: async () => template,
    logger: { error() { assert.fail('A valid archive page must not be logged as an error.'); } },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { page: '2' } }, response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /href="\/blogs\.html" rel="prev"/);
  assert.match(response.body, /href="\/blogs\.html\?page=3" rel="next"/);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blogs\.html\?page=2"/);
  assert.match(response.body, /<title>Anime News, Reviews &amp; Guides — Page 2 \| Animoro<\/title>/);
  assert.match(response.body, /<meta name="twitter:title" content="Anime News, Reviews &amp; Guides — Page 2 \| Animoro"/);
  assert.match(response.body, /<meta name="twitter:description" content="Page 2 of Animoro's latest anime news/);
  assert.match(response.body, /Article 10/);
  assert.doesNotMatch(response.body, /Article 1</);
});

test('rejects invalid archive page numbers instead of silently serving page one', async () => {
  const handler = createBlogsHandler({
    getServices: () => createServices([]),
    loadTemplate: async () => template,
    logger: { error() { assert.fail('Invalid page input is not a service error.'); } },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { page: '1001' } }, response);

  assert.equal(response.statusCode, 400);
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
  assert.match(response.body, /<title>Reviews — Animoro<\/title>/);
  assert.match(response.body, /<h1 class="section-title" id="blogArchiveTitle">Reviews<\/h1>/);
  assert.match(response.body, /href="https:\/\/www\.animoro\.in\/category\.html\?category=Reviews"/);
  assert.match(response.body, /<meta name="twitter:title" content="Reviews — Animoro"/);
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
