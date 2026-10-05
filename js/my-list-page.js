import { setupMobileNav, createAnimeCard, createUpcomingAnimeCard } from './ui.js';
import { getMyList, attachMyListToggle } from './my-list.js';

function renderMyListPage() {
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
    }
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
}

document.addEventListener('DOMContentLoaded', renderMyListPage);
