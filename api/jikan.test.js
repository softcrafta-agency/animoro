import assert from 'node:assert/strict';
import test from 'node:test';
import { createJikanHandler } from './jikan.js';

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
    },
  };
}

test('proxies supported Jikan requests and enables shared caching', async () => {
  let requestedUrl;
  const handler = createJikanHandler({
    fetchImpl: async url => {
      requestedUrl = url.toString();
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'anime', q: 'Naruto' } }, response);

  assert.equal(requestedUrl, 'https://api.jikan.moe/v4/anime?page=1&limit=24&q=Naruto');
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['cache-control'], 'public, s-maxage=3600, stale-while-revalidate=86400');
  assert.deepEqual(JSON.parse(response.body), { data: [] });
});

test('preserves upstream rate-limit responses without caching them', async () => {
  const handler = createJikanHandler({
    fetchImpl: async () => ({
      ok: false,
      status: 429,
      json: async () => ({ message: 'Rate limit exceeded.' }),
    }),
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'upcoming' } }, response);

  assert.equal(response.statusCode, 429);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(JSON.parse(response.body), { error: 'Rate limit exceeded.' });
});

test('rejects unsupported methods without making an upstream request', async () => {
  let fetched = false;
  const handler = createJikanHandler({
    fetchImpl: async () => {
      fetched = true;
      throw new Error('Unexpected request.');
    },
  });
  const response = createResponse();

  await handler({ method: 'POST', query: { resource: 'anime' } }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
  assert.equal(fetched, false);
});

test('returns gateway timeout for an aborted upstream request', async () => {
  const handler = createJikanHandler({
    fetchImpl: async () => {
      const error = new Error('Request timed out.');
      error.name = 'AbortError';
      throw error;
    },
    logger: { warn() {} },
  });
  const response = createResponse();

  await handler({ method: 'GET', query: { resource: 'detail', id: '20' } }, response);

  assert.equal(response.statusCode, 504);
  assert.equal(response.headers['cache-control'], 'no-store');
});
