import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createArticleHandler, loadRelatedPosts } from '../article.js';

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

test('prioritizes anime and tag matches, deduplicates results, and excludes the current or unpublished posts', async () => {
  const entries = [
    { id: 'current', title: 'Current', slug: 'current', status: 'published', animeSlug: 'linked-anime', tags: ['action'], category: 'Reviews', publishedAt: new Date('2026-10-08') },
    { id: 'anime-match', title: 'Anime Match', slug: 'anime-match', status: 'published', animeSlug: 'linked-anime', publishedAt: new Date('2026-10-01') },
    { id: 'tag-match', title: 'Tag Match', slug: 'tag-match', status: 'published', tags: ['action'], publishedAt: new Date('2026-10-06') },
    { id: 'tag-match-newer', title: 'Newer Tag Match', slug: 'newer-tag-match', status: 'published', tags: ['analysis'], publishedAt: new Date('2026-10-07') },
    { id: 'category-match', title: 'Category Match', slug: 'category-match', status: 'published', category: 'Reviews', publishedAt: new Date('2026-10-04') },
    { id: 'draft-match', title: 'Draft Match', slug: 'draft-match', status: 'draft', animeSlug: 'linked-anime' },
  ];
  const firestore = {
    collection() {
      const filters = [];
      let maximum = Infinity;
      return {
        where(field, operator, value) {
          filters.push({ field, operator, value });
          return this;
        },
        orderBy() { return this; },
        limit(value) { maximum = value; return this; },
        async get() {
          const specificFilter = filters.find(filter => filter.field !== 'status');
          let matching = entries;
          if (specificFilter?.field === 'animeSlug') {
            matching = entries.filter(entry => entry.animeSlug === specificFilter.value || entry.id === 'draft-match' || entry.id === 'current');
          } else if (specificFilter?.field === 'tags') {
            matching = entries.filter(entry => entry.tags || entry.id === 'current');
          } else if (specificFilter?.field === 'category') {
            matching = entries.filter(entry => entry.category || entry.id === 'current');
          } else {
            matching = entries;
          }
          return { docs: matching.slice(0, maximum).map(entry => ({ id: entry.id, data: () => entry })) };
        },
      };
    },
  };

  const related = await loadRelatedPosts(firestore, {
    animeSlug: 'linked-anime',
    tags: ['action', 'analysis'],
    category: 'Reviews',
  }, 'current');

  assert.deepEqual(related.map(post => post.id), [
    'anime-match',
    'tag-match-newer',
    'tag-match',
    'category-match',
  ]);
  assert.equal(new Set(related.map(post => post.id)).size, related.length);
  assert.ok(related.every(post => post.status === 'published'));
});

test('uses matching secondary and legacy keywords to link related published articles', async () => {
  const entries = [
    { id: 'current', status: 'published', secondaryKeywords: ['Jiro Azuma'] },
    { id: 'new-match', status: 'published', secondaryKeywords: ['Jiro Azuma'] },
    { id: 'legacy-match', status: 'published', keywords: ['Jiro Azuma'] },
    { id: 'unrelated', status: 'published', secondaryKeywords: ['Other topic'] },
  ];
  const firestore = {
    collection() {
      const filters = [];
      let maximum = Infinity;
      return {
        where(field, operator, value) {
          filters.push({ field, operator, value });
          return this;
        },
        orderBy() { return this; },
        limit(value) { maximum = value; return this; },
        async get() {
          const keywordFilter = filters.find(filter =>
            ['secondaryKeywords', 'keywords'].includes(filter.field)
          );
          const matches = keywordFilter
            ? entries.filter(entry => (entry[keywordFilter.field] || [])
              .some(keyword => keywordFilter.value.includes(keyword)))
            : entries;
          return { docs: matches.slice(0, maximum).map(entry => ({ id: entry.id, data: () => entry })) };
        },
      };
    },
  };

  const related = await loadRelatedPosts(firestore, {
    primaryKeyword: 'Black Torch',
    secondaryKeywords: ['Jiro Azuma'],
  }, 'current');

  assert.deepEqual(related.slice(0, 2).map(post => post.id), ['new-match', 'legacy-match']);
});

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
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.animoro\.in\/blog\/published-story"/);
});

test('renders published article content exceeding 100,000 characters', async () => {
  const content = `<p>${'a'.repeat(100_001)}</p>`;
  const handler = createArticleHandler({
    getServices: () => createServices({
      title: 'Long Published Story',
      slug: 'long-published-story',
      status: 'published',
      content,
      category: '',
    }),
    loadTemplate: async () => template,
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { slug: 'long-published-story' } }, response);

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.includes(content));
});

