import { normalizeArticleSlug } from './article-url.js';

export function normalizeUpcomingSlug(value) {
  return normalizeArticleSlug(value);
}

export function getUpcomingAnimeSlug(item) {
  const slug = item?.slug || item?.id || item?.title;
  return slug ? normalizeUpcomingSlug(slug) : 'upcoming-anime';
}

export function getUpcomingAnimePath(item) {
  return `/upcoming-anime.html/${encodeURIComponent(getUpcomingAnimeSlug(item))}`;
}

export function getUpcomingAnimeCanonicalUrl(item) {
  return new URL(getUpcomingAnimePath(item), 'https://www.animoro.in').toString();
}
