import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { createArticleCard, setupMobileNav } from './ui.js';

let allPublishedPosts = [];
let lastPostDoc = null;
let hasMorePosts = true;
let pendingPageRequest = null;
let usingFallback = false;
let isLoaded = false;
const PAGE_SIZE = 50;

function initSearchPage() {
  setupMobileNav();

  const searchInput = document.getElementById('searchInput');
  const resultsContainer = document.getElementById('searchResultsContainer');
  const resultsCount = document.getElementById('searchResultsCount');

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get('q') || '';

  if (searchInput) {
    searchInput.value = initialQuery;
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => searchArticles(e.target.value.trim()), 180);
    });
  }

  const loadMoreBtn = document.getElementById('loadMoreSearchResultsBtn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Searching older articles...';
      await loadNextPublishedPage();
      renderSearchResults();
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Search Older Articles';
    });
  }

  if (initialQuery) {
    searchArticles(initialQuery);
  }
}

async function searchArticles(term) {
  const resultsContainer = document.getElementById('searchResultsContainer');
  if (!resultsContainer) return;

  if (!term) {
    resultsContainer.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <p class="empty-state-desc">Type keywords above to search across titles, categories, authors, and tags.</p>
      </div>
    `;
    const resultsCount = document.getElementById('searchResultsCount');
    if (resultsCount) resultsCount.textContent = '';
    updateLoadMoreButton();
    return;
  }

  if (!isConfigured || !db) {
    renderSearchMessage('Search is unavailable until Firebase is configured.');
    return;
  }

  if (!isLoaded) await loadNextPublishedPage();
  renderSearchResults(term);
}

function loadNextPublishedPage() {
  if (pendingPageRequest) return pendingPageRequest;
  if (!hasMorePosts || !db) return Promise.resolve();

  pendingPageRequest = (async () => {
    try {
      let snap;
      if (!usingFallback) {
        const constraints = [
          where('status', '==', 'published'),
          orderBy('publishedAt', 'desc')
        ];
        if (lastPostDoc) constraints.push(startAfter(lastPostDoc));
        constraints.push(limit(PAGE_SIZE));

        try {
          snap = await getDocs(query(collection(db, 'posts'), ...constraints));
        } catch (orderErr) {
          console.warn('Ordered search query failed; using a limited fallback:', orderErr);
          usingFallback = true;
        }
      }

      if (usingFallback) {
        const constraints = [where('status', '==', 'published')];
        if (lastPostDoc) constraints.push(startAfter(lastPostDoc));
        constraints.push(limit(PAGE_SIZE));
        snap = await getDocs(query(collection(db, 'posts'), ...constraints));
      }

      allPublishedPosts.push(...snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })));
      lastPostDoc = snap.docs.at(-1) || lastPostDoc;
      hasMorePosts = snap.docs.length === PAGE_SIZE;
      isLoaded = true;
    } catch (error) {
      handleFirestoreError(error, 'list', 'posts');
      if (!isLoaded) renderSearchMessage('Unable to search articles. Please check your connection.');
      hasMorePosts = false;
    } finally {
      pendingPageRequest = null;
      updateLoadMoreButton();
    }
  })();
  return pendingPageRequest;
}

function renderSearchResults(term = document.getElementById('searchInput')?.value.trim() || '') {
  const resultsContainer = document.getElementById('searchResultsContainer');
  const resultsCount = document.getElementById('searchResultsCount');
  if (!resultsContainer) return;

  const lower = term.toLowerCase();
  const matched = allPublishedPosts.filter(post => {
    const titleMatch = (post.title || '').toLowerCase().includes(lower);
    const excerptMatch = (post.excerpt || '').toLowerCase().includes(lower);
    const catMatch = (post.category || '').toLowerCase().includes(lower);
    const authorMatch = (post.authorName || '').toLowerCase().includes(lower);
    const tagMatch = (post.tags || []).some(tag => String(tag).toLowerCase().includes(lower));

    return titleMatch || excerptMatch || catMatch || authorMatch || tagMatch;
  });

  if (resultsCount) {
    resultsCount.textContent = `Found ${matched.length} matching article${matched.length === 1 ? '' : 's'} in ${allPublishedPosts.length} loaded.`;
  }

  if (matched.length === 0) {
    renderSearchMessage(hasMorePosts
      ? 'No matches in the articles loaded so far. Search older articles to continue.'
      : 'No articles found. Try another search.');
    updateLoadMoreButton();
    return;
  }

  resultsContainer.innerHTML = '';
  matched.forEach(post => {
    resultsContainer.appendChild(createArticleCard(post.id, post));
  });
  updateLoadMoreButton();
}

function renderSearchMessage(message) {
  const resultsContainer = document.getElementById('searchResultsContainer');
  if (!resultsContainer) return;
  resultsContainer.innerHTML = `
    <div class="empty-state" style="grid-column: 1 / -1;">
      <p class="empty-state-desc">${message}</p>
    </div>
  `;
}

function updateLoadMoreButton() {
  const loadMoreBtn = document.getElementById('loadMoreSearchResultsBtn');
  if (loadMoreBtn) loadMoreBtn.style.display = hasMorePosts && isLoaded ? 'inline-flex' : 'none';
}

initSearchPage();
