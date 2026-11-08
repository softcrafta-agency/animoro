import { 
  collection, 
  query, 
  where, 
  or,
  orderBy, 
  getDocs,
  limit,
  startAfter
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { createArticleCard, setupMobileNav } from './ui.js';
import { escapeHtml } from './html-utils.js';
import { getArticleCategories } from './article-editor-fields.js';

const CATEGORY_DESCRIPTIONS = {
  'Anime News': 'Breaking news, seasonal announcements, studio updates, and production insights.',
  'Reviews': 'Critical analyses, spoiler-free breakdowns, and in-depth episodic reviews.',
  'Rankings': 'Community top tier lists, best-of-season countdowns, and iconic character rankings.',
  'Guides': 'Watch orders, beginner roadmaps, lore explanations, and manga reading companions.',
  'Recommendations': 'Handpicked anime recommendations curated by genre, mood, and storytelling caliber.',
  'Manga': 'Manga chapter discussions, adaptations comparison, and light novel spotlights.',
  'Seasonal Anime': 'Previews, schedules, and essential guides for current and upcoming anime seasons.'
};
const PAGE_SIZE = 9;
const CATEGORY_SCAN_SIZE = 30;
let lastCategoryDoc = null;
let isLoadingCategory = false;
let pendingCategoryPosts = [];

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

async function initCategoryPage() {
  setupMobileNav();

  const urlParams = new URLSearchParams(window.location.search);
  const categoryName = urlParams.get('category') || 'Anime News';

  const titleEl = document.getElementById('categoryTitle');
  const descEl = document.getElementById('categoryDescription');
  const container = document.getElementById('categoryArticlesContainer');
  const categoryDescription = CATEGORY_DESCRIPTIONS[categoryName] || `Explore all editorial coverage, analysis, and stories in ${categoryName}.`;
  const canonicalUrl = new URL(`/category.html?category=${encodeURIComponent(categoryName)}`, 'https://www.animoro.in').toString();

  if (titleEl) titleEl.textContent = categoryName;
  if (descEl) descEl.textContent = categoryDescription;

  document.title = `${categoryName} — Animoro`;
  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) metaDescription.setAttribute('content', `${categoryDescription} Discover the latest Animoro stories in ${categoryName}.`);
  ensureMetaTag('property', 'og:title', `${categoryName} — Animoro`);
  ensureMetaTag('property', 'og:description', `${categoryDescription} Discover the latest Animoro stories in ${categoryName}.`);
  ensureMetaTag('property', 'og:url', canonicalUrl);
  ensureMetaTag('property', 'og:image', 'https://www.animoro.in/logo.png');
  ensureMetaTag('name', 'twitter:card', 'summary_large_image');
  ensureMetaTag('name', 'twitter:title', `${categoryName} — Animoro`);
  ensureMetaTag('name', 'twitter:description', `${categoryDescription} Discover the latest Animoro stories in ${categoryName}.`);
  ensureCanonical(canonicalUrl);

  if (!container) return;

  const loadMoreBtn = document.getElementById('loadMoreCategoryArticlesBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadCategoryArticles(lastCategoryDoc));
  }

  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Articles are unavailable</h3>
        <p class="empty-state-desc">The category service is not configured. Please try again later.</p>
      </div>
    `;
    return;
  }

  await loadCategoryArticles();
}

async function loadCategoryArticles(cursor = null) {
  const categoryName = new URLSearchParams(window.location.search).get('category') || 'Anime News';
  const container = document.getElementById('categoryArticlesContainer');
  const loadMoreBtn = document.getElementById('loadMoreCategoryArticlesBtn');
  if (!container || !db || isLoadingCategory) return;

  isLoadingCategory = true;
  if (!cursor) {
    lastCategoryDoc = null;
    pendingCategoryPosts = [];
    container.innerHTML = '<div class="home-loading-state" role="status" aria-label="Loading category articles"><span class="home-loading-line"></span><span class="home-loading-line"></span><span class="home-loading-line"></span></div>';
  }
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading articles...';
  }

  try {
    let scanCursor = cursor;
    let hasMore = true;
    const posts = pendingCategoryPosts.splice(0, PAGE_SIZE);
    while (posts.length < PAGE_SIZE && hasMore) {
      let snap;
      let orderedDocs;
      try {
        const constraints = [
          where('status', '==', 'published'),
          or(
            where('categories', 'array-contains', categoryName),
            where('category', '==', categoryName)
          ),
          orderBy('publishedAt', 'desc')
        ];
        if (scanCursor) constraints.push(startAfter(scanCursor));
        constraints.push(limit(CATEGORY_SCAN_SIZE));
        snap = await getDocs(query(collection(db, 'posts'), ...constraints));
        orderedDocs = snap.docs;
      } catch (idxErr) {
        console.warn("Ordered category query failed, using a published-articles fallback:", idxErr);
        const fallbackConstraints = [where('status', '==', 'published')];
        if (scanCursor) fallbackConstraints.push(startAfter(scanCursor));
        fallbackConstraints.push(limit(CATEGORY_SCAN_SIZE));
        snap = await getDocs(query(collection(db, 'posts'), ...fallbackConstraints));
        orderedDocs = [...snap.docs].sort((a, b) => {
          const aData = a.data();
          const bData = b.data();
          const tA = aData.publishedAt?.toDate?.() || new Date(aData.publishedAt || aData.createdAt || 0);
          const tB = bData.publishedAt?.toDate?.() || new Date(bData.publishedAt || bData.createdAt || 0);
          return tB - tA;
        });
      }

      if (snap.empty) {
        hasMore = false;
        break;
      }
      scanCursor = snap.docs.at(-1) || scanCursor;
      hasMore = snap.docs.length === CATEGORY_SCAN_SIZE;

      pendingCategoryPosts.push(...orderedDocs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(post => getArticleCategories(post).includes(categoryName)));
      posts.push(...pendingCategoryPosts.splice(0, PAGE_SIZE - posts.length));
    }

    if (!posts.length && !cursor) {
      ensureMetaTag('name', 'robots', 'noindex, follow');
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h3 class="empty-state-title">No stories yet</h3>
          <p class="empty-state-desc">No articles published in ${escapeHtml(categoryName)} yet. Fresh content is coming soon.</p>
        </div>
      `;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    } else if (!posts.length) {
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    if (!cursor) {
      container.innerHTML = '';
      ensureMetaTag('name', 'robots', 'index, follow');
    }
    const fragment = document.createDocumentFragment();
    posts.forEach(post => fragment.appendChild(createArticleCard(post.id, post)));
    container.appendChild(fragment);
    lastCategoryDoc = scanCursor;
    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Load More Articles';
      loadMoreBtn.style.display = hasMore || pendingCategoryPosts.length ? 'inline-flex' : 'none';
    }
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    const errorState = document.createElement('div');
    errorState.className = 'empty-state';
    errorState.style.gridColumn = '1 / -1';
    errorState.innerHTML = `
      <h3 class="empty-state-title">Unable to load category</h3>
      <p class="empty-state-desc">Please check the connection and try again.</p>
      <button class="btn-outline" type="button">Retry</button>
    `;
    errorState.querySelector('button')?.addEventListener('click', () => loadCategoryArticles(cursor));
    if (cursor) {
      container.appendChild(errorState);
    } else {
      container.replaceChildren(errorState);
    }
  } finally {
    isLoadingCategory = false;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = false;
      if (loadMoreBtn.style.display !== 'none') loadMoreBtn.textContent = 'Load More Articles';
    }
  }
}

initCategoryPage();
