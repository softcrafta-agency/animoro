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
  classifyComic,
  FEATURED_MANHWA_SLUG,
  filterComicsByContentType,
  filterComicsByCountry,
  getManhwaDetailsBySlug,
  filterManhwaByGenre,
  getCountryName,
  getManhwaSlug,
  isConfirmedManhwa,
  normalizeManhwa,
  OFFICIAL_FEATURED_URL,
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

function mangaDexRecord(overrides = {}) {
  return {
    id: 'ef525177-734a-4ae0-bc66-b2d377f3ada9',
    type: 'manga',
    attributes: {
      title: { en: 'Lore Olympus' },
      altTitles: [{ ja: 'ロア・オリンポス' }],
      description: { en: 'A modern retelling of a Greek myth.' },
      originalLanguage: 'en',
      status: 'completed',
      tags: [
        { attributes: { name: { en: 'Long Strip' }, group: 'format' } },
        { attributes: { name: { en: 'Romance' }, group: 'genre' } },
      ],
      ...overrides.attributes,
    },
    relationships: [
      { type: 'cover_art', attributes: { fileName: 'cover.jpg' } },
      { type: 'author', attributes: { name: 'Rachel Smythe' } },
      { type: 'artist', attributes: { name: 'Rachel Smythe' } },
      ...(overrides.relationships || []),
    ],
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

test('classifies comics conservatively from origin, format, source, and tags', () => {
  assert.equal(isConfirmedManhwa(manhwaRecord()), true);
  assert.equal(classifyComic(manhwaRecord({
    countryOfOrigin: 'JP',
    format: 'MANGA',
  })), 'Manga');
  assert.equal(classifyComic(manhwaRecord({
    countryOfOrigin: 'CN',
    format: 'MANGA',
    tags: [],
  })), 'Manhua');
  assert.equal(classifyComic(manhwaRecord({
    countryOfOrigin: 'US',
    format: 'MANGA',
    source: 'COMIC',
    tags: [],
  })), 'Western Comics');
  assert.equal(classifyComic(manhwaRecord({
    countryOfOrigin: 'US',
    format: 'WEBTOON',
    tags: [],
  })), 'Webcomics');
  assert.equal(classifyComic(manhwaRecord({
    countryOfOrigin: 'FR',
    format: 'MANGA',
    tags: [],
  })), 'Other');
  assert.equal(classifyComic(manhwaRecord({
    countryOfOrigin: null,
    format: 'MANGA',
    tags: [],
  })), 'Other');
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
  assert.equal(normalized.contentType, 'Manhwa');
  assert.equal(normalized.countryName, 'South Korea');
  assert.equal(normalized.title, 'The Greatest Estate Developer');
  assert.ok(normalized.alternativeTitles.includes('역대급 영지 설계사'));
  assert.ok(normalized.alternativeTitles.includes('The Legendary Estate Developer'));
  assert.deepEqual(normalized.authors, ['Hyeon-Min Lee', 'Baek-Gyeong Mun']);
  assert.deepEqual(normalized.artists, ['Hyeon-Su Kim']);
  assert.equal(normalized.status, 'Completed');
  assert.equal(getManhwaSlug(normalized), 'the-greatest-estate-developer');
});

test('preserves the featured title details route and official WEBTOON destination', async () => {
  storage.clear();
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://graphql.anilist.co');
    const request = JSON.parse(options.body);
    assert.equal(request.variables.id, 140407);
    return response({ data: { Media: manhwaRecord() } });
  };
  const result = await getManhwaDetailsBySlug(FEATURED_MANHWA_SLUG);
  assert.equal(result.item.title, 'The Greatest Estate Developer');
  assert.equal(result.item.contentType, 'Manhwa');
  assert.equal(result.item.countryName, 'South Korea');
  assert.equal(OFFICIAL_FEATURED_URL, 'https://www.webtoons.com/en/fantasy/the-greatest-estate-developer/list?title_no=3596');
});

test('filters by genres, countries, content types, and unknown origin', () => {
  const entries = [
    normalizeManhwa(manhwaRecord()),
    normalizeManhwa(manhwaRecord({
      id: 200,
      title: { english: 'A Japanese Manga' },
      countryOfOrigin: 'JP',
      genres: ['Fantasy'],
      tags: [],
    })),
    normalizeManhwa(manhwaRecord({
      id: 201,
      title: { english: 'An Unknown Comic' },
      countryOfOrigin: null,
      format: 'MANGA',
      genres: ['Romance'],
      tags: [],
    })),
  ];
  assert.deepEqual(
    filterManhwaByGenre(entries, 'Fantasy').map(item => item.title),
    ['The Greatest Estate Developer', 'A Japanese Manga']
  );
  assert.deepEqual(filterManhwaByGenre(entries, 'Isekai').map(item => item.title), ['The Greatest Estate Developer']);
  assert.deepEqual(filterComicsByCountry(entries, 'JP').map(item => item.title), ['A Japanese Manga']);
  assert.deepEqual(filterComicsByCountry(entries, 'UNKNOWN').map(item => item.title), ['An Unknown Comic']);
  assert.deepEqual(filterComicsByCountry(entries, 'OTHER').map(item => item.title), []);
  assert.deepEqual(filterComicsByContentType(entries, 'Manhwa').map(item => item.title), ['The Greatest Estate Developer']);
  assert.deepEqual(
    filterComicsByContentType(filterComicsByCountry(filterManhwaByGenre(entries, 'Fantasy'), 'JP'), 'Manga')
      .map(item => item.title),
    ['A Japanese Manga']
  );
  assert.equal(getCountryName('CN'), 'China');
  assert.throws(() => filterManhwaByGenre(entries, 'Science Fiction'), /Unsupported comic genre/);
});

test('search combines alternate-title, genre, country, content-type filters, and AniList pagination', async () => {
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
              tags: [],
            }),
          ],
        },
      },
    });
  };

  const result = await searchManhwa({
    query: 'Legendary Estate',
    genre: 'Isekai',
    country: 'KR',
    contentType: 'Manhwa',
    page: 2,
    perPage: 24,
  });
  assert.equal(requestCount, 1);
  assert.match(body.query, /countryOfOrigin:\s*\$countryOfOrigin/);
  assert.deepEqual(body.variables, {
    page: 2,
    perPage: 24,
    search: 'Legendary Estate',
    genreIn: null,
    tagIn: ['Isekai'],
    countryOfOrigin: 'KR',
  });
  assert.deepEqual(result.items.map(item => item.title), ['The Greatest Estate Developer']);
  assert.deepEqual(result.countries, ['KR', 'JP']);
  assert.equal(result.pagination.hasNextPage, true);
});

