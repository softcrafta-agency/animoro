export const ARTICLE_SEARCH_INTENTS = [
  'informational',
  'commercial',
  'transactional',
  'navigational',
];

export function isValidArticleCategory(value, registeredCategories, legacyCategory = '') {
  return typeof value === 'string' &&
    value.length > 0 &&
    (registeredCategories.includes(value) || value === legacyCategory);
}

export function normalizeArticleCategories(values) {
  const categories = Array.isArray(values) ? values : [values];
  const seen = new Set();
  return categories
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(value => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function getArticleCategories(post) {
  const legacyCategories = Array.isArray(post?.category) ? post.category : [post?.category];
  return normalizeArticleCategories([
    ...(Array.isArray(post?.categories) ? post.categories : []),
    ...legacyCategories,
  ]);
}

export function isValidArticleCategories(values, registeredCategories, savedCategories = []) {
  const categories = normalizeArticleCategories(values);
  const saved = new Set(normalizeArticleCategories(savedCategories));
  return categories.length > 0 &&
    categories.every(category => registeredCategories.includes(category) || saved.has(category));
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
      return value.split(/[,\r\n]+/);
    })
    .map(value => value.trim().replace(/\s+/g, ' '))
    .filter(value => {
      const normalized = value.toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function getArticleKeywordFields(primaryKeyword, secondaryKeywordInput) {
  const primary = String(primaryKeyword ?? '').trim().replace(/\s+/g, ' ');
  const secondaryKeywords = normalizeArticleKeywords(secondaryKeywordInput);

  return {
    primaryKeyword: primary,
    secondaryKeywords,
    keywords: normalizeArticleKeywords([primary, ...secondaryKeywords]),
    relatedKeywords: secondaryKeywords,
  };
}

export function getArticleSecondaryKeywords(post) {
  const primaryKeyword = normalizeArticleKeywords([
    post?.primaryKeyword || post?.focusKeyword || '',
  ])[0]?.toLocaleLowerCase();

  for (const candidate of [
    post?.secondaryKeywords,
    post?.keywords,
    post?.relatedKeywords,
  ]) {
    const keywords = normalizeArticleKeywords(candidate)
      .filter(keyword => keyword.toLocaleLowerCase() !== primaryKeyword);
    if (keywords.length) return keywords;
  }

  return [];
}

function normalizeKeywordCoverageText(value) {
  return String(value ?? '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#\d+|#x[\da-f]+|[a-z][\da-z]+);/gi, ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesKeywordPhrase(text, keyword) {
  const phrase = normalizeKeywordCoverageText(keyword);
  return Boolean(phrase && ` ${text} `.includes(` ${phrase} `));
}

export function getArticleKeywordCoverage(keywords, content) {
  const html = String(content ?? '');
  const contentText = normalizeKeywordCoverageText(html);
  const headingText = [...html.matchAll(/<h[2-6]\b[^>]*>([\s\S]*?)<\/h[2-6]\s*>/gi)]
    .map(match => normalizeKeywordCoverageText(match[1]))
    .join(' ');

  return normalizeArticleKeywords(keywords).map(keyword => ({
    keyword,
    inContent: includesKeywordPhrase(contentText, keyword),
    inHeading: includesKeywordPhrase(headingText, keyword),
  }));
}
