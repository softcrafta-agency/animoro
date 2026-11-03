import { normalizeAnimeSlug } from './anime-url.js';
import { TENRAI_GENRES, TENRAI_GENRE_IDS } from './tenrai-genres.js';

const CACHE_PREFIX = 'animoro_tenrai_v1:';
const LIST_CACHE_MS = 15 * 60 * 1000;
const SCHEDULE_CACHE_MS = 15 * 60 * 1000;
const DETAIL_CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 510;
const VALID_TYPES = new Set(['tv', 'movie', 'ova', 'ona', 'special', 'music', 'cm', 'pv', 'tv_special']);
const VALID_SEASONS = new Set(['winter', 'spring', 'summer', 'fall']);

let requestChain = Promise.resolve();
let lastRequestAt = 0;
const inFlightRequests = new Map();

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getCached(path, allowStale = false) {
  try {
    const raw = safeStorage()?.getItem(`${CACHE_PREFIX}${path}`);
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached || !cached.value || !Number.isFinite(cached.expiresAt)) return null;
    if (cached.expiresAt < Date.now() &&
        (!allowStale || !Number.isFinite(cached.staleUntil) || cached.staleUntil < Date.now())) return null;
    return cached.value;
  } catch {
    return null;
  }
}

function setCached(path, value, ttl) {
  try {
    safeStorage()?.setItem(`${CACHE_PREFIX}${path}`, JSON.stringify({
      value,
      expiresAt: Date.now() + ttl,
      staleUntil: Date.now() + ttl + MAX_STALE_MS,
    }));
  } catch {
    // Cache storage is optional; the API response remains usable without it.
  }
}

function enqueueRequest(task) {
  const run = requestChain.then(async () => {
    const wait = Math.max(0, lastRequestAt + REQUEST_GAP_MS - Date.now());
    if (wait) await new Promise(resolve => window.setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  requestChain = run.catch(() => undefined);
  return run;
}

function buildRequestParams(options = {}) {
  const params = new URLSearchParams();
  Object.entries(options).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(item => params.append(key, String(item)));
    } else {
      params.set(key, String(value));
    }
  });
  return params;
}

function buildRequestPath(resource, options = {}) {
  const params = buildRequestParams({ resource, ...options });
  return params.toString();
}

function validatePayload(payload, resource) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'data')) {
    throw new Error('Tenrai returned an invalid anime data response.');
  }
  if (resource === 'detail') {
    if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data) ||
        !Number.isInteger(Number(payload.data.mal_id)) || Number(payload.data.mal_id) < 1) {
      throw new Error('Tenrai returned an invalid anime detail response.');
    }
  } else if (!Array.isArray(payload.data)) {
    throw new Error('Tenrai returned an invalid anime list response.');
  }
  if (payload.pagination !== undefined &&
      (!payload.pagination || typeof payload.pagination !== 'object' || Array.isArray(payload.pagination))) {
    throw new Error('Tenrai returned invalid pagination metadata.');
  }
}