test('search accepts a content type or country name and supports unknown country metadata', async () => {
  storage.clear();
  let body;
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('https://api.mangadex.org')) {
      return response({ result: 'ok', data: [mangaDexRecord()], total: 1 });
    }
    body = JSON.parse(options.body);
    return response({
      data: {
        Page: {
          pageInfo: { currentPage: 1, hasNextPage: false, total: 5 },
          media: [
            manhwaRecord({ id: 400, title: { english: 'Korean Webtoon' } }),
            manhwaRecord({ id: 401, title: { english: 'Manga from Japan' }, countryOfOrigin: 'JP', tags: [] }),
            manhwaRecord({ id: 402, title: { english: 'Manhua from China' }, countryOfOrigin: 'CN', tags: [] }),
            manhwaRecord({ id: 403, title: { english: 'Unknown Manga' }, countryOfOrigin: null, tags: [] }),
            manhwaRecord({ id: 404, title: { english: 'Other comic' }, countryOfOrigin: 'FR', tags: [] }),
          ],
        },
      },
    });
  };

  const japanese = await searchManhwa({ query: 'Japan' });
  assert.equal(body.variables.countryOfOrigin, 'JP');
  assert.deepEqual(japanese.items.map(item => item.title), ['Manga from Japan']);
  const korean = await searchManhwa({ query: 'Korea' });
  assert.deepEqual(korean.items.map(item => item.title), ['Korean Webtoon']);
  const chinese = await searchManhwa({ query: 'China' });
  assert.deepEqual(chinese.items.map(item => item.title), ['Manhua from China']);
  const unknown = await searchManhwa({ country: 'UNKNOWN' });
  assert.deepEqual(unknown.items.map(item => item.title), ['Lore Olympus', 'Unknown Manga']);
  const otherCountry = await searchManhwa({ country: 'OTHER' });
  assert.deepEqual(otherCountry.items.map(item => item.title), ['Other comic']);
});

test('discovers Western webcomics by content type without a title-only API request', async () => {
  storage.clear();
  let variables;
  globalThis.fetch = async (url, options) => {
    if (url.startsWith('https://api.mangadex.org')) {
      return response({ result: 'ok', data: [mangaDexRecord()], total: 1 });
    }
    variables = JSON.parse(options.body).variables;
    return response({
      data: {
        Page: {
          pageInfo: { currentPage: 1, hasNextPage: false, total: 0 },
          media: [],
        },
      },
    });
  };
  const result = await searchManhwa({ query: 'Webcomics' });
  assert.equal(variables.search, null);
  assert.deepEqual(result.items.map(item => item.title), ['Lore Olympus']);
  assert.equal(result.items[0].contentType, 'Webcomics');
  assert.equal(result.items[0].countryName, '');
  assert.equal(result.items[0].originalLanguageName, 'English');
  assert.match(result.items[0].coverImage, /uploads\.mangadex\.org/);
  assert.deepEqual(result.items[0].authors, ['Rachel Smythe']);
  assert.deepEqual(result.countries, []);
});

test('resolves MangaDex recommendations through the existing detail route without reader links', async () => {
  storage.clear();
  globalThis.fetch = async url => {
    assert.match(url, /^https:\/\/api\.mangadex\.org\/manga\//);
    return response({ result: 'ok', response: 'entity', data: mangaDexRecord() });
  };
  const slug = 'lore-olympus-md-ef525177-734a-4ae0-bc66-b2d377f3ada9';
  const result = await getManhwaDetailsBySlug(slug);
  assert.equal(result.item.title, 'Lore Olympus');
  assert.equal(result.item.contentType, 'Webcomics');
  assert.equal(result.item.countryName, '');
  assert.equal(result.item.siteUrl, '');
  assert.deepEqual(result.recommendations, []);
});

test('reuses cached metadata for the exact same query', async () => {
  storage.clear();
  let aniListRequests = 0;
  let mangaDexRequests = 0;
  globalThis.fetch = async url => {
    if (url.startsWith('https://api.mangadex.org')) {
      mangaDexRequests += 1;
      return response({ result: 'ok', data: [], total: 0 });
    }
    aniListRequests += 1;
    return response({ data: { Page: { pageInfo: {}, media: [manhwaRecord()] } } });
  };
  await searchManhwa({ query: 'Greatest Estate' });
  const cachedResult = await searchManhwa({ query: 'Greatest Estate' });
  assert.equal(aniListRequests, 1);
  assert.equal(mangaDexRequests, 1);
  assert.equal(cachedResult.cached, true);
});
