export const ARTICLE_CATEGORIES = [
  'Anime News',
  'Reviews',
  'Rankings',
  'Guides',
  'Recommendations',
  'Manga',
  'Seasonal Anime',
];

export function isValidArticleCategory(value) {
  return ARTICLE_CATEGORIES.includes(value);
}

export function isValidFeaturedOrder(value) {
  return value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export function normalizeArticleTags(values) {
  const seen = new Set();
  return values
    .filter(value => typeof value === 'string')
    .map(value => value.trim().replace(/^#/, '').trim())
    .filter(value => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}
