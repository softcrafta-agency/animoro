import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  startAfter 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { createArticleCard, setupMobileNav } from './home.js';

let selectedCategory = 'all';
let currentSort = 'latest'; // latest, popular, oldest
let lastDoc = null;
let isLoading = false;
const PAGE_SIZE = 9;

async function initBlogsPage() {
  setupMobileNav();

  // Read URL query parameter for category if present
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get('category');
  if (catParam) {
    selectedCategory = catParam;
  }

  setupFilterEvents();
  loadArticles(true);
}

function setupFilterEvents() {
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach(pill => {
    const cat = pill.getAttribute('data-category');
    if (cat === selectedCategory) {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
    }

    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedCategory = pill.getAttribute('data-category');
      loadArticles(true);
    });
  });

  const sortSelect = document.getElementById('sortFilterSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      loadArticles(true);
    });
  }

  const loadMoreBtn = document.getElementById('loadMoreBlogsBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadArticles(false));
  }
}

async function loadArticles(reset = false) {
  const container = document.getElementById('blogsGridContainer');
  const loadMoreBtn = document.getElementById('loadMoreBlogsBtn');
  if (!container || isLoading) return;

  if (reset) {
    lastDoc = null;
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p class="empty-state-desc">Loading anime stories from Animoro...</p>
      </div>
    `;
  }

  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
        </div>
        <h3 class="empty-state-title">No Stories Published Yet</h3>
        <p class="empty-state-desc">Connect Firebase in Settings and publish your first article from the Admin Panel.</p>
      </div>
    `;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  isLoading = true;
  if (loadMoreBtn) loadMoreBtn.textContent = 'Loading stories...';

  try {
    let orderField = 'publishedAt';
    let orderDir = 'desc';

    if (currentSort === 'popular') {
      orderField = 'views';
      orderDir = 'desc';
    } else if (currentSort === 'oldest') {
      orderField = 'publishedAt';
      orderDir = 'asc';
    }

    let constraints = [
      where('status', '==', 'published'),
      orderBy(orderField, orderDir),
      limit(PAGE_SIZE)
    ];

    if (selectedCategory && selectedCategory !== 'all') {
      constraints.unshift(where('category', '==', selectedCategory));
    }

    if (lastDoc && !reset) {
      constraints.push(startAfter(lastDoc));
    }

    let snap;
    let fallbackUsed = false;
    try {
      const q = query(collection(db, 'posts'), ...constraints);
      snap = await getDocs(q);
    } catch (orderErr) {
      console.warn("Ordered query in blogs.js failed, attempting status fallback:", orderErr);
      const simpleConstraints = [where('status', '==', 'published')];
      if (selectedCategory && selectedCategory !== 'all') {
        simpleConstraints.push(where('category', '==', selectedCategory));
      }
      simpleConstraints.push(limit(50));
      const fallbackQ = query(collection(db, 'posts'), ...simpleConstraints);
      snap = await getDocs(fallbackQ);
      fallbackUsed = true;
    }

    if (reset) {
      container.innerHTML = '';
    }

    if (snap.empty && reset) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">No stories found</h3>
          <p class="empty-state-desc">There are no articles published in this category yet. Check back soon!</p>
        </div>
      `;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    let docs = [...snap.docs];
    if (fallbackUsed) {
      docs.sort((a, b) => {
        const pA = a.data();
        const pB = b.data();
        if (currentSort === 'popular') {
          return (pB.views || 0) - (pA.views || 0);
        }
        const tA = pA.publishedAt?.toDate ? pA.publishedAt.toDate().getTime() : (pA.publishedAt ? new Date(pA.publishedAt).getTime() : 0);
        const tB = pB.publishedAt?.toDate ? pB.publishedAt.toDate().getTime() : (pB.publishedAt ? new Date(pB.publishedAt).getTime() : 0);
        return currentSort === 'oldest' ? tA - tB : tB - tA;
      });
      docs = docs.slice(0, PAGE_SIZE);
    }

    if (docs.length > 0) {
      lastDoc = docs[docs.length - 1];
      docs.forEach(doc => {
        container.appendChild(createArticleCard(doc.id, doc.data()));
      });
    }

    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Load More Articles';
      loadMoreBtn.style.display = (!fallbackUsed && snap.docs.length === PAGE_SIZE) ? 'inline-flex' : 'none';
    }

  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    if (reset) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">Unable to load stories</h3>
          <p class="empty-state-desc">Please verify your Firebase configuration and Firestore index rules.</p>
        </div>
      `;
    }
  } finally {
    isLoading = false;
  }
}

document.addEventListener('DOMContentLoaded', initBlogsPage);
