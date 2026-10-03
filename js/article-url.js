export const ARTICLE_SITE_ORIGIN = 'https://www.animoro.in';

export function normalizeArticleSlug(value) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.slice(0, 200).replace(/-+$/g, '') || 'article';
}

export function isValidArticleSlug(value) {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function createUniqueArticleSlug(value, existingSlugs) {
  const baseSlug = normalizeArticleSlug(value);
  if (!existingSlugs.has(baseSlug)) return baseSlug;

  let suffix = 2;
  let candidate;
  do {
    const suffixText = `-${suffix}`;
    candidate = `${baseSlug.slice(0, 200 - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
    suffix += 1;
  } while (existingSlugs.has(candidate));

  return candidate;
}

export function getArticleSlug(post) {
  return isValidArticleSlug(post?.slug)
    ? post.slug
    : normalizeArticleSlug(post?.title);
}

export function getArticlePath(post) {
  return `/blog.html/${encodeURIComponent(getArticleSlug(post))}`;
}

export function getCanonicalArticleUrl(post) {
  return new URL(getArticlePath(post), ARTICLE_SITE_ORIGIN).toString();
}
