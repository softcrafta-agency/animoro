import {
  collection,
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { setupMobileNav, createUpcomingAnimeCard } from './ui.js';
import { attachMyListToggle } from './my-list.js';
import { getUpcomingAnimeCanonicalUrl, getUpcomingAnimePath } from './upcoming-url.js';

let allPublishedUpcoming = [];
let activeFilters = {
  query: '',
  year: 'all',
  season: 'all',
  type: 'all',
  genre: 'all',
  sort: 'release-date'
};

function initUpcomingPage() {
  setupMobileNav();
  bindFilterControls();
  const path = getRequestedUpcomingSlug();
  if (path) {
    loadUpcomingDetail(path);
  } else {
    loadUpcomingDirectory();
  }
}

function getRequestedUpcomingSlug() {
  const candidates = [
    '/upcoming-anime.html/',
    '/upcoming-anime/'
  ];
  const pathname = window.location.pathname;
  for (const prefix of candidates) {
    if (!pathname.startsWith(prefix)) continue;
    const slug = decodeURIComponent(pathname.slice(prefix.length));
    return slug && !slug.includes('/') ? slug : '';
  }
  return '';
}

async function loadUpcomingDirectory() {
  const container = document.getElementById('upcomingAnimeSections');
  if (!container) return;

  if (!isConfigured || !db) {
    container.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Upcoming anime is unavailable until Firebase is configured.</p></div>';
    return;
  }

  try {
    const snapshot = await getDocs(query(collection(db, 'upcomingAnime'), limit(200)));
    allPublishedUpcoming = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(item => item.status === 'published');
    renderUpcomingDirectory();
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    container.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Unable to load upcoming anime right now. Please try again later.</p></div>';
  }
}

async function loadUpcomingDetail(slug) {
  const detailRoot = document.getElementById('upcomingDetail');
  const directoryRoot = document.getElementById('upcomingAnimeSections');
  if (!detailRoot) return;

  if (!isConfigured || !db) {
    detailRoot.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Upcoming anime details are unavailable until Firebase is configured.</p></div>';
    return;
  }

  try {
    const snapshot = await getDocs(query(
      collection(db, 'upcomingAnime'),
      where('slug', '==', slug),
      where('status', '==', 'published'),
      limit(1)
    ));

    if (snapshot.empty) {
      window.location.replace('/404.html');
      return;
    }

    const anime = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    if (directoryRoot) directoryRoot.hidden = true;
    renderUpcomingDetail(anime);
  } catch (error) {
    handleFirestoreError(error, 'fetch', `upcomingAnime/${slug}`);
    detailRoot.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Unable to load this upcoming anime page.</p></div>';
  }
}

function bindFilterControls() {
  const searchInput = document.getElementById('upcomingSearchInput');
  const yearFilter = document.getElementById('upcomingYearFilter');
  const seasonFilter = document.getElementById('upcomingSeasonFilter');
  const typeFilter = document.getElementById('upcomingTypeFilter');
  const genreFilter = document.getElementById('upcomingGenreFilter');
  const sortFilter = document.getElementById('upcomingSortFilter');

  if (searchInput) {
    searchInput.addEventListener('input', event => {
      activeFilters.query = event.target.value.trim().toLowerCase();
      renderUpcomingDirectory();
    });
  }
  [yearFilter, seasonFilter, typeFilter, genreFilter, sortFilter].forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
      activeFilters.year = yearFilter?.value || 'all';
      activeFilters.season = seasonFilter?.value || 'all';
      activeFilters.type = typeFilter?.value || 'all';
      activeFilters.genre = genreFilter?.value || 'all';
      activeFilters.sort = sortFilter?.value || 'release-date';
      renderUpcomingDirectory();
    });
  });
}