test('resolves a published article slug from the rewritten Vercel request URL', async () => {
  const slugs = [
    'best-sports-anime-you-should-definitely-watch',
    'kagurabachi-anime-release-date-story-characters-powers-everything-you-need-to-know',
  ];

  for (const slug of slugs) {
    const handler = createArticleHandler({
      getServices: () => createServices({
        title: 'Published Anime Article',
        slug,
        status: 'published',
        content: '<p>Published article content.</p>',
        category: '',
      }),
      loadTemplate: async () => template,
    });
    const response = createResponse();

    await handler({
      method: 'GET',
      url: `/api/article?slug=${slug}`,
    }, response);

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Published article content/);
    assert.ok(response.body.includes(`/blog/${slug}`));
    assert.doesNotMatch(response.body, /blog\.html\//);
  }
});

test('loads related posts and associated anime profile concurrently', async () => {
  const article = {
    title: 'Published Story',
    slug: 'published-story',
    status: 'published',
    category: 'Anime News',
    animeTitle: 'Linked Anime',
    animeSlug: 'linked-anime',
    content: '<p>Published article body.</p>',
  };
  const articleDocument = { id: 'article-1', data: () => article };
  let postQueryCount = 0;
  let relatedQueryStarted = false;
  let animeQueryStarted = false;
  let resolveRelatedQuery;
  let resolveAnimeQuery;
  const relatedQuery = new Promise(resolve => {
    resolveRelatedQuery = resolve;
  });
  const animeQuery = new Promise(resolve => {
    resolveAnimeQuery = resolve;
  });
  const firestore = {
    collection(name) {
      const queryIndex = name === 'posts' ? postQueryCount++ : 0;
      return {
        where() { return this; },
        orderBy() { return this; },
        limit() { return this; },
        async get() {
          if (name === 'posts' && queryIndex === 0) return { docs: [articleDocument] };
          if (name === 'posts') {
            relatedQueryStarted = true;
            return relatedQuery;
          }
          animeQueryStarted = true;
          return animeQuery;
        },
      };
    },
  };
  const handler = createArticleHandler({
    getServices: () => ({ firestore }),
    loadTemplate: async () => template,
  });
  const response = createResponse();
  const responsePromise = handler({
    method: 'GET',
    query: { slug: 'published-story' },
  }, response);

  await new Promise(resolve => setTimeout(resolve, 0));
  const bothQueriesStarted = relatedQueryStarted && animeQueryStarted;
  resolveRelatedQuery({ docs: [] });
  resolveAnimeQuery({
    docs: [{ data: () => ({ visibility: 'published', slug: 'linked-anime' }) }],
  });
  await responsePromise;

  assert.ok(bothQueriesStarted);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Published article body\./);
  assert.match(response.body, /<span class="badge-category">Linked Anime<\/span>/);
  assert.doesNotMatch(response.body, /anime\.html\/linked-anime/);
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

test('returns a private-safe 503 and logs a request ID when Firestore access fails', async () => {
  const logged = [];
  const handler = createArticleHandler({
    getServices: () => ({
      firestore: {
        collection() {
          return {
            where() { return this; },
            limit() { return this; },
            async get() {
              const error = new Error('Private database detail');
              error.code = 'permission-denied';
              throw error;
            },
          };
        },
      },
    }),
    logger: { error: (...args) => logged.push(args) },
  });
  const response = createResponse();

  await handler({
    method: 'GET',
    query: { slug: 'published-story' },
    headers: { 'x-vercel-id': 'bom1::request-123' },
  }, response);

  assert.equal(response.statusCode, 503);
  assert.match(response.body, /Please try again shortly/);
  assert.doesNotMatch(response.body, /Private database detail|permission-denied/);
  assert.equal(logged.length, 1);
  assert.match(logged[0][1], /"stage":"query_article"/);
  assert.match(logged[0][1], /"requestId":"bom1::request-123"/);
  assert.match(logged[0][1], /"errorCode":"permission-denied"/);
});

test('returns a diagnostic 503 when the article template is missing or invalid', async () => {
  for (const invalidTemplate of ['', null]) {
    const logged = [];
    const handler = createArticleHandler({
      getServices: () => createServices({
        title: 'Published Story',
        slug: 'published-story',
        status: 'published',
        content: '<p>Published article body.</p>',
        category: '',
      }),
      loadTemplate: async () => invalidTemplate,
      logger: { error: (...args) => logged.push(args) },
    });
    const response = createResponse();

    await handler({ method: 'GET', query: { slug: 'published-story' } }, response);

    assert.equal(response.statusCode, 503);
    assert.match(logged[0][1], /"stage":"load_template"/);
  }
});

test('returns 503 instead of crashing when Firestore returns an invalid query result', async () => {
  const logged = [];
  const handler = createArticleHandler({
    getServices: () => ({ firestore: { collection: () => ({ where() { return this; }, limit() { return this; }, get: async () => null }) } }),
    logger: { error: (...args) => logged.push(args) },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { slug: 'published-story' } }, response);

  assert.equal(response.statusCode, 503);
  assert.match(logged[0][1], /"stage":"query_article"/);
});
