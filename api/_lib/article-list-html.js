import { getArticlePath } from '../../js/article-url.js';
import { getArticleCategories } from '../../js/article-editor-fields.js';
import { escapeHtml, getSafeImageUrl } from '../../js/html-utils.js';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80';

function formatPublishedDate(value) {
  if (!value) return '';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function renderArticleCard(post) {
  const articlePath = getArticlePath(post);
  const title = escapeHtml(post.title || 'Untitled article');
  const categories = getArticleCategories(post);
  const category = escapeHtml(categories[0] || 'General');
  const categoryLinks = categories.map(name =>
    `<a class="badge-category" href="/category.html?category=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`
  ).join('');
  const excerpt = escapeHtml(post.excerpt || '');
  const authorName = typeof post.authorName === 'string' ? post.authorName.trim() : '';
  const imageUrl = escapeHtml(getSafeImageUrl(post.coverImage, FALLBACK_IMAGE));
  const publishedDate = formatPublishedDate(post.publishedAt);

  return `<article class="article-card">
    <a href="${articlePath}" class="card-img-wrap">
      <img class="card-img" src="${imageUrl}" alt="${title}" width="800" height="450" loading="lazy" decoding="async" />
      <span class="card-category-badge">${category}</span>
    </a>
    <div class="card-body">
      ${publishedDate ? `<div class="card-meta"><span>${escapeHtml(publishedDate)}</span></div>` : ''}
      ${categoryLinks ? `<div class="card-category-list">${categoryLinks}</div>` : ''}
      <h3 class="card-title"><a href="${articlePath}">${title}</a></h3>
      <p class="card-excerpt">${excerpt}</p>
      <div class="card-footer">
        <div class="author-info">
          ${authorName ? `<div class="author-avatar">${escapeHtml(authorName[0].toUpperCase())}</div><span>${escapeHtml(authorName)}</span>` : ''}
        </div>
        <a href="${articlePath}" style="color: var(--accent-crimson); font-weight: 600; display: flex; align-items: center; gap: 4px;">
          Read
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
      </div>
    </div>
  </article>`;
}

export function renderArticleList(posts) {
  if (!posts.length) {
    return `<div class="empty-state" style="grid-column: 1 / -1;">
      <h2 class="empty-state-title">No stories found</h2>
      <p class="empty-state-desc">There are no published articles in this selection yet. Browse all articles or check back soon.</p>
      <a class="btn-outline" href="/blogs.html">Browse All Articles</a>
    </div>`;
  }
  return posts.map(renderArticleCard).join('\n');
}
