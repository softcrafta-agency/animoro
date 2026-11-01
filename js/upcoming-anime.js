import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { setupMobileNav, createUpcomingAnimeCard } from './ui.js';
import { attachMyListToggle, showPendingMyListActionNotice } from './my-list.js';
import { getUpcomingAnimeCanonicalUrl } from './upcoming-url.js';
import { formatUpcomingReleaseDate, getUpcomingReleaseTimestamp } from './upcoming-date.js';
import { getUpcomingAnime, searchUpcomingAnime } from './jikan-service.js';

const PAGE_SIZE = 24;
let currentPage = 1;
let pagination = {};
let searchTimer = 0;
let loading = false;

function getRequestedUpcomingSlug() {
  const pathname = window.location.pathname;
  const prefix = pathname.startsWith('/upcoming-anime/') ? '/upcoming-anime/' : pathname.startsWith('/upcoming-anime.html/') ? '/upcoming-anime.html/' : '';
  if (!prefix) return '';
  const value = pathname.slice(prefix.length);
  if (!value || value.includes('/')) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function getFilters() {
  return {
    query: document.getElementById('upcomingSearchInput')?.value.trim() || '',
    year: document.getElementById('upcomingYearFilter')?.value || 'all',
    season: document.getElementById('upcomingSeasonFilter')?.value || 'all',
    type: document.getElementById('upcomingTypeFilter')?.value || 'all',
    genre: document.getElementById('upcomingGenreFilter')?.value || 'all',
    sort: document.getElementById('upcomingSortFilter')?.value || 'release-date',
  };
}

function setDataNote(message) {
  const note = document.getElementById('upcomingDataNote');
  if (note) note.textContent = message;
}

function renderMessage(container, message, onRetry = null) {
  container.replaceChildren();
  const state = document.createElement('div');
  state.className = 'empty-state';
  state.style.gridColumn = '1 / -1';
  const paragraph = document.createElement('p');
  paragraph.className = 'empty-state-desc';
  paragraph.textContent = message;
  state.appendChild(paragraph);
  if (onRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn-outline';
    retry.textContent = 'Retry';
    retry.addEventListener('click', onRetry);
    state.appendChild(retry);
  }
  container.appendChild(state);
}

function renderLoading(container) {
  container.innerHTML = '<div class="home-loading-state" role="status" aria-label="Loading upcoming anime"><span class="home-loading-line"></span><span class="home-loading-line"></span></div>';
}

function updatePagination() {
  const previous = document.getElementById('previousUpcomingBtn');
  const next = document.getElementById('nextUpcomingBtn');
  const status = document.getElementById('upcomingPageStatus');
  if (previous) previous.hidden = currentPage <= 1;
  if (next) next.hidden = !pagination?.has_next_page;
  if (status) status.textContent = pagination ? `Page ${currentPage}` : '';
}

async function loadManualUpcoming() {
  if (!isConfigured || !db) return [];
  try {
    const snapshot = await getDocs(query(collection(db, 'upcomingAnime'), where('status', '==', 'published'), limit(120)));
    return snapshot.docs.map(document => ({ id: document.id, dataSource: 'manual', ...document.data() }));
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    return [];
  }
}

function matchesFilters(item, filters) {
  const text = [item.title, item.japaneseTitle, item.shortDescription, item.description, ...(item.genres || [])].join(' ').toLowerCase();
  const queryMatches = !filters.query || text.includes(filters.query.toLowerCase());
  const yearMatches = filters.year === 'all' || String(item.releaseYear || '') === filters.year;
  const seasonMatches = filters.season === 'all' || String(item.season || '').toLowerCase() === filters.season.toLowerCase();
  const typeMatches = filters.type === 'all' || String(item.type || '').toLowerCase() === filters.type.toLowerCase();
  const genreMatches = filters.genre === 'all' || (item.genres || []).some(genre => String(genre).toLowerCase() === filters.genre.toLowerCase());
  return queryMatches && yearMatches && seasonMatches && typeMatches && genreMatches;
}

function sortUpcoming(items, sort) {
  return [...items].sort((left, right) => {
    if (sort === 'a-z') return String(left.title || '').localeCompare(String(right.title || ''));
    if (sort === 'popularity') return Number(right.scoredBy || 0) - Number(left.scoredBy || 0);
    if (sort === 'rating') return Number(right.rating || 0) - Number(left.rating || 0);
    return getUpcomingReleaseTimestamp(left.releaseDate) - getUpcomingReleaseTimestamp(right.releaseDate) || String(left.title || '').localeCompare(String(right.title || ''));
  });
}

function renderVerifiedAnnouncements(entries, filters) {
  const section = document.getElementById('verifiedUpcomingSection');
  const container = document.getElementById('verifiedUpcomingContainer');
  if (!section || !container) return;
  const filtered = sortUpcoming(entries.filter(item => matchesFilters(item, filters)), filters.sort).slice(0, 12);
  section.hidden = !filtered.length;
  container.replaceChildren(...filtered.map(createUpcomingAnimeCard));
}

async function loadUpcomingDirectory(page = 1) {
  const container = document.getElementById('upcomingAnimeSections');
  if (!container || loading) return;
  loading = true;
  currentPage = page;
  const filters = getFilters();
  renderLoading(container);

  const [manualResult, apiResult] = await Promise.allSettled([
    loadManualUpcoming(),
    filters.query ? searchUpcomingAnime({ page, limit: PAGE_SIZE, query: filters.query, type: filters.type === 'all' ? '' : filters.type.toLowerCase() }) : getUpcomingAnime({ page, limit: PAGE_SIZE }),
  ]);
  const manual = manualResult.status === 'fulfilled' ? manualResult.value : [];
  renderVerifiedAnnouncements(manual, filters);

  if (apiResult.status === 'fulfilled') {
    const result = apiResult.value;
    const entries = sortUpcoming(result.items.filter(item => matchesFilters(item, filters)), filters.sort);
    pagination = result.pagination || {};
    if (entries.length) container.replaceChildren(...entries.map(createUpcomingAnimeCard));
    else renderMessage(container, 'No upcoming anime on this page match your filters. Try another filter or page.');
    setDataNote(result.stale
      ? 'Showing recently cached Jikan results while the live source reconnects. Release dates may change.'
      : 'Release information is supplied by Jikan. Editor-verified announcements are marked separately; “TBA” means no release date is currently available from the source.');
  } else if (manual.length) {
    pagination = { has_next_page: false };
    renderMessage(container, 'The live upcoming-anime database is temporarily unavailable. See the verified announcements above.');
    setDataNote('Jikan is temporarily unavailable. Editor-managed announcements remain available.');
  } else {
    pagination = { has_next_page: false };
    renderMessage(container, 'Upcoming anime data is temporarily unavailable. Please retry in a moment.', () => loadUpcomingDirectory(currentPage));
    setDataNote('Jikan is unavailable and no editor-managed announcements are currently published.');
  }
  loading = false;
  updatePagination();
}

function getSafeExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
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
  element.content = String(content).slice(0, 1000);
}

