import {
  collection,
  getDocs,
  limit,
  query,
  startAfter,
  where
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { getArticlePath } from './article-url.js';
import { getAnimeCanonicalUrl, getAnimePath, normalizeAnimeSlug } from './anime-url.js';
import { createAnimeCard, createArticleCard, setupMobileNav } from './ui.js';

const PAGE_SIZE = 24;
const ARTICLE_SAMPLE_SIZE = 36;
let lastAnimeDocument = null;
let isLoadingMore = false;

async function initAnimePage() {
  setupMobileNav();
  const slug = getRequestedAnimeSlug();
  if (slug) {
    await loadAnimeDetails(slug);
  } else {
    await loadAnimeDirectory(true);
  }
}

function getRequestedAnimeSlug() {
  const prefix = '/anime.html/';
  const pathname = window.location.pathname;
  if (!pathname.startsWith(prefix)) return '';

  const encodedSlug = pathname.slice(prefix.length);
  if (!encodedSlug || encodedSlug.includes('/')) return '';
  try {
    const slug = decodeURIComponent(encodedSlug);
    if (slug.includes('/') || slug.includes('\\')) return '';
    return normalizeAnimeSlug(slug);
  } catch (error) {
    console.warn('Invalid encoded anime slug in URL:', error);
    return '';
  }
}

async function loadAnimeDirectory(reset = false) {
  const container = document.getElementById('animeDirectoryContainer');
  const loadMoreButton = document.getElementById('loadMoreAnimeBtn');
  if (!container || isLoadingMore) return;

  if (!isConfigured || !db) {
    renderMessage(container, 'Anime listings are unavailable until Firebase is configured.');
    return;
  }

  isLoadingMore = true;
  if (loadMoreButton) loadMoreButton.disabled = true;
  if (reset) {
    lastAnimeDocument = null;
    container.innerHTML = '<div class="home-loading-state" role="status" aria-label="Loading anime"><span class="home-loading-line"></span><span class="home-loading-line"></span></div>';
  }

  try {
    const constraints = [where('visibility', '==', 'published'), limit(PAGE_SIZE)];
    if (lastAnimeDocument && !reset) constraints.splice(1, 0, startAfter(lastAnimeDocument));
    const snapshot = await getDocs(query(collection(db, 'anime'), ...constraints));

    if (reset) container.replaceChildren();
    if (snapshot.empty && reset) {
      renderMessage(container, 'No anime entries have been published yet.');
    } else {
      const fragment = document.createDocumentFragment();
      snapshot.docs.forEach(document => fragment.appendChild(createAnimeCard({
        id: document.id,
        ...document.data()
      })));
      container.appendChild(fragment);
      lastAnimeDocument = snapshot.docs.at(-1) || lastAnimeDocument;
    }

    if (loadMoreButton) loadMoreButton.hidden = snapshot.docs.length < PAGE_SIZE;
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    if (reset) renderMessage(container, 'Unable to load anime listings. Please check your connection.');
  } finally {
    isLoadingMore = false;
    if (loadMoreButton) loadMoreButton.disabled = false;
  }
}

async function loadAnimeDetails(slug) {
  const directory = document.getElementById('animeDirectoryContainer');
  const detail = document.getElementById('animeDetail');
  const articlesSection = document.getElementById('animeArticleSection');
  if (!directory || !detail || !isConfigured || !db) {
    if (directory) renderMessage(directory, 'Anime details are unavailable until Firebase is configured.');
    return;
  }

  directory.hidden = true;
  document.getElementById('loadMoreAnimeBtn').hidden = true;

  try {
    const animeQuery = query(
      collection(db, 'anime'),
      where('visibility', '==', 'published'),
      where('slug', '==', slug),
      limit(1)
    );
    const snapshot = await getDocs(animeQuery);
    if (snapshot.empty) {
      window.location.replace('/404.html');
      return;
    }

    const anime = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    renderAnimeDetails(anime);
    await loadAnimeArticles(anime);
    if (articlesSection) articlesSection.hidden = document.getElementById('animeArticles').childElementCount === 0;
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    renderMessage(directory, 'Unable to load this anime page. Please try again later.');
    directory.hidden = false;
  }
}

function renderAnimeDetails(anime) {
  const detail = document.getElementById('animeDetail');
  const banner = document.getElementById('animeBanner');
  const title = document.getElementById('animePageTitle');
  const description = document.getElementById('animePageDescription');
  const breadcrumb = document.getElementById('animeBreadcrumbCurrent');
  const canonicalUrl = getAnimeCanonicalUrl(anime);
  if (!detail || !title || !description) return;

  title.textContent = anime.title || 'Anime';
  description.textContent = anime.synopsis || 'Anime information and related Animoro articles.';
  if (breadcrumb) breadcrumb.textContent = anime.title || 'Anime';
  document.title = `${anime.seoTitle || anime.title || 'Anime'} — Animoro`;
  setMeta('name', 'description', anime.seoDescription || anime.synopsis || anime.title || 'Anime information on Animoro.');
  setMeta('property', 'og:type', 'video.tv_show');
  setMeta('property', 'og:title', anime.seoTitle || anime.title || 'Anime');
  setMeta('property', 'og:description', anime.seoDescription || anime.synopsis || anime.title || 'Anime information on Animoro.');
  setMeta('property', 'og:url', canonicalUrl);
  setMeta('name', 'twitter:card', anime.bannerImage ? 'summary_large_image' : 'summary');
  setMeta('name', 'twitter:title', anime.seoTitle || anime.title || 'Anime');
  setMeta('name', 'twitter:description', anime.seoDescription || anime.synopsis || anime.title || 'Anime information on Animoro.');

  const cover = safeImageUrl(anime.coverImage);
  if (anime.coverImage) setMeta('property', 'og:image', anime.coverImage);
  setCanonical(canonicalUrl);

  if (banner && safeImageUrl(anime.bannerImage)) {
    banner.style.backgroundImage = `linear-gradient(90deg, rgba(10, 12, 18, .92), rgba(10, 12, 18, .28)), url("${safeImageUrl(anime.bannerImage)}")`;
    banner.hidden = false;
  }

  detail.replaceChildren();
  if (cover) {
    const image = document.createElement('img');
    image.className = 'anime-detail-cover';
    image.src = cover;
    image.alt = `${anime.title} cover`;
    image.width = 600;
    image.height = 850;
    image.loading = 'eager';
    image.decoding = 'async';
    detail.appendChild(image);
  }

  const information = document.createElement('div');
  information.className = 'anime-detail-information';
  const titleElement = document.createElement('h2');
  titleElement.textContent = anime.title || 'Anime';
  information.appendChild(titleElement);
  const alternatives = arrayOfStrings(anime.alternativeTitles);
  if (alternatives.length) appendText(information, 'Alternative titles', alternatives.join(', '));
  if (anime.synopsis) appendText(information, 'Synopsis', anime.synopsis);
  if (arrayOfStrings(anime.genres).length) appendText(information, 'Genres', arrayOfStrings(anime.genres).join(' · '));

  const fields = [
    ['Type', anime.type],
    ['Status', anime.status],
    ['Release year', anime.releaseYear],
    ['Studio', anime.studio],
    ['Episodes', anime.episodes],
    ['Season', anime.season],
    ['Source', anime.source],
    ['Rating', anime.rating],
  ].filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (fields.length) {
    const list = document.createElement('dl');
    list.className = 'anime-facts';
    fields.forEach(([label, value]) => {
      const term = document.createElement('dt');
      term.textContent = label;
      const descriptionElement = document.createElement('dd');
      descriptionElement.textContent = String(value);
      list.append(term, descriptionElement);
    });
    information.appendChild(list);
  }

  const characters = arrayOfStrings(anime.characters);
  if (characters.length) appendText(information, 'Characters', characters.join(' · '));
  const articlePath = getAnimePath(anime);
  appendStructuredData(anime, canonicalUrl, articlePath);
  detail.appendChild(information);
  detail.hidden = false;
}

async function loadAnimeArticles(anime) {
  const container = document.getElementById('animeArticles');
  if (!container || !db) return;

  const snapshot = await getDocs(query(
    collection(db, 'posts'),
    where('status', '==', 'published'),
    limit(ARTICLE_SAMPLE_SIZE)
  ));
  const animeSlug = String(anime.slug || '');
  const animeTitle = String(anime.title || '').toLowerCase();
  const animeTags = new Set(arrayOfStrings(anime.tags).map(value => value.toLowerCase()));

  const related = snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .map(post => {
      const tags = arrayOfStrings(post.tags).map(tag => tag.toLowerCase());
      const tagScore = tags.filter(tag => animeTags.has(tag)).length;
      const directlyLinked = post.animeSlug === animeSlug;
      const titleMatch = String(post.title || '').toLowerCase().includes(animeTitle) ||
        String(post.animeTitle || '').toLowerCase() === animeTitle;
      return { post, score: (directlyLinked ? 100 : 0) + (titleMatch ? 30 : 0) + tagScore * 10 };
    })
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  container.replaceChildren();
  related.forEach(({ post }) => container.appendChild(createArticleCard(post.id, post)));
}

function appendText(parent, label, value) {
  const block = document.createElement('section');
  block.className = 'anime-detail-copy';
  const heading = document.createElement('h3');
  heading.textContent = label;
  const text = document.createElement('p');
  text.textContent = value;
  block.append(heading, text);
  parent.appendChild(block);
}

function appendStructuredData(anime, canonicalUrl, path) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: anime.title,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    ...(anime.synopsis ? { description: anime.synopsis } : {}),
    ...(safeImageUrl(anime.coverImage) ? { image: safeImageUrl(anime.coverImage) } : {}),
    ...(anime.studio ? { productionCompany: { '@type': 'Organization', name: anime.studio } } : {}),
    ...(anime.episodes ? { numberOfEpisodes: Number(anime.episodes) || anime.episodes } : {}),
  };
  setJsonLd('animeJsonLd', schema);
  setJsonLd('animeBreadcrumbJsonLd', {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.animoro.in/' },
      { '@type': 'ListItem', position: 2, name: 'Anime Database', item: 'https://www.animoro.in/anime.html' },
      { '@type': 'ListItem', position: 3, name: anime.title, item: new URL(path, 'https://www.animoro.in').toString() },
    ],
  });
}

function setMeta(attribute, name, content) {
  let meta = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

function setCanonical(url) {
  const links = [...document.querySelectorAll('link[rel~="canonical"]')];
  const canonical = links.shift() || document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = url;
  if (!canonical.isConnected) document.head.appendChild(canonical);
  links.forEach(link => link.remove());
}

function setJsonLd(id, data) {
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data).replace(/</g, '\\u003c');
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
}

function safeImageUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value, window.location.origin);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function renderMessage(container, message) {
  container.innerHTML = '';
  const state = document.createElement('div');
  state.className = 'empty-state';
  state.style.gridColumn = '1 / -1';
  const text = document.createElement('p');
  text.className = 'empty-state-desc';
  text.textContent = message;
  state.appendChild(text);
  container.appendChild(state);
}

document.getElementById('loadMoreAnimeBtn')?.addEventListener('click', () => loadAnimeDirectory(false));
initAnimePage();
