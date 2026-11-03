import { setupMobileNav } from './ui.js';
import {
  getManhwaDetailsBySlug,
  getManhwaDiscovery,
  getManhwaPath,
  getManhwaSlug,
  getCountryName,
  searchManhwa,
} from './manhwa-service.js';
import { createManhwaDetailStructuredData, createManhwaStructuredData } from './manhwa-seo.js';
import {
  renderFeaturedManhwa,
  renderLoading,
  renderManhwaCards,
  renderManhwaDetails,
  renderMessage,
} from './manhwa-renderer.js';

const SEARCH_DEBOUNCE_MS = 450;
const PAGE_SIZE = 24;
let selectedGenre = '';
let selectedCountry = '';
let selectedContentType = '';
let currentPage = 1;
let currentQuery = '';
let latestSearchId = 0;
let searchTimer = 0;
let latestPagination = {};

function byId(id) {
  return document.getElementById(id);
}

function setMeta(attribute, key, content) {
  let meta = document.querySelector(`meta[${attribute}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  meta.content = String(content || '').slice(0, 1000);
}

function setCanonical(url) {
  const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = new URL(url, window.location.origin).toString();
  if (!canonical.isConnected) document.head.appendChild(canonical);
}

function setStructuredData(data) {
  let node = byId('manhwaJsonLd');
  if (!node) {
    node = document.createElement('script');
    node.id = 'manhwaJsonLd';
    node.type = 'application/ld+json';
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
}

function setPageMeta({ title, description, canonical, image = '' }) {
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:image', image || 'https://www.animoro.in/logo.png');
  setMeta('property', 'og:image:alt', image ? `${document.title} cover art` : 'Animoro');
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', image || 'https://www.animoro.in/logo.png');
  setCanonical(canonical);
}

function setFreshness(message) {
  const note = byId(byId('manhwaDetailPage')?.hidden ? 'manhwaLandingFreshnessNote' : 'manhwaDetailFreshnessNote');
  if (!note) return;
  note.textContent = message;
  note.hidden = !message;
}

function getDataNotice({ stale = false, sourceErrors = [] } = {}) {
  const notices = [];
  if (stale) notices.push('Showing recently cached metadata while a live API reconnects.');
  if (sourceErrors.length) {
    const sources = [...new Set(sourceErrors.map(item => item.source))].join(' and ');
    notices.push(`${sources} metadata is temporarily unavailable; results may be incomplete.`);
  }
  return notices.join(' ');
}

function showSearchLoading() {
  const container = byId('manhwaSearchResults');
  if (container) renderLoading(container, 'Searching comic recommendations');
  const status = byId('manhwaSearchStatus');
  if (status) status.textContent = 'Searching…';
}

function updatePagination() {
  const previous = byId('manhwaPrevious');
  const next = byId('manhwaNext');
  const status = byId('manhwaPageStatus');
  if (previous) previous.hidden = currentPage <= 1;
  if (next) next.hidden = !latestPagination?.hasNextPage;
  if (status) status.textContent = latestPagination?.currentPage
    ? `Page ${latestPagination.currentPage}`
    : '';
}

function updateCountryOptions(countries = []) {
  const select = byId('manhwaCountryFilter');
  if (!select) return;
  for (const country of countries) {
    if (!/^[A-Z]{2}$/.test(country) || [...select.options].some(option => option.value === country)) continue;
    const option = document.createElement('option');
    option.value = country;
    option.textContent = getCountryName(country);
    select.appendChild(option);
  }
}

async function runSearch(page = 1) {
  const container = byId('manhwaSearchResults');
  if (!container) return;
  const requestId = ++latestSearchId;
  currentPage = page;
  currentQuery = byId('manhwaSearchInput')?.value.trim() || '';
  showSearchLoading();

  try {
    const result = await searchManhwa({
      query: currentQuery,
      genre: selectedGenre,
      country: selectedCountry,
      contentType: selectedContentType,
      page,
      perPage: PAGE_SIZE,
    });
    if (requestId !== latestSearchId) return;
    updateCountryOptions(result.countries);
    latestPagination = result.pagination;
    renderManhwaCards(container, result.items, 'No comics matched this search and filter combination. Try another title or filter.');
    const status = byId('manhwaSearchStatus');
    if (status) status.textContent = result.items.length
      ? `${result.items.length} comic recommendations shown.`
      : 'No results found.';
    setFreshness(getDataNotice(result));
  } catch (error) {
    if (requestId !== latestSearchId) return;
    console.warn('Comic search failed.', error);
    renderMessage(container, 'Comic search is temporarily unavailable. Please retry.', () => runSearch(currentPage));
    const status = byId('manhwaSearchStatus');
    if (status) status.textContent = 'Search could not be completed.';
    setFreshness('');
  } finally {
    if (requestId === latestSearchId) updatePagination();
  }
}

function scheduleSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => runSearch(1), SEARCH_DEBOUNCE_MS);
}

function setGenre(genre) {
  window.clearTimeout(searchTimer);
  selectedGenre = selectedGenre === genre ? '' : genre;
  document.querySelectorAll('[data-manhwa-genre]').forEach(button => {
    const active = button.dataset.manhwaGenre === selectedGenre;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  runSearch(1);
}

function setCountry(country) {
  selectedCountry = country;
  runSearch(1);
}

function setContentType(contentType) {
  selectedContentType = contentType;
  runSearch(1);
}

function setPageLandingState() {
  const landing = byId('manhwaLanding');
  const details = byId('manhwaDetailPage');
  if (landing) landing.hidden = false;
  if (details) details.hidden = true;
  setPageMeta({
    title: 'Discover Comics, Manga & Webcomics | Animoro',
    description: 'Discover comics and webcomics from Korea, Japan, China, the United States, and beyond. Explore recommendations, genres, and country of origin.',
    canonical: 'https://www.animoro.in/manhwa',
  });
}

function renderDiscovery(data) {
  updateCountryOptions(data.countries);
  renderFeaturedManhwa(byId('manhwaFeatured'), data.featured, { eager: true });
  renderManhwaCards(byId('manhwaTrending'), data.trending);
  byId('manhwaTrendingSection').hidden = !data.trending.length;
  renderManhwaCards(byId('manhwaPopular'), data.popular);
  renderManhwaCards(byId('manhwaRecommended'), data.recommended,
    'AniList has no similar comic recommendations for this title right now.');
  renderManhwaCards(byId('manhwaRecent'), data.recent);
  latestPagination = data.pagination;
  renderManhwaCards(byId('manhwaSearchResults'), data.results);
  const status = byId('manhwaSearchStatus');
  if (status) status.textContent = `${data.results.length} comic recommendations shown.`;
  setFreshness(getDataNotice(data));
  updatePagination();
  setStructuredData(createManhwaStructuredData(data.featured));
}

async function loadLanding() {
  setPageLandingState();
  try {
    const data = await getManhwaDiscovery();
    renderDiscovery(data);
  } catch (error) {
    console.warn('Comic discovery could not be loaded.', error);
    for (const id of ['manhwaFeatured', 'manhwaTrending', 'manhwaPopular', 'manhwaRecommended', 'manhwaRecent', 'manhwaSearchResults']) {
      const container = byId(id);
      if (container) renderMessage(container, 'Comic recommendations are temporarily unavailable. Please retry.', loadLanding);
    }
  }
}

function updateDetailMetadata(manhwa) {
  const title = `${manhwa.title} — ${manhwa.contentType} Details | Animoro`;
  const origin = manhwa.countryName ? ` Country of origin: ${manhwa.countryName}.` : '';
  const description = manhwa.synopsis || `Discover ${manhwa.title}, a ${manhwa.contentType.toLowerCase()} recommendation.${origin} Explore its genres, creators, publication status, and official platform.`;
  const canonical = `https://www.animoro.in${getManhwaPath(manhwa)}`;
  setPageMeta({ title, description, canonical, image: manhwa.coverImage });
  setStructuredData(createManhwaDetailStructuredData({
    ...manhwa,
    slug: getManhwaSlug(manhwa),
  }));
}

async function loadDetails(slug) {
  byId('manhwaLanding').hidden = true;
  byId('manhwaDetailPage').hidden = false;
  byId('manhwaRecommendationsSection').hidden = true;
  renderLoading(byId('manhwaDetailContainer'), 'Loading manhwa details');
  setPageMeta({
    title: 'Comic Details | Animoro',
    description: 'Explore comic metadata, country of origin, and official publishing platforms on Animoro.',
    canonical: `https://www.animoro.in/manhwa/${encodeURIComponent(slug)}`,
  });

  try {
    const result = await getManhwaDetailsBySlug(slug);
    const canonicalPath = getManhwaPath(result.item);
    if (window.location.pathname !== canonicalPath) {
      window.history.replaceState(window.history.state, '', canonicalPath);
    }
    renderManhwaDetails(byId('manhwaDetailContainer'), result.item);
    updateDetailMetadata(result.item);
    const recommendations = result.recommendations.slice(0, 8);
    if (recommendations.length) {
      renderManhwaCards(byId('manhwaRecommendations'), recommendations);
    } else {
      renderManhwaCards(
        byId('manhwaRecommendations'),
        [],
        'Related-comic recommendations are not available from this metadata provider yet.'
      );
    }
    byId('manhwaRecommendationsSection').hidden = false;
    const breadcrumb = byId('manhwaBreadcrumbCurrentDetail');
    if (breadcrumb) breadcrumb.textContent = result.item.title;
    setFreshness(result.stale ? 'Showing recently cached comic metadata while the live API reconnects.' : '');
  } catch (error) {
    console.warn('Comic details could not be loaded.', error);
    if (Number(error?.status) === 404) {
      window.location.replace('/404.html');
      return;
    }
    renderMessage(byId('manhwaDetailContainer'), 'This comic recommendation page is temporarily unavailable. Please try again.', () => loadDetails(slug));
  }
}

function bindSearch() {
  const form = byId('manhwaSearchForm');
  const input = byId('manhwaSearchInput');
  form?.addEventListener('submit', event => {
    event.preventDefault();
    window.clearTimeout(searchTimer);
    runSearch(1);
  });
  input?.addEventListener('input', scheduleSearch);
  document.querySelectorAll('[data-manhwa-genre]').forEach(button => {
    button.addEventListener('click', () => setGenre(button.dataset.manhwaGenre || ''));
  });
  byId('manhwaCountryFilter')?.addEventListener('change', event => setCountry(event.target.value));
  byId('manhwaContentTypeFilter')?.addEventListener('change', event => setContentType(event.target.value));
  byId('manhwaPrevious')?.addEventListener('click', () => runSearch(Math.max(1, currentPage - 1)));
  byId('manhwaNext')?.addEventListener('click', () => runSearch(currentPage + 1));
}

async function initManhwaPage() {
  setupMobileNav();
  bindSearch();
  const path = window.location.pathname.replace(/\/+$/, '');
  const detailPrefix = path.startsWith('/manhwa/') ? '/manhwa/' : path.startsWith('/manhwa.html/') ? '/manhwa.html/' : '';
  if (detailPrefix) {
    const encodedSlug = path.slice(detailPrefix.length);
    let slug = '';
    try {
      slug = decodeURIComponent(encodedSlug);
    } catch {
      window.location.replace('/404.html');
      return;
    }
    if (!slug || slug.includes('/') || slug.includes('\\')) {
      window.location.replace('/404.html');
      return;
    }
    await loadDetails(slug);
    return;
  }
  await loadLanding();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initManhwaPage, { once: true });
} else {
  initManhwaPage();
}
