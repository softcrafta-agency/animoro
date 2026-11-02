const JIKAN_ORIGIN = 'https://api.jikan.moe/v4';
const LIST_LIMIT = 24;
const TOP_LIMIT = 12;
const UPCOMING_LIMIT = 24;
const VALID_TYPES = new Set(['tv', 'movie', 'ova', 'ona', 'special', 'music', 'cm', 'pv', 'tv_special']);
const VALID_STATUSES = new Set(['airing', 'complete', 'upcoming']);
const VALID_ORDER_BY = new Set(['mal_id', 'title', 'start_date', 'end_date', 'episodes', 'score', 'scored_by', 'rank', 'popularity', 'members', 'favorites']);
const VALID_SORT = new Set(['asc', 'desc']);

function parsePositiveInteger(value, fallback, maximum) {
  const number = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(number) && number > 0 && number <= maximum ? number : fallback;
}

function normalizedValue(value, allowed) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : '';
}

export function getJikanRequestUrl(query = {}) {
  const resource = String(query.resource || '').trim();
  const page = parsePositiveInteger(query.page, 1, 1000);
  const limit = parsePositiveInteger(query.limit, resource === 'top' ? TOP_LIMIT : resource === 'upcoming' ? UPCOMING_LIMIT : LIST_LIMIT, 25);
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });

  if (resource === 'top') return new URL(`top/anime?${params}`, `${JIKAN_ORIGIN}/`);
  if (resource === 'upcoming') return new URL(`seasons/upcoming?${params}`, `${JIKAN_ORIGIN}/`);
  if (resource === 'detail') {
    const id = parsePositiveInteger(query.id, 0, Number.MAX_SAFE_INTEGER);
    return id ? new URL(`anime/${id}/full`, `${JIKAN_ORIGIN}/`) : null;
  }
  if (resource !== 'anime') return null;

  const search = String(query.q || '').trim().slice(0, 100);
  const type = normalizedValue(query.type, VALID_TYPES);
  const status = normalizedValue(query.status, VALID_STATUSES);
  const orderBy = normalizedValue(query.order_by, VALID_ORDER_BY);
  const sort = normalizedValue(query.sort, VALID_SORT);
  if (search) params.set('q', search);
  if (type) params.set('type', type);
  if (status) params.set('status', status);
  if (orderBy) params.set('order_by', orderBy);
  if (sort) params.set('sort', sort);
  return new URL(`anime?${params}`, `${JIKAN_ORIGIN}/`);
}

export function createJikanError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function isValidJikanPayload(payload, resource) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Object.hasOwn(payload, 'data')) {
    return false;
  }
  if (resource === 'detail') {
    const id = Number(payload.data?.mal_id);
    return Boolean(payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data) &&
      Number.isInteger(id) && id > 0);
  }
  return Array.isArray(payload.data);
}
