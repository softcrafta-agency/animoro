import assert from 'node:assert/strict';
import test, { after, beforeEach } from 'node:test';
import { getDirectJikanUrl, getUpcomingAnime, normalizeJikanAnime } from './jikan-service.js';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const cache = new Map();
let requests;

function response(status, payload, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => headers[name.toLowerCase()] || null },
    async json() { return payload; },
  };
}

beforeEach(() => {
  cache.clear();
  requests = [];
  globalThis.window = {
    localStorage: {
      getItem: key => cache.get(key) || null,
      setItem: (key, value) => cache.set(key, value),
    },
    setTimeout,
    clearTimeout,
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function setFetch(handler) {
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    requests.push({ url, options });
    return handler(url, options);
  };
}

test('builds valid direct Jikan fallback URLs for list, upcoming, top, and detail requests', () => {
  assert.equal(
    getDirectJikanUrl('resource=anime&page=2&limit=24&q=Naruto'),
    'https://api.jikan.moe/v4/anime?page=2&limit=24&q=Naruto',
  );
  assert.equal(
    getDirectJikanUrl('resource=upcoming&page=1&limit=24'),
    'https://api.jikan.moe/v4/seasons/upcoming?page=1&limit=24',
  );
  assert.equal(
    getDirectJikanUrl('resource=top&limit=6'),
    'https://api.jikan.moe/v4/top/anime?limit=6',
  );
  assert.equal(
    getDirectJikanUrl('resource=detail&id=20'),
    'https://api.jikan.moe/v4/anime/20/full',
  );
});

test('normalizes Jikan anime data with a stable internal MAL identifier and poster fallback', () => {
  const anime = normalizeJikanAnime({
    mal_id: 20,
    title: 'Naruto',
    title_japanese: 'NARUTO',
    images: { jpg: { large_image_url: 'https://cdn.example.test/naruto.jpg' } },
    synopsis: 'A young ninja seeks recognition.',
    genres: [{ name: 'Action' }],
    themes: [{ name: 'Martial Arts' }],
    score: 8.1,
    status: 'Finished Airing',
    aired: { from: '2002-10-03T00:00:00+00:00', prop: { from: { year: 2002 } } },
    type: 'TV',
  });

  assert.equal(anime.id, 'jikan-20');
  assert.equal(anime.malId, 20);
  assert.equal(anime.slug, 'naruto--20');
  assert.equal(anime.coverImage, 'https://cdn.example.test/naruto.jpg');
  assert.deepEqual(anime.genres, ['Action', 'Martial Arts']);
  assert.equal(anime.status, 'completed');
  assert.equal(anime.releaseYear, '2002');
});

test('does not invent an upcoming release date when Jikan has none', () => {
  const anime = normalizeJikanAnime({ mal_id: 101, title: 'Future Story', status: 'Not yet aired' }, 'upcoming');
  assert.equal(anime.releaseDate, '');
  assert.equal(anime.releaseStatus, 'Release Date TBA');
});

test('preserves exact, month-only, and year-only release precision', () => {
  const exact = normalizeJikanAnime({
    mal_id: 201,
    title: 'Exact date',
    aired: { prop: { from: { day: 12, month: 3, year: 2027 } } },
  }, 'upcoming');
  const month = normalizeJikanAnime({
    mal_id: 202,
    title: 'Month only',
    aired: { prop: { from: { day: null, month: 3, year: 2027 } } },
  }, 'upcoming');
  const year = normalizeJikanAnime({
    mal_id: 203,
    title: 'Year only',
    aired: { prop: { from: { day: null, month: null, year: 2027 } } },
  }, 'upcoming');

  assert.equal(exact.releaseDate, '2027-03-12');
  assert.equal(exact.releaseDatePrecision, 'exact');
  assert.equal(month.releaseDate, 'March 2027');
  assert.equal(month.releaseDatePrecision, 'month');
  assert.equal(year.releaseDate, '2027');
  assert.equal(year.releaseDatePrecision, 'year');
});

test('uses Jikan upcoming status as a fallback when seasonal data is empty', async () => {
  setFetch(url => {
    const query = new URL(url, 'https://animoro.test').searchParams;
    if (query.get('resource') === 'upcoming') return response(200, { data: [], pagination: {} });
    assert.equal(query.get('status'), 'upcoming');
    return response(200, {
      data: [{ mal_id: 301, title: 'Jikan upcoming title', status: 'Not yet aired' }],
      pagination: { has_next_page: true },
    });
  });

  const result = await getUpcomingAnime({ page: 1, limit: 2 });

  assert.equal(result.source, 'upcoming-status');
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.items[0].malId, 301);
  assert.equal(result.items[0].title, 'Jikan upcoming title');
  assert.equal(requests.length, 2);
});

test('uses the status endpoint when the seasonal Jikan request fails', async () => {
  setFetch(url => {
    const query = new URL(url, 'https://animoro.test').searchParams;
    if (query.get('resource') === 'upcoming') return response(503, { error: 'Temporarily unavailable.' });
    return response(200, { data: [{ mal_id: 302, title: 'Fallback title' }] });
  });

  const result = await getUpcomingAnime({ page: 1, limit: 2 });

  assert.equal(result.fallbackUsed, true);
  assert.equal(result.items[0].malId, 302);
});

test('does not return an empty catalogue when both Jikan endpoints fail', async () => {
  setFetch(() => response(503, { error: 'Unavailable.' }));

  await assert.rejects(getUpcomingAnime({ page: 1, limit: 2 }), /Jikan upcoming anime endpoints are temporarily unavailable/);
  assert.equal(requests.length, 2);
});

test('uses direct Jikan only when the Vercel proxy route is missing', async () => {
  setFetch(url => {
    if (url.startsWith('/api/jikan?')) {
      return {
        ok: false,
        status: 404,
        headers: { get: () => null },
        async json() { throw new SyntaxError('HTML response is not JSON.'); },
      };
    }
    assert.match(url, /^https:\/\/api\.jikan\.moe\/v4\/seasons\/upcoming/);
    return response(200, { data: [{ mal_id: 303, title: 'Direct fallback' }] });
  });

  const result = await getUpcomingAnime({ page: 1, limit: 2 });

  assert.equal(result.items[0].title, 'Direct fallback');
  assert.equal(requests.length, 2);
});

test('does not retry a proxy 404 against direct Jikan', async () => {
  setFetch((url, _options) => {
    if (url.startsWith('/api/jikan?')) return response(404, { error: 'Not found.' }, { 'x-jikan-proxy': '1' });
    throw new Error('Proxy upstream errors must not be sent directly to Jikan.');
  });

  await assert.rejects(getUpcomingAnime({ page: 1, limit: 2 }), /Jikan upcoming anime endpoints are temporarily unavailable/);
  assert.equal(requests.filter(request => request.url.startsWith('https://api.jikan.moe')).length, 0);
});
