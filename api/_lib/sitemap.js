import {
  createUniqueArticleSlug,
  isValidArticleSlug,
  normalizeArticleSlug
} from '../../js/article-url.js';

export const SITE_ORIGIN = 'https://www.animoro.in';

const STATIC_PATHS = [
  '/',
  '/blogs.html',
  '/about.html',
  '/contact.html',
  '/search.html',
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoDate(value) {
  if (value == null) return null;

  let date;
  if (typeof value.toDate === 'function') {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }

  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function getLastModified(post) {
  for (const field of ['updatedAt', 'publishedAt', 'createdAt']) {
    const date = toIsoDate(post[field]);
    if (date) return date;
  }
  return null;
}

function articleUrl(slug) {
  return new URL(`/blog.html/${encodeURIComponent(slug)}`, `${SITE_ORIGIN}/`).toString();
}

export function assignPostSlugs(posts) {
  const reservedSlugs = new Set(
    posts
      .map(post => post.slug)
      .filter(isValidArticleSlug)
  );

  return posts.map(post => {
    if (isValidArticleSlug(post.slug)) return post;

    const baseSlug = normalizeArticleSlug(post.title);
    const slug = createUniqueArticleSlug(baseSlug, reservedSlugs);
    reservedSlugs.add(slug);
    return { ...post, slug };
  });
}

function categoryUrl(name) {
  return `${SITE_ORIGIN}/category.html?category=${encodeURIComponent(name)}`;
}

function appendUrl(urls, location, lastModified = null) {
  urls.push(
    `  <url>\n` +
      `    <loc>${escapeXml(location)}</loc>\n` +
      (lastModified ? `    <lastmod>${escapeXml(lastModified)}</lastmod>\n` : '') +
      `  </url>`
  );
}

export function buildSitemap(posts, categories) {
  const urls = [];
  const seenLocations = new Set();

  function add(location, lastModified) {
    if (seenLocations.has(location)) return;
    seenLocations.add(location);
    appendUrl(urls, location, lastModified);
  }

  for (const path of STATIC_PATHS) {
    add(new URL(path, `${SITE_ORIGIN}/`).toString());
  }

  const publicPosts = assignPostSlugs(posts.filter(post => post.status === 'published'));
  const categoryNames = new Set();

  for (const category of categories) {
    if (typeof category.name === 'string' && category.name.trim()) {
      categoryNames.add(category.name.trim());
    }
  }

  for (const post of publicPosts) {
    if (typeof post.category === 'string' && post.category.trim()) {
      categoryNames.add(post.category.trim());
    }
  }

  for (const name of [...categoryNames].sort((a, b) => a.localeCompare(b))) {
    add(categoryUrl(name));
  }

  for (const post of publicPosts) {
    if (!isValidArticleSlug(post.slug)) continue;
    add(articleUrl(post.slug), getLastModified(post));
  }

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls.join('\n')}\n` +
    '</urlset>'
  );
}
