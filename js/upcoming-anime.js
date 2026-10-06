import { onAuthStateChanged } from 'firebase/auth';
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
import { auth } from './auth-init.js';
import { verifyAdminStatus } from './auth.js';
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
    loadUpcomingDetail(path, new URLSearchParams(window.location.search).get('preview') === '1');
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
    const snapshot = await getDocs(query(
      collection(db, 'upcomingAnime'),
      where('status', '==', 'published'),
      limit(200)
    ));
    allPublishedUpcoming = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }));
    renderUpcomingDirectory();
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    container.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Unable to load upcoming anime right now. Please try again later.</p></div>';
  }
}

async function loadUpcomingDetail(slug, preview = false) {
  const detailRoot = document.getElementById('upcomingDetail');
  const directoryRoot = document.getElementById('upcomingAnimeSections');
  if (!detailRoot) return;

  if (!isConfigured || !db) {
    detailRoot.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Upcoming anime details are unavailable until Firebase is configured.</p></div>';
    return;
  }

  try {
    if (preview) {
      const user = auth?.currentUser || await getInitialAuthUser();
      if (!user || !await verifyAdminStatus(user)) {
        detailRoot.innerHTML = '<div class="empty-state"><p class="empty-state-desc">Admin permission required to preview this upcoming anime.</p></div>';
        return;
      }
    }

    const constraints = [where('slug', '==', slug)];
    if (!preview) constraints.push(where('status', '==', 'published'));
    constraints.push(limit(1));
    const snapshot = await getDocs(query(collection(db, 'upcomingAnime'), ...constraints));

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

function getInitialAuthUser() {
  if (!auth) return Promise.resolve(null);
  return new Promise(resolve => {
    let initialized = false;
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, user => {
      initialized = true;
      unsubscribe();
      resolve(user);
    });
    if (initialized) unsubscribe();
  });
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
    const message = activeFilters.query
      ? 'No anime found matching your search.'
      : 'No upcoming anime found.';
    container.innerHTML = `<div class="empty-state"><p class="empty-state-desc">${message}</p></div>`;
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
    const aDate = getReleaseSortValue(a.releaseDate);
    const bDate = getReleaseSortValue(b.releaseDate);
    return aDate - bDate;
  });
}

