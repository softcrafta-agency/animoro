import { getArticlePath } from './article-url.js';
import { getAnimePath } from './anime-url.js';
import { attachMyListToggle } from './my-list.js';
import { getUpcomingAnimePath } from './upcoming-url.js';
import { initializeAuthNavigation } from './auth-nav.js';
import { escapeHtml, getSafeImageUrl } from './html-utils.js';
import { formatUpcomingReleaseDate } from './upcoming-date.js';

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
  const title = escapeHtml(post.title || 'Untitled article');
  const category = escapeHtml(post.category || 'General');
  const excerpt = escapeHtml(post.excerpt || '');
  const rawAuthorName = typeof post.authorName === 'string' ? post.authorName.trim() : '';
  const authorName = rawAuthorName
    ? escapeHtml(rawAuthorName)
    : '';
  const authorInitial = rawAuthorName ? escapeHtml(rawAuthorName[0].toUpperCase()) : '';
  const publishedAt = post.publishedAt;
  const imageUrl = escapeHtml(getSafeImageUrl(
    post.coverImage,
    'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80'
  ));
  card.innerHTML = `
    <a href="${articlePath}" class="card-img-wrap">
      <img class="card-img" src="${imageUrl}" alt="${title}" width="800" height="450" loading="lazy" decoding="async" />
      <span class="card-category-badge">${category}</span>
    </a>
    <div class="card-body">
      ${publishedAt ? `<div class="card-meta"><span>${escapeHtml(formatDate(publishedAt))}</span></div>` : ''}
      <h3 class="card-title">
        <a href="${articlePath}">${title}</a>
      </h3>
      <p class="card-excerpt">${excerpt}</p>
      <div class="card-footer">
        <div class="author-info">
          ${authorName ? `<div class="author-avatar">${authorInitial}</div><span>${authorName}</span>` : ''}
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
  image.src = getSafeImageUrl(anime.coverImage, '/favicon.svg');
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
    anime.status,
    anime.rating !== undefined && anime.rating !== '' ? `★ ${anime.rating}` : '',
  ].filter(Boolean).join(' · ');
  const japaneseTitle = anime.japaneseTitle
    ? document.createElement('p')
    : null;
  if (japaneseTitle) {
    japaneseTitle.className = 'card-excerpt';
    japaneseTitle.textContent = anime.japaneseTitle;
  }

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

  body.append(title, ...(japaneseTitle ? [japaneseTitle] : []), details, footer);
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
  image.src = getSafeImageUrl(item.poster || item.coverImage, '/favicon.svg');
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
  const releaseDate = document.createElement('span');
  releaseDate.textContent = formatUpcomingReleaseDate(item.releaseDate);
  const season = document.createElement('span');
  season.textContent = [item.season || 'TBA', item.releaseYear].filter(Boolean).join(' ');
  meta.append(releaseDate, season);

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
    item.releaseStatus || item.status,
  ].filter(Boolean).join(' · ');
  const japaneseTitle = item.japaneseTitle
    ? document.createElement('p')
    : null;
  if (japaneseTitle) {
    japaneseTitle.className = 'card-excerpt';
    japaneseTitle.textContent = item.japaneseTitle;
  }

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

  body.append(meta, title, ...(japaneseTitle ? [japaneseTitle] : []), details, footer);
  card.append(imageLink, body);
  return card;
}

export function setupMobileNav() {
  initializeAuthNavigation();
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileBackdrop');
  const closeBtn = document.getElementById('drawerCloseBtn');
  const navigationLinks = [
    { href: '/', label: 'Home', key: 'home' },
    { href: '/anime.html', label: 'Anime List', key: 'anime' },
    { href: '/upcoming-anime.html', label: 'Upcoming Anime', key: 'upcoming' },
    { href: '/blogs.html', label: 'Articles', key: 'articles' },
    { href: '/search.html', label: 'Search', key: 'search' },
    { href: '/my-list.html', label: 'My List', key: 'my-list' },
    { href: '/anime-calendar.html', label: 'Release Calendar', key: 'calendar' },
  ];
  const pathname = window.location.pathname;
  const activeKey = pathname === '/'
    ? 'home'
    : pathname.startsWith('/anime.html')
      ? 'anime'
      : pathname.startsWith('/upcoming-anime')
        ? 'upcoming'
        : pathname === '/blogs.html' || pathname.startsWith('/blog.html/') ||
            pathname === '/category.html'
          ? 'articles'
          : pathname === '/search.html'
            ? 'search'
            : pathname === '/my-list.html'
              ? 'my-list'
              : pathname === '/anime-calendar.html'
                ? 'calendar'
                : '';

  const desktopNavigation = document.querySelector('.main-nav');
  if (desktopNavigation) {
    desktopNavigation.setAttribute('aria-label', 'Main navigation');
    desktopNavigation.replaceChildren(...navigationLinks
      .filter(link => link.key !== 'search')
      .map(link => {
        const anchor = document.createElement('a');
        anchor.href = link.href;
        anchor.className = 'nav-link';
        anchor.textContent = link.label;
        if (link.key === activeKey) {
          anchor.classList.add('active');
          anchor.setAttribute('aria-current', 'page');
        }
        return anchor;
      }));
  }
  const mobileNavigation = drawer?.querySelector('nav');
  if (mobileNavigation) {
    mobileNavigation.replaceChildren(...navigationLinks.map(link => {
      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.textContent = link.label;
      if (link.key === activeKey) {
        anchor.classList.add('active');
        anchor.setAttribute('aria-current', 'page');
      }
      return anchor;
    }));
  }

  if (!document.getElementById('mobileBottomNav')) {
    const nav = document.createElement('nav');
    nav.id = 'mobileBottomNav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', 'Mobile navigation');
    nav.innerHTML = `
      <a href="/" data-mobile-key="home" aria-label="Home">
        <span aria-hidden="true">⌂</span><small>Home</small>
      </a>
      <a href="/anime.html" data-mobile-key="anime" aria-label="Anime List">
        <span aria-hidden="true">✦</span><small>Anime List</small>
      </a>
      <a href="/search.html" data-mobile-key="search" aria-label="Search">
        <span aria-hidden="true">⌕</span><small>Search</small>
      </a>
      <a href="/my-list.html" data-mobile-key="my-list" aria-label="My list">
        <span aria-hidden="true">♥</span><small>My List</small>
      </a>
      <button type="button" id="mobileMoreNavButton" aria-label="Open more navigation" aria-haspopup="true" aria-expanded="false">
        <span aria-hidden="true">☰</span><small>More</small>
      </button>
    `;
    document.body.appendChild(nav);
    document.body.classList.add('has-mobile-bottom-nav');

    nav.querySelectorAll('[data-mobile-key]').forEach(link => {
      if (link.getAttribute('data-mobile-key') === activeKey) {
        link.setAttribute('aria-current', 'page');
      }
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

  hamburgerBtn.setAttribute('aria-controls', drawer.id);
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  if (!drawer.classList.contains('open')) {
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
  }
  if (closeBtn) closeBtn.setAttribute('aria-label', 'Close navigation menu');
  let previousBodyOverflow = '';

  function openMenu() {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    drawer.inert = false;
    backdrop.classList.add('show');
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    hamburgerBtn.setAttribute('aria-expanded', 'true');
    closeBtn?.focus();
  }

  function closeMenu(restoreFocus = true) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.inert = true;
    backdrop.classList.remove('show');
    document.body.style.overflow = previousBodyOverflow;
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    document.getElementById('mobileMoreNavButton')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) hamburgerBtn.focus();
  }

  hamburgerBtn.addEventListener('click', () => {
    if (drawer.classList.contains('open')) closeMenu(false);
    else openMenu();
  });
  backdrop.addEventListener('click', closeMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  document.addEventListener('keydown', event => {
    if (!drawer.classList.contains('open')) return;
    if (event.key === 'Escape') {
      closeMenu();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...drawer.querySelectorAll('a[href], button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}
