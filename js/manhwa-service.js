import { requestAniList } from './manhwa-api.js';

export const FEATURED_MANHWA_ID = 140407;
export const FEATURED_MANHWA_SLUG = 'the-greatest-estate-developer';
export const OFFICIAL_FEATURED_URL =
  'https://www.webtoons.com/en/fantasy/the-greatest-estate-developer/list?title_no=3596';

const CACHE_PREFIX = 'animoro_manhwa_v1:';
const CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const CONFIRMING_TAGS = new Set(['webtoon', 'long strip', 'manhwa']);
const ACCEPTED_FORMATS = new Set(['MANGA', 'WEBTOON']);

const CARD_FIELDS = `
  fragment ManhwaCardFields on Media {
    id
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
      media(type: MANGA, countryOfOrigin: "KR", sort: TRENDING_DESC) { ...ManhwaCardFields }
    }
    popular: Page(page: 1, perPage: 12) {
      media(type: MANGA, countryOfOrigin: "KR", sort: POPULARITY_DESC) { ...ManhwaCardFields }
    }
    recent: Page(page: 1, perPage: 12) {
      media(type: MANGA, countryOfOrigin: "KR", sort: ID_DESC) { ...ManhwaCardFields }
    }
    search: Page(page: 1, perPage: 24) {
      pageInfo { currentPage hasNextPage total }
      media(type: MANGA, countryOfOrigin: "KR", sort: POPULARITY_DESC) { ...ManhwaCardFields }
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
  query SearchManhwa($page: Int!, $perPage: Int!, $search: String, $genreIn: [String], $tagIn: [String]) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage total }
      media(
        type: MANGA
        countryOfOrigin: "KR"
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
  const cached = readCache(key);
  if (cached) return { data: cached.value, stale: false, cached: true };

  try {
    const data = await requestAniList(query, variables);
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

export function isConfirmedManhwa(media) {
  if (media?.countryOfOrigin !== 'KR' || !ACCEPTED_FORMATS.has(media?.format)) return false;
  if (media.format === 'WEBTOON') return true;
  const source = normalizedText(media.source);
  if (source === 'manhwa' || source === 'webtoon') return true;
  return getTagNames(media.tags).some(tag => CONFIRMING_TAGS.has(normalizedText(tag)));
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
    title: String(title.english || title.userPreferred || title.romaji || title.native || 'Untitled manhwa').trim(),
    alternativeTitles: alternatives,
    countryOfOrigin: media.countryOfOrigin || '',
    format: media.format || '',
    source: media.source || '',
    isConfirmedManhwa: isConfirmedManhwa(media),
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
  return slug || `manhwa-${Number(media?.id) || 'title'}`;
}

export function getManhwaPath(media) {
  return `/manhwa/${encodeURIComponent(getManhwaSlug(media))}`;
}

function normalizeResults(values) {
  return Array.isArray(values)
    ? values.map(normalizeManhwa).filter(item => item?.isConfirmedManhwa)
    : [];
}

function normalizeGenre(genre) {
  const value = String(genre || '').trim();
  const allowed = new Set([
    'Action', 'Adventure', 'Fantasy', 'Comedy', 'Romance',
    'Drama', 'Horror', 'Thriller', 'Mystery', 'Isekai',
  ]);
  if (value && !allowed.has(value)) throw new TypeError(`Unsupported manhwa genre: ${value}`);
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

export async function getManhwaFeatured() {
  const result = await cachedQuery('featured-details', DETAIL_QUERY, { id: FEATURED_MANHWA_ID });
  const featured = normalizeManhwa(result.data?.Media);
  if (!featured?.isConfirmedManhwa) {
    throw new Error('The featured title could not be verified as Korean manhwa in AniList metadata.');
  }
  return { item: featured, stale: result.stale, cached: result.cached };
}

export async function getManhwaDiscovery() {
  const result = await cachedQuery('discovery', DISCOVERY_QUERY);
  const data = result.data || {};
  const featured = normalizeManhwa(data.featured);
  if (!featured?.isConfirmedManhwa) {
    throw new Error('The featured title could not be verified as Korean manhwa in AniList metadata.');
  }
  const recommended = featured.recommendations.filter(item =>
    item.isConfirmedManhwa && item.id !== featured.id
  );

  return {
    featured,
    trending: normalizeResults(data.trending?.media),
    popular: normalizeResults(data.popular?.media),
    recommended,
    recent: normalizeResults(data.recent?.media),
    results: normalizeResults(data.search?.media),
    pagination: data.search?.pageInfo || {},
    stale: result.stale,
    cached: result.cached,
  };
}

export async function searchManhwa({ query = '', genre = '', page = 1, perPage = 24 } = {}) {
  const normalizedGenre = normalizeGenre(genre);
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safePerPage = Math.min(50, Math.max(1, Math.floor(Number(perPage) || 24)));
  const search = String(query || '').trim();
  const variables = {
    page: safePage,
    perPage: safePerPage,
    search: search || null,
    genreIn: normalizedGenre && normalizedGenre !== 'Isekai' ? [normalizedGenre] : null,
    tagIn: normalizedGenre === 'Isekai' ? ['Isekai'] : null,
  };
  const key = `search:${JSON.stringify(variables)}`;
  const result = await cachedQuery(key, SEARCH_QUERY, variables);
  const items = normalizeResults(result.data?.Page?.media);
  const matchingItems = filterManhwaByGenre(items, normalizedGenre);
  const queryText = normalizedText(search);
  const titleMatches = !queryText
    ? matchingItems
    : matchingItems.filter(item => item.alternativeTitles.some(title => normalizedText(title).includes(queryText)));

  return {
    items: titleMatches,
    pagination: result.data?.Page?.pageInfo || {},
    stale: result.stale,
    cached: result.cached,
  };
}

export async function getManhwaDetailsBySlug(slug) {
  const safeSlug = String(slug || '');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(safeSlug)) {
    throw new TypeError('A valid manhwa title slug is required.');
  }
  if (safeSlug.toLowerCase() === FEATURED_MANHWA_SLUG) {
    const discoveryCache = readCache('discovery', true);
    if (Number(discoveryCache?.value?.featured?.id) === FEATURED_MANHWA_ID) {
      const cachedItem = normalizeManhwa(discoveryCache.value.featured);
      if (cachedItem?.isConfirmedManhwa) {
        return {
          item: cachedItem,
          recommendations: cachedItem.recommendations.filter(candidate =>
            candidate.isConfirmedManhwa && candidate.id !== cachedItem.id
          ),
          stale: discoveryCache.expiresAt < Date.now(),
          cached: true,
        };
      }
    }

    const result = await cachedQuery('featured-details', DETAIL_QUERY, { id: FEATURED_MANHWA_ID });
    const item = normalizeManhwa(result.data?.Media);
    if (!item?.isConfirmedManhwa) throw new Error('AniList did not return verified manhwa metadata for this title.');
    return {
      item,
      recommendations: item.recommendations.filter(candidate =>
        candidate.isConfirmedManhwa && candidate.id !== item.id
      ),
      stale: result.stale,
      cached: result.cached,
    };
  }

  const result = await searchManhwa({ query: safeSlug.replace(/-/g, ' '), perPage: 50 });
  const item = result.items.find(candidate => getManhwaSlug(candidate) === safeSlug.toLowerCase());
  if (!item) {
    const error = new Error('No confirmed Korean manhwa title matched this URL.');
    error.status = 404;
    throw error;
  }
  return { item, recommendations: [], stale: result.stale, cached: result.cached };
}
