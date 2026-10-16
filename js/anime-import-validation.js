import { isValidAnimeSlug } from './anime-url.js';

export const ANIME_IMPORT_FIELDS = [
  'title', 'slug', 'alternativeTitles', 'synopsis', 'seoTitle', 'seoDescription',
  'coverImageUrl', 'bannerImageUrl', 'genres', 'type', 'seriesStatus', 'releaseYear',
  'studio', 'episodes', 'season', 'source', 'rating', 'characters', 'tags',
  'releaseDay', 'releaseTime', 'releaseTimezone', 'nextEpisode', 'publication',
];

export function parseAnimeImportJson(text) {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of anime objects.');
  return parsed;
}

const LIST_FIELDS = new Set(['alternativeTitles', 'genres', 'characters', 'tags']);
const STRING_LIMITS = {
  title: 200,
  slug: 200,
  synopsis: 5000,
  seoTitle: 200,
  seoDescription: 1000,
  type: 80,
  studio: 200,
  season: 100,
  source: 100,
  releaseTime: 5,
  releaseTimezone: 100,
};
const SERIES_STATUSES = ['upcoming', 'airing', 'completed', 'hiatus'];
const PUBLICATION_STATUSES = ['draft', 'published'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function validateAnimeImportRecord(record, number) {
  const errors = [];
  const addError = (field, message) => errors.push({ field, message });

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return {
      number,
      valid: false,
      duplicate: false,
      errors: [{ field: 'record', message: 'Each record must be a JSON object.' }],
      payload: {},
    };
  }

  Object.keys(record).forEach(field => {
    if (!ANIME_IMPORT_FIELDS.includes(field)) {
      addError(field, 'Unsupported field. Use one of the supported Add Anime fields.');
    }
  });

  const payload = {
    title: '',
    slug: '',
    alternativeTitles: [],
    synopsis: '',
    seoTitle: '',
    seoDescription: '',
    coverImage: '',
    bannerImage: '',
    genres: [],
    type: '',
    status: '',
    releaseYear: null,
    studio: '',
    episodes: null,
    season: '',
    source: '',
    rating: null,
    characters: [],
    tags: [],
    releaseDay: '',
    releaseTime: '',
    timezone: '',
    nextEpisode: null,
    visibility: 'draft',
  };

  for (const field of ANIME_IMPORT_FIELDS) {
    if (!Object.hasOwn(record, field)) continue;
    const value = record[field];

    if (LIST_FIELDS.has(field)) {
      const result = normalizeList(value, field);
      if (result.error) addError(field, result.error);
      else payload[field] = result.value;
      continue;
    }

    if (field === 'coverImageUrl' || field === 'bannerImageUrl') {
      const targetField = field === 'coverImageUrl' ? 'coverImage' : 'bannerImage';
      const result = normalizeImageUrl(value, field);
      if (result.error) addError(field, result.error);
      else payload[targetField] = result.value;
      continue;
    }

    if (field === 'seriesStatus') {
      const result = normalizeEnum(value, field, SERIES_STATUSES, '');
      if (result.error) addError(field, result.error);
      else payload.status = result.value;
      continue;
    }

    if (field === 'publication') {
      const result = normalizeEnum(value, field, PUBLICATION_STATUSES, 'draft');
      if (result.error) addError(field, result.error);
      else payload.visibility = result.value;
      continue;
    }

    if (field === 'releaseDay') {
      const result = normalizeWeekday(value);
      if (result.error) addError(field, result.error);
      else payload.releaseDay = result.value;
      continue;
    }

    if (['releaseYear', 'episodes', 'rating', 'nextEpisode'].includes(field)) {
      const result = normalizeNumber(value, field);
      if (result.error) addError(field, result.error);
      else payload[field] = result.value;
      continue;
    }

    const result = normalizeString(value, field);
    if (result.error) {
      addError(field, result.error);
      continue;
    }
    if (field === 'releaseTimezone' && result.value) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: result.value });
      } catch {
        addError(field, 'Enter a valid IANA timezone, such as Asia/Kolkata.');
        continue;
      }
    }
    if (field === 'releaseTime' && result.value && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result.value)) {
      addError(field, 'Use a 24-hour time in HH:MM format.');
      continue;
    }

    const targetField = field === 'releaseTimezone' ? 'timezone' : field;
    payload[targetField] = result.value;
  }

  if (!payload.title) addError('title', 'Title is required.');
  if (!payload.slug) {
    addError('slug', 'Slug is required.');
  } else if (!isValidAnimeSlug(payload.slug)) {
    addError('slug', 'Use lowercase letters, numbers, and single hyphens only.');
  }

  if (payload.releaseDay && !payload.releaseTime) {
    addError('releaseTime', 'Release time is required when a release day is set.');
  } else if (payload.releaseTime && !payload.releaseDay) {
    addError('releaseDay', 'Release day is required when a release time is set.');
  }

  return { number, valid: errors.length === 0, duplicate: false, errors, payload };
}