function getReleaseSortValue(value) {
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
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

  meta.forEach(([attrKey, attrValue, content]) => setMeta(attrKey, attrValue, content));
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = getUpcomingAnimeCanonicalUrl(anime);

  const imageUrl = getSafeExternalUrl(anime.poster || anime.coverImage) || '/favicon.svg';
  const shareImage = getSafeExternalUrl(imageUrl);
  if (shareImage) {
    setMeta('property', 'og:image', shareImage);
    setMeta('name', 'twitter:image', shareImage);
  }
  const info = document.createElement('div');
  info.className = 'anime-detail-information';
  const metaInfo = document.createElement('div');
  metaInfo.className = 'card-meta';
  const releaseStatus = document.createElement('span');
  releaseStatus.textContent = anime.releaseStatus || 'TBA';
  const season = document.createElement('span');
  season.textContent = [anime.season || 'TBA', anime.releaseYear].filter(Boolean).join(' ');
  metaInfo.append(releaseStatus, season);

  const heading = document.createElement('h1');
  heading.className = 'section-title';
  heading.style.cssText = 'font-size:clamp(2rem,4vw,3rem);margin:0 0 12px;';
  heading.textContent = title;
  info.append(metaInfo, heading);
  if (anime.japaneseTitle) {
    const japaneseTitle = document.createElement('p');
    japaneseTitle.style.cssText = 'color:var(--text-muted);margin-bottom:16px;';
    japaneseTitle.textContent = anime.japaneseTitle;
    info.appendChild(japaneseTitle);
  }

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px;';
  const myListButton = document.createElement('button');
  myListButton.type = 'button';
  myListButton.className = 'btn-outline my-list-toggle-btn';
  myListButton.dataset.kind = 'upcoming';
  myListButton.setAttribute('aria-pressed', 'false');
  buttonRow.appendChild(myListButton);
  info.appendChild(buttonRow);

  const facts = document.createElement('dl');
  facts.className = 'anime-facts';
  [
    ['Release Date', anime.releaseDate || 'TBA'],
    ['Season', anime.season || 'TBA'],
    ['Year', anime.releaseYear || 'TBA'],
    ['Type', anime.type || 'TBA'],
    ['Genres', Array.isArray(anime.genres) && anime.genres.length ? anime.genres.join(', ') : '—'],
    ['Studio', anime.studio || '—'],
    ['Source', anime.source || '—'],
    ['Episodes', anime.episodes || 'TBA'],
    ['Duration', anime.duration || '—'],
    ['Age Rating', anime.ageRating || '—'],
    ...(anime.rating !== undefined && anime.rating !== '' ? [['Rating', anime.rating]] : []),
  ].forEach(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = String(value);
    facts.append(term, description);
  });
  info.appendChild(facts);

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
  const descriptionParagraph = document.createElement('p');
  descriptionParagraph.style.whiteSpace = 'pre-wrap';
  descriptionParagraph.textContent = anime.description || anime.shortDescription || 'No description provided yet.';
  description.appendChild(descriptionParagraph);
  detail.appendChild(description);

  const trailerUrl = getYouTubeEmbedUrl(anime.trailerUrl);
  if (trailerUrl) {
    const trailerWrap = document.createElement('div');
    trailerWrap.style.marginTop = '24px';
    const trailerHeading = document.createElement('h3');
    trailerHeading.className = 'section-title';
    trailerHeading.style.cssText = 'font-size:1.3rem;margin-bottom:10px;';
    trailerHeading.textContent = 'Trailer';
    const trailerFrame = document.createElement('iframe');
    trailerFrame.src = trailerUrl;
    trailerFrame.title = `${title} trailer`;
    trailerFrame.loading = 'lazy';
    trailerFrame.referrerPolicy = 'strict-origin-when-cross-origin';
    trailerFrame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    trailerFrame.allowFullscreen = true;
    trailerFrame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
    const trailerFrameWrap = document.createElement('div');
    trailerFrameWrap.style.cssText = 'position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:18px;background:#0b0f18;';
    trailerFrameWrap.appendChild(trailerFrame);
    trailerWrap.append(trailerHeading, trailerFrameWrap);
    detail.appendChild(trailerWrap);
  }

  const externalLinks = buildExternalLinks(anime);
  if (externalLinks) detail.appendChild(externalLinks);

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
  ].map(([label, href]) => [label, getSafeExternalUrl(href)])
    .filter(([, href]) => Boolean(href));

  if (!links.length) return '';

  const section = document.createElement('section');
  section.style.marginTop = '20px';
  const heading = document.createElement('h3');
  heading.className = 'section-title';
  heading.style.cssText = 'font-size:1.2rem;margin-bottom:12px;';
  heading.textContent = 'Where to watch / follow';
  const linkList = document.createElement('div');
  linkList.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
  links.forEach(([label, href]) => {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'btn-outline';
    link.textContent = label;
    linkList.appendChild(link);
  });
  section.append(heading, linkList);
  return section;
}

function getSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function getYouTubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    let videoId = '';
    if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      videoId = url.pathname === '/watch'
        ? url.searchParams.get('v') || ''
        : url.pathname.startsWith('/embed/')
          ? url.pathname.split('/')[2]
          : '';
    } else if (url.hostname === 'youtu.be') {
      videoId = url.pathname.slice(1);
    }
    return /^[A-Za-z0-9_-]{11}$/.test(videoId)
      ? `https://www.youtube-nocookie.com/embed/${videoId}`
      : '';
  } catch {
    return '';
  }
}

function setMeta(attribute, name, content) {
  let element = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = content;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUpcomingPage);
} else {
  initUpcomingPage();
}
