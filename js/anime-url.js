import { normalizeArticleSlug } from './article-url.js';

export function normalizeAnimeSlug(value) {
  return normalizeArticleSlug(value);
}

export function isValidAnimeSlug(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function getAnimeSlug(anime) {
  return isValidAnimeSlug(anime?.slug)
    ? anime.slug
    : normalizeAnimeSlug(anime?.title);
}

export function getAnimePath(anime) {
  return `/anime.html/${encodeURIComponent(getAnimeSlug(anime))}`;
}

export function getAnimeCanonicalUrl(anime) {
  return new URL(getAnimePath(anime), 'https://www.animoro.in').toString();
}
