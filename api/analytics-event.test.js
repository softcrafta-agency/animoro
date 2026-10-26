import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalyticsEventHandler } from './analytics-event.js';

const visitorId = '0123456789abcdef0123456789abcdef';
const sessionId = 'abcdef0123456789abcdef0123456789';
const eventId = '11111111111111111111111111111111';
const requestHeaders = {
  'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36',
  'x-vercel-forwarded-for': '203.0.113.10',
};
const rateLimitSecret = 'test-only-analytics-rate-limit-secret';

function makeFirestore(seed = {}) {
  const records = new Map(Object.entries(seed));
  const references = new Map();
  const writes = [];

  function makeRef(collectionName, id, parent = '') {
    const path = `${parent}${collectionName}/${id}`;
    if (references.has(path)) return references.get(path);
    const ref = {
      id,
      path,
      collection(name) {
        return {
          doc(childId) {
            return makeRef(name, childId, `${path}/`);
          },
        };
      },
      async get() {
        const data = records.get(path);
        return { exists: data !== undefined, data: () => data };
      },
    };
    references.set(path, ref);
    return ref;
  }

  const firestore = {
    collection(name) {
      return {
        doc(id) {
          return makeRef(name, id);
        },
        where() {
          return this;
        },
        limit() {
          return this;
        },
        async get() {
          return { docs: [] };
        },
      };
    },
    async runTransaction(callback) {
      return callback({
        async get(ref) {
          const data = records.get(ref.path);
          return { exists: data !== undefined, data: () => data };
        },
        create(ref, data) {
          writes.push({ type: 'create', path: ref.path, data });
          records.set(ref.path, data);
        },
        set(ref, data, options) {
          writes.push({ type: 'set', path: ref.path, data });
          records.set(ref.path, options?.merge ? { ...(records.get(ref.path) || {}), ...data } : data);
        },
        update(ref, data) {
          writes.push({ type: 'update', path: ref.path, data });
          records.set(ref.path, { ...(records.get(ref.path) || {}), ...data });
        },
      });
    },
  };
  return { firestore, records, writes };
}

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

function makeRequest(body, headers = requestHeaders) {
  return { method: 'POST', headers, body };
}

test('page-view ingestion writes server-side pseudonymous records and daily aggregates', async () => {
  const { firestore, writes } = makeFirestore();
  const handler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    clock: () => new Date('2025-02-03T12:00:00.000Z'),
    rateLimitSecret,
    logger: { error() {} },
  });
  const response = makeResponse();

  await handler(makeRequest({
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/anime',
    pageTitle: 'Anime List',
  }), response);

  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, { accepted: true, reason: 'recorded' });
  assert.equal(writes.some(write => write.path === `analytics_events/${eventId}`), true);
  assert.equal(writes.some(write => write.path === `analytics_visitors/${visitorId}`), true);
  assert.equal(writes.some(write => write.path === `analytics_sessions/${sessionId}`), true);
  assert.equal(writes.some(write => write.path === `analytics_daily_summaries/2025-02-03`), true);
  assert.equal(writes.some(write => write.path.includes('/visitors/')), true);
  const event = writes.find(write => write.path === `analytics_events/${eventId}`).data;
  assert.equal(event.pagePath, '/anime');
  assert.equal(event.operatingSystem, 'Other');
  assert.equal('ipAddress' in event, false);
});

test('page-view ingestion rejects invalid paths and suppresses bots before writes', async () => {
  const { firestore, writes } = makeFirestore();
  const handler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    rateLimitSecret,
    logger: { error() {} },
  });
  const body = { eventType: 'page_view', eventId, visitorId, sessionId, pagePath: '/admin.html' };
  const invalidPathResponse = makeResponse();
  await handler(makeRequest(body), invalidPathResponse);
  assert.equal(invalidPathResponse.statusCode, 400);
  assert.equal(writes.length, 0);

  const botResponse = makeResponse();
  await handler(makeRequest({ ...body, pagePath: '/anime' }, { 'user-agent': 'Googlebot/2.1' }), botResponse);
  assert.equal(botResponse.statusCode, 202);
  assert.equal(botResponse.body.accepted, false);
  assert.equal(writes.length, 0);
});

