import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeoPageHandler } from './seo-page.js';

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

function createFirestore(records = {}) {
  return {
    collection(name) {
      const filters = [];
      return {
        where(field, operator, value) {
          filters.push({ field, operator, value });
          return this;
        },
        orderBy() { return this; },
        limit() { return this; },
        async get() {
          const matches = (records[name] || []).filter(record =>
            filters.every(({ field, value }) => field === 'categories'
              ? record.categories?.includes(value) || record.category === value
              : record[field] === value)
          );
          return {
            docs: matches.map((record, index) => ({
              id: record.id || String(index),
              data: () => record,
            })),
          };
        },
      };
    },
  };
}

function request(type, params = {}) {
  return { method: 'GET', query: { type, ...params }, url: '/' };
}

const templates = {
  anime: '<head><title>directory</title><meta name="description" content="directory"><meta property="og:title" content="directory"><meta property="og:description" content="directory"><meta property="og:url" content="directory"><link rel="canonical" href="directory"></head><h1 id="animePageTitle">Directory</h1><p id="animePageDescription">Directory</p><div id="animeDetail" hidden></div><section id="animeDirectorySection"></section>',
  upcoming: '<head><title>directory</title><meta name="description" content="directory"><meta property="og:title" content="directory"><meta property="og:description" content="directory"><meta property="og:url" content="directory"><link rel="canonical" href="directory"></head><div id="upcomingPageHeader"><h1>Upcoming Anime</h1></div><div id="upcomingDetail"></div><div id="upcomingFilters"></div><section id="verifiedUpcomingSection"></section><section><h2 id="upcomingDatabaseHeading">Directory</h2></section>',
  category: '<head><title>Anime Category — Animoro</title><meta name="description" content="generic"><meta property="og:title" content="generic"><meta property="og:description" content="generic"><meta property="og:url" content="generic"><meta property="og:image" content="generic"><link rel="canonical" href="generic"></head><h1 id="categoryTitle">Anime News</h1><p id="categoryDescription">Loading</p><div id="categoryArticlesContainer"></div><!-- CATEGORY_PAGINATION -->',
};

test('valid anime detail renders unique metadata and an www self-canonical in the initial response', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({ firestore: createFirestore() }),
    loadTemplate: async type => templates[type],
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      async json() {
        return { data: { mal_id: 20, title: 'Naruto', synopsis: 'Ninja story', type: 'TV' } };
      },
    }),
    logger: { error() { assert.fail('Valid anime details must not fail.'); } },
  });
  const response = createResponse();

  await handler(request('anime', { slug: 'naruto--20' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<title>Naruto \| Animoro<\/title>/);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/anime\/naruto--20"/);
  assert.match(response.body, /<meta name="twitter:title" content="Naruto \| Animoro"/);
  assert.match(response.body, /<meta name="twitter:description" content="Ninja story"/);
  assert.match(response.body, /<meta name="twitter:image" content="https:\/\/www\.animoro\.in\/animoro-logo-social\.jpg"/);
  assert.match(response.body, /<h1 id="animePageTitle">Naruto<\/h1>/);
  assert.match(response.body, /Ninja story/);
  assert.match(response.body, /id="animeDetail">/);
});

test('valid Firestore anime profiles render with their stored slug and no synthetic URL', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({
      firestore: createFirestore({
        anime: [{
          title: 'Published Profile',
          slug: 'published-profile',
          visibility: 'published',
          synopsis: 'Editor-managed profile.',
        }],
      }),
    }),
    loadTemplate: async type => templates[type],
    fetchImpl: async () => {
      assert.fail('A Firestore profile without a Tenrai ID must not call Tenrai.');
    },
    logger: { error() { assert.fail('A published Firestore anime profile must render.'); } },
  });
  const response = createResponse();

  await handler(request('anime', { slug: 'published-profile' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Published Profile/);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/anime\/published-profile"/);
  assert.match(response.body, /Editor-managed profile\./);
});

test('invalid anime and upcoming detail records return HTTP 404', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({ firestore: createFirestore() }),
    loadTemplate: async type => templates[type],
    fetchImpl: async () => ({ status: 404, ok: false }),
    logger: { error() { assert.fail('A missing record is a 404, not a service error.'); } },
  });

  const invalidAnime = createResponse();
  await handler(request('anime', { slug: 'not-an-anime--42' }), invalidAnime);
  assert.equal(invalidAnime.statusCode, 404);
  assert.match(invalidAnime.body, /noindex, nofollow/);

  const invalidUpcoming = createResponse();
  await handler(request('upcoming', { slug: 'not-published' }), invalidUpcoming);
  assert.equal(invalidUpcoming.statusCode, 404);
});

