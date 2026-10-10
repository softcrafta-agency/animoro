import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeaturedHandler } from '../featured.js';

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

function createDocument(id, data) {
  return { id, data: () => data };
}

function createFirestore({ featured = [], latest = [] } = {}) {
  const queries = [];
  const firestore = {
    collection(name) {
      const constraints = [];
      return {
        where(...args) {
          constraints.push(['where', ...args]);
          queries.push(['where', ...args]);
          return this;
        },
        orderBy(...args) {
          queries.push(['orderBy', ...args]);
          return this;
        },
        select(...fields) {
          queries.push(['select', ...fields]);
          return this;
        },
        limit(count) {
          queries.push(['limit', count]);
          return this;
        },
        async get() {
          const requestedFeatured = constraints.some(query =>
            query[0] === 'where' && query[1] === 'featured'
          );
          const requestedDocumentId = constraints.some(query =>
            typeof query[1] === 'object'
          );
          if (requestedDocumentId) {
            return { docs: [featured[0] || latest[0]].filter(Boolean) };
          }
          return { docs: requestedFeatured ? featured : latest };
        },
      };
    },
  };
  return { firestore, queries };
}

test('returns only the first featured cover before the hero renders without caching publication data', async () => {
  const { firestore, queries } = createFirestore({
    featured: [
      createDocument('featured-1', {
        title: 'Featured Story',
        slug: 'featured-story',
        excerpt: 'A short summary',
        coverImage: 'https://images.example/cover.webp',
        category: 'Reviews',
        authorName: 'Editor',
        featuredOrder: 1,
        publishedAt: { toDate: () => new Date('2026-10-01T00:00:00Z') },
        content: 'This large article body must not be selected.',
      }),
      createDocument('featured-2', {
        title: 'Second Story',
        slug: 'second-story',
        coverImage: 'https://images.example/second.webp',
        featuredOrder: 2,
      }),
    ],
  });
  const response = createResponse();
  const handler = createFeaturedHandler({ getServices: () => ({ firestore }) });

  await handler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const body = JSON.parse(response.body);
  assert.equal(body.featured[0].title, 'Featured Story');
  assert.equal(body.featured[0].coverImage, 'https://images.example/cover.webp');
  assert.equal('coverImage' in body.featured[1], false);
  assert.equal(body.imagesDeferred, true);
  assert.equal(body.featured[0].publishedAt, '2026-10-01T00:00:00.000Z');
  assert.equal('content' in body.featured[0], false);
  assert.ok(queries.some(query => query[0] === 'select' && !query.includes('content')));
});

test('returns remaining cover URLs separately after the initial hero image loads', async () => {
  const { firestore } = createFirestore({
    featured: [
      createDocument('featured-1', { coverImage: 'https://images.example/cover.webp', featuredOrder: 1 }),
      createDocument('featured-2', { coverImage: 'https://images.example/second.webp', featuredOrder: 2 }),
    ],
  });
  const response = createResponse();
  const handler = createFeaturedHandler({ getServices: () => ({ firestore }) });

  await handler({ method: 'GET', url: '/api/featured?images=1' }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const body = JSON.parse(response.body);
  assert.deepEqual(body.featuredImages, [
    { id: 'featured-1', coverImage: 'https://images.example/cover.webp' },
    { id: 'featured-2', coverImage: 'https://images.example/second.webp' },
  ]);
});

test('loads a limited latest-post fallback when there are no featured stories', async () => {
  const { firestore } = createFirestore({
    latest: [createDocument('latest-1', {
      title: 'Latest Story',
      publishedAt: { toDate: () => new Date('2026-10-02T00:00:00Z') },
    })],
  });
  const response = createResponse();
  const handler = createFeaturedHandler({ getServices: () => ({ firestore }) });

  await handler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body).featured, []);
  assert.equal(JSON.parse(response.body).latest[0].title, 'Latest Story');
});

test('rejects methods other than GET and HEAD without caching the response', async () => {
  const response = createResponse();
  const handler = createFeaturedHandler();

  await handler({ method: 'POST' }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
  assert.equal(response.headers['cache-control'], 'no-store');
});