async function loadUpcomingDetail(slug, preview = false) {
  const detail = document.getElementById('upcomingDetail');
  const controls = document.getElementById('upcomingFilters');
  const database = document.getElementById('upcomingAnimeSections')?.closest('section');
  const verified = document.getElementById('verifiedUpcomingSection');
  if (!detail) return;
  if (controls) controls.hidden = true;
  if (database) database.hidden = true;
  if (verified) verified.hidden = true;
  document.getElementById('upcomingPagination')?.setAttribute('hidden', '');

  if (!isConfigured || !db) {
    renderMessage(detail, 'This editor-managed announcement is unavailable right now.');
    return;
  }
  try {
    if (preview) {
      const [{ auth }, { verifyAdminStatus }] = await Promise.all([import('./auth-init.js'), import('./auth.js')]);
      if (!auth?.currentUser || !await verifyAdminStatus(auth.currentUser)) {
        renderMessage(detail, 'Admin permission is required to preview this announcement.');
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
    renderUpcomingDetail({ id: snapshot.docs[0].id, dataSource: 'manual', ...snapshot.docs[0].data() });
  } catch (error) {
    handleFirestoreError(error, 'fetch', `upcomingAnime/${slug}`);
    renderMessage(detail, 'Unable to load this upcoming anime page. Please try again later.');
  }
}

function renderUpcomingDetail(anime) {
  const detail = document.getElementById('upcomingDetail');
  if (!detail) return;
  const title = anime.title || 'Upcoming Anime';
  const canonicalUrl = getUpcomingAnimeCanonicalUrl(anime);
  document.title = `${title} — Release Information | Animoro`;
  setMeta('name', 'description', anime.shortDescription || `Release information for ${title}.`);
  setMeta('property', 'og:title', `${title} — Release Information | Animoro`);
  setMeta('property', 'og:description', anime.shortDescription || `Release information for ${title}.`);
  setMeta('property', 'og:url', canonicalUrl);
  const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = canonicalUrl;
  if (!canonical.isConnected) document.head.appendChild(canonical);

  detail.replaceChildren();
  const poster = getSafeExternalUrl(anime.poster || anime.coverImage);
  if (poster) {
    const image = document.createElement('img');
    image.className = 'anime-detail-cover';
    image.src = poster;
    image.alt = `${title} poster`;
    image.width = 600;
    image.height = 900;
    image.loading = 'eager';
    image.addEventListener('error', () => { image.src = '/favicon.svg'; }, { once: true });
    detail.appendChild(image);
    setMeta('property', 'og:image', poster);
  }

  const info = document.createElement('div');
  info.className = 'anime-detail-information';
  const heading = document.createElement('h1');
  heading.className = 'section-title';
  heading.textContent = title;
  const status = document.createElement('p');
  status.className = 'card-meta';
  status.textContent = anime.releaseStatus || 'Release Date TBA';
  info.append(status, heading);
  if (anime.japaneseTitle) {
    const japanese = document.createElement('p');
    japanese.className = 'card-excerpt';
    japanese.textContent = anime.japaneseTitle;
    info.appendChild(japanese);
  }
  const facts = [
    ['Release date', anime.releaseDate ? formatUpcomingReleaseDate(anime.releaseDate) : 'Release Date TBA'],
    ['Release season', [anime.season, anime.releaseYear].filter(Boolean).join(' ') || 'TBA'],
    ['Type', anime.type || 'TBA'], ['Genres', (anime.genres || []).join(', ') || '—'],
    ['Last verified', anime.lastVerified || 'Not provided'],
  ];
  const list = document.createElement('dl');
  list.className = 'anime-facts';
  facts.forEach(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    list.append(term, definition);
  });
  info.appendChild(list);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-outline';
  button.style.cssText = 'padding:10px 16px;border-radius:999px;';
  attachMyListToggle(button, { ...anime, kind: 'upcoming' });
  info.appendChild(button);
  detail.appendChild(info);

  const description = document.createElement('section');
  description.className = 'article-content';
  const text = document.createElement('p');
  text.textContent = anime.description || anime.shortDescription || 'No description has been published yet.';
  description.appendChild(text);
  if (anime.officialUrl) {
    const link = document.createElement('a');
    link.className = 'btn-outline';
    link.href = anime.officialUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Official announcement / source';
    description.appendChild(link);
  }
  detail.appendChild(description);
}

function bindControls() {
  document.getElementById('upcomingSearchInput')?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadUpcomingDirectory(1), 350);
  });
  ['upcomingYearFilter', 'upcomingSeasonFilter', 'upcomingTypeFilter', 'upcomingGenreFilter', 'upcomingSortFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => loadUpcomingDirectory(1));
  });
  document.getElementById('previousUpcomingBtn')?.addEventListener('click', () => loadUpcomingDirectory(Math.max(1, currentPage - 1)));
  document.getElementById('nextUpcomingBtn')?.addEventListener('click', () => loadUpcomingDirectory(currentPage + 1));
}

function initUpcomingPage() {
  setupMobileNav();
  showPendingMyListActionNotice(document.getElementById('upcomingDetail'), () => window.location.reload());
  const slug = getRequestedUpcomingSlug();
  if (slug) return loadUpcomingDetail(slug, new URLSearchParams(window.location.search).get('preview') === '1');
  bindControls();
  return loadUpcomingDirectory(1);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUpcomingPage, { once: true });
else initUpcomingPage();
