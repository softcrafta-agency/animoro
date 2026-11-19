import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSeoCopilotHandler } from './seo-copilot.js';

function makeResponse() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end(body) {
      this.body = JSON.parse(body);
      return this;
    },
  };
}

class MemoryFirestore {
  constructor(seed = {}) {
    this.documents = new Map(Object.entries(seed).flatMap(([collection, records]) =>
      Object.entries(records).map(([id, value]) => [`${collection}/${id}`, value])
    ));
    this.queryTrace = [];
    this.missingIndex = false;
  }

  collection(name) {
    return new MemoryCollection(this, name);
  }

  async runTransaction(callback) {
    return callback({
      get: reference => reference.get(),
      set: (reference, value, options) => reference.set(value, options),
    });
  }
}

class MemoryCollection {
  constructor(firestore, name, filters = [], maximum = Infinity) {
    this.firestore = firestore;
    this.name = name;
    this.filters = filters;
    this.maximum = maximum;
  }

  doc(id) {
    return new MemoryDocument(this.firestore, this.name, id);
  }

  where(field, operator, value) {
    this.firestore.queryTrace.push({ collection: this.name, field, operator });
    return new MemoryCollection(this.firestore, this.name, [...this.filters, { field, operator, value }], this.maximum);
  }

  orderBy() { return this; }

  limit(maximum) {
    return new MemoryCollection(this.firestore, this.name, this.filters, maximum);
  }

  async get() {
    if (this.name === 'analytics_events' && this.firestore.missingIndex) {
      throw Object.assign(new Error('The query requires a composite index for analytics_events.'), {
        code: 'failed-precondition',
      });
    }
    const docs = [];
    for (const [path, data] of this.firestore.documents) {
      if (!path.startsWith(`${this.name}/`)) continue;
      const id = path.slice(this.name.length + 1);
      const matches = this.filters.every(({ field, operator, value }) => {
        const actual = data[field];
        const actualValue = actual?.toMillis?.() ?? actual;
        const expectedValue = value?.toMillis?.() ?? value;
        if (operator === '==') return actualValue === expectedValue;
        if (operator === '>=') return actualValue >= expectedValue;
        if (operator === '<=') return actualValue <= expectedValue;
        if (operator === '<') return actualValue < expectedValue;
        return false;
      });
      if (matches) docs.push({ id, data: () => data });
    }
    return { docs: docs.slice(0, this.maximum) };
  }
}

class MemoryDocument {
  constructor(firestore, collection, id) {
    this.firestore = firestore;
    this.path = `${collection}/${id}`;
    this.id = id;
  }

  async get() {
    const value = this.firestore.documents.get(this.path);
    return { id: this.id, exists: Boolean(value), data: () => value };
  }

  async set(value, options = {}) {
    const current = this.firestore.documents.get(this.path) || {};
    this.firestore.documents.set(this.path, options.merge ? { ...current, ...value } : value);
  }

  async update(value) {
    const current = this.firestore.documents.get(this.path);
    if (!current) throw new Error('Document does not exist.');
    this.firestore.documents.set(this.path, { ...current, ...value });
  }
}

function createRequest(method, { query = {}, body } = {}) {
  return { method, query, body, headers: {} };
}

