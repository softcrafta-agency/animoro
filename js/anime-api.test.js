import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay > 1000 ? delay : 0),
  clearTimeout: id => globalThis.clearTimeout(id),
};

const { getAnimeDirectory, getUpcomingAnime } = await import('./anime-api.js');

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => payload,
  };
}

function animeRecord(overrides = {}) {
  return {
    mal_id: 20,
    title: 'Naruto',
    title_english: 'Naruto',
    images: { webp: { large_image_url: 'https://images.example/naruto.webp' } },
    aired: { from: '2002-10-03T00:00:00+00:00', prop: { from: { year: 2002, month: 10, day: 3 } } },
    genres: [{ name: 'Action' }],
    score: 8.2,
    ...overrides,
  };
}

test('Tenrai catalogue responses normalize real catalogue fields and preserve MAL detail IDs', async () => {
  storage.clear();
  let requestUrl;
  globalThis.fetch = async url => {
    requestUrl = url;
    return response(200, {
      data: [animeRecord()],
      pagination: { has_next_page: true },
    });
  };

  const result = await getAnimeDirectory({ query: 'naruto', page: 2, limit: 1 });

  assert.match(requestUrl, /^\/api\/tenrai\?/);
  assert.equal(new URL(requestUrl, 'https://animoro.in').searchParams.get('q'), 'naruto');
  assert.equal(result.items[0].source, 'tenrai');
  assert.equal(result.items[0].malId, 20);
  assert.equal(result.items[0].slug, 'naruto--20');
  assert.equal(result.items[0].releaseDate, '2002-10-03');
  assert.equal(result.items[0].coverImage, 'https://images.example/naruto.webp');
  assert.equal(result.pagination.has_next_page, true);
});

test('Tenrai upcoming catalogue falls back to anime marked upcoming when seasonal data is empty', async () => {
  storage.clear();
  const requestedResources = [];
  globalThis.fetch = async url => {
    const params = new URL(url, 'https://animoro.in').searchParams;
    const resource = params.get('resource');
    requestedResources.push(resource);
    if (resource === 'upcoming') return response(200, { data: [], pagination: { has_next_page: false } });
    return response(200, {
      data: [animeRecord({ mal_id: 999, title: 'Upcoming Test', status: 'Not yet aired', aired: { from: null, prop: { from: {} } } })],
      pagination: { has_next_page: false },
    });
  };

  const result = await getUpcomingAnime({ page: 1, limit: 5 });

  assert.deepEqual(requestedResources, ['upcoming', 'anime']);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.items[0].title, 'Upcoming Test');
  assert.equal(result.items[0].status, 'upcoming');
  assert.equal(result.items[0].releaseDatePrecision, 'unknown');
});

test('Tenrai HTTP failures remain errors rather than becoming empty catalogues', async () => {
  storage.clear();
  globalThis.fetch = async () => response(503, { error: 'Upstream unavailable' });

  await assert.rejects(
    getAnimeDirectory({ query: 'unavailable' }),
    error => error.status === 503 && /Upstream unavailable/.test(error.message)
  );
});
