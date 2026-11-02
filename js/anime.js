import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { getAnimeCanonicalUrl, isValidAnimeDetailSlug } from './anime-url.js';
import { createAnimeCard, createArticleCard, setupMobileNav } from './ui.js';
import { attachMyListToggle } from './my-list.js';
import { getAnimeDetails, getAnimeDirectory, getTopAnime } from './anime-api.js';
import { filterAndSortAnime } from './anime-directory.js';

const PAGE_SIZE = 24;
const ARTICLE_SAMPLE_SIZE = 36;
const ANIME_ID_PATTERN = /^(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)--(?<id>[1-9]\d*)$/i;
let currentPage = 1;
let latestPagination = {};
let latestDirectory = null;
let latestDirectoryRequest = 0;
let searchTimer = 0;

function getRequestedAnimeSlug() {
  const pathname = window.location.pathname;
  const prefix = pathname.startsWith('/anime/') ? '/anime/' : pathname.startsWith('/anime.html/') ? '/anime.html/' : '';
  if (!prefix) return '';
  const encoded = pathname.slice(prefix.length);
  if (!encoded || encoded.includes('/')) return '';
  try {
    const slug = decodeURIComponent(encoded);
    return slug.includes('\\') || !isValidAnimeDetailSlug(slug) ? '' : slug;
  } catch {
    return '';
  }
}

function getFilters() {
  return {
    query: document.getElementById('animeSearchInput')?.value.trim() || '',
    type: document.getElementById('animeTypeFilter')?.value || '',
    status: document.getElementById('animeStatusFilter')?.value || '',
    genre: document.getElementById('animeGenreFilter')?.value || '',
    sort: document.getElementById('animeSortFilter')?.value || 'popularity',
  };
}

function setDataNote(message) {
  const note = document.getElementById('animeDataNote');
  if (note) {
    note.textContent = message;
    note.hidden = !message;
  }
}

function setLoading(container, label) {
  container.replaceChildren();
  const state = document.createElement('div');
  state.className = 'home-loading-state';
  state.setAttribute('role', 'status');
  state.setAttribute('aria-label', label);
  state.innerHTML = '<span class="home-loading-line"></span><span class="home-loading-line"></span>';
  container.appendChild(state);
}

