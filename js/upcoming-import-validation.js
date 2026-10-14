import { normalizeAnimeSlug } from './anime-url.js';

export const UPCOMING_RELEASE_STATUSES = [
  'TBA',
  'Announced',
  'Upcoming',
  'Airing Soon',
  'Airing',
  'Completed',
  'Delayed',
];

const IMPORT_FIELDS = {
  title: ['animeTitle', 'title'],
  japaneseTitle: ['japaneseTitle'],
  slug: ['animeSlug', 'slug'],
  poster: ['posterImageUrl', 'poster'],
  shortDescription: ['shortDescription'],
  description: ['fullDescription', 'description'],
  releaseDate: ['releaseDate'],
  releaseYear: ['releaseYear'],
  season: ['season'],
  releaseStatus: ['releaseStatus'],
  type: ['type'],
  genres: ['genres'],
  studio: ['studio'],
  source: ['source'],
  episodes: ['episodes'],
  duration: ['duration'],
  ageRating: ['ageRating'],
  trailerUrl: ['trailerUrl'],
  officialUrl: ['officialWebsite', 'officialUrl'],
  malUrl: ['myAnimeListUrl', 'malUrl'],
  anilistUrl: ['aniListUrl', 'anilistUrl'],
  crunchyrollUrl: ['crunchyrollUrl'],
  featured: ['featuredUpcomingAnime', 'featured'],
  status: ['status'],
};
const IDENTIFIER_FIELDS = ['id', 'documentId', 'docId'];
const ALLOWED_FIELDS = new Set([...Object.values(IMPORT_FIELDS).flat(), ...IDENTIFIER_FIELDS]);
const SEASONS = ['TBA', 'Winter', 'Spring', 'Summer', 'Fall'];
const TYPES = ['TV', 'Movie', 'OVA', 'ONA', 'Special'];
const SOURCES = ['Manga', 'Light Novel', 'Original', 'Game', 'Web Manga', 'Other'];

export function validateUpcomingImportRecord(record, number) {
  const errors = [];
  const payload = {};
  const supplied = new Set();
  let documentId = '';
  const addError = (field, message) => errors.push({ field, message });

  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return { number, valid: false, errors: [{ field: 'record', message: 'Each record must be a JSON object.' }], payload, supplied };
  }

  Object.keys(record).forEach(field => {
    if (!ALLOWED_FIELDS.has(field)) addError(field, 'Unsupported field; remove it or map it to a supported Upcoming Anime field.');
  });

  for (const [canonical, aliases] of Object.entries(IMPORT_FIELDS)) {
    const presentAliases = aliases.filter(alias => Object.hasOwn(record, alias));
    if (!presentAliases.length) continue;
    if (presentAliases.length > 1) {
      addError(aliases[0], `Provide only one of: ${presentAliases.join(', ')}.`);
      continue;
    }
    const field = presentAliases[0];
    supplied.add(canonical);
    const normalized = normalizeField(canonical, record[field]);
    if (normalized.error) addError(field, normalized.error);
    else payload[canonical] = normalized.value;
  }

  const suppliedIds = IDENTIFIER_FIELDS.filter(field => Object.hasOwn(record, field));
  if (suppliedIds.length > 1) addError('documentId', `Provide only one of: ${IDENTIFIER_FIELDS.join(', ')}.`);
  if (suppliedIds.length) {
    const field = suppliedIds[0];
    const value = record[field];
    if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 1500) {
      addError(field, 'Document ID must be a non-empty string without slashes and no longer than 1500 characters.');
    } else {
      documentId = value.trim();
    }
  }

  if (!payload.title) addError('animeTitle', 'Anime title is required.');
  if (payload.title && !payload.slug && !supplied.has('slug')) {
    payload.slug = normalizeAnimeSlug(payload.title);
  } else if (supplied.has('slug') && typeof payload.slug === 'string') {
    payload.slug = normalizeAnimeSlug(payload.slug);
  }
  if (!payload.slug) addError('animeSlug', 'Anime slug is required or must be generated from a valid title.');
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
    addError('animeSlug', 'Slug must contain lowercase letters, numbers, and single hyphens only.');
  }

  return { number, valid: errors.length === 0, errors, payload, supplied, documentId, duplicateWithinFile: false, match: null };
}

