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
  getManhwaDiscovery,
  getManhwaDetailsBySlug,
  filterManhwaByGenre,
  getCountryName,
  getManhwaPath,
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
    startDate: { year: 2020, month: 1, day: 1 },
    meanScore: 84,
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
  assert.equal(normalized.originalTitle, '역대급 영지 설계사');
  assert.equal(normalized.releaseYear, 2020);
  assert.equal(normalized.rating, 84);
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

test('creates unique detail URLs and loads five AniList comics directly by ID', async () => {
  storage.clear();
  const originalSetTimeout = globalThis.setTimeout;
  const ids = [140408, 140409, 140410, 140411, 140412];
  const countries = ['KR', 'JP', 'CN', 'US', 'FR'];
  const requestedIds = [];
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  globalThis.fetch = async (_url, options) => {
    const id = JSON.parse(options.body).variables.id;
    requestedIds.push(id);
    return response({
      data: {
        Media: manhwaRecord({
          id,
          title: { english: `Comic ${id}`, native: `Original ${id}` },
          countryOfOrigin: countries[ids.indexOf(id)],
          tags: [{ name: 'Long Strip' }],
          recommendations: {
            nodes: [{
              mediaRecommendation: manhwaRecord({
                id: id + 1000,
                title: { english: `Related Comic ${id}` },
              }),
            }],
          },
        }),
      },
    });
  };

  try {
    const slugs = ids.map((id, index) => getManhwaSlug(normalizeManhwa(manhwaRecord({
      id,
      title: { english: `Comic ${id}` },
      countryOfOrigin: countries[index],
      tags: [{ name: 'Long Strip' }],
    }))));
    assert.equal(new Set(slugs).size, ids.length);
    assert.deepEqual(slugs.map(slug => getManhwaPath({ slug })), ids.map((id, index) =>
      `/manhwa/comic-${id}--${id}`
    ));

    for (let index = 0; index < slugs.length; index += 1) {
      const result = await getManhwaDetailsBySlug(slugs[index]);
      assert.equal(result.item.id, ids[index]);
      assert.equal(result.item.countryOfOrigin, countries[index]);
      assert.equal(result.recommendations[0].title, `Related Comic ${ids[index]}`);
    }
    assert.deepEqual(requestedIds, ids);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('returns a 404 only for a confirmed missing comic and keeps API failures retryable', async () => {
  storage.clear();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  try {
    await assert.rejects(
      getManhwaDetailsBySlug('../invalid'),
      error => error.status === 404 && error.notFound === true
    );

    globalThis.fetch = async () => response({ data: { Media: null } });
    await assert.rejects(
      getManhwaDetailsBySlug('missing-comic--140499'),
      error => error.status === 404 && error.notFound === true
    );

    storage.clear();
    globalThis.fetch = async () => {
      throw new Error('Network unavailable');
    };
    await assert.rejects(
      getManhwaDetailsBySlug('temporarily-unavailable--140500'),
      error => error.notFound !== true
    );

    storage.clear();
    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({ message: 'Upstream endpoint unavailable' }),
    });
    await assert.rejects(
      getManhwaDetailsBySlug('upstream-error--140501'),
      error => error.status === 404 && error.notFound !== true
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('does not turn a partial provider outage into a legacy-slug 404', async () => {
  storage.clear();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  globalThis.fetch = async url => {
    if (String(url).startsWith('https://api.mangadex.org')) {
      return response({ result: 'ok', data: [], total: 0 });
    }
    return {
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({ message: 'AniList request blocked' }),
    };
  };
  try {
    await assert.rejects(
      getManhwaDetailsBySlug('return-of-the-blossoming-blade'),
      error => error instanceof AggregateError && error.notFound !== true
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test('resolves existing title-only URLs to the matching AniList record ID', async () => {
  storage.clear();
  const originalSetTimeout = globalThis.setTimeout;
  const requestedIds = [];
  globalThis.setTimeout = (callback, _delay, ...args) => originalSetTimeout(callback, 0, ...args);
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.mangadex.org')) {
      return response({ result: 'ok', data: [], total: 0 });
    }
    const request = JSON.parse(options.body);
    if (request.query.includes('SearchManhwa')) {
      return response({
        data: {
          Page: {
            pageInfo: { currentPage: 1, hasNextPage: false, total: 1 },
            media: [manhwaRecord({
              id: 132144,
              title: {
                english: 'Return of the Blossoming Blade',
                romaji: 'Hwasangwihwan',
                native: '화산귀환',
              },
            })],
          },
        },
      });
    }
    requestedIds.push(request.variables.id);
    return response({
      data: {
        Media: manhwaRecord({
          id: request.variables.id,
          title: {
            english: 'Return of the Blossoming Blade',
            romaji: 'Hwasangwihwan',
            native: '화산귀환',
          },
        }),
      },
    });
  };
  try {
    const result = await getManhwaDetailsBySlug('return-of-the-blossoming-blade');
    assert.equal(result.item.id, 132144);
    assert.deepEqual(requestedIds, [132144]);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
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
  assert.match(body.query, /isAdult:\s*false/);
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
  const slug = 'previous-title-md-ef525177-734a-4ae0-bc66-b2d377f3ada9';
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

test('excludes explicit comics from discovery lists and cached recommendations', async () => {
  storage.clear();
  const recommendationRecords = [
    manhwaRecord({ id: 501, title: { english: 'Adult Flagged' }, isAdult: true }),
    manhwaRecord({ id: 502, title: { english: 'Adult Genre' }, genres: ['Adult'] }),
    manhwaRecord({ id: 503, title: { english: 'Hentai Genre' }, genres: ['Hentai'] }),
    manhwaRecord({ id: 504, title: { english: 'Erotica Tag' }, tags: [{ name: 'Erotica' }] }),
    manhwaRecord({ id: 505, title: { english: 'Pornographic Tag' }, tags: [{ name: 'Pornographic' }] }),
    manhwaRecord({ id: 508, title: { english: '18 Plus Rating' }, rating: '18+ explicit' }),
    manhwaRecord({
      id: 506,
      title: { english: 'Romance Drama' },
      genres: ['Romance', 'Drama'],
      tags: [{ name: 'Long Strip' }],
    }),
  ];
  const recommendations = recommendationRecords.map(mediaRecommendation => ({ mediaRecommendation }));
  const aniListRecords = [
    ...recommendationRecords,
    manhwaRecord({
      id: 507,
      title: { english: 'Safe Action' },
      genres: ['Action'],
      tags: [{ name: 'Long Strip' }],
    }),
  ];
  const mangaDexRecords = [
    mangaDexRecord({ attributes: { contentRating: 'erotica' } }),
    mangaDexRecord({
      id: 'ef525177-734a-4ae0-bc66-b2d377f3ada8',
      attributes: { contentRating: 'pornographic' },
    }),
    mangaDexRecord({
      id: 'ef525177-734a-4ae0-bc66-b2d377f3ada7',
      attributes: { contentRating: 'safe' },
    }),
  ];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.mangadex.org')) {
      return response({ result: 'ok', data: mangaDexRecords, total: mangaDexRecords.length });
    }
    assert.match(JSON.parse(options.body).query, /isAdult:\s*false/);
    return response({
      data: {
        featured: manhwaRecord({ recommendations: { nodes: recommendations } }),
        trending: { media: aniListRecords },
        popular: { media: aniListRecords },
        recent: { media: aniListRecords },
        search: {
          pageInfo: { currentPage: 1, hasNextPage: false, total: aniListRecords.length },
          media: aniListRecords,
        },
      },
    });
  };

  const discovery = await getManhwaDiscovery();
  for (const list of [
    discovery.trending,
    discovery.popular,
    discovery.recent,
    discovery.recommended,
    discovery.results,
  ]) {
    assert.ok(list.every(item => !/Adult Flagged|Adult Genre|Hentai Genre|Erotica Tag|Pornographic Tag|18 Plus Rating/.test(item.title)));
  }
  assert.ok(discovery.recommended.some(item => item.title === 'Romance Drama'));
  assert.ok(discovery.trending.some(item => item.title === 'Safe Action'));
  assert.ok(discovery.results.some(item => item.title === 'Lore Olympus'));

  const cachedDiscovery = await getManhwaDiscovery();
  assert.equal(cachedDiscovery.cached, true);
  assert.deepEqual(cachedDiscovery.recommended.map(item => item.title), ['Romance Drama']);
});

test('filters search pages and related-comic recommendations without dropping general genres', async () => {
  storage.clear();
  let searchPage = 1;
  const pageRecords = [
    manhwaRecord({ id: 601, title: { english: 'Explicit Search Result' }, isAdult: true }),
    manhwaRecord({
      id: 602,
      title: { english: 'Fantasy Romance Search Result' },
      genres: ['Fantasy', 'Romance'],
      tags: [{ name: 'Long Strip' }],
    }),
  ];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.mangadex.org')) {
      return response({ result: 'ok', data: [], total: 0 });
    }
    const request = JSON.parse(options.body);
    if (request.query.includes('SearchManhwa')) {
      searchPage = request.variables.page;
      return response({
        data: {
          Page: {
            pageInfo: { currentPage: searchPage, hasNextPage: searchPage === 1, total: 4 },
            media: pageRecords,
          },
        },
      });
    }
    return response({
      data: {
        Media: manhwaRecord({
          id: request.variables.id,
          recommendations: {
            nodes: [
              { mediaRecommendation: manhwaRecord({ id: 603, title: { english: 'Hentai Related' }, tags: [{ name: 'Hentai' }] }) },
              { mediaRecommendation: manhwaRecord({ id: 604, title: { english: 'Safe Drama Related' }, genres: ['Drama'] }) },
            ],
          },
        }),
      },
    });
  };

  const firstPage = await searchManhwa({ query: 'Fantasy', page: 1 });
  const secondPage = await searchManhwa({ query: 'Fantasy', page: 2 });
  assert.deepEqual(firstPage.items.map(item => item.title), ['Fantasy Romance Search Result']);
  assert.deepEqual(secondPage.items.map(item => item.title), ['Fantasy Romance Search Result']);
  assert.equal(secondPage.pagination.currentPage, 2);
  assert.deepEqual(secondPage.items[0].genres, ['Fantasy', 'Romance']);

  const detail = await getManhwaDetailsBySlug('safe-comic--140407');
  assert.deepEqual(detail.recommendations.map(item => item.title), ['Safe Drama Related']);
});