test('upcoming detail is rendered only for published records with an www canonical', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({
      firestore: createFirestore({
        upcomingAnime: [{
          title: 'Future Series',
          slug: 'future-series',
          status: 'published',
          shortDescription: 'Release details',
        }],
      }),
    }),
    loadTemplate: async type => templates[type],
    logger: { error() { assert.fail('A published upcoming record must render.'); } },
  });
  const response = createResponse();

  await handler(request('upcoming', { slug: 'future-series' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<title>Future Series — Release Information \| Animoro<\/title>/);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/upcoming-anime\/future-series"/);
  assert.match(response.body, /<meta name="twitter:title" content="Future Series — Release Information \| Animoro"/);
  assert.match(response.body, /<meta name="twitter:description" content="Release details"/);
  assert.match(response.body, /<h1 class="section-title">Future Series<\/h1>/);
});

test('Tenrai outages are not reported as missing anime records', async () => {
  const errors = [];
  const handler = createSeoPageHandler({
    getServices: () => ({ firestore: createFirestore() }),
    loadTemplate: async type => templates[type],
    fetchImpl: async () => ({ status: 503, ok: false }),
    logger: { error(...args) { errors.push(args); } },
  });
  const response = createResponse();

  await handler(request('anime', { slug: 'naruto--20' }), response);

  assert.equal(response.statusCode, 503);
  assert.match(response.body, /temporarily unavailable/i);
  assert.equal(errors.length, 1);
});

test('category metadata and H1 are rendered before client JavaScript runs', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({
      firestore: createFirestore({
        posts: [{
          id: 'review',
          title: 'Review',
          slug: 'review',
          status: 'published',
          categories: ['Reviews'],
          publishedAt: '2026-11-15T12:00:00.000Z',
        }],
      }),
    }),
    loadTemplate: async type => templates[type],
    logger: { error() { assert.fail('A published category must render.'); } },
  });
  const response = createResponse();

  await handler(request('category', { category: 'Reviews' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<title>Reviews — Animoro<\/title>/);
  assert.match(response.body, /<h1 id="categoryTitle">Reviews<\/h1>/);
  assert.match(response.body, /category\.html\?category=Reviews/);
  assert.match(response.body, /Critical analyses/);
  assert.match(response.body, /href="\/blog\/review"/);
  const breadcrumb = response.body.match(/<script id="categoryBreadcrumbJsonLd" type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  assert.deepEqual(JSON.parse(breadcrumb).itemListElement.map(item => item.name), ['Home', 'Articles', 'Reviews']);
  assert.match(response.body, /<meta name="twitter:title" content="Reviews — Animoro"/);
});

test('category pages render crawlable article links, pagination and a page-specific canonical', async () => {
  const posts = Array.from({ length: 10 }, (_, index) => ({
    id: `review-${index}`,
    title: `Review ${index}`,
    slug: `review-${index}`,
    status: 'published',
    categories: ['Reviews'],
    publishedAt: new Date(Date.UTC(2026, 10, 15 - index)).toISOString(),
  }));
  const handler = createSeoPageHandler({
    getServices: () => ({ firestore: createFirestore({ posts }) }),
    loadTemplate: async type => templates[type],
    logger: { error() { assert.fail('Published category articles must render.'); } },
  });
  const response = createResponse();

  await handler(request('category', { category: 'Reviews', page: '2' }), response);

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/category\.html\?category=Reviews&amp;page=2"/);
  assert.match(response.body, /href="\/blog\/review-9"/);
  assert.match(response.body, /rel="prev"/);
  assert.doesNotMatch(response.body, /rel="next"/);
  assert.match(response.body, /<script id="categoryBreadcrumbJsonLd" type="application\/ld\+json">/);
});

test('invalid category page numbers return HTTP 400', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({ firestore: createFirestore() }),
    loadTemplate: async type => templates[type],
    logger: { error() { assert.fail('Invalid page numbers are client errors.'); } },
  });
  const response = createResponse();

  await handler(request('category', { category: 'Reviews', page: '0' }), response);

  assert.equal(response.statusCode, 400);
});

test('empty categories return noindex HTTP 404', async () => {
  const handler = createSeoPageHandler({
    getServices: () => ({ firestore: createFirestore() }),
    loadTemplate: async type => templates[type],
    logger: { error() { assert.fail('An empty category is a 404, not a service error.'); } },
  });
  const response = createResponse();

  await handler(request('category', { category: 'No Stories' }), response);

  assert.equal(response.statusCode, 404);
  assert.match(response.body, /noindex, nofollow/);
});