async function fetchTenrai(path, resource) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(`/api/tenrai?${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    let body;
    try {
      body = await response.json();
    } catch {
      if (!response.ok) {
        const error = new Error(`Tenrai request failed (${response.status}); the response was not JSON.`);
        error.status = response.status;
        throw error;
      }
      throw new Error('Tenrai returned invalid JSON.');
    }
    if (!response.ok) {
      const message = body?.message || body?.error ||
        (response.status === 429
          ? 'Tenrai rate limit reached. Please retry after a short wait.'
          : `Tenrai request failed (${response.status}).`);
      const error = new Error(message);
      error.status = response.status;
      error.type = body?.type || 'UpstreamRequestError';
      error.retryAfter = response.headers?.get('retry-after') || '';
      throw error;
    }
    validatePayload(body, resource);
    return body;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Tenrai request timed out.');
      timeoutError.type = 'Timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function requestTenrai(path, ttl = LIST_CACHE_MS) {
  const cached = getCached(path);
  if (cached) return { ...cached, cached: true, stale: false };
  const pendingRequest = inFlightRequests.get(path);
  if (pendingRequest) return pendingRequest;

  const resource = new URLSearchParams(path).get('resource');
  const request = enqueueRequest(() => fetchTenrai(path, resource));
  inFlightRequests.set(path, request);
  try {
    const payload = await request;
    setCached(path, payload, ttl);
    return { ...payload, cached: false, stale: false };
  } catch (error) {
    const stale = getCached(path, true);
    if (stale) return { ...stale, cached: true, stale: true };
    throw error;
  } finally {
    inFlightRequests.delete(path);
  }
}

function namesFrom(items) {
  return Array.isArray(items)
    ? items.map(item => typeof item?.name === 'string' ? item.name.trim() : '').filter(Boolean)
    : [];
}

function firstImage(images) {
  for (const format of [images?.webp, images?.jpg]) {
    const image = format?.large_image_url || format?.image_url || format?.small_image_url;
    if (typeof image === 'string' && image) return image;
  }
  return '';
}

function validDateParts(year, month, day) {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function getRelease(item) {
  const from = item?.aired?.prop?.from || {};
  const raw = typeof item?.aired?.from === 'string' ? item.aired.from : '';
  const year = Number(from.year || item?.year || raw.slice(0, 4));
  const month = Number(from.month || raw.match(/^\d{4}-(\d{2})/)?.[1] || 0);
  const day = Number(from.day || raw.match(/^\d{4}-\d{2}-(\d{2})/)?.[1] || 0);
  if (validDateParts(year, month, day)) {
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      precision: 'exact',
    };
  }
  if (Number.isInteger(year) && year >= 1900 && year < 2200 && month >= 1 && month <= 12) {
    return {
      date: `${new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))} ${year}`,
      precision: 'month',
    };
  }
  if (Number.isInteger(year) && year >= 1900 && year < 2200) return { date: String(year), precision: 'year' };
  return { date: '', precision: 'unknown' };
}

function normalizeStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('finished')) return 'completed';
  if (normalized.includes('airing')) return 'airing';
  if (normalized.includes('not yet')) return 'upcoming';
  return status || '';
}

export function normalizeAnime(item, kind = 'anime') {
  const malId = Number(item?.mal_id);
  const title = String(item?.title || item?.title_english || item?.title_japanese || 'Untitled anime').trim();
  const slugBase = normalizeAnimeSlug(item?.title_english || item?.title || title) || 'anime';
  const release = getRelease(item);
  const year = Number(item?.aired?.prop?.from?.year || item?.year || String(item?.aired?.from || '').slice(0, 4));
  const season = typeof item?.season === 'string'
    ? `${item.season.charAt(0).toUpperCase()}${item.season.slice(1)}`
    : '';
  const alternativeTitles = [...new Set((Array.isArray(item?.titles) ? item.titles : [])
    .map(entry => entry?.title)
    .filter(value => typeof value === 'string' && value && value !== title))];
  const genres = [...new Set([
    ...namesFrom(item?.genres),
    ...namesFrom(item?.explicit_genres),
    ...namesFrom(item?.themes),
    ...namesFrom(item?.demographics),
  ])];
  const score = Number(item?.score);
  return {
    id: Number.isInteger(malId) && malId > 0 ? `tenrai-${malId}` : slugBase,
    malId: Number.isInteger(malId) && malId > 0 ? malId : null,
    slug: Number.isInteger(malId) && malId > 0 ? `${slugBase}--${malId}` : slugBase,
    source: 'tenrai',
    sourceLabel: 'Tenrai / MyAnimeList catalogue data',
    title,
    japaneseTitle: item?.title_japanese || '',
    alternativeTitles,
    coverImage: firstImage(item?.images),
    poster: firstImage(item?.images),
    bannerImage: '',
    synopsis: item?.synopsis || '',
    shortDescription: item?.synopsis || '',
    genres,
    themes: namesFrom(item?.themes),
    type: item?.type || '',
    status: normalizeStatus(item?.status),
    releaseStatus: kind === 'upcoming'
      ? release.precision === 'unknown' ? 'Release date not listed by Tenrai' : 'Tenrai catalogue listing'
      : '',
    releaseDate: kind === 'upcoming' ? release.date : release.date,
    releaseDatePrecision: kind === 'upcoming' ? release.precision : '',
    releaseYear: Number.isInteger(year) && year >= 1900 && year < 2200 ? String(year) : '',
    season,
    rating: Number.isFinite(score) && score > 0 ? score : '',
    popularity: Number.isFinite(Number(item?.popularity)) && Number(item.popularity) > 0
      ? Number(item.popularity)
      : '',
    scoredBy: Number.isFinite(Number(item?.scored_by)) ? Number(item.scored_by) : 0,
    episodes: item?.episodes ?? '',
    studio: namesFrom(item?.studios).join(', '),
    sourceMaterial: item?.source || '',
    ageRating: item?.rating || '',
    trailerUrl: item?.trailer?.url || '',
    malUrl: item?.url || '',
    broadcast: item?.broadcast && typeof item.broadcast === 'object' ? item.broadcast : null,
    airing: item?.airing === true,
    nextEpisode: null,
  };
}

function mapGenreToTenrai(genre) {
  const value = String(genre || '').trim().toLowerCase().replace(/[_–—]/g, '-');
  if (!value) return '';
  if (/^\d+(?:,\d+){0,24}$/.test(value)) {
    const ids = value.split(',');
    if (ids.some(id => !TENRAI_GENRE_IDS.has(id))) {
      throw new TypeError(`Unsupported Tenrai anime genre ID: ${value}`);
    }
    return value;
  }
  if (!Object.hasOwn(TENRAI_GENRES, value)) {
    throw new TypeError(`Unsupported anime genre: ${genre}`);
  }
  return TENRAI_GENRES[value];
}

function requestGenre(options = {}) {
  if (Array.isArray(options.genres)) {
    return options.genres.map(mapGenreToTenrai).join(',');
  }
  if (options.genres !== undefined && options.genres !== null && options.genres !== '') {
    return mapGenreToTenrai(options.genres);
  }
  return mapGenreToTenrai(options.genre);
}

function normalizeApiStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (['completed', 'complete', 'finished', 'finished airing'].includes(value)) return 'complete';
  if (['airing', 'currently airing'].includes(value)) return 'airing';
  if (['upcoming', 'not yet aired', 'not yet airing'].includes(value)) return 'upcoming';
  return value;
}

function normalizeSort(options = {}) {
  const aliases = {
    popular: 'popularity',
    'most-popular': 'popularity',
    'top-rated': 'score',
    'top_rated': 'score',
    newest: 'start_date',
    'newest-first': 'start_date',
    'newest_first': 'start_date',
  };
  const requested = String(options.orderBy || 'popularity').trim().toLowerCase();
  const normalized = aliases[requested] || requested;
  const allowed = new Set(['popularity', 'score', 'title', 'start_date', 'members']);
  const orderBy = allowed.has(normalized) ? normalized : 'popularity';
  const requestedDirection = String(options.sort || '').trim().toLowerCase();
  const defaultDirection = orderBy === 'title' || orderBy === 'popularity' ? 'asc' : 'desc';
  return {
    order_by: orderBy,
    sort: ['asc', 'desc'].includes(requestedDirection) ? requestedDirection : defaultDirection,
  };
}

function mapItems(payload, kind = 'anime') {
  return payload.data.map(item => normalizeAnime(item, kind));
}

export async function getAnimeDirectory(options = {}) {
  const params = buildRequestPath('anime', {
    page: options.page || 1,
    limit: options.limit || 24,
    q: String(options.query || '').trim(),
    type: options.type || '',
    status: normalizeApiStatus(options.status),
    genres: requestGenre(options),
    ...normalizeSort(options),
  });
  const payload = await requestTenrai(params);
  return {
    items: mapItems(payload),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getTopAnime(limit = 6) {
  const result = await getAnimeDirectory({
    page: 1,
    limit,
    orderBy: 'score',
    sort: 'desc',
  });
  return result;
}

function hasUpcomingFilters(options) {
  return Boolean(
    options.query || options.year || options.season || options.type ||
    options.genre || options.genres
  );
}

function upcomingQueryOptions(options = {}) {
  const season = String(options.season || '').toLowerCase();
  const year = String(options.year || '');
  const params = {
    page: options.page || 1,
    limit: options.limit || 24,
    q: options.query || '',
    status: 'upcoming',
    type: options.type || '',
    genres: requestGenre(options),
    ...normalizeSort(options),
  };
  if (VALID_SEASONS.has(season) && /^\d{4}$/.test(year)) {
    params.season = season;
    params.season_year = year;
  } else if (/^\d{4}$/.test(year)) {
    params.year = year;
  } else if (VALID_SEASONS.has(season)) {
    params.season = season;
  }
  return params;
}

async function searchUpcomingAnime(options = {}) {
  const path = buildRequestPath('anime', upcomingQueryOptions(options));
  const payload = await requestTenrai(path);
  return {
    items: mapItems(payload, 'upcoming'),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getUpcomingAnime(options = {}) {
  if (hasUpcomingFilters(options)) return searchUpcomingAnime(options);

  const path = buildRequestPath('upcoming', {
    page: options.page || 1,
    limit: options.limit || 24,
    filter: options.type || '',
    genres: requestGenre(options),
  });
  const payload = await requestTenrai(path);
  const items = mapItems(payload, 'upcoming');
  if (items.length) {
    return {
      items,
      pagination: payload.pagination || {},
      stale: Boolean(payload.stale),
      source: 'seasons-upcoming',
    };
  }

  const fallback = await searchUpcomingAnime(options);
  return { ...fallback, source: 'anime-status-upcoming', fallbackUsed: true };
}

export async function getCurrentSeasonAnime(options = {}) {
  const path = buildRequestPath('now', {
    page: options.page || 1,
    limit: options.limit || 24,
    filter: options.type || '',
    genres: requestGenre(options),
    ...normalizeSort(options),
  });
  const payload = await requestTenrai(path);
  return {
    items: mapItems(payload),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getSeasonalAnime(options = {}) {
  const year = String(options.year || '');
  const season = String(options.season || '').toLowerCase();
  if (!/^(?:19|20|21)\d{2}$/.test(year) || !VALID_SEASONS.has(season)) {
    throw new TypeError('A valid season year and season are required.');
  }
  const path = buildRequestPath('season', {
    year,
    season,
    page: options.page || 1,
    limit: options.limit || 24,
    filter: options.type || '',
    genres: requestGenre(options),
    ...normalizeSort(options),
  });
  const payload = await requestTenrai(path);
  return {
    items: mapItems(payload),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getAnimeDetails(malId) {
  const id = Number.parseInt(String(malId), 10);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid anime ID.');
  const path = buildRequestPath('detail', { id });
  const payload = await requestTenrai(path, DETAIL_CACHE_MS);
  return { anime: normalizeAnime(payload.data), stale: Boolean(payload.stale) };
}

export async function getAnimeEpisodes(malId, page = 1) {
  const id = Number.parseInt(String(malId), 10);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid anime ID.');
  const payload = await requestTenrai(buildRequestPath('episodes', { id, page }));
  return { items: payload.data, pagination: payload.pagination || {}, stale: Boolean(payload.stale) };
}

export async function getAnimeSchedules(options = {}) {
  const path = buildRequestPath('schedules', {
    page: options.page || 1,
    limit: options.limit || 100,
    filter: options.filter || '',
    type: options.type || '',
    genres: requestGenre(options),
  });
  const payload = await requestTenrai(path, SCHEDULE_CACHE_MS);
  return {
    items: mapItems(payload, 'schedule'),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getAllAnimeSchedules({ limit = 100, maxPages = 10 } = {}) {
  const items = [];
  let stale = false;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await getAnimeSchedules({ page, limit });
    items.push(...result.items);
    stale ||= result.stale;
    if (!result.pagination?.has_next_page || result.items.length === 0) break;
  }
  return { items, stale };
}
