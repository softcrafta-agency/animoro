const TENRAI_ORIGIN = 'https://api.tenrai.org/v1/';
const ANIME_TYPES = new Set(['tv', 'movie', 'ova', 'special', 'ona', 'music', 'cm', 'pv', 'tv_special']);
const ANIME_STATUSES = new Set(['airing', 'complete', 'upcoming']);
const ANIME_ORDER_BY = new Set([
  'mal_id', 'title', 'title_english', 'title_japanese', 'start_date', 'end_date',
  'episodes', 'score', 'scored_by', 'rank', 'popularity', 'members', 'favorites',
]);
const SEASONS = new Set(['winter', 'spring', 'summer', 'fall']);
const WEEKDAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'unknown', 'other']);

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function singleValue(query, name, fallback = '') {
  const value = query[name];
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value) || typeof value === 'object') {
    throw requestError(400, `The ${name} parameter must have one value.`);
  }
  return String(value);
}

function positiveInteger(query, name, fallback, maximum) {
  const value = singleValue(query, name, String(fallback));
  if (!/^[1-9]\d*$/.test(value) || Number(value) > maximum) {
    throw requestError(400, `The ${name} parameter must be between 1 and ${maximum}.`);
  }
  return value;
}

function addParam(url, query, name, options = {}) {
  const value = singleValue(query, name);
  if (!value) return;
  if (options.maxLength && value.length > options.maxLength) {
    throw requestError(400, `The ${name} parameter is too long.`);
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw requestError(400, `The ${name} parameter is invalid.`);
  }
  if (options.allowed && !options.allowed.has(value.toLowerCase())) {
    throw requestError(400, `The ${name} parameter is not supported.`);
  }
  url.searchParams.set(options.alias || name, value);
}

function addCommonListParams(url, query, { genres = true, typeName = 'type' } = {}) {
  url.searchParams.set('page', positiveInteger(query, 'page', 1, 20000));
  url.searchParams.set('limit', positiveInteger(query, 'limit', 24, 100));
  addParam(url, query, typeName, { allowed: ANIME_TYPES, alias: typeName === 'type' ? undefined : typeName });
  if (genres) addParam(url, query, 'genres', { pattern: /^\d+(?:,\d+){0,24}$/ });
  addParam(url, query, 'order_by', { allowed: ANIME_ORDER_BY });
  addParam(url, query, 'sort', { allowed: new Set(['asc', 'desc']) });
}

export function getTenraiRequestUrl(query = {}) {
  const resource = singleValue(query, 'resource');
  let url;

  if (resource === 'anime') {
    url = new URL('anime', TENRAI_ORIGIN);
    addCommonListParams(url, query);
    addParam(url, query, 'q', { maxLength: 300 });
    const requestedStatus = singleValue(query, 'status').trim().toLowerCase();
    const normalizedStatus = ['completed', 'finished', 'finished airing'].includes(requestedStatus)
      ? 'complete'
      : requestedStatus;
    if (normalizedStatus && !ANIME_STATUSES.has(normalizedStatus)) {
      throw requestError(400, 'The status parameter is not supported.');
    }
    if (normalizedStatus) url.searchParams.set('status', normalizedStatus);
    addParam(url, query, 'year', { pattern: /^[1-9]\d{0,3}$/ });
    addParam(url, query, 'season', { allowed: SEASONS });
    addParam(url, query, 'season_year', { pattern: /^(?:19|20|21)\d{2}$/ });
    return url;
  }

  if (resource === 'upcoming') {
    url = new URL('seasons/upcoming', TENRAI_ORIGIN);
    addCommonListParams(url, query, { typeName: 'filter' });
    return url;
  }

  if (resource === 'now') {
    url = new URL('seasons/now', TENRAI_ORIGIN);
    addCommonListParams(url, query, { typeName: 'filter' });
    return url;
  }

  if (resource === 'season') {
    const year = singleValue(query, 'year');
    const season = singleValue(query, 'season').toLowerCase();
    if (!/^(?:19|20|21)\d{2}$/.test(year) || !SEASONS.has(season)) {
      throw requestError(400, 'A supported season and four-digit year are required.');
    }
    url = new URL(`seasons/${year}/${season}`, TENRAI_ORIGIN);
    addCommonListParams(url, query, { typeName: 'filter' });
    return url;
  }

  if (resource === 'schedules') {
    url = new URL('schedules', TENRAI_ORIGIN);
    addCommonListParams(url, query, { genres: true });
    addParam(url, query, 'filter', { allowed: WEEKDAYS });
    return url;
  }

  if (resource === 'top') {
    url = new URL('anime', TENRAI_ORIGIN);
    url.searchParams.set('order_by', 'score');
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('limit', positiveInteger(query, 'limit', 6, 100));
    url.searchParams.set('page', positiveInteger(query, 'page', 1, 20000));
    return url;
  }

  if (resource === 'detail' || resource === 'episodes') {
    const id = singleValue(query, 'id');
    if (!/^[1-9]\d*$/.test(id) || Number(id) > Number.MAX_SAFE_INTEGER) {
      throw requestError(400, 'A valid positive anime ID is required.');
    }
    if (resource === 'episodes') {
      url = new URL(`anime/${id}/episodes`, TENRAI_ORIGIN);
      addParam(url, query, 'page', { pattern: /^[1-9]\d*$/ });
      return url;
    }
    return new URL(`anime/${id}/full`, TENRAI_ORIGIN);
  }

  return null;
}

export function isValidTenraiPayload(payload, resource) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'data')) {
    return false;
  }

  if (resource === 'detail') {
    return Boolean(
      payload.data &&
      typeof payload.data === 'object' &&
      !Array.isArray(payload.data) &&
      Number.isInteger(Number(payload.data.mal_id)) &&
      Number(payload.data.mal_id) > 0
    );
  }

  if (!Array.isArray(payload.data)) return false;
  if (payload.pagination !== undefined) {
    const pagination = payload.pagination;
    if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) return false;
    if (pagination.has_next_page !== undefined && typeof pagination.has_next_page !== 'boolean') return false;
  }
  return true;
}

export function getTenraiCacheControl(resource) {
  if (resource === 'detail') return 'public, s-maxage=21600, stale-while-revalidate=86400';
  if (resource === 'schedules') return 'public, s-maxage=900, stale-while-revalidate=3600';
  if (resource === 'upcoming' || resource === 'now' || resource === 'season') {
    return 'public, s-maxage=1800, stale-while-revalidate=7200';
  }
  return 'public, s-maxage=900, stale-while-revalidate=3600';
}

export { requestError as createTenraiRequestError };
