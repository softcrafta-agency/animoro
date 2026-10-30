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