function normalizeField(field, value) {
  const fail = message => ({ error: message });
  const optionalString = (maxLength, label = field) => {
    if (value === null) return { value: '' };
    if (typeof value !== 'string') return fail(`${label} must be a string.`);
    const text = value.trim();
    if (text.length > maxLength) return fail(`${label} must be ${maxLength} characters or fewer.`);
    return { value: text };
  };

  if ([
    'title', 'japaneseTitle', 'slug', 'poster', 'shortDescription', 'description', 'releaseDate',
    'season', 'releaseStatus', 'type', 'studio', 'source', 'duration', 'ageRating', 'trailerUrl',
    'officialUrl', 'malUrl', 'anilistUrl', 'crunchyrollUrl',
  ].includes(field)) {
    const limits = {
      title: 200, japaneseTitle: 200, slug: 200, poster: 2048, shortDescription: 400,
      description: 8000, releaseDate: 100, season: 30, releaseStatus: 30, type: 30,
      studio: 200, source: 50, duration: 80, ageRating: 40, trailerUrl: 2048,
      officialUrl: 2048, malUrl: 2048, anilistUrl: 2048, crunchyrollUrl: 2048,
    };
    const result = optionalString(limits[field], field);
    if (result.error || !result.value) return result;

    const allowed = {
      season: SEASONS,
      releaseStatus: UPCOMING_RELEASE_STATUSES,
      type: TYPES,
      source: SOURCES,
    }[field];
    if (allowed && !allowed.includes(result.value)) {
      return fail(`Must be one of: ${allowed.join(', ')}.`);
    }
    if (field === 'poster' || [
      'trailerUrl', 'officialUrl', 'malUrl', 'anilistUrl', 'crunchyrollUrl',
    ].includes(field)) {
      const safeUrl = validateHttpUrl(result.value);
      if (safeUrl.error) return safeUrl;
      if (field === 'poster' && !isDirectImageUrl(safeUrl.value)) {
        return fail('Poster must be a direct JPEG, PNG, or WebP image URL (including a Firebase Storage download URL), not an official website page. Clear posterImageUrl to import without a poster or provide the image URL.');
      }
      return { value: safeUrl.value };
    }
    return result;
  }

  if (field === 'releaseYear') {
    if (value === null || value === '') return { value: null };
    if (!(typeof value === 'number' || (typeof value === 'string' && /^\d{4}$/.test(value)))) {
      return fail('Release year must be a four-digit year or null.');
    }
    const year = Number(value);
    if (!Number.isInteger(year) || year < 2025 || year > 2100) {
      return fail('Release year must be between 2025 and 2100.');
    }
    return { value: String(year) };
  }
  if (field === 'genres') {
    if (typeof value !== 'string' && !Array.isArray(value)) {
      return fail('Genres must be an array of strings or a comma-separated string.');
    }
    const genres = (Array.isArray(value) ? value : value.split(',')).map(genre => (
      typeof genre === 'string' ? genre.trim() : null
    ));
    if (genres.some(genre => genre === null)) return fail('Every genre must be a string.');
    const normalized = [...new Set(genres.filter(Boolean))];
    if (normalized.length > 30 || normalized.some(genre => genre.length > 80)) {
      return fail('Genres may contain at most 30 values, each no longer than 80 characters.');
    }
    return { value: normalized };
  }
  if (field === 'episodes') {
    if (value === null) return { value: 'TBA' };
    if (typeof value !== 'string' && typeof value !== 'number') {
      return fail('Episodes must be a string, number, or null.');
    }
    const episodes = String(value).trim();
    if (episodes.length > 30) return fail('Episodes must be 30 characters or fewer.');
    return { value: episodes || 'TBA' };
  }
  if (field === 'featured') {
    return typeof value === 'boolean' ? { value } : fail('Featured Upcoming Anime must be true or false.');
  }
  if (field === 'status') {
    if (typeof value !== 'string') return fail('Publication status must be Draft, Published, or Archived.');
    const status = value.trim().toLowerCase();
    if (!['draft', 'published', 'archived'].includes(status)) {
      return fail('Publication status must be Draft, Published, or Archived.');
    }
    return { value: status };
  }
  return fail('Unsupported field.');
}

function validateHttpUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return { error: 'URL must use HTTP or HTTPS and cannot contain credentials.' };
    }
    return { value: url.toString() };
  } catch {
    return { error: 'Enter a valid HTTP or HTTPS URL.' };
  }
}

function isDirectImageUrl(value) {
  try {
    const url = new URL(value);
    const pathname = decodeURIComponent(url.pathname).toLowerCase();
    return /\.(?:jpe?g|png|webp)$/.test(pathname) ||
      (url.hostname === 'firebasestorage.googleapis.com' && url.searchParams.get('alt') === 'media');
  } catch {
    return false;
  }
}
