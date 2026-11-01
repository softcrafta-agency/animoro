import { normalizeArticleSlug } from './article-url.js';

const JIKAN_DETAIL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*--[1-9]\d*$/i;

export function normalizeAnimeSlug(value) {
  return normalizeArticleSlug(value);
}

export function isValidAnimeSlug(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isValidAnimeDetailSlug(value) {
  return isValidAnimeSlug(value) ||
    (typeof value === 'string' &&
      value.length <= 200 &&
      JIKAN_DETAIL_SLUG_PATTERN.test(value));
}

export function getAnimeSlug(anime) {
  return isValidAnimeSlug(anime?.slug)
    ? anime.slug
    : normalizeAnimeSlug(anime?.title);
}

export function getAnimePath(anime) {
  const slug = getAnimeSlug(anime) || 'anime';
  const malId = Number.parseInt(String(anime?.malId || ''), 10);
  const stableSlug = Number.isInteger(malId) && malId > 0 && !slug.endsWith(`--${malId}`)
    ? `${slug}--${malId}`
    : slug;
  return `/anime/${encodeURIComponent(stableSlug)}`;
}

export function getAnimeCanonicalUrl(anime) {
  return new URL(getAnimePath(anime), 'https://www.animoro.in').toString();
}
