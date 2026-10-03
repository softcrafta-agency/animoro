import { getArticlePath } from './article-url.js';

export function formatDate(timestamp) {
  if (!timestamp) return 'Recent';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatViews(views) {
  const num = views || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

export function createArticleCard(id, post) {
  const card = document.createElement('article');
  card.className = 'article-card';
  const articlePath = getArticlePath(post);
  card.innerHTML = `
    <a href="${articlePath}" class="card-img-wrap">
      <img class="card-img" src="${post.coverImage || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80'}" alt="${post.title}" width="800" height="450" loading="lazy" decoding="async" />
      <span class="card-category-badge">${post.category || 'General'}</span>
    </a>
    <div class="card-body">
      <div class="card-meta">
        <span>${formatDate(post.publishedAt || post.createdAt)}</span>
      </div>
      <h3 class="card-title">
        <a href="${articlePath}">${post.title}</a>
      </h3>
      <p class="card-excerpt">${post.excerpt || ''}</p>
      <div class="card-footer">
        <div class="author-info">
          <div class="author-avatar">${(post.authorName || 'A')[0].toUpperCase()}</div>
          <span>${post.authorName || 'Animoro Editor'}</span>
        </div>
        <a href="${articlePath}" style="color: var(--accent-crimson); font-weight: 600; display: flex; align-items: center; gap: 4px;">
          Read
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
      </div>
    </div>
  `;
  return card;
}

export function setupMobileNav() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileBackdrop');
  const closeBtn = document.getElementById('drawerCloseBtn');

  if (!hamburgerBtn || !drawer || !backdrop) return;

  function openMenu() {
    drawer.classList.add('open');
    backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', openMenu);
  backdrop.addEventListener('click', closeMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
}
