import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { createArticleCard, setupMobileNav } from './home.js';

let allPublishedPosts = [];
let isLoaded = false;

async function initSearchPage() {
  setupMobileNav();

  const searchInput = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('searchResultsContainer');
  const resultsCount = document.getElementById('searchResultsCount');

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get('q') || '';

  if (searchInput) {
    searchInput.value = initialQuery;
    searchInput.addEventListener('input', (e) => {
      performSearch(e.target.value.trim());
    });
  }

  await loadAllPublishedPosts();

  if (initialQuery) {
    performSearch(initialQuery);
  }
}

async function loadAllPublishedPosts() {
  if (!isConfigured || !db) return;

  try {
    let snap;
    let usedFallback = false;
    try {
      const q = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        orderBy('publishedAt', 'desc')
      );
      snap = await getDocs(q);
    } catch (orderErr) {
      console.warn("Ordered query failed in search, falling back to simple status query:", orderErr);
      const fallbackQ = query(
        collection(db, 'posts'),
        where('status', '==', 'published')
      );
      snap = await getDocs(fallbackQ);
      usedFallback = true;
    }

    allPublishedPosts = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    if (usedFallback) {
      allPublishedPosts.sort((a, b) => {
        const tA = a.publishedAt?.toDate?.() || new Date(a.publishedAt || a.createdAt || 0);
        const tB = b.publishedAt?.toDate?.() || new Date(b.publishedAt || b.createdAt || 0);
        return tB - tA;
      });
    }

    isLoaded = true;
  } catch (err) {
    handleFirestoreError(err, 'list', 'posts');
  }
}

function performSearch(term) {
  const resultsContainer = document.getElementById('searchResultsContainer');
  const resultsCount = document.getElementById('searchResultsCount');
  if (!resultsContainer) return;

  if (!term) {
    resultsContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p class="empty-state-desc">Type keywords above to search across titles, categories, authors, and tags.</p>
      </div>
    `;
    if (resultsCount) resultsCount.textContent = '';
    return;
  }

  const lower = term.toLowerCase();
  const matched = allPublishedPosts.filter(post => {
    const titleMatch = (post.title || '').toLowerCase().includes(lower);
    const excerptMatch = (post.excerpt || '').toLowerCase().includes(lower);
    const catMatch = (post.category || '').toLowerCase().includes(lower);
    const authorMatch = (post.authorName || '').toLowerCase().includes(lower);
    const tagMatch = (post.tags || []).some(t => t.toLowerCase().includes(lower));

    return titleMatch || excerptMatch || catMatch || authorMatch || tagMatch;
  });

  if (resultsCount) {
    resultsCount.textContent = `Found ${matched.length} article${matched.length === 1 ? '' : 's'} for "${term}"`;
  }

  if (matched.length === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </div>
        <h3 class="empty-state-title">No articles found.</h3>
        <p class="empty-state-desc">Try another search.</p>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = '';
  matched.forEach(post => {
    resultsContainer.appendChild(createArticleCard(post.id, post));
  });
}

document.addEventListener('DOMContentLoaded', initSearchPage);