function renderUpcomingDirectory() {
  const container = document.getElementById('upcomingAnimeSections');
  if (!container) return;

  const filtered = filterUpcomingAnime(allPublishedUpcoming);
  if (!filtered.length) {
    container.innerHTML = '<div class="empty-state"><p class="empty-state-desc">No upcoming anime found.</p></div>';
    return;
  }

  const sections = {
    comingSoon: filtered.filter(item => isSoon(item)),
    upcomingSeason: filtered.filter(item => item.featured || isCurrentOrNextSeason(item)),
    laterThisYear: filtered.filter(item => !isSoon(item) && !isCurrentOrNextSeason(item) && item.releaseYear && Number(item.releaseYear) >= new Date().getFullYear())
  };

  const fragment = document.createDocumentFragment();
  const orderedSections = [
    { key: 'comingSoon', title: 'Coming Soon' },
    { key: 'upcomingSeason', title: 'Upcoming Season' },
    { key: 'laterThisYear', title: 'Later This Year' }
  ];

  orderedSections.forEach(({ key, title }) => {
    const items = sections[key];
    if (!items.length) return;

    const section = document.createElement('section');
    section.className = 'section-padded';
    section.style.paddingTop = '0';

    const heading = document.createElement('div');
    heading.className = 'section-header';
    heading.innerHTML = `<div><h2 class="section-title">${title}</h2></div>`;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'articles-grid';
    items.forEach(item => {
      const card = createUpcomingAnimeCard(item);
      grid.appendChild(card);
    });
    section.appendChild(grid);
    fragment.appendChild(section);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

function filterUpcomingAnime(items) {
  const query = activeFilters.query;
  const year = activeFilters.year;
  const season = activeFilters.season;
  const type = activeFilters.type;
  const genre = activeFilters.genre;

  const filtered = items.filter(item => {
    const matchesQuery = !query || [item.title, item.japaneseTitle, item.slug, item.shortDescription].some(value => String(value || '').toLowerCase().includes(query));
    const matchesYear = year === 'all' || String(item.releaseYear || '') === String(year);
    const matchesSeason = season === 'all' || String(item.season || '').toLowerCase() === season.toLowerCase();
    const matchesType = type === 'all' || String(item.type || '').toLowerCase() === type.toLowerCase();
    const matchesGenre = genre === 'all' || (Array.isArray(item.genres) && item.genres.some(g => g.toLowerCase() === genre.toLowerCase()));
    return matchesQuery && matchesYear && matchesSeason && matchesType && matchesGenre;
  });

  const sortKey = activeFilters.sort || 'release-date';
  return filtered.sort((a, b) => {
    if (sortKey === 'a-z') return (a.title || '').localeCompare(b.title || '');
    if (sortKey === 'rating') return Number(b.featured || 0) - Number(a.featured || 0);
    if (sortKey === 'popularity') return Number(b.featured || 0) - Number(a.featured || 0);
    const aDate = a.releaseDate ? new Date(a.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDate = b.releaseDate ? new Date(b.releaseDate).getTime() : Number.MAX_SAFE_INTEGER;
    return aDate - bDate;
  });
}

function isSoon(item) {
  const releaseDate = item.releaseDate ? new Date(item.releaseDate) : null;
  if (!releaseDate || Number.isNaN(releaseDate.getTime())) return false;
  const now = Date.now();
  const diffDays = (releaseDate.getTime() - now) / 86400000;
  return diffDays >= 0 && diffDays <= 180;
}

function isCurrentOrNextSeason(item) {
  const seasonMap = ['Winter', 'Spring', 'Summer', 'Fall'];
  const currentSeason = getCurrentSeason();
  const itemSeason = String(item.season || '');
  if (!itemSeason) return false;
  return seasonMap.includes(itemSeason) && (item.featured || itemSeason === currentSeason || itemSeason === getNextSeason(currentSeason));
}

function getCurrentSeason() {
  const month = new Date().getMonth();
  if (month <= 1) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Fall';
}

function getNextSeason(current) {
  const order = ['Winter', 'Spring', 'Summer', 'Fall'];
  const index = order.indexOf(current);
  return order[(index + 1) % order.length];
}

function renderUpcomingDetail(anime) {
  const detail = document.getElementById('upcomingDetail');
  if (!detail) return;

  const title = anime.title || 'Upcoming Anime';
  document.title = `${title} — Release Date, Trailer & Details | Animoro`;

  const meta = [
    ['name', 'description', anime.shortDescription || `Details and release information for ${title}.`],
    ['property', 'og:title', `${title} — Release Date, Trailer & Details | Animoro`],
    ['property', 'og:description', anime.shortDescription || `Discover the release details for ${title}.`],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', getUpcomingAnimeCanonicalUrl(anime)],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', `${title} | Animoro`],
    ['name', 'twitter:description', anime.shortDescription || `Upcoming anime release details for ${title}.`],
  ];

  meta.forEach(([attrKey, attrValue, content]) => {
    const element = document.createElement('meta');
    element.setAttribute(attrKey, attrValue);
    element.setAttribute('content', content);
    document.head.appendChild(element);
  });

  const imageUrl = anime.poster || anime.coverImage || '/favicon.svg';
  const info = document.createElement('div');
  info.className = 'anime-detail-information';
  info.innerHTML = `
    <div class="card-meta"><span>${anime.releaseStatus || 'TBA'}</span><span>${anime.season || 'TBA'} ${anime.releaseYear || ''}</span></div>
    <h1 class="section-title" style="font-size: clamp(2rem, 4vw, 3rem); margin: 0 0 12px;">${title}</h1>
    <p style="color: var(--text-muted); margin-bottom: 16px;">${anime.japaneseTitle || ''}</p>
    <div style="display:flex; flex-wrap: wrap; gap: 12px; margin-bottom: 18px;">
      <button type="button" class="btn-outline my-list-toggle-btn" data-kind="upcoming" aria-pressed="false">＋ Add to My List</button>
    </div>
    <div class="anime-facts">
      <dt>Release Date</dt><dd>${anime.releaseDate || 'TBA'}</dd>
      <dt>Season</dt><dd>${anime.season || 'TBA'}</dd>
      <dt>Type</dt><dd>${anime.type || 'TBA'}</dd>
      <dt>Genres</dt><dd>${(anime.genres || []).join(', ') || '—'}</dd>
      <dt>Studio</dt><dd>${anime.studio || '—'}</dd>
      <dt>Source</dt><dd>${anime.source || '—'}</dd>
      <dt>Episodes</dt><dd>${anime.episodes || 'TBA'}</dd>
      <dt>Duration</dt><dd>${anime.duration || '—'}</dd>
    </div>
  `;

  detail.replaceChildren();

  const image = document.createElement('img');
  image.className = 'anime-detail-cover';
  image.src = imageUrl;
  image.alt = `${title} poster`;
  image.loading = 'eager';
  image.decoding = 'async';
  image.width = 600;
  image.height = 850;
  detail.appendChild(image);
  detail.appendChild(info);

  const description = document.createElement('div');
  description.className = 'article-content';
  description.innerHTML = `<p>${(anime.description || anime.shortDescription || 'No description provided yet.').replace(/\n/g, '<br>')}</p>`;
  detail.appendChild(description);

  if (anime.trailerUrl) {
    const trailerWrap = document.createElement('div');
    trailerWrap.style.marginTop = '24px';
    trailerWrap.innerHTML = `
      <h3 class="section-title" style="font-size: 1.3rem; margin-bottom: 10px;">Trailer</h3>
      <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 18px; background: #0b0f18;">
        <iframe src="${anime.trailerUrl.replace('watch?v=', 'embed/')}" title="${title} trailer" style="position:absolute; inset:0; width:100%; height:100%; border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    `;
    detail.appendChild(trailerWrap);
  }

  const list = document.createElement('div');
  list.style.marginTop = '20px';
  list.innerHTML = buildExternalLinks(anime);
  detail.appendChild(list);

  const button = detail.querySelector('.my-list-toggle-btn');
  if (button) {
    attachMyListToggle(button, { ...anime, kind: 'upcoming' });
  }
}

function buildExternalLinks(anime) {
  const links = [
    ['Official Website', anime.officialUrl],
    ['MyAnimeList', anime.malUrl],
    ['AniList', anime.anilistUrl],
    ['Crunchyroll', anime.crunchyrollUrl],
  ].filter(([, href]) => Boolean(href));

  if (!links.length) return '';

  return `
    <h3 class="section-title" style="font-size: 1.2rem; margin-bottom: 12px;">Where to watch / follow</h3>
    <div style="display:flex; flex-wrap:wrap; gap: 10px;">
      ${links.map(([label, href]) => `<a href="${href}" target="_blank" rel="noreferrer" class="btn-outline">${label}</a>`).join('')}
    </div>
  `;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUpcomingPage);
} else {
  initUpcomingPage();
}
