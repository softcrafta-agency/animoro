import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';
import { createAnalyticsHandler } from './analytics.js';

function makeResponse() {
  return {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(body) {
      this.body = JSON.parse(body);
      return this;
    },
  };
}

function makeRequest(query = {}, method = 'GET') {
  return { method, query, headers: {} };
}

function makePerformanceFirestore(events, posts) {
  class Query {
    constructor(name, filters = [], pageSize = Infinity, cursorId = '') {
      this.name = name;
      this.filters = filters;
      this.pageSize = pageSize;
      this.cursorId = cursorId;
    }

    where(field, operator, value) {
      return new Query(this.name, [...this.filters, { field, operator, value }], this.pageSize, this.cursorId);
    }

    orderBy() {
      return this;
    }

    limit(pageSize) {
      return new Query(this.name, this.filters, pageSize, this.cursorId);
    }

    startAfter(document) {
      return new Query(this.name, this.filters, this.pageSize, document.id);
    }

    async get() {
      let docs = (this.name === 'analytics_events' ? events : posts).map((data, index) => ({
        id: data.id || String(index),
        data: () => data,
      }));
      docs = docs.filter(document => this.filters.every(({ field, operator, value }) => {
        const actual = document.data()[field];
        const actualValue = actual?.toMillis?.() ?? actual;
        const expectedValue = value?.toMillis?.() ?? value;
        if (operator === '==') return actualValue === expectedValue;
        if (operator === '>=') return actualValue >= expectedValue;
        if (operator === '<') return actualValue < expectedValue;
        return false;
      }));
      if (this.name === 'analytics_events') {
        docs.sort((left, right) => left.data().timestamp.toMillis() - right.data().timestamp.toMillis());
      }
      if (this.cursorId) {
        docs = docs.slice(docs.findIndex(document => document.id === this.cursorId) + 1);
      }
      return { docs: docs.slice(0, this.pageSize) };
    }
  }

  return {
    collection(name) {
      return {
        where(field, operator, value) {
          return new Query(name, [{ field, operator, value }]);
        },
      };
    },
  };
}

function makePageView(id, timestamp, visitorId, articleId = '') {
  return {
    id,
    eventType: 'page_view',
    timestamp: Timestamp.fromDate(new Date(timestamp)),
    visitorId,
    ...(articleId ? { articleId, articleTitle: 'Article A', articleSlug: 'article-a' } : {}),
  };
}

test('analytics dashboard API requires verified admin authorization', async () => {
  const handler = createAnalyticsHandler({
    authorize: async () => ({ authorized: false, status: 403, message: 'Admin access required.' }),
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(makeRequest({ mode: 'summary', startDate: '2025-02-03', endDate: '2025-02-03' }), response);

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, { error: 'Admin access required.' });
});

test('performance endpoint compares complete India days using consented page-view events', async () => {
  const firestore = makePerformanceFirestore([
    makePageView('outside-before', '2025-02-01T18:29:59.999Z', 'ignored'),
    makePageView('previous-article', '2025-02-01T18:30:00.000Z', 'visitor-one', 'article-a'),
    makePageView('previous-home', '2025-02-02T18:29:59.999Z', 'visitor-one'),
    makePageView('selected-article-one', '2025-02-02T18:30:00.000Z', 'visitor-one', 'article-a'),
    makePageView('selected-home', '2025-02-03T17:00:00.000Z', 'visitor-one'),
    makePageView('selected-article-two', '2025-02-03T18:29:59.999Z', 'visitor-two', 'article-a'),
    makePageView('outside-after', '2025-02-03T18:30:00.000Z', 'ignored'),
  ], [
    { id: 'article-a', status: 'published', title: 'Article A', slug: 'article-a', category: 'News' },
    { id: 'article-b', status: 'published', title: 'Article B', slug: 'article-b', category: 'Reviews' },
  ]);
  const handler = createAnalyticsHandler({
    authorize: async () => ({ authorized: true, services: { firestore } }),
    clock: () => new Date('2025-02-04T00:00:00.000Z'),
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(makeRequest({ mode: 'performance', date: '2025-02-03' }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.timeZone, 'Asia/Kolkata');
  assert.deepEqual(response.body.chart, [
    { date: '2025-02-02', pageViews: 2 },
    { date: '2025-02-03', pageViews: 3 },
  ]);
  assert.deepEqual(response.body.summary, {
    pageViews: 3,
    uniqueVisitors: 2,
    articleViews: 2,
    publishedArticles: 2,
    previousDayPageViews: 2,
    change: 1,
    changePercent: 50,
    trend: 'up',
  });
  assert.equal(response.body.topArticles[0].id, 'article-a');
  assert.equal(response.body.topArticles[0].pageViews, 2);
  assert.equal(response.body.lowestArticles[0].id, 'article-b');
  assert.equal(response.body.lowestArticles[0].yesterdayViews, 0);
});

test('performance endpoint paginates large event sets without truncating counts', async () => {
  const events = Array.from({ length: 501 }, (_, index) =>
    makePageView(
      `event-${index}`,
      new Date(Date.parse('2025-02-02T18:30:00.000Z') + index * 1000).toISOString(),
      'same-visitor',
    )
  );
  const firestore = makePerformanceFirestore(events, []);
  const handler = createAnalyticsHandler({
    authorize: async () => ({ authorized: true, services: { firestore } }),
    clock: () => new Date('2025-02-04T00:00:00.000Z'),
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(makeRequest({ mode: 'performance', date: '2025-02-03' }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.summary.pageViews, 501);
  assert.equal(response.body.summary.uniqueVisitors, 1);
});

test('performance endpoint rejects invalid and incomplete reporting dates', async () => {
  const handler = createAnalyticsHandler({
    authorize: async () => ({ authorized: true, services: { firestore: {} } }),
    clock: () => new Date('2025-02-04T00:00:00.000Z'),
    logger: { error() {} },
  });

  for (const date of ['2025-02-30', '2025-02-04']) {
    const response = makeResponse();
    await handler(makeRequest({ mode: 'performance', date }), response);
    assert.equal(response.statusCode, 400);
  }
});

test('unauthenticated analytics requests return 401 before querying analytics data', async () => {
  const handler = createAnalyticsHandler({ logger: { error() {} } });
  const response = makeResponse();

  await handler(makeRequest({
    mode: 'summary',
    startDate: '2025-02-03',
    endDate: '2025-02-03',
  }), response);

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'Authentication required.' });
});

test('analytics dashboard API rejects invalid dates, unsupported modes, and methods', async () => {
  const handler = createAnalyticsHandler({
    authorize: async () => ({
      authorized: true,
      services: { firestore: {} },
    }),
    clock: () => new Date('2025-02-03T12:00:00.000Z'),
    logger: { error() {} },
  });

  const invalidDate = makeResponse();
  await handler(makeRequest({ startDate: '2025-01-01', endDate: '2025-04-01' }), invalidDate);
  assert.equal(invalidDate.statusCode, 400);

  const unsupportedMode = makeResponse();
  await handler(makeRequest({ mode: 'unknown', startDate: '2025-02-03', endDate: '2025-02-03' }), unsupportedMode);
  assert.equal(unsupportedMode.statusCode, 400);

  const wrongMethod = makeResponse();
  await handler(makeRequest({}, 'POST'), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, 'GET');
});