test('page-view ingestion rejects draft articles and throttles rapid session events', async () => {
  const { firestore, writes } = makeFirestore({
    [`analytics_sessions/${sessionId}`]: { lastEventAtMillis: Date.parse('2025-02-03T12:00:00.000Z') - 100 },
  });
  const handler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    clock: () => new Date('2025-02-03T12:00:00.000Z'),
    rateLimitSecret,
    logger: { error() {} },
  });
  const draftResponse = makeResponse();
  await handler(makeRequest({
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/blog/unpublished-story',
    pageTitle: 'Unpublished Story',
    articleSlug: 'unpublished-story',
  }), draftResponse);
  assert.equal(draftResponse.body.reason, 'article_not_public');

  const throttledResponse = makeResponse();
  await handler(makeRequest({
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/anime',
    pageTitle: 'Anime List',
  }), throttledResponse);
  assert.equal(throttledResponse.body.reason, 'throttled');
  assert.equal(writes.some(write => write.path.startsWith('analytics_events/')), false);
});

test('repeated requests are capped per network address even when session IDs change', async () => {
  const { firestore, records } = makeFirestore();
  const handler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    clock: () => new Date('2025-02-03T12:00:00.000Z'),
    rateLimitSecret,
    maxRequestsPerWindow: 2,
    logger: { error() {} },
  });
  const requestFor = (id, session) => makeRequest({
    eventType: 'page_view',
    eventId: id,
    visitorId,
    sessionId: session,
    pagePath: '/anime',
    pageTitle: 'Anime List',
  });
  const first = makeResponse();
  const second = makeResponse();
  const third = makeResponse();

  await handler(requestFor(eventId, sessionId), first);
  await handler(requestFor('22222222222222222222222222222222', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), second);
  await handler(requestFor('33333333333333333333333333333333', 'cccccccccccccccccccccccccccccccc'), third);

  assert.equal(first.body.accepted, true);
  assert.equal(second.body.accepted, true);
  assert.equal(third.statusCode, 429);
  assert.equal([...records.keys()].filter(path => path.startsWith('analytics_rate_limits/')).length, 1);
});

test('duplicate page-view IDs do not create a second analytics event', async () => {
  const { firestore, writes } = makeFirestore();
  const handler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    clock: () => new Date('2025-02-03T12:00:00.000Z'),
    rateLimitSecret,
    logger: { error() {} },
  });
  const body = {
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/anime',
    pageTitle: 'Anime List',
  };
  const first = makeResponse();
  const duplicate = makeResponse();
  await handler(makeRequest(body), first);
  await handler(makeRequest(body), duplicate);

  assert.equal(first.body.reason, 'recorded');
  assert.equal(duplicate.body.reason, 'duplicate');
  assert.equal(writes.filter(write => write.path === `analytics_events/${eventId}`).length, 1);
});

test('malformed payloads and missing rate-limit configuration fail closed', async () => {
  const { firestore, writes } = makeFirestore();
  const handler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    rateLimitSecret,
    logger: { error() {} },
  });
  const malformed = makeResponse();
  await handler(makeRequest({
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/anime',
    pageTitle: 'Anime List',
    injectedField: true,
  }), malformed);
  assert.equal(malformed.statusCode, 400);
  assert.equal(writes.length, 0);

  const malformedJson = makeResponse();
  await handler(makeRequest('{not-json'), malformedJson);
  assert.equal(malformedJson.statusCode, 400);

  const missingIp = makeResponse();
  await handler(makeRequest({
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/anime',
    pageTitle: 'Anime List',
  }, { 'user-agent': requestHeaders['user-agent'] }), missingIp);
  assert.equal(missingIp.statusCode, 503);

  const missingSecretHandler = createAnalyticsEventHandler({
    getServices: () => ({ firestore }),
    rateLimitSecret: '',
    logger: { error() {} },
  });
  const missingSecret = makeResponse();
  await missingSecretHandler(makeRequest({
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath: '/anime',
    pageTitle: 'Anime List',
  }), missingSecret);
  assert.equal(missingSecret.statusCode, 503);
});
