import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  limit,
  startAfter
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { createArticleCard, setupMobileNav } from './ui.js';

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
let lastCategoryDoc = null;
let isLoadingCategory = false;

async function initCategoryPage() {
  setupMobileNav();

  const urlParams = new URLSearchParams(window.location.search);
  const categoryName = urlParams.get('category') || 'Anime News';

  const titleEl = document.getElementById('categoryTitle');
  const descEl = document.getElementById('categoryDescription');
  const container = document.getElementById('categoryArticlesContainer');

  if (titleEl) titleEl.textContent = categoryName;
  if (descEl) descEl.textContent = CATEGORY_DESCRIPTIONS[categoryName] || `Explore all editorial coverage, analysis, and stories in ${categoryName}.`;

  document.title = `${categoryName} — Animoro`;

  if (!container) return;

  const loadMoreBtn = document.getElementById('loadMoreCategoryArticlesBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadCategoryArticles(lastCategoryDoc));
  }

  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">No articles found</h3>
        <p class="empty-state-desc">Configure Firebase in the Admin panel to load stories in this category.</p>
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
    container.innerHTML = '<div class="home-loading-state" role="status" aria-label="Loading category articles"><span class="home-loading-line"></span><span class="home-loading-line"></span><span class="home-loading-line"></span></div>';
  }
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading articles...';
  }

  try {
    let snap;
    let usedFallback = false;
    try {
      const constraints = [
        where('status', '==', 'published'),
        where('category', '==', categoryName),
        orderBy('publishedAt', 'desc')
      ];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(PAGE_SIZE));
      const q = query(
        collection(db, 'posts'),
        ...constraints
      );
      snap = await getDocs(q);
    } catch (idxErr) {
      console.warn("Compound index query failed for category, using fallback query:", idxErr);
      const fallbackConstraints = [
        where('status', '==', 'published'),
        where('category', '==', categoryName)
      ];
      if (cursor) fallbackConstraints.push(startAfter(cursor));
      fallbackConstraints.push(limit(PAGE_SIZE));
      const fallbackQ = query(
        collection(db, 'posts'),
        ...fallbackConstraints
      );
      snap = await getDocs(fallbackQ);
      usedFallback = true;
    }

    if (snap.empty && !cursor) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h3 class="empty-state-title">No stories yet</h3>
          <p class="empty-state-desc">No articles published in ${categoryName} yet. Fresh content is coming soon.</p>
        </div>
      `;
    } else if (snap.empty) {
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    let posts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (usedFallback) {
      posts.sort((a, b) => {
        const tA = a.publishedAt?.toDate?.() || new Date(a.publishedAt || a.createdAt || 0);
        const tB = b.publishedAt?.toDate?.() || new Date(b.publishedAt || b.createdAt || 0);
        return tB - tA;
      });
    }

    if (!cursor) container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    posts.forEach(post => fragment.appendChild(createArticleCard(post.id, post)));
    container.appendChild(fragment);
    lastCategoryDoc = snap.docs.at(-1) || cursor;
    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Load More Articles';
      loadMoreBtn.style.display = snap.docs.length === PAGE_SIZE ? 'inline-flex' : 'none';
    }
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load category</h3>
        <p class="empty-state-desc">Please verify your Firestore index configuration.</p>
      </div>
    `;
  } finally {
    isLoadingCategory = false;
    if (loadMoreBtn) {
      loadMoreBtn.disabled = false;
      if (loadMoreBtn.style.display !== 'none') loadMoreBtn.textContent = 'Load More Articles';
    }
  }
}

initCategoryPage();
