const SEARCH_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how',
  'in', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'what', 'when', 'where',
  'which', 'who', 'why', 'with',
]);
const COMMON_CONTENT_TERMS = new Set(['anime', 'manga', 'story', 'series', 'characters', 'episode']);

export function normalizeArticleSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenVariants(token) {
  const variants = new Set([token]);
  if (token.length > 4 && token.endsWith('ies')) variants.add(`${token.slice(0, -3)}y`);
  else if (token.length > 4 && token.endsWith('es')) variants.add(token.slice(0, -2));
  else if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) variants.add(token.slice(0, -1));
  return variants;
}

function includesAllQueryTokens(value, queryTokens) {
  const fieldTokens = new Set(normalizeArticleSearchText(value).split(' ').filter(Boolean));
  return queryTokens.every(queryToken =>
    [...tokenVariants(queryToken)].some(variant => fieldTokens.has(variant)) ||
    [...fieldTokens].some(fieldToken =>
      [...tokenVariants(fieldToken)].some(variant => variant === queryToken)
    )
  );
}

function getArticleKeywords(post) {
  const values = [
    post.primaryKeyword,
    post.focusKeyword,
    ...(Array.isArray(post.secondaryKeywords) ? post.secondaryKeywords : []),
    ...(Array.isArray(post.keywords) ? post.keywords : []),
    ...(Array.isArray(post.relatedKeywords) ? post.relatedKeywords : []),
  ];
  return values.filter(value => typeof value === 'string' && value.trim());
}

export function scoreArticleSearch(post, query) {
  const normalizedQuery = normalizeArticleSearchText(query);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter(token => !SEARCH_STOP_WORDS.has(token));
  if (!queryTokens.length) return 0;

  const title = normalizeArticleSearchText(post.title);
  const keywords = getArticleKeywords(post).map(normalizeArticleSearchText).filter(Boolean);
  const titleExact = title === normalizedQuery;
  const titlePhrase = title.includes(normalizedQuery);
  const titleWords = includesAllQueryTokens(title, queryTokens);
  const keywordExact = keywords.some(keyword => keyword === normalizedQuery);
  const keywordPhrase = keywords.some(keyword => keyword.includes(normalizedQuery));
  const keywordWords = keywords.some(keyword => includesAllQueryTokens(keyword, queryTokens));
  const excerpt = `${post.excerpt || ''} ${post.description || ''} ${post.seoDescription || ''}`;
  const excerptPhrase = normalizeArticleSearchText(excerpt).includes(normalizedQuery);
  const excerptWords = includesAllQueryTokens(excerpt, queryTokens);
  const content = String(post.content || '').replace(/<[^>]*>/g, ' ');
  const contentPhrase = normalizeArticleSearchText(content).includes(normalizedQuery);
  const contentWords = includesAllQueryTokens(content, queryTokens);
  const commonSingleWordQuery = queryTokens.length === 1 && COMMON_CONTENT_TERMS.has(queryTokens[0]);
  const otherMetadata = [
    post.slug,
    post.seoTitle,
    post.category,
    post.authorName,
    ...(Array.isArray(post.tags) ? post.tags : []),
  ].filter(value => typeof value === 'string').join(' ');
  const metadataPhrase = normalizeArticleSearchText(otherMetadata).includes(normalizedQuery);
  const metadataWords = includesAllQueryTokens(otherMetadata, queryTokens);

  let score = 0;
  if (titleExact) score += 1000;
  else if (titlePhrase) score += 850;
  else if (titleWords) score += 800;

  if (keywordExact) score += 750;
  else if (keywordPhrase) score += 650;
  else if (keywordWords) score += 600;

  if (!commonSingleWordQuery) {
    if (excerptPhrase) score += 450;
    else if (excerptWords) score += 350;
    if (contentPhrase) score += 300;
    else if (contentWords) score += 220;
  }
  if (metadataPhrase) score += 100;
  else if (metadataWords) score += 60;

  return score;
}