test('SEO Copilot requires verified admin authorization', async () => {
  const handler = createSeoCopilotHandler({
    authorize: async () => ({ authorized: false, status: 403, message: 'Admin access required.' }),
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(createRequest('GET'), response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'Admin access required.' });
});

test('analyzes a saved article with verified Groq model, caches it, and saves recommendation decisions', async () => {
  const originalEnvironment = {
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GSC_SERVICE_ACCOUNT_JSON: process.env.GSC_SERVICE_ACCOUNT_JSON,
    GSC_SITE_URL: process.env.GSC_SITE_URL,
  };
  process.env.GROQ_API_KEY = 'test-secret';
  process.env.GROQ_MODEL = 'test-model';
  delete process.env.GSC_SERVICE_ACCOUNT_JSON;
  delete process.env.GSC_SITE_URL;

  const firestore = new MemoryFirestore({
    posts: {
      'article-1': {
        title: 'Domina Powers and Abilities',
        slug: 'domina-powers',
        status: 'published',
        views: 17,
        content: '<p>Saved article content.</p>',
      },
    },
  });
  let groqCalls = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url.endsWith('/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-model' }] }), { status: 200 });
    }
    assert.equal(url.endsWith('/chat/completions'), true);
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    groqCalls += 1;
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'The article can better explain the character.',
            primaryTopic: 'Domina abilities',
            searchIntent: { intent: 'informational', reason: 'Readers seek character details.', confidence: 0.9 },
            contentGaps: ['More detail about abilities'],
            headingSuggestions: [{ level: 'H2', text: 'Domina’s Powers', reason: 'Clarify the central topic.' }],
            faqRecommendations: [{ question: 'What abilities does Domina have?', reason: 'A likely reader question.' }],
            internalLinkOpportunities: [],
            contentQuality: {
              grammarFeedback: [],
              readability: 'Clear but brief.',
              naturalness: 'Natural, with a few areas to expand.',
              repetitiveLanguage: [],
              factualConsistency: 'No contradiction found within this text.',
              authorshipAssessment: 'AI-written',
            },
            recommendations: [{
              keyword: 'Domina powers',
              category: 'primary-topic',
              searchIntent: 'informational',
              reason: 'The article introduces Domina but has little explanation of his abilities.',
              placement: 'Add a useful H2 section.',
              potentialBenefit: 'More complete topic coverage.',
              confidence: 0.87,
              contentCoverage: 'Introduced but not explained.',
              suggestedHeading: 'Domina’s Powers and Abilities',
              suggestedParagraph: 'Draft for editorial review.',
            }],
          }),
        },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }), { status: 200 });
  };
  const handler = createSeoCopilotHandler({
    authorize: async () => ({ authorized: true, uid: 'admin-1', services: { firestore } }),
    fetchImpl,
    clock: () => new Date('2026-11-18T12:00:00.000Z'),
    logger: { error() {} },
  });
  const body = {
    action: 'analyze',
    articleId: 'article-1',
    title: 'Domina Powers and Abilities',
    slug: 'domina-powers',
    content: `<p>${'Domina is a character. '.repeat(20)}</p>`,
  };

  try {
    const first = makeResponse();
    await handler(createRequest('POST', { body }), first);

    assert.equal(first.statusCode, 200);
    assert.equal(first.body.model, 'test-model');
    assert.equal(first.body.usage.totalTokens, 150);
    assert.equal(first.body.views.totalViews, 17);
    assert.equal(first.body.analysis.contentQuality.authorshipAssessment, 'unknown');
    assert.equal(first.body.analysis.recommendations[0].status, 'pending');
    assert.equal(first.body.analysis.recommendations[0].source, 'ai-content-analysis');
    assert.equal(first.body.analysis.searchConsole.status, 'not_connected');

    const cached = makeResponse();
    await handler(createRequest('POST', { body }), cached);
    assert.equal(cached.statusCode, 200);
    assert.equal(cached.body.cached, true);
    assert.equal(groqCalls, 1);

    const recommendationId = first.body.analysis.recommendations[0].id;
    const decision = makeResponse();
    await handler(createRequest('POST', {
      body: { action: 'decision', recommendationId, status: 'accepted' },
    }), decision);
    assert.equal(decision.statusCode, 200);
    assert.equal(decision.body.status, 'accepted');

    const cachedAfterDecision = makeResponse();
    await handler(createRequest('POST', { body }), cachedAfterDecision);
    assert.equal(cachedAfterDecision.body.analysis.recommendations[0].status, 'accepted');

    const reanalysis = makeResponse();
    await handler(createRequest('POST', { body: { ...body, force: true } }), reanalysis);
    assert.equal(reanalysis.statusCode, 200);
    assert.equal(reanalysis.body.cached, false);
    assert.equal(groqCalls, 2);
  } finally {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('rejects invalid analysis input before calling Groq', async () => {
  let called = false;
  const handler = createSeoCopilotHandler({
    authorize: async () => ({ authorized: true, uid: 'admin-1', services: { firestore: new MemoryFirestore() } }),
    fetchImpl: async () => {
      called = true;
      throw new Error('Should not be called.');
    },
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(createRequest('POST', {
    body: { action: 'analyze', title: 'Short article', content: '<p>Too short.</p>', draftKey: 'abcdefghijklmnop' },
  }), response);

  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('links temporary draft analysis and recommendation records after article save', async () => {
  const draftKey = '12345678-1234-1234-1234-123456789abc';
  const draftId = `draft-admin-1-${draftKey}`;
  const firestore = new MemoryFirestore({
    posts: { 'saved-article': { title: 'Saved article title', slug: 'saved-article', status: 'draft' } },
    seo_recommendations: {
      rec1: { articleId: draftId, keyword: 'Example keyword', status: 'accepted' },
    },
    seo_analyses: {
      analysis1: { articleId: draftId, articleTitle: 'Draft title' },
    },
  });
  const handler = createSeoCopilotHandler({
    authorize: async () => ({ authorized: true, uid: 'admin-1', services: { firestore } }),
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(createRequest('POST', {
    body: { action: 'link-draft', draftKey, articleId: 'saved-article' },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.linked, 1);
  assert.equal(response.body.analyses, 1);
  assert.equal(firestore.documents.get('seo_recommendations/rec1').articleId, 'saved-article');
  assert.equal(firestore.documents.get('seo_analyses/analysis1').articleTitle, 'Saved article title');
});

test('reports consented page-view trends separately from other analytics events', async () => {
  const now = new Date('2026-11-18T12:00:00.000Z');
  const event = (eventType, daysAgo) => {
    const date = new Date(now.getTime() - daysAgo * 86400000);
    return {
      articleId: 'article-1',
      eventType,
      timestamp: { toDate: () => date, toMillis: () => date.getTime() },
    };
  };
  const firestore = new MemoryFirestore({
    posts: { 'article-1': { title: 'Article', views: 12 } },
    analytics_events: {
      recent1: event('page_view', 2),
      recent2: event('page_view', 3),
      previous: event('page_view', 10),
      engagement: event('engagement', 1),
    },
  });
  const handler = createSeoCopilotHandler({
    authorize: async () => ({ authorized: true, uid: 'admin-1', services: { firestore } }),
    clock: () => now,
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(createRequest('GET', {
    query: { mode: 'performance', articleId: 'article-1' },
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.totalViews, 12);
  assert.equal(response.body.last7Days, 2);
  assert.equal(response.body.previous7Days, 1);
  assert.equal(response.body.trend7Days.direction, 'up');
  assert.equal(response.body.trend7Days.changePercent, 100);
  assert.equal(response.body.shortRangeEventCount, 3);
  assert.deepEqual(
    firestore.queryTrace
      .filter(query => query.collection === 'analytics_events')
      .map(({ field, operator }) => [field, operator]),
    [
      ['articleId', '=='],
      ['eventType', '=='],
      ['timestamp', '>='],
    ],
  );
});

test('Firestore config declares the analytics page-view index at collection scope', async () => {
  const config = JSON.parse(await readFile(new URL('../../firestore.indexes.json', import.meta.url), 'utf8'));
  assert.ok(config.indexes.some(index =>
    index.collectionGroup === 'analytics_events' &&
    index.queryScope === 'COLLECTION' &&
    JSON.stringify(index.fields) === JSON.stringify([
      { fieldPath: 'articleId', order: 'ASCENDING' },
      { fieldPath: 'eventType', order: 'ASCENDING' },
      { fieldPath: 'timestamp', order: 'ASCENDING' },
    ])
  ));
});

test('article overview surfaces a missing analytics index without inventing view counts', async () => {
  const firestore = new MemoryFirestore({
    posts: { 'article-1': { title: 'Article', views: 12 } },
  });
  firestore.missingIndex = true;
  const handler = createSeoCopilotHandler({
    authorize: async () => ({ authorized: true, uid: 'admin-1', services: { firestore } }),
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(createRequest('GET', {
    query: { mode: 'performance', articleId: 'article-1' },
  }), response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, 'FIRESTORE_INDEX_REQUIRED');
  assert.match(response.body.error, /composite index for analytics_events/);
  assert.equal(response.body.last7Days, undefined);
  assert.equal(response.body.totalViews, undefined);

  const analysisResponse = makeResponse();
  await handler(createRequest('POST', {
    body: {
      action: 'analyze',
      articleId: 'article-1',
      title: 'Article',
      content: `<p>${'Representative article text. '.repeat(12)}</p>`,
      force: true,
    },
  }), analysisResponse);
  assert.equal(analysisResponse.statusCode, 503);
  assert.equal(analysisResponse.body.code, 'FIRESTORE_INDEX_REQUIRED');
  assert.match(analysisResponse.body.error, /articleId ASCENDING, eventType ASCENDING, timestamp ASCENDING/);
});
