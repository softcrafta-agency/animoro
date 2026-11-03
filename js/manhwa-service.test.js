import assert from 'node:assert/strict';
import test from 'node:test';

const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: key => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
};

const {
  filterManhwaByGenre,
  getManhwaSlug,
  isConfirmedManhwa,
  normalizeManhwa,
  searchManhwa,
} = await import('./manhwa-service.js');

function manhwaRecord(overrides = {}) {
  return {
    id: 140407,
    title: {
      english: 'The Greatest Estate Developer',
      romaji: 'Yeokdaegeum Yeongji Seolgyesa',
      native: '역대급 영지 설계사',
    },
    synonyms: ['The Legendary Estate Developer'],
    countryOfOrigin: 'KR',
    format: 'MANGA',
    source: 'OTHER',
    status: 'FINISHED',
    description: 'A civil engineering student wakes up inside a fantasy novel.',
    genres: ['Comedy', 'Fantasy'],
    tags: [{ name: 'Long Strip' }, { name: 'Isekai' }],
    coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx140407-1.jpg' },
    siteUrl: 'https://anilist.co/manga/140407',
    staff: {
      edges: [
        { role: 'Story', node: { name: { full: 'Hyeon-Min Lee' } } },
        { role: 'Art', node: { name: { full: 'Hyeon-Su Kim' } } },
        { role: 'Original Story', node: { name: { full: 'Baek-Gyeong Mun' } } },
      ],
    },
    ...overrides,
  };
}

function response(payload) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => payload,
  };
}

test('confirms Korean webtoon/manhwa from origin, format, and supporting tags', () => {
  assert.equal(isConfirmedManhwa(manhwaRecord()), true);
  assert.equal(isConfirmedManhwa(manhwaRecord({
    countryOfOrigin: 'JP',
    format: 'MANGA',
  })), false);
  assert.equal(isConfirmedManhwa(manhwaRecord({
    countryOfOrigin: 'KR',
    format: 'MANGA',
    tags: [{ name: 'Fantasy' }],
    source: 'OTHER',
  })), false);
  assert.equal(isConfirmedManhwa(manhwaRecord({
    countryOfOrigin: 'KR',
    format: 'NOVEL',
    tags: [{ name: 'Webtoon' }],
  })), false);
  assert.equal(isConfirmedManhwa(manhwaRecord({
    countryOfOrigin: 'KR',
    format: 'WEBTOON',
    tags: [],
  })), true);
});

test('normalizes alternative titles, contributors, status, and slug', () => {
  const normalized = normalizeManhwa(manhwaRecord());
  assert.equal(normalized.isConfirmedManhwa, true);
  assert.equal(normalized.title, 'The Greatest Estate Developer');
  assert.ok(normalized.alternativeTitles.includes('역대급 영지 설계사'));
  assert.ok(normalized.alternativeTitles.includes('The Legendary Estate Developer'));
  assert.deepEqual(normalized.authors, ['Hyeon-Min Lee', 'Baek-Gyeong Mun']);
  assert.deepEqual(normalized.artists, ['Hyeon-Su Kim']);
  assert.equal(normalized.status, 'Completed');
  assert.equal(getManhwaSlug(normalized), 'the-greatest-estate-developer');
});

test('filters only on supplied genres and Isekai tags', () => {
  const entries = [
    normalizeManhwa(manhwaRecord()),
    normalizeManhwa(manhwaRecord({
      id: 200,
      title: { english: 'Another Series' },
      genres: ['Romance'],
      tags: [{ name: 'Webtoon' }],
    })),
  ];
  assert.deepEqual(filterManhwaByGenre(entries, 'Fantasy').map(item => item.title), ['The Greatest Estate Developer']);
  assert.deepEqual(filterManhwaByGenre(entries, 'Isekai').map(item => item.title), ['The Greatest Estate Developer']);
  assert.throws(() => filterManhwaByGenre(entries, 'Science Fiction'), /Unsupported manhwa genre/);
});

test('search combines alternative-title matching, origin classification, genre filters, and API pagination', async () => {
  storage.clear();
  let body;
  let requestCount = 0;
  globalThis.fetch = async (url, options) => {
    requestCount += 1;
    assert.equal(url, 'https://graphql.anilist.co');
    body = JSON.parse(options.body);
    return response({
      data: {
        Page: {
          pageInfo: { currentPage: 2, hasNextPage: true, total: 81 },
          media: [
            manhwaRecord(),
            manhwaRecord({
              id: 301,
              title: { english: 'Japanese title' },
              countryOfOrigin: 'JP',
            }),
          ],
        },
      },
    });
  };

  const result = await searchManhwa({
    query: 'Legendary Estate',
    genre: 'Isekai',
    page: 2,
    perPage: 24,
  });
  assert.equal(requestCount, 1);
  assert.match(body.query, /countryOfOrigin:\s*"KR"/);
  assert.deepEqual(body.variables, {
    page: 2,
    perPage: 24,
    search: 'Legendary Estate',
    genreIn: null,
    tagIn: ['Isekai'],
  });
  assert.deepEqual(result.items.map(item => item.title), ['The Greatest Estate Developer']);
  assert.equal(result.pagination.hasNextPage, true);
});

test('reuses cached metadata for the exact same query', async () => {
  storage.clear();
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return response({ data: { Page: { pageInfo: {}, media: [manhwaRecord()] } } });
  };
  await searchManhwa({ query: 'Greatest Estate' });
  const cachedResult = await searchManhwa({ query: 'Greatest Estate' });
  assert.equal(requestCount, 1);
  assert.equal(cachedResult.cached, true);
});