function renderMessage(container, message, onRetry = null) {
  container.replaceChildren();
  const state = document.createElement('div');
  state.className = 'empty-state';
  state.style.gridColumn = '1 / -1';
  const text = document.createElement('p');
  text.className = 'empty-state-desc';
  text.textContent = message;
  state.appendChild(text);
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

function updatePagination() {
  const previous = document.getElementById('previousAnimeBtn');
  const next = document.getElementById('loadMoreAnimeBtn');
  const status = document.getElementById('animePageStatus');
  if (previous) previous.hidden = currentPage <= 1;
  if (next) next.hidden = !latestPagination?.has_next_page;
  if (status) status.textContent = latestDirectory ? `Page ${currentPage}` : '';
}

async function loadManualAnime() {
  if (!isConfigured || !db) return [];
  try {
    const snapshot = await getDocs(query(collection(db, 'anime'), where('visibility', '==', 'published'), limit(120)));
    return snapshot.docs.map(document => ({ id: document.id, source: 'manual', ...document.data() }));
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    return [];
  }
}

async function loadAnimeDirectory(page = 1) {
  const container = document.getElementById('animeDirectoryContainer');
  if (!container) return;
  const requestId = ++latestDirectoryRequest;
  currentPage = page;
  const filters = getFilters();
  setLoading(container, 'Loading anime');

  try {
    const result = await getAnimeDirectory({
      page, limit: PAGE_SIZE, query: filters.query, type: filters.type, status: filters.status,
      genre: filters.genre, orderBy: filters.sort,
    });
    if (requestId !== latestDirectoryRequest) return;
    const entries = result.items;
    latestDirectory = 'tenrai';
    latestPagination = result.pagination;
    if (!entries.length) {
      renderMessage(container, filters.genre ? 'No anime on this page match that genre. Try another filter or page.' : 'No anime found. Try a different search or filter.');
    } else {
      container.replaceChildren(...entries.map(createAnimeCard));
    }
    setDataNote(result.stale
      ? 'Showing recently cached Tenrai data while the live service reconnects.'
      : 'Anime catalogue information is supplied by Tenrai. Editor-managed entries remain available if the service is unavailable.');
  } catch (error) {
    if (requestId !== latestDirectoryRequest) return;
    console.warn('Could not load the Tenrai anime directory.', error);
    const manual = filterAndSortAnime(await loadManualAnime(), filters);
    if (requestId !== latestDirectoryRequest) return;
    latestDirectory = 'manual';
    latestPagination = { has_next_page: false };
    if (!manual.length) {
      renderMessage(container, 'The anime database is temporarily unavailable. Please retry in a moment.', () => loadAnimeDirectory(currentPage));
      setDataNote('Tenrai is unavailable and no cached or editor-managed results match this view.');
    } else {
      container.replaceChildren(...manual.slice(0, PAGE_SIZE).map(createAnimeCard));
      setDataNote('The live anime database is temporarily unavailable. Showing editor-managed catalogue entries.');
    }
  } finally {
    if (requestId === latestDirectoryRequest) updatePagination();
  }
}

async function loadTopAnime() {
  const container = document.getElementById('popularAnimeContainer');
  if (!container) return;
  try {
    const result = await getTopAnime(6);
    if (!result.items.length) throw new Error('No top anime returned.');
    container.replaceChildren(...result.items.map(createAnimeCard));
  } catch (error) {
    console.warn('Could not load Tenrai top-rated anime.', error);
    const manual = (await loadManualAnime()).filter(item => Number.isFinite(Number(item.rating)) && Number(item.rating) > 0)
      .sort((left, right) => Number(right.rating) - Number(left.rating)).slice(0, 6);
    if (manual.length) container.replaceChildren(...manual.map(createAnimeCard));
    else renderMessage(container, 'Top-rated anime are unavailable right now.', loadTopAnime);
  }
}

async function loadManualAnimeDetail(slug) {
  if (!isConfigured || !db) return null;
  const snapshot = await getDocs(query(collection(db, 'anime'), where('visibility', '==', 'published'), where('slug', '==', slug), limit(1)));
  return snapshot.empty ? null : { id: snapshot.docs[0].id, source: 'manual', ...snapshot.docs[0].data() };
}

async function loadAnimeDetails(slug) {
  const directory = document.getElementById('animeDirectoryContainer');
  const detail = document.getElementById('animeDetail');
  const popular = document.getElementById('popularAnimeSection');
  const directorySection = document.getElementById('animeDirectorySection');
  const controls = document.getElementById('animeDirectoryControls');
  if (!detail || !directory) return;
  directory.hidden = true;
  if (directorySection) directorySection.hidden = true;
  if (popular) popular.hidden = true;
  if (controls) controls.hidden = true;
  document.getElementById('animePagination')?.setAttribute('hidden', '');

  try {
    const match = ANIME_ID_PATTERN.exec(slug);
    let anime;
    let stale = false;
    if (match?.groups?.id) ({ anime, stale } = await getAnimeDetails(match.groups.id));
    else anime = await loadManualAnimeDetail(slug);
    if (!anime) {
      window.location.replace('/404.html');
      return;
    }
    renderAnimeDetails(anime, stale);
    await loadAnimeArticles(anime);
  } catch (error) {
    console.warn('Could not load anime detail.', error);
    let fallback = null;
    try {
      fallback = await loadManualAnimeDetail(slug);
    } catch (manualError) {
      handleFirestoreError(manualError, 'fetch', `anime/${slug}`);
    }
    if (fallback) {
      renderAnimeDetails(fallback, false);
      await loadAnimeArticles(fallback);
      return;
    }
    if (Number(error?.status) === 404) {
      window.location.replace('/404.html');
      return;
    }
    renderMessage(directory, 'This anime page is temporarily unavailable. Please try again later.', () => loadAnimeDetails(slug));
    directory.hidden = false;
  }
}

function appendText(parent, label, value) {
  if (!value) return;
  const block = document.createElement('section');
  block.className = 'anime-detail-copy';
  const heading = document.createElement('h3');
  heading.textContent = label;
  const text = document.createElement('p');
  text.textContent = value;
  block.append(heading, text);
  parent.appendChild(block);
}

function safeImageUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function setMeta(attribute, name, content) {
  let meta = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  meta.content = String(content).slice(0, 1000);
}

function setCanonical(url) {
  const canonical = document.querySelector('link[rel="canonical"]') || document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = url;
  if (!canonical.isConnected) document.head.appendChild(canonical);
}

function setJsonLd(id, value) {
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('script');
    node.id = id;
    node.type = 'application/ld+json';
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(value).replace(/</g, '\\u003c');
}

function renderAnimeListStructuredData() {
  setJsonLd('animeListJsonLd', {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: 'Anime List – Explore Anime Series and Details',
        description: 'Browse the anime list by title, genre, type, or status. Explore popular titles, ratings, and detailed series information to find your next watch.',
        url: 'https://www.animoro.in/anime-list',
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.animoro.in/' },
          { '@type': 'ListItem', position: 2, name: 'Anime List', item: 'https://www.animoro.in/anime-list' },
        ],
      },
    ],
  });
}

