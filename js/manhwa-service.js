import { requestAniList } from './manhwa-api.js';
import {
  getMangaDexDetails as fetchMangaDexDetails,
  searchMangaDex as fetchMangaDexSearch,
} from './manhwa-mangadex-api.js';

export const FEATURED_MANHWA_ID = 140407;
export const FEATURED_MANHWA_SLUG = 'the-greatest-estate-developer';
export const OFFICIAL_FEATURED_URL =
  'https://www.webtoons.com/en/fantasy/the-greatest-estate-developer/list?title_no=3596';

const CACHE_PREFIX = 'animoro_manhwa_v2:';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const CONFIRMING_TAGS = new Set(['webtoon', 'webcomic', 'web comics', 'long strip', 'manhwa']);
const COMIC_FORMATS = new Set(['MANGA', 'WEBTOON', 'ONE_SHOT']);
const COUNTRY_FILTERS = new Set(['KR', 'JP', 'CN', 'US', 'OTHER', 'UNKNOWN']);
const CORE_COUNTRIES = new Set(['KR', 'JP', 'CN', 'US']);
const CONTENT_TYPES = new Set(['Manhwa', 'Manga', 'Manhua', 'Western Comics', 'Webcomics', 'Other']);
const GENRES = new Set([
  'Action', 'Adventure', 'Fantasy', 'Comedy', 'Romance',
  'Drama', 'Horror', 'Thriller', 'Mystery', 'Isekai',
]);

const CARD_FIELDS = `
  fragment ManhwaCardFields on Media {
    id
    type
    title { romaji english native userPreferred }
    synonyms
    countryOfOrigin
    format
    source
    status
    description(asHtml: false)
    genres
    tags { name }
    coverImage { extraLarge large }
    siteUrl
    trending
    popularity
    startDate { year month day }
  }
`;

const STAFF_FIELDS = `
  staff(perPage: 25, sort: RELEVANCE) {
    edges { role node { name { full } } }
  }
`;

const DISCOVERY_QUERY = `
  query ManhwaDiscovery {
    trending: Page(page: 1, perPage: 12) {
      media(type: MANGA, sort: TRENDING_DESC) { ...ManhwaCardFields }
    }
    popular: Page(page: 1, perPage: 12) {
      media(type: MANGA, sort: POPULARITY_DESC) { ...ManhwaCardFields }
    }
    recent: Page(page: 1, perPage: 12) {
      media(type: MANGA, sort: ID_DESC) { ...ManhwaCardFields }
    }
    search: Page(page: 1, perPage: 24) {
      pageInfo { currentPage hasNextPage total }
      media(type: MANGA, sort: POPULARITY_DESC) { ...ManhwaCardFields }
    }
    featured: Media(id: ${FEATURED_MANHWA_ID}, type: MANGA) {
      ...ManhwaCardFields
      ${STAFF_FIELDS}
      recommendations(perPage: 20, sort: RATING_DESC) {
        nodes { mediaRecommendation { ...ManhwaCardFields } }
      }
    }
  }
  ${CARD_FIELDS}
`;

const SEARCH_QUERY = `
  query SearchManhwa($page: Int!, $perPage: Int!, $search: String, $genreIn: [String], $tagIn: [String], $countryOfOrigin: CountryCode) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage total }
      media(
        type: MANGA
        countryOfOrigin: $countryOfOrigin
        search: $search
        genre_in: $genreIn
        tag_in: $tagIn
        sort: POPULARITY_DESC
      ) {
        ...ManhwaCardFields
      }
    }
  }
  ${CARD_FIELDS}
`;

const DETAIL_QUERY = `
  query ManhwaDetails($id: Int!) {
    Media(id: $id, type: MANGA) {
      ...ManhwaCardFields
      ${STAFF_FIELDS}
      recommendations(perPage: 20, sort: RATING_DESC) {
        nodes { mediaRecommendation { ...ManhwaCardFields } }
      }
    }
  }
  ${CARD_FIELDS}
`;

function safeStorage() {
  try {
    return globalThis.window?.localStorage || null;
  } catch {
    return null;
  }
}

