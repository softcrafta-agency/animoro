import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnimePath } from './anime-url.js';
import { TENRAI_GENRES } from './tenrai-genres.js';

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay > 1000 ? delay : 0),
  clearTimeout: id => globalThis.clearTimeout(id),
};

const { getAnimeDirectory, getAnimeSchedules, getUpcomingAnime, normalizeAnime } = await import('./anime-api.js');

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
  assert.equal(result.items[0].popularity, '');
  assert.equal(result.pagination.has_next_page, true);
});

test('Tenrai directory sort fields use the correct fields and directions', async () => {
  storage.clear();
  const requests = [];
  globalThis.fetch = async url => {
    const params = new URL(url, 'https://animoro.in').searchParams;
    requests.push(params);
    return response(200, {
      data: [animeRecord({ popularity: 12, score: 8.5 })],
      pagination: { has_next_page: false },
    });
  };

  const popular = await getAnimeDirectory({ orderBy: 'popularity' });
  await getAnimeDirectory({ orderBy: 'score', sort: 'desc' });
  await getAnimeDirectory({ orderBy: 'start_date' });
  await getAnimeDirectory({ orderBy: 'title' });

  assert.equal(requests[0].get('order_by'), 'popularity');
  assert.equal(requests[0].get('sort'), 'asc');
  assert.equal(requests[1].get('order_by'), 'score');
  assert.equal(requests[1].get('sort'), 'desc');
  assert.equal(requests[2].get('order_by'), 'start_date');
  assert.equal(requests[2].get('sort'), 'desc');
  assert.equal(requests[3].get('order_by'), 'title');
  assert.equal(requests[3].get('sort'), 'asc');
  assert.equal(popular.items[0].popularity, 12);
  assert.equal(normalizeAnime(animeRecord({ popularity: null })).popularity, '');
});

test('Tenrai directory sends every selected filter together and trims search terms', async () => {
  storage.clear();
  let requestUrl;
  globalThis.fetch = async url => {
    requestUrl = url;
    return response(200, {
      data: [animeRecord({ status: 'Currently Airing', type: 'TV' })],
      pagination: { has_next_page: false },
    });
  };

  await getAnimeDirectory({
    query: '  Naruto ',
    type: 'tv',
    status: 'airing',
    genre: 'Action',
    orderBy: 'popularity',
  });

  const params = new URL(requestUrl, 'https://animoro.in').searchParams;
  assert.equal(params.get('q'), 'Naruto');
  assert.equal(params.get('type'), 'tv');
  assert.equal(params.get('status'), 'airing');
  assert.equal(params.get('genres'), '1');
  assert.equal(params.get('order_by'), 'popularity');
  assert.equal(params.get('sort'), 'asc');
});

test('Tenrai directory integrates movie, TV, status, genre, search, and sort filters', async () => {
  storage.clear();
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(new URL(url, 'https://animoro.in').searchParams);
    return response(200, { data: [], pagination: { has_next_page: false } });
  };

  const cases = [
    [{ type: 'movie', genre: 'Action' }, { type: 'movie', genres: '1', order_by: 'popularity', sort: 'asc' }],
    [{ type: 'tv', status: 'airing' }, { type: 'tv', status: 'airing' }],
    [{ type: 'tv', status: 'completed' }, { type: 'tv', status: 'complete' }],
    [{ type: 'movie', orderBy: 'top-rated' }, { type: 'movie', order_by: 'score', sort: 'desc' }],
    [{ query: '  naruto ', genre: 'Fantasy' }, { q: 'naruto', genres: '10' }],
    [
      { query: 'One Piece', type: 'tv', status: 'completed', genre: 'Action', orderBy: 'score', page: 3, limit: 24 },
      { q: 'One Piece', type: 'tv', status: 'complete', genres: '1', order_by: 'score', sort: 'desc', page: '3', limit: '24' },
    ],
  ];

  for (const [options, expected] of cases) {
    const requestIndex = requests.length;
    await getAnimeDirectory(options);
    const params = requests[requestIndex];
    for (const [name, value] of Object.entries(expected)) {
      assert.equal(params.get(name), value, `${name} for ${JSON.stringify(options)}`);
    }
  }
});

test('every configured Tenrai genre maps to its supported ID and invalid genres are rejected', async () => {
  for (const [genre, id] of Object.entries(TENRAI_GENRES)) {
    storage.clear();
    let requestUrl;
    globalThis.fetch = async url => {
      requestUrl = url;
      return response(200, { data: [], pagination: { has_next_page: false } });
    };

    await getAnimeDirectory({ genre });
    assert.equal(
      new URL(requestUrl, 'https://animoro.in').searchParams.get('genres'),
      id,
      `${genre} must map to Tenrai genre ID ${id}`
    );
  }

  storage.clear();
  let requested = false;
  globalThis.fetch = async () => {
    requested = true;
    return response(200, { data: [] });
  };
  await assert.rejects(getAnimeDirectory({ genre: 'unsupported-genre' }), /Unsupported anime genre/);
  await assert.rejects(getAnimeDirectory({ genres: ['Action', 'unsupported-genre'] }), /Unsupported anime genre/);
  await assert.rejects(getAnimeDirectory({ genres: '999' }), /Unsupported Tenrai anime genre ID/);
  assert.equal(requested, false);
});

