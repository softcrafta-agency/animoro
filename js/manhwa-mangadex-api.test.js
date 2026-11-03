import assert from 'node:assert/strict';
import test from 'node:test';

const { getMangaDexDetails, requestMangaDex, searchMangaDex } = await import('./manhwa-mangadex-api.js');

function response(status, payload, headers = new Headers()) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    json: async () => payload,
  };
}

test('searches MangaDex metadata and deduplicates concurrent requests', async () => {
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    requests += 1;
    const parsedUrl = new URL(url);
    assert.equal(parsedUrl.origin, 'https://api.mangadex.org');
    assert.equal(parsedUrl.pathname, '/manga');
    assert.equal(parsedUrl.searchParams.get('title'), 'Lore Olympus');
    assert.equal(parsedUrl.searchParams.get('limit'), '12');
    assert.equal(parsedUrl.searchParams.get('includes[]'), 'cover_art');
    assert.deepEqual(parsedUrl.searchParams.getAll('contentRating[]'), ['safe', 'suggestive']);
    assert.equal(options.headers.Accept, 'application/json');
    await new Promise(resolve => globalThis.setTimeout(resolve, 10));
    return response(200, { result: 'ok', response: 'collection', data: [] });
  };

  const [first, second] = await Promise.all([
    searchMangaDex({ title: 'Lore Olympus' }),
    searchMangaDex({ title: 'Lore Olympus' }),
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(first, { result: 'ok', response: 'collection', data: [] });
  assert.deepEqual(second, first);
});

test('retries MangaDex rate limits and surfaces API errors', async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) {
      return response(429, {}, new Headers({ 'retry-after': '1' }));
    }
    return response(200, { result: 'ok', response: 'entity', data: {} });
  };
  const result = await requestMangaDex('/manga/ef525177-734a-4ae0-bc66-b2d377f3ada9');
  assert.equal(requests, 2);
  assert.deepEqual(result.data, {});

  globalThis.fetch = async () => response(503, {}, new Headers());
  await assert.rejects(
    requestMangaDex('/manga', { limit: 1 }),
    /MangaDex request failed \(503\)/
  );
});

test('treats a missing MangaDex detail record as confirmed not found', async () => {
  globalThis.fetch = async () => response(404, { result: 'error' });
  await assert.rejects(
    getMangaDexDetails('ef525177-734a-4ae0-bc66-b2d377f3ada9'),
    error => error.status === 404 && error.notFound === true
  );
});