function readCache(key, allowStale = false) {
  try {
    const raw = safeStorage()?.getItem(`${CACHE_PREFIX}${key}`);
    const cache = raw ? JSON.parse(raw) : null;
    if (!cache || !Object.hasOwn(cache, 'value') || !Number.isFinite(cache.expiresAt)) return null;
    if (cache.expiresAt < Date.now() &&
        (!allowStale || !Number.isFinite(cache.staleUntil) || cache.staleUntil < Date.now())) return null;
    return cache;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    safeStorage()?.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({
      value,
      expiresAt: Date.now() + CACHE_TTL_MS,
      staleUntil: Date.now() + CACHE_TTL_MS + MAX_STALE_MS,
    }));
  } catch {
    // The API response remains usable when browser storage is unavailable.
  }
}

async function cachedQuery(key, query, variables = {}) {
  return cachedValue(key, () => requestAniList(query, variables));
}

async function cachedValue(key, load) {
  const cached = readCache(key);
  if (cached) return { data: cached.value, stale: false, cached: true };

  try {
    const data = await load();
    writeCache(key, data);
    return { data, stale: false, cached: false };
  } catch (error) {
    const stale = readCache(key, true);
    if (stale) return { data: stale.value, stale: true, cached: true };
    throw error;
  }
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function uniqueNames(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getTagNames(tags) {
  return Array.isArray(tags)
    ? tags.map(tag => typeof tag === 'string' ? tag : tag?.name).filter(name => typeof name === 'string')
    : [];
}

function hasWebcomicEvidence(media) {
  if (media?.format === 'WEBTOON') return true;
  const source = normalizedText(media?.source);
  if (['manhwa', 'webtoon', 'webcomic', 'web comics'].includes(source)) return true;
  return getTagNames(media?.tags).some(tag => CONFIRMING_TAGS.has(normalizedText(tag)));
}

export function classifyComic(media) {
  const country = typeof media?.countryOfOrigin === 'string'
    ? media.countryOfOrigin.trim().toUpperCase()
    : '';
  const format = typeof media?.format === 'string' ? media.format.trim().toUpperCase() : '';
  const webcomic = hasWebcomicEvidence(media);
  const language = typeof media?.originalLanguage === 'string'
    ? media.originalLanguage.trim().toLowerCase()
    : '';

  if (media?.provider === 'mangadex') {
    if (language === 'ko' && webcomic) return 'Manhwa';
    if (webcomic) return 'Webcomics';
    if (language === 'ja') return 'Manga';
    if (language === 'zh' || language.startsWith('zh-')) return 'Manhua';
    return 'Other';
  }
  if (country === 'KR' && COMIC_FORMATS.has(format) && (webcomic || format === 'WEBTOON')) return 'Manhwa';
  if (country === 'JP' && ['MANGA', 'ONE_SHOT'].includes(format)) return 'Manga';
  if (country === 'CN' && ['MANGA', 'ONE_SHOT'].includes(format)) return 'Manhua';
  if (country === 'US' && COMIC_FORMATS.has(format)) return webcomic ? 'Webcomics' : 'Western Comics';
  if (webcomic && COMIC_FORMATS.has(format)) return 'Webcomics';
  return 'Other';
}

export function isConfirmedManhwa(media) {
  return classifyComic(media) === 'Manhwa';
}

export function getCountryName(countryCode) {
  const code = typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const knownNames = { KR: 'South Korea', JP: 'Japan', CN: 'China', US: 'United States' };
  if (knownNames[code]) return knownNames[code];
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch {
    return code;
  }
}

function getLanguageName(languageCode) {
  const code = typeof languageCode === 'string' ? languageCode.trim().toLowerCase() : '';
  if (!code) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}

function getStatus(status) {
  const values = {
    FINISHED: 'Completed',
    RELEASING: 'Publishing',
    NOT_YET_RELEASED: 'Not yet released',
    CANCELLED: 'Cancelled',
    HIATUS: 'On hiatus',
  };
  return values[status] || '';
}

function getContributors(staff) {
  const authors = [];
  const artists = [];
  const edges = Array.isArray(staff?.edges) ? staff.edges : [];
  for (const edge of edges) {
    const role = String(edge?.role || '');
    const name = String(edge?.node?.name?.full || '').trim();
    if (!name) continue;
    if (/art|illustrat|pencill/i.test(role)) artists.push(name);
    if (/story|author|writer/i.test(role)) authors.push(name);
  }
  return { authors: uniqueNames(authors), artists: uniqueNames(artists) };
}

export function normalizeManhwa(media) {
  if (!media || typeof media !== 'object') return null;
  const title = media.title || {};
  const alternatives = uniqueNames([
    title.english,
    title.romaji,
    title.native,
    title.userPreferred,
    ...(Array.isArray(media.synonyms) ? media.synonyms : []),
  ]);
  const contributors = getContributors(media.staff);
  const tags = getTagNames(media.tags);
  const image = media.coverImage?.extraLarge || media.coverImage?.large || '';

  return {
    id: Number(media.id) || 0,
    type: media.type || 'MANGA',
    provider: media.provider || 'anilist',
    providerId: typeof media.providerId === 'string' ? media.providerId : '',
    title: String(title.english || title.userPreferred || title.romaji || title.native || 'Untitled comic').trim(),
    alternativeTitles: alternatives,
    countryOfOrigin: typeof media.countryOfOrigin === 'string' ? media.countryOfOrigin.trim().toUpperCase() : '',
    countryName: getCountryName(media.countryOfOrigin),
    format: media.format || '',
    source: media.source || '',
    originalLanguage: typeof media.originalLanguage === 'string' ? media.originalLanguage : '',
    originalLanguageName: getLanguageName(media.originalLanguage),
    isConfirmedManhwa: isConfirmedManhwa(media),
    contentType: classifyComic(media),
    synopsis: typeof media.description === 'string' ? media.description.trim() : '',
    genres: uniqueNames(Array.isArray(media.genres) ? media.genres : []),
    tags,
    authors: contributors.authors,
    artists: contributors.artists,
    status: getStatus(media.status),
    coverImage: typeof image === 'string' ? image : '',
    siteUrl: typeof media.siteUrl === 'string' ? media.siteUrl : '',
    trending: numericValue(media.trending),
    popularity: numericValue(media.popularity),
    startDate: media.startDate || null,
    recommendations: Array.isArray(media.recommendations?.nodes)
      ? media.recommendations.nodes.map(item => normalizeManhwa(item?.mediaRecommendation)).filter(Boolean)
      : [],
  };
}

export function getManhwaSlug(media) {
  if (Number(media?.id) === FEATURED_MANHWA_ID) return FEATURED_MANHWA_SLUG;
  const title = String(media?.title || '').normalize('NFKD').toLowerCase();
  const slug = title.replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (media?.provider === 'mangadex' && /^[0-9a-f-]{36}$/i.test(media.providerId || '')) {
    return `${slug || 'comic'}-md-${media.providerId.toLowerCase()}`;
  }
  return slug || `manhwa-${Number(media?.id) || 'title'}`;
}

export function getManhwaPath(media) {
  return `/manhwa/${encodeURIComponent(getManhwaSlug(media))}`;
}

function normalizeResults(values) {
  return Array.isArray(values)
    ? values.map(normalizeManhwa).filter(item =>
      item && item.type === 'MANGA' && !['NOVEL', 'LIGHT_NOVEL'].includes(item.format)
    )
    : [];
}

function selectMangaDexMetadata(record) {
  if (!record || typeof record !== 'object') return null;
  const attributes = record.attributes || {};
  const metadataAttributes = Object.fromEntries(
    ['title', 'altTitles', 'description', 'originalLanguage', 'status', 'tags']
      .filter(field => Object.hasOwn(attributes, field))
      .map(field => [field, attributes[field]])
  );
  const relationships = Array.isArray(record.relationships)
    ? record.relationships.filter(item => ['cover_art', 'author', 'artist'].includes(item.type)).map(item => ({
      type: item.type,
      attributes: item.type === 'cover_art'
        ? { fileName: item.attributes?.fileName || '' }
        : { name: item.attributes?.name || '' },
    }))
    : [];
  return { id: record.id, attributes: metadataAttributes, relationships };
}

function selectMangaDexResponse(payload) {
  return {
    total: Number(payload?.total) || 0,
    data: Array.isArray(payload?.data)
      ? payload.data.map(selectMangaDexMetadata).filter(Boolean)
      : selectMangaDexMetadata(payload?.data),
  };
}

function normalizeMangaDexRecord(record) {
  const attributes = record?.attributes;
  if (!record?.id || !attributes || typeof attributes !== 'object') return null;
  const localized = value => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return String(value.en || Object.values(value).find(text => typeof text === 'string') || '');
  };
  const title = localized(attributes.title);
  if (!title) return null;
  const tags = Array.isArray(attributes.tags) ? attributes.tags : [];
  const tagValues = tags.map(tag => ({
    name: localized(tag?.attributes?.name),
    group: String(tag?.attributes?.group || ''),
  })).filter(tag => tag.name);
  const formats = tagValues.map(tag => tag.name.toLowerCase());
  const hasWebcomicFormat = formats.some(tag =>
    ['long strip', 'webtoon', 'webcomic', 'web comics'].includes(tag)
  );
  const cover = record.relationships?.find(item => item.type === 'cover_art')?.attributes?.fileName;
  const coverImage = cover
    ? `https://uploads.mangadex.org/covers/${encodeURIComponent(record.id)}/${encodeURIComponent(cover)}.512.jpg`
    : '';
  const names = Array.isArray(attributes.altTitles)
    ? attributes.altTitles.flatMap(item => Object.values(item || {}).map(localized))
    : [];
  const staff = (record.relationships || [])
    .filter(item => ['author', 'artist'].includes(item.type) && item.attributes?.name)
    .map(item => ({ role: item.type, node: { name: { full: item.attributes.name } } }));
  const statusNames = {
    completed: 'FINISHED',
    ongoing: 'RELEASING',
    hiatus: 'HIATUS',
    cancelled: 'CANCELLED',
  };
  const mapped = {
    id: 0,
    provider: 'mangadex',
    providerId: record.id,
    type: 'MANGA',
    title: { english: title },
    synonyms: names,
    countryOfOrigin: '',
    originalLanguage: attributes.originalLanguage,
    format: hasWebcomicFormat ? 'WEBTOON' : 'MANGA',
    source: 'OTHER',
    status: statusNames[String(attributes.status || '').toLowerCase()] || '',
    description: localized(attributes.description),
    genres: tagValues.filter(tag => tag.group === 'genre').map(tag => tag.name),
    tags: tagValues.map(tag => ({ name: tag.name })),
    coverImage: { extraLarge: coverImage },
    siteUrl: '',
    staff: { edges: staff },
  };
  return normalizeManhwa(mapped);
}

function normalizeMangaDexResults(values) {
  return Array.isArray(values) ? values.map(normalizeMangaDexRecord).filter(Boolean) : [];
}

function interleaveComics(primary, secondary, limit = Infinity) {
  const merged = [];
  const seenTitles = new Set();
  const count = Math.max(primary.length, secondary.length);
  for (let index = 0; index < count && merged.length < limit; index += 1) {
    for (const item of [primary[index], secondary[index]]) {
      if (!item || merged.length >= limit) continue;
      const title = normalizedText(item.title).replace(/[^\p{L}\p{N}]+/gu, '');
      if (title && seenTitles.has(title)) continue;
      if (title) seenTitles.add(title);
      merged.push(item);
    }
  }
  return merged;
}

function normalizeGenre(genre) {
  const value = String(genre || '').trim();
  if (value && !GENRES.has(value)) throw new TypeError(`Unsupported comic genre: ${value}`);
  return value;
}

export function filterManhwaByGenre(entries, genre) {
  const selected = normalizedText(normalizeGenre(genre));
  if (!selected) return entries;
  return entries.filter(item => {
    const source = selected === 'isekai' ? item.tags : item.genres;
    return Array.isArray(source) && source.some(value => normalizedText(value) === selected);
  });
}

function normalizeCountryFilter(country) {
  const value = String(country || '').trim().toUpperCase();
  if (value && !COUNTRY_FILTERS.has(value) && !/^[A-Z]{2}$/.test(value)) {
    throw new TypeError(`Unsupported country filter: ${country}`);
  }
  return value;
}

function normalizeContentType(contentType) {
  const value = String(contentType || '').trim();
  if (!value) return '';
  const match = [...CONTENT_TYPES].find(type => normalizedText(type) === normalizedText(value));
  if (!match) throw new TypeError(`Unsupported comic content type: ${contentType}`);
  return match;
}

export function filterComicsByCountry(entries, country) {
  const selected = normalizeCountryFilter(country);
  if (!selected) return entries;
  if (selected === 'UNKNOWN') return entries.filter(item => !item.countryOfOrigin);
  if (selected === 'OTHER') {
    return entries.filter(item => item.countryOfOrigin && !CORE_COUNTRIES.has(item.countryOfOrigin.toUpperCase()));
  }
  return entries.filter(item => item.countryOfOrigin.toUpperCase() === selected);
}

export function filterComicsByContentType(entries, contentType) {
  const selected = normalizeContentType(contentType);
  return selected ? entries.filter(item => item.contentType === selected) : entries;
}

function getSearchIntent(query) {
  const value = normalizedText(query);
  const genre = [...GENRES].find(item => normalizedText(item) === value);
  if (genre) return { genre };
  const contentType = [...CONTENT_TYPES].find(item => normalizedText(item) === value);
  if (contentType) return { contentType };
  const countryAliases = {
    kr: 'KR',
    jp: 'JP',
    cn: 'CN',
    us: 'US',
    'south korea': 'KR',
    korea: 'KR',
    korean: 'KR',
    japan: 'JP',
    japanese: 'JP',
    china: 'CN',
    chinese: 'CN',
    'united states': 'US',
    'united states of america': 'US',
    america: 'US',
    american: 'US',
    'other countries': 'OTHER',
    'unknown origin': 'UNKNOWN',
  };
  const country = countryAliases[value];
  return country ? { country } : {};
}

export async function getManhwaFeatured() {
  const result = await cachedQuery('featured-details', DETAIL_QUERY, { id: FEATURED_MANHWA_ID });
  const featured = normalizeManhwa(result.data?.Media);
  if (featured?.contentType !== 'Manhwa' || featured.id !== FEATURED_MANHWA_ID) {
    throw new Error('The featured title could not be verified as Korean manhwa in AniList metadata.');
  }
  return { item: featured, stale: result.stale, cached: result.cached };
}

export async function getManhwaDiscovery() {
  const result = await cachedQuery('discovery', DISCOVERY_QUERY);
  const data = result.data || {};
  const featured = normalizeManhwa(data.featured);
  if (featured?.contentType !== 'Manhwa' || featured.id !== FEATURED_MANHWA_ID) {
    throw new Error('The featured title could not be verified as Korean manhwa in AniList metadata.');
  }
  const trending = normalizeResults(data.trending?.media);
  const popular = normalizeResults(data.popular?.media);
  const recommended = featured.recommendations.filter(item =>
    item.type === 'MANGA' && !['NOVEL', 'LIGHT_NOVEL'].includes(item.format) && item.id !== featured.id
  );
  const recent = normalizeResults(data.recent?.media);
  const mangaDexErrors = [];
  let mangaDexResult = null;
  try {
    mangaDexResult = await cachedValue('mangadex:discovery:page:1', async () =>
      selectMangaDexResponse(await fetchMangaDexSearch({ limit: 12, offset: 0 }))
    );
  } catch (error) {
    mangaDexErrors.push({ source: 'MangaDex', error });
  }
  const aniListResults = normalizeResults(data.search?.media);
  const mangaDexResults = normalizeMangaDexResults(mangaDexResult?.data?.data);
  const results = interleaveComics(aniListResults, mangaDexResults, 24);
  const countries = [...new Set([featured, ...trending, ...popular, ...recommended, ...recent, ...results]
    .map(item => item.countryOfOrigin.trim().toUpperCase()).filter(code => /^[A-Z]{2}$/.test(code)))];

  return {
    featured,
    trending,
    popular,
    recommended,
    recent,
    results,
    countries,
    pagination: {
      ...(data.search?.pageInfo || {}),
      hasNextPage: Boolean(data.search?.pageInfo?.hasNextPage) ||
        Number(mangaDexResult?.data?.total || 0) > 12,
    },
    sourceErrors: mangaDexErrors,
    stale: result.stale || Boolean(mangaDexResult?.stale),
    cached: result.cached && Boolean(mangaDexResult?.cached),
  };
}

export async function searchManhwa({
  query = '',
  genre = '',
  country = '',
  contentType = '',
  page = 1,
  perPage = 24,
} = {}) {
  const intent = getSearchIntent(query);
  const normalizedGenre = normalizeGenre(genre || intent.genre);
  const normalizedCountry = normalizeCountryFilter(country || intent.country);
  const normalizedContentType = normalizeContentType(contentType || intent.contentType);
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePerPage = Math.min(50, Math.max(1, Math.floor(Number(perPage) || 24)));
  const search = String(query || '').trim();
  const apiSearch = Object.keys(intent).length ? '' : search;
  const apiCountry = /^[A-Z]{2}$/.test(normalizedCountry) ? normalizedCountry : null;
  const includeMangaDex = !normalizedCountry || normalizedCountry === 'UNKNOWN';
  const sourcePageSize = includeMangaDex ? Math.ceil(safePerPage / 2) : safePerPage;
  const variables = {
    page: safePage,
    perPage: sourcePageSize,
    search: apiSearch || null,
    genreIn: normalizedGenre && normalizedGenre !== 'Isekai' ? [normalizedGenre] : null,
    tagIn: normalizedGenre === 'Isekai' ? ['Isekai'] : null,
    countryOfOrigin: apiCountry,
  };
  const key = `search:${JSON.stringify(variables)}`;
  const requests = [
    cachedQuery(key, SEARCH_QUERY, variables),
  ];
  if (includeMangaDex) {
    requests.push(cachedValue(
      `mangadex:search:${JSON.stringify({ title: apiSearch, page: safePage, limit: sourcePageSize })}`,
      async () => selectMangaDexResponse(await fetchMangaDexSearch({
        title: apiSearch,
        limit: sourcePageSize,
        offset: (safePage - 1) * sourcePageSize,
      }))
    ));
  }
  const settled = await Promise.allSettled(requests);
  const sourceErrors = [];
  const aniListResult = settled[0].status === 'fulfilled' ? settled[0].value : null;
  if (!aniListResult) sourceErrors.push({ source: 'AniList', error: settled[0].reason });
  const mangaDexResult = includeMangaDex && settled[1]?.status === 'fulfilled' ? settled[1].value : null;
  if (includeMangaDex && !mangaDexResult) sourceErrors.push({ source: 'MangaDex', error: settled[1].reason });
  if (!aniListResult && !mangaDexResult) {
    throw new AggregateError(sourceErrors.map(item => item.error), 'Comic metadata services are unavailable.');
  }

  const rawItems = Array.isArray(aniListResult?.data?.Page?.media) ? aniListResult.data.Page.media : [];
  const aniListItems = normalizeResults(rawItems);
  const mangaDexItems = normalizeMangaDexResults(mangaDexResult?.data?.data);
  const items = interleaveComics(aniListItems, mangaDexItems);
  const matchingItems = filterComicsByContentType(
    filterComicsByCountry(filterManhwaByGenre(items, normalizedGenre), normalizedCountry),
    normalizedContentType
  );
  const queryText = Object.keys(intent).length ? '' : normalizedText(search);
  const titleMatches = !queryText
    ? matchingItems
    : matchingItems.filter(item => [
      item.title,
      ...item.alternativeTitles,
      ...item.genres,
      item.contentType,
      item.countryName,
      item.originalLanguageName,
    ].some(value => normalizedText(value).includes(queryText)));

  return {
    items: titleMatches,
    pagination: {
      ...(aniListResult?.data?.Page?.pageInfo || {}),
      currentPage: safePage,
      total: Number(aniListResult?.data?.Page?.pageInfo?.total || 0) +
        Number(mangaDexResult?.data?.total || 0),
      hasNextPage: Boolean(aniListResult?.data?.Page?.pageInfo?.hasNextPage) ||
        Boolean(mangaDexResult && Number(mangaDexResult.data.total || 0) > safePage * sourcePageSize),
    },
    countries: [...new Set([
      ...rawItems.map(item =>
        typeof item?.countryOfOrigin === 'string' ? item.countryOfOrigin.trim().toUpperCase() : ''
      ),
      ...mangaDexItems.map(item => item.countryOfOrigin),
    ].filter(code => /^[A-Z]{2}$/.test(code)))],
    sourceErrors,
    stale: Boolean(aniListResult?.stale || mangaDexResult?.stale),
    cached: Boolean(aniListResult?.cached && mangaDexResult?.cached),
  };
}

export async function getManhwaDetailsBySlug(slug) {
  const safeSlug = String(slug || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(safeSlug)) {
    throw new TypeError('A valid manhwa title slug is required.');
  }
  const mangaDexMatch = safeSlug.match(/-md-([0-9a-f-]{36})$/i);
  if (mangaDexMatch) {
    const result = await cachedValue(`mangadex:detail:${mangaDexMatch[1]}`, async () =>
      selectMangaDexResponse(await fetchMangaDexDetails(mangaDexMatch[1]))
    );
    const item = normalizeMangaDexRecord(result.data?.data);
    if (!item || getManhwaSlug(item) !== safeSlug.toLowerCase()) {
      const error = new Error('No MangaDex metadata matched this comic URL.');
      error.status = 404;
      throw error;
    }
    return { item, recommendations: [], stale: result.stale, cached: result.cached };
  }
  if (safeSlug.toLowerCase() === FEATURED_MANHWA_SLUG) {
    const discoveryCache = readCache('discovery', true);
    if (Number(discoveryCache?.value?.featured?.id) === FEATURED_MANHWA_ID) {
      const cachedItem = normalizeManhwa(discoveryCache.value.featured);
      if (cachedItem?.contentType === 'Manhwa' && cachedItem.id === FEATURED_MANHWA_ID) {
        return {
          item: cachedItem,
          recommendations: cachedItem.recommendations.filter(candidate =>
            candidate.type === 'MANGA' && !['NOVEL', 'LIGHT_NOVEL'].includes(candidate.format) && candidate.id !== cachedItem.id
          ),
          stale: discoveryCache.expiresAt < Date.now(),
          cached: true,
        };
      }
    }

    const result = await cachedQuery('featured-details', DETAIL_QUERY, { id: FEATURED_MANHWA_ID });
    const item = normalizeManhwa(result.data?.Media);
    if (item?.contentType !== 'Manhwa' || item.id !== FEATURED_MANHWA_ID) throw new Error('AniList did not return verified manhwa metadata for this title.');
    return {
      item,
      recommendations: item.recommendations.filter(candidate =>
        candidate.type === 'MANGA' && !['NOVEL', 'LIGHT_NOVEL'].includes(candidate.format) && candidate.id !== item.id
      ),
      stale: result.stale,
      cached: result.cached,
    };
  }

  const result = await searchManhwa({ query: safeSlug.replace(/-/g, ' '), perPage: 50 });
  const item = result.items.find(candidate => getManhwaSlug(candidate) === safeSlug.toLowerCase());
  if (!item) {
    const error = new Error('No comic title matched this URL.');
    error.status = 404;
    throw error;
  }
  return { item, recommendations: [], stale: result.stale, cached: result.cached };
}