test('Tenrai pagination changes only the page while preserving the applied filters', async () => {
  storage.clear();
  const requests = [];
  globalThis.fetch = async url => {
    requests.push(new URL(url, 'https://animoro.in').searchParams);
    return response(200, { data: [], pagination: { has_next_page: false } });
  };
  const filters = {
    query: 'Naruto',
    type: 'tv',
    status: 'completed',
    genre: 'Action',
    orderBy: 'score',
    limit: 24,
  };

  await getAnimeDirectory({ ...filters, page: 1 });
  await getAnimeDirectory({ ...filters, page: 2 });

  const firstPage = requests[0];
  const secondPage = requests[1];
  for (const name of ['q', 'type', 'status', 'genres', 'order_by', 'sort', 'limit']) {
    assert.equal(secondPage.get(name), firstPage.get(name), `${name} should persist on the next page`);
  }
  assert.equal(firstPage.get('page'), '1');
  assert.equal(secondPage.get('page'), '2');
});

test('reset filter defaults request the unfiltered popular directory', async () => {
  storage.clear();
  let requestUrl;
  globalThis.fetch = async url => {
    requestUrl = url;
    return response(200, { data: [], pagination: { has_next_page: false } });
  };

  await getAnimeDirectory({
    query: '',
    type: '',
    status: '',
    genre: '',
    orderBy: 'popularity',
    page: 1,
  });

  const params = new URL(requestUrl, 'https://animoro.in').searchParams;
  for (const name of ['q', 'type', 'status', 'genres']) assert.equal(params.has(name), false);
  assert.equal(params.get('order_by'), 'popularity');
  assert.equal(params.get('sort'), 'asc');
  assert.equal(params.get('page'), '1');
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

test('Tenrai upcoming catalogue omits unsupported ordering and maps real anime records', async () => {
  storage.clear();
  let requestUrl;
  globalThis.fetch = async url => {
    requestUrl = url;
    return response(200, {
      data: [animeRecord({
        mal_id: 62516,
        title: 'Dandadan 3rd Season',
        title_english: 'Dandadan 3rd Season',
        status: 'Not yet aired',
        images: { webp: { large_image_url: 'https://images.example/dandadan.webp' } },
        aired: { from: '2027', prop: { from: { year: 2027, month: null, day: null } } },
      })],
      pagination: { current_page: 1, has_next_page: true },
    });
  };

  const result = await getUpcomingAnime({ page: 1, limit: 24 });
  const params = new URL(requestUrl, 'https://animoro.in').searchParams;

  assert.equal(params.get('resource'), 'upcoming');
  assert.equal(params.get('page'), '1');
  assert.equal(params.get('limit'), '24');
  assert.equal(params.has('order_by'), false);
  assert.equal(params.has('sort'), false);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, 'Dandadan 3rd Season');
  assert.equal(result.items[0].malId, 62516);
  assert.equal(getAnimePath(result.items[0]), '/anime/dandadan-3rd-season--62516');
  assert.equal(result.items[0].poster, 'https://images.example/dandadan.webp');
  assert.equal(result.items[0].releaseDate, '2027');
  assert.equal(result.items[0].releaseDatePrecision, 'year');
  assert.equal(result.pagination.has_next_page, true);
});

test('Tenrai schedule catalogue maps broadcast data from schedule records', async () => {
  storage.clear();
  let requestUrl;
  globalThis.fetch = async url => {
    requestUrl = url;
    return response(200, {
      data: [animeRecord({
        mal_id: 63409,
        title: 'Scheduled Anime',
        broadcast: { day: 'Mondays', time: '21:30', timezone: 'Asia/Tokyo' },
      })],
      pagination: { has_next_page: false },
    });
  };

  const result = await getAnimeSchedules({ limit: 2 });
  const params = new URL(requestUrl, 'https://animoro.in').searchParams;

  assert.equal(params.get('resource'), 'schedules');
  assert.equal(params.get('limit'), '2');
  assert.equal(result.items[0].title, 'Scheduled Anime');
  assert.equal(result.items[0].malId, 63409);
  assert.deepEqual(result.items[0].broadcast, {
    day: 'Mondays',
    time: '21:30',
    timezone: 'Asia/Tokyo',
  });
});

test('Tenrai HTTP failures remain errors rather than becoming empty catalogues', async () => {
  storage.clear();
  globalThis.fetch = async () => response(503, { error: 'Upstream unavailable' });

  await assert.rejects(
    getAnimeDirectory({ query: 'unavailable' }),
    error => error.status === 503 && /Upstream unavailable/.test(error.message)
  );
});

test('Tenrai upcoming request errors are not converted to empty results or hidden by a fallback', async () => {
  storage.clear();
  const requestedResources = [];
  globalThis.fetch = async url => {
    requestedResources.push(new URL(url, 'https://animoro.in').searchParams.get('resource'));
    return response(400, { error: 'querystring/order_by must be equal to one of the allowed values' });
  };

  await assert.rejects(
    getUpcomingAnime({ page: 1, limit: 24 }),
    error => error.status === 400 && /order_by/.test(error.message)
  );
  assert.deepEqual(requestedResources, ['upcoming']);
});
