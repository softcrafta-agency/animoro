import { normalizeAnimeSlug } from './anime-url.js';

const API_ORIGIN = 'https://api.jikan.moe/v4';
const CACHE_PREFIX = 'animoro_jikan_v1:';
const LIST_CACHE_MS = 20 * 60 * 1000;
const DETAIL_CACHE_MS = 6 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 400;
const REQUEST_TIMEOUT_MS = 9000;
let requestChain = Promise.resolve();
let lastRequestAt = 0;

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(path) {
  return `${CACHE_PREFIX}${path}`;
}

function getCached(path, allowStale = false) {
  try {
    const raw = safeStorage()?.getItem(cacheKey(path));
    const cached = raw ? JSON.parse(raw) : null;
    if (!cached || !cached.value || !Number.isFinite(cached.expiresAt)) return null;
    if (!allowStale && cached.expiresAt < Date.now()) return null;
    return cached.value;
  } catch {
    return null;
  }
}

function setCached(path, value, ttl) {
  try {
    safeStorage()?.setItem(cacheKey(path), JSON.stringify({ value, expiresAt: Date.now() + ttl }));
  } catch {
    // Storage is only a performance enhancement; rendering still works without it.
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

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.message || `Anime data request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    window.clearTimeout(timeout);
  }
}

function toSearchParams(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export function getDirectJikanUrl(path) {
  const params = new URLSearchParams(path);
  const resource = params.get('resource');
  params.delete('resource');
  let endpoint;
  if (resource === 'anime') endpoint = 'anime';
  else if (resource === 'top') endpoint = 'top/anime';
  else if (resource === 'upcoming') endpoint = 'seasons/upcoming';
  else if (resource === 'detail') {
    const id = params.get('id');
    if (!/^[1-9]\d*$/.test(id || '')) throw new Error('Invalid anime ID.');
    endpoint = `anime/${id}/full`;
    params.delete('id');
  } else {
    throw new Error('Unsupported Jikan request.');
  }
  const url = new URL(endpoint, `${API_ORIGIN}/`);
  url.search = params.toString();
  return url.toString();
}

async function requestJikan(path, ttl = LIST_CACHE_MS) {
  const cached = getCached(path);
  if (cached) return { ...cached, cached: true, stale: false };

  try {
    const payload = await enqueueRequest(async () => {
      try {
        return await fetchJson(`/api/jikan?${path}`);
      } catch (error) {
        if (![404, 405].includes(Number(error?.status))) throw error;
        return fetchJson(getDirectJikanUrl(path));
      }
    });
    setCached(path, payload, ttl);
    return { ...payload, cached: false, stale: false };
  } catch (error) {
    const stale = getCached(path, true);
    if (stale) return { ...stale, cached: true, stale: true };
    throw error;
  }
}

function arrayOfNames(value) {
  return Array.isArray(value)
    ? value.map(item => typeof item?.name === 'string' ? item.name.trim() : '').filter(Boolean)
    : [];
}

function firstImage(images) {
  const formats = [images?.webp, images?.jpg];
  for (const format of formats) {
    const image = format?.large_image_url || format?.image_url || format?.small_image_url;
    if (typeof image === 'string' && image) return image;
  }
  return '';
}

function releaseYear(item) {
  const date = item?.aired?.from || item?.broadcast?.day;
  const year = Number(item?.year || item?.aired?.prop?.from?.year || String(date || '').slice(0, 4));
  return Number.isInteger(year) && year > 1900 && year < 2200 ? String(year) : '';
}

function statusFromJikan(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('finished')) return 'completed';
  if (value.includes('airing')) return 'airing';
  if (value.includes('not yet')) return 'upcoming';
  return status || '';
}

function releaseStatusFromJikan(item) {
  if (item?.aired?.from) return 'Release date listed by Jikan';
  return 'Release Date TBA';
}

export function normalizeJikanAnime(item, kind = 'anime') {
  const malId = Number(item?.mal_id);
  const title = String(item?.title || item?.title_english || item?.title_japanese || 'Untitled anime').trim();
  const baseSlug = normalizeAnimeSlug(item?.title_english || item?.title || title) || 'anime';
  const year = releaseYear(item);
  const season = typeof item?.season === 'string'
    ? `${item.season.charAt(0).toUpperCase()}${item.season.slice(1)}`
    : '';
  const alternativeTitles = [...new Set((Array.isArray(item?.titles) ? item.titles : [])
    .map(entry => entry?.title)
    .filter(value => typeof value === 'string' && value && value !== title))];
  const genres = [...new Set([
    ...arrayOfNames(item?.genres),
    ...arrayOfNames(item?.explicit_genres),
    ...arrayOfNames(item?.themes),
    ...arrayOfNames(item?.demographics),
  ])];
  return {
    id: malId ? `jikan-${malId}` : baseSlug,
    malId: Number.isInteger(malId) && malId > 0 ? malId : null,
    slug: malId ? `${baseSlug}--${malId}` : baseSlug,
    source: 'jikan',
    sourceLabel: 'Jikan / MyAnimeList data',
    title,
    japaneseTitle: item?.title_japanese || '',
    alternativeTitles,
    coverImage: firstImage(item?.images),
    bannerImage: '',
    synopsis: item?.synopsis || '',
    shortDescription: item?.synopsis || '',
    genres,
    themes: [...new Set(arrayOfNames(item?.themes))],
    type: item?.type || '',
    status: statusFromJikan(item?.status),
    releaseStatus: kind === 'upcoming' ? releaseStatusFromJikan(item) : '',
    releaseDate: item?.aired?.from || '',
    releaseYear: year,
    season,
    rating: Number.isFinite(Number(item?.score)) && Number(item.score) > 0 ? Number(item.score) : '',
    scoredBy: Number.isFinite(Number(item?.scored_by)) ? Number(item.scored_by) : 0,
    episodes: item?.episodes ?? '',
    studio: arrayOfNames(item?.studios).join(', '),
    sourceMaterial: item?.source || '',
    ageRating: item?.rating || '',
    trailerUrl: item?.trailer?.url || '',
    malUrl: item?.url || '',
    jikanUpdatedAt: new Date().toISOString(),
  };
}

export async function getAnimeDirectory(options = {}) {
  const params = {
    resource: 'anime',
    page: options.page || 1,
    limit: options.limit || 24,
    q: options.query || '',
    type: options.type || '',
    status: options.status || '',
    order_by: options.orderBy || 'popularity',
    sort: options.sort || 'asc',
  };
  const path = toSearchParams(params);
  const payload = await requestJikan(path);
  return {
    items: (payload.data || []).map(item => normalizeJikanAnime(item)),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getTopAnime(limit = 6) {
  const payload = await requestJikan(toSearchParams({ resource: 'top', limit }), LIST_CACHE_MS);
  return { items: (payload.data || []).map(item => normalizeJikanAnime(item)), stale: Boolean(payload.stale) };
}

export async function getUpcomingAnime(options = {}) {
  const path = toSearchParams({ resource: 'upcoming', page: options.page || 1, limit: options.limit || 24 });
  const payload = await requestJikan(path);
  return {
    items: (payload.data || []).map(item => normalizeJikanAnime(item, 'upcoming')),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function searchUpcomingAnime(options = {}) {
  const path = toSearchParams({
    resource: 'anime', page: options.page || 1, limit: options.limit || 24,
    q: options.query || '', type: options.type || '', status: 'upcoming',
    order_by: 'popularity', sort: 'asc',
  });
  const payload = await requestJikan(path);
  return {
    items: (payload.data || []).map(item => normalizeJikanAnime(item, 'upcoming')),
    pagination: payload.pagination || {},
    stale: Boolean(payload.stale),
  };
}

export async function getJikanAnimeDetails(malId) {
  const id = Number.parseInt(String(malId), 10);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid anime ID.');
  const payload = await requestJikan(toSearchParams({ resource: 'detail', id }), DETAIL_CACHE_MS);
  return { anime: normalizeJikanAnime(payload.data || {}), stale: Boolean(payload.stale) };
}