function renderAnimeDetails(anime, stale) {
  const detail = document.getElementById('animeDetail');
  const title = document.getElementById('animePageTitle');
  const description = document.getElementById('animePageDescription');
  const breadcrumb = document.getElementById('animeBreadcrumbCurrent');
  const banner = document.getElementById('animeBanner');
  if (!detail || !title || !description) return;
  const canonicalUrl = getAnimeCanonicalUrl(anime);
  const imageUrl = safeImageUrl(anime.coverImage);
  title.textContent = anime.title || 'Anime';
  description.textContent = anime.synopsis || 'Anime information and related Animoro articles.';
  if (breadcrumb) breadcrumb.textContent = anime.title || 'Anime';
  document.title = `${anime.title || 'Anime'} — Anime Details | Animoro`;
  setMeta('name', 'description', anime.synopsis || `Anime details for ${anime.title || 'this series'} on Animoro.`);
  setMeta('property', 'og:title', `${anime.title || 'Anime'} — Anime Details | Animoro`);
  setMeta('property', 'og:description', anime.synopsis || `Anime details for ${anime.title || 'this series'} on Animoro.`);
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('property', 'og:type', 'website');
  if (imageUrl) setMeta('property', 'og:image', imageUrl);
  setCanonical(canonicalUrl);
  if (banner) banner.hidden = true;

  detail.replaceChildren();
  if (imageUrl) {
    const image = document.createElement('img');
    image.className = 'anime-detail-cover';
    image.src = imageUrl;
    image.alt = `${anime.title || 'Anime'} poster`;
    image.width = 600;
    image.height = 900;
    image.loading = 'eager';
    image.decoding = 'async';
    image.addEventListener('error', () => { image.src = '/favicon.svg'; }, { once: true });
    detail.appendChild(image);
  }

  const information = document.createElement('div');
  information.className = 'anime-detail-information';
  const infoTitle = document.createElement('h2');
  infoTitle.textContent = anime.title || 'Anime';
  information.appendChild(infoTitle);
  appendText(information, 'Alternative titles', Array.isArray(anime.alternativeTitles) ? anime.alternativeTitles.join(' · ') : '');
  appendText(information, 'Synopsis', anime.synopsis);
  appendText(information, 'Genres', Array.isArray(anime.genres) ? anime.genres.join(' · ') : '');
  appendText(information, 'Themes', Array.isArray(anime.themes) ? anime.themes.join(' · ') : '');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-outline';
  button.style.cssText = 'padding:10px 16px;border-radius:999px;margin-bottom:16px;';
  attachMyListToggle(button, { ...anime, kind: 'anime' });
  information.appendChild(button);

  const facts = [
    ['Type', anime.type], ['Status', anime.status], ['Season', anime.season], ['Release year', anime.releaseYear],
    ['Episodes', anime.episodes], ['Score', anime.rating ? `${anime.rating}${anime.scoredBy ? ` (${anime.scoredBy.toLocaleString()} ratings)` : ''}` : '—'],
    ['Studio', anime.studio], ['Source material', anime.sourceMaterial || anime.source], ['Age rating', anime.ageRating],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (facts.length) {
    const list = document.createElement('dl');
    list.className = 'anime-facts';
    facts.forEach(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const definition = document.createElement('dd');
      definition.textContent = String(value);
      list.append(term, definition);
    });
    information.appendChild(list);
  }
  detail.appendChild(information);

  if (stale) {
    const attribution = document.createElement('p');
    attribution.className = 'anime-data-note';
    attribution.textContent = 'Showing cached data from Tenrai while the live service reconnects.';
    detail.appendChild(attribution);
  }
  detail.hidden = false;
  setJsonLd('animeBreadcrumbJsonLd', {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.animoro.in/' },
      { '@type': 'ListItem', position: 2, name: 'Anime List', item: 'https://www.animoro.in/anime-list' },
      { '@type': 'ListItem', position: 3, name: anime.title || 'Anime', item: canonicalUrl },
    ],
  });
}