export function markAnimeImportDuplicates(records, existingSlugs = new Set()) {
  const seenSlugs = new Set();
  return records.map(record => {
    if (!record.valid) return { ...record, duplicate: false };
    const slug = record.payload.slug;
    const duplicate = existingSlugs.has(slug) || seenSlugs.has(slug);
    seenSlugs.add(slug);
    const errors = record.errors.filter(error => error.message !== 'This slug already exists and will be skipped.');
    return {
      ...record,
      duplicate,
      errors: duplicate
        ? [...errors, { field: 'slug', message: 'This slug already exists and will be skipped.' }]
        : errors,
    };
  });
}

function normalizeList(value, field) {
  if (value === null) return { value: [] };
  if (typeof value !== 'string' && !Array.isArray(value)) {
    return { error: `${field} must be an array of strings or a comma-separated string.` };
  }
  const items = (Array.isArray(value) ? value : value.split(',')).map(item => (
    typeof item === 'string' ? item.trim() : null
  ));
  if (items.some(item => item === null)) return { error: `Every ${field} value must be a string.` };
  return { value: [...new Set(items.filter(Boolean))] };
}

function normalizeString(value, field) {
  if (value === null) return { value: '' };
  if (typeof value !== 'string') return { error: `${field} must be a string or null.` };
  const text = value.trim();
  const maxLength = STRING_LIMITS[field];
  if (maxLength && text.length > maxLength) {
    return { error: `${field} must be ${maxLength} characters or fewer.` };
  }
  return { value: text };
}

function normalizeEnum(value, field, allowed, nullValue) {
  if (value === null || value === '') return { value: nullValue };
  if (typeof value !== 'string') return { error: `${field} must be a string or null.` };
  const normalized = value.trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    return { error: `${field} must be one of: ${allowed.join(', ')}.` };
  }
  return { value: normalized };
}

function normalizeWeekday(value) {
  if (value === null || value === '') return { value: '' };
  if (typeof value !== 'string') return { error: 'releaseDay must be a weekday string or null.' };
  const normalized = WEEKDAYS.find(day => day.toLowerCase() === value.trim().toLowerCase());
  return normalized
    ? { value: normalized }
    : { error: `releaseDay must be one of: ${WEEKDAYS.join(', ')}.` };
}

function normalizeNumber(value, field) {
  if (value === null) return { value: null };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { error: `${field} must be a number or null.` };
  }
  const ranges = {
    releaseYear: { min: 1900, max: 2200, integer: true },
    episodes: { min: 0, integer: true },
    rating: { min: 0, max: 10 },
    nextEpisode: { min: 1, integer: true },
  };
  const range = ranges[field];
  if (range.integer && !Number.isInteger(value)) return { error: `${field} must be a whole number.` };
  if (value < range.min || (range.max !== undefined && value > range.max)) {
    const maximum = range.max === undefined ? '' : ` and no greater than ${range.max}`;
    return { error: `${field} must be at least ${range.min}${maximum}.` };
  }
  return { value };
}

function normalizeImageUrl(value, field) {
  if (value === null || value === '') return { value: '' };
  if (typeof value !== 'string') return { error: `${field} must be a URL string or null.` };
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return { error: `${field} must use HTTP or HTTPS and cannot contain credentials.` };
    }
    const pathname = decodeURIComponent(url.pathname).toLowerCase();
    const isFirebaseDownload = url.hostname === 'firebasestorage.googleapis.com' &&
      url.searchParams.get('alt') === 'media';
    if (!/\.(?:jpe?g|png|webp)$/.test(pathname) && !isFirebaseDownload) {
      return { error: `${field} must be a direct JPEG, PNG, or WebP image URL.` };
    }
    return { value: url.toString() };
  } catch {
    return { error: `${field} must be a valid direct HTTP or HTTPS image URL.` };
  }
}
