export const ARTICLE_CATEGORIES = [
  'Anime News',
  'Reviews',
  'Rankings',
  'Guides',
  'Recommendations',
  'Manga',
  'Seasonal Anime',
];

export const ARTICLE_SEARCH_INTENTS = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
];

export function isValidArticleCategory(value) {
  return ARTICLE_CATEGORIES.includes(value);
}

export function isValidSearchIntent(value) {
  return ARTICLE_SEARCH_INTENTS.includes(value);
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

export function normalizeArticleKeywords(values) {
  const items = Array.isArray(values) ? values : [values];
  const seen = new Set();

  return items
    .flatMap(value => {
      if (typeof value !== 'string') return [];
      return value.split(',');
    })
    .map(value => value.trim().replace(/\s+/g, ' '))
    .filter(value => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}