async function loadAnimeArticles(anime) {
  const section = document.getElementById('animeArticleSection');
  const container = document.getElementById('animeArticles');
  if (!section || !container || !isConfigured || !db) return;
  try {
    const snapshot = await getDocs(query(collection(db, 'posts'), where('status', '==', 'published'), limit(ARTICLE_SAMPLE_SIZE)));
    const title = String(anime.title || '').toLowerCase();
    const tags = new Set((anime.genres || []).map(value => String(value).toLowerCase()));
    const related = snapshot.docs.map(document => ({ id: document.id, ...document.data() }))
      .map(post => {
        const postTags = Array.isArray(post.tags) ? post.tags.map(tag => String(tag).toLowerCase()) : [];
        const score = (title && String(post.title || '').toLowerCase().includes(title) ? 30 : 0) + postTags.filter(tag => tags.has(tag)).length * 10;
        return { post, score };
      })
      .filter(entry => entry.score > 0).sort((left, right) => right.score - left.score).slice(0, 6);
    container.replaceChildren(...related.map(({ post }) => createArticleCard(post.id, post)));
    section.hidden = !related.length;
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    section.hidden = true;
  }
}

function bindDirectoryControls() {
  const search = document.getElementById('animeSearchInput');
  search?.addEventListener('input', () => {
    latestDirectoryRequest += 1;
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => loadAnimeDirectory(1), 350);
  });
  ['animeTypeFilter', 'animeStatusFilter', 'animeGenreFilter', 'animeSortFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => loadAnimeDirectory(1));
  });
  document.getElementById('previousAnimeBtn')?.addEventListener('click', () => loadAnimeDirectory(Math.max(1, currentPage - 1)));
  document.getElementById('loadMoreAnimeBtn')?.addEventListener('click', () => loadAnimeDirectory(currentPage + 1));
}

async function initAnimePage() {
  setupMobileNav();
  const isDetailPath = window.location.pathname.startsWith('/anime/') ||
    window.location.pathname.startsWith('/anime.html/');
  if (isDetailPath) {
    document.getElementById('animeListJsonLd')?.remove();
    const slug = getRequestedAnimeSlug();
    if (!slug) {
      window.location.replace('/404.html');
      return;
    }
    return loadAnimeDetails(slug);
  }
  renderAnimeListStructuredData();
  bindDirectoryControls();
  await Promise.all([loadAnimeDirectory(1), loadTopAnime()]);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAnimePage, { once: true });
else initAnimePage();
