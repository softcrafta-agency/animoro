import assert from 'node:assert/strict';
import test from 'node:test';
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
