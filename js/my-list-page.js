import { setupMobileNav, createAnimeCard, createUpcomingAnimeCard } from './ui.js';
import { getMyList, attachMyListToggle } from './my-list.js';

function ensureMetaTag(attribute, name, value) {
  const selector = `meta[${attribute}="${name}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
}

function ensureCanonical(url) {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

function renderMyListPage() {
  const canonicalUrl = new URL('/my-list.html', 'https://www.animoro.in').toString();
  document.title = 'My List — Saved Anime | Animoro';
  ensureMetaTag('name', 'description', 'Save and manage your favorite anime in your personal Animoro list.');
  ensureMetaTag('name', 'robots', 'noindex, nofollow');
  ensureMetaTag('property', 'og:title', 'My List — Saved Anime | Animoro');
  ensureMetaTag('property', 'og:description', 'Save and manage your favorite anime in your personal Animoro list.');
  ensureMetaTag('property', 'og:url', canonicalUrl);
  ensureCanonical(canonicalUrl);

  setupMobileNav();
  const container = document.getElementById('myListContainer');
  if (!container) return;

  const list = getMyList();
  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 style="font-size: 1.7rem; margin-bottom: 12px;">Your list is empty</h3>
        <p class="empty-state-desc">Start adding anime you want to watch later.</p>
        <a href="/anime.html" class="btn-cta" style="margin-top: 16px;">Explore Anime</a>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  list.forEach(item => {
    const record = { ...item, kind: item.kind || 'anime' };
    const card = record.kind === 'upcoming' ? createUpcomingAnimeCard(record) : createAnimeCard(record);
    const button = card.querySelector('.btn-outline');
    if (button) {
      attachMyListToggle(button, record);
      button.textContent = 'Remove from My List';
    }
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
}

document.addEventListener('animoro-my-list-change', renderMyListPage);
document.addEventListener('DOMContentLoaded', renderMyListPage);
