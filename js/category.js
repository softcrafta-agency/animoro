import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { createArticleCard, setupMobileNav } from './home.js';

const CATEGORY_DESCRIPTIONS = {
  'Anime News': 'Breaking news, seasonal announcements, studio updates, and production insights.',
  'Reviews': 'Critical analyses, spoiler-free breakdowns, and in-depth episodic reviews.',
  'Rankings': 'Community top tier lists, best-of-season countdowns, and iconic character rankings.',
  'Guides': 'Watch orders, beginner roadmaps, lore explanations, and manga reading companions.',
  'Recommendations': 'Handpicked anime recommendations curated by genre, mood, and storytelling caliber.',
  'Manga': 'Manga chapter discussions, adaptations comparison, and light novel spotlights.',
  'Seasonal Anime': 'Previews, schedules, and essential guides for current and upcoming anime seasons.'
};

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

  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">No articles found</h3>
        <p class="empty-state-desc">Configure Firebase in the Admin panel to load stories in this category.</p>
      </div>
    `;
    return;
  }

  try {
    let snap;
    let usedFallback = false;
    try {
      const q = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('category', '==', categoryName),
        orderBy('publishedAt', 'desc')
      );
      snap = await getDocs(q);
    } catch (idxErr) {
      console.warn("Compound index query failed for category, using fallback query:", idxErr);
      const fallbackQ = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('category', '==', categoryName)
      );
      snap = await getDocs(fallbackQ);
      usedFallback = true;
    }

    if (snap.empty) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h3 class="empty-state-title">No stories yet</h3>
          <p class="empty-state-desc">No articles published in ${categoryName} yet. Fresh content is coming soon.</p>
        </div>
      `;
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

    container.innerHTML = '';
    posts.forEach(post => {
      container.appendChild(createArticleCard(post.id, post));
    });
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load category</h3>
        <p class="empty-state-desc">Please verify your Firestore index configuration.</p>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', initCategoryPage);
