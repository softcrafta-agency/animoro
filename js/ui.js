import { getArticlePath } from './article-url.js';
import { getAnimePath } from './anime-url.js';
import { attachMyListToggle } from './my-list.js';
import { getUpcomingAnimePath } from './upcoming-url.js';

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

export function createAnimeCard(anime) {
  const card = document.createElement('article');
  card.className = 'article-card';

  const imageLink = document.createElement('a');
  imageLink.className = 'card-img-wrap';
  imageLink.href = getAnimePath(anime);
  const image = document.createElement('img');
  image.className = 'card-img';
  image.src = anime.coverImage || '/favicon.svg';
  image.alt = `${anime.title} cover`;
  image.width = 800;
  image.height = 450;
  image.loading = 'lazy';
  image.decoding = 'async';
  imageLink.appendChild(image);

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('h3');
  title.className = 'card-title';
  const titleLink = document.createElement('a');
  titleLink.href = getAnimePath(anime);
  titleLink.textContent = anime.title || 'Untitled anime';
  title.appendChild(titleLink);

  const details = document.createElement('p');
  details.className = 'card-excerpt';
  details.textContent = [
    ...(Array.isArray(anime.genres) ? anime.genres : []),
    anime.releaseYear,
    anime.type,
  ].filter(Boolean).join(' · ');

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const toggler = document.createElement('button');
  toggler.type = 'button';
  toggler.className = 'btn-outline';
  toggler.style.padding = '8px 12px';
  toggler.style.fontSize = '0.8rem';
  toggler.style.width = '100%';
  toggler.style.justifyContent = 'center';
  toggler.style.marginTop = '12px';
  toggler.style.borderRadius = '999px';
  attachMyListToggle(toggler, { ...anime, kind: 'anime' });
  footer.appendChild(toggler);

  body.append(title, details, footer);
  card.append(imageLink, body);
  return card;
}

export function createUpcomingAnimeCard(item) {
  const card = document.createElement('article');
  card.className = 'article-card';

  const imageLink = document.createElement('a');
  imageLink.className = 'card-img-wrap';
  imageLink.href = getUpcomingAnimePath(item);
  const image = document.createElement('img');
  image.className = 'card-img';
  image.src = item.poster || item.coverImage || '/favicon.svg';
  image.alt = `${item.title} poster`;
  image.width = 800;
  image.height = 450;
  image.loading = 'lazy';
  image.decoding = 'async';
  imageLink.appendChild(image);

  const body = document.createElement('div');
  body.className = 'card-body';

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.innerHTML = `<span>${item.releaseDate || 'TBA'}</span><span>${item.season || 'TBA'}</span>`;

  const title = document.createElement('h3');
  title.className = 'card-title';
  const titleLink = document.createElement('a');
  titleLink.href = getUpcomingAnimePath(item);
  titleLink.textContent = item.title || 'Untitled upcoming anime';
  title.appendChild(titleLink);

  const details = document.createElement('p');
  details.className = 'card-excerpt';
  details.textContent = [
    ...(Array.isArray(item.genres) ? item.genres : []),
    item.type,
    item.releaseStatus,
  ].filter(Boolean).join(' · ');

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const toggler = document.createElement('button');
  toggler.type = 'button';
  toggler.className = 'btn-outline';
  toggler.style.padding = '8px 12px';
  toggler.style.fontSize = '0.8rem';
  toggler.style.width = '100%';
  toggler.style.justifyContent = 'center';
  toggler.style.marginTop = '12px';
  toggler.style.borderRadius = '999px';
  attachMyListToggle(toggler, { ...item, kind: 'upcoming' });
  footer.appendChild(toggler);

  body.append(meta, title, details, footer);
  card.append(imageLink, body);
  return card;
}

export function setupMobileNav() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileBackdrop');
  const closeBtn = document.getElementById('drawerCloseBtn');

  if (drawer) {
    addDrawerLink(drawer, '/anime.html', 'Anime Database');
    addDrawerLink(drawer, '/upcoming-anime.html', 'Upcoming Anime');
    addDrawerLink(drawer, '/my-list.html', 'My List');
    addDrawerLink(drawer, '/anime-calendar.html', 'Release Calendar');
  }

  if (!document.getElementById('mobileBottomNav')) {
    const nav = document.createElement('nav');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');
    nav.innerHTML = `
      <a href="/" data-mobile-path="/" aria-label="Home">
        <span aria-hidden="true">⌂</span><small>Home</small>
      </a>
      <a href="/search.html" data-mobile-path="/search.html" aria-label="Search">
        <span aria-hidden="true">⌕</span><small>Search</small>
      </a>
      <a href="/upcoming-anime.html" data-mobile-path="/upcoming-anime.html" aria-label="Upcoming anime">
        <span aria-hidden="true">✦</span><small>Upcoming</small>
      </a>
      <a href="/my-list.html" data-mobile-path="/my-list.html" aria-label="My list">
        <span aria-hidden="true">♥</span><small>My List</small>
      </a>
      <button type="button" id="mobileMoreNavButton" aria-label="Open more navigation" aria-haspopup="true" aria-expanded="false">
        <span aria-hidden="true">☰</span><small>More</small>
      </button>
    `;
    document.body.appendChild(nav);
    document.body.classList.add('has-mobile-bottom-nav');

    const currentPath = window.location.pathname;
    nav.querySelectorAll('[data-mobile-path]').forEach(link => {
      const targetPath = link.getAttribute('data-mobile-path');
      const active = targetPath === '/#trending'
        ? currentPath === '/' && window.location.hash === '#trending'
        : targetPath === '/'
          ? currentPath === '/' && !window.location.hash
          : targetPath === '/anime.html'
            ? currentPath === '/anime.html'
            : currentPath === targetPath;
      if (active) link.setAttribute('aria-current', 'page');
    });

    const moreButton = document.getElementById('mobileMoreNavButton');
    if (moreButton) {
      moreButton.addEventListener('click', () => {
        if (!hamburgerBtn || !drawer || !backdrop) {
          window.location.assign('/blogs.html');
          return;
        }
        const opening = !drawer.classList.contains('open');
        if (opening) hamburgerBtn.click();
        else if (closeBtn) closeBtn.click();
        moreButton.setAttribute('aria-expanded', String(opening));
      });
    }
  }

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

function addDrawerLink(drawer, href, label) {
  const navigation = drawer.querySelector('nav');
  if (!navigation || navigation.querySelector(`a[href="${href}"]`)) return;
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  navigation.appendChild(link);
}
