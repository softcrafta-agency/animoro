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
import { createAnimeCard, createArticleCard, setupMobileNav } from './ui.js';
import { getArticlePath } from './article-url.js';
import { getAnimePath } from './anime-url.js';

let allPublishedPosts = [];
let lastPostDoc = null;
let hasMorePosts = true;
let pendingPageRequest = null;
let usingFallback = false;
let isLoaded = false;
let animeResults = [];
let isAnimeLoaded = false;
let searchSuggestions = [];
let activeSuggestionIndex = -1;
const PAGE_SIZE = 50;

function initSearchPage() {
  setupMobileNav();

  const searchInput = document.getElementById('searchInput');
  const searchForm = document.getElementById('searchForm');
  const suggestions = document.getElementById('searchSuggestions');
  const resultsContainer = document.getElementById('searchResultsContainer');

  const params = new URLSearchParams(window.location.search);
  const initialQuery = params.get('q') || '';

  if (searchInput) {
    searchInput.value = initialQuery;
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const term = e.target.value.trim();
      updateSearchUrl(term);
      debounceTimer = setTimeout(() => searchArticles(term), 180);
    });
    searchInput.addEventListener('keydown', handleSearchKeydown);
    searchInput.addEventListener('focus', () => {
      if (searchInput.value.trim()) renderSuggestions(searchInput.value.trim());
    });
  }

  if (searchForm) {
    searchForm.addEventListener('submit', event => {
      event.preventDefault();
      const term = searchInput?.value.trim() || '';
      if (term) {
        updateSearchUrl(term);
        searchArticles(term);
        closeSuggestions();
      }
    });
  }

  if (suggestions) {
    document.addEventListener('click', event => {
      if (!searchForm?.contains(event.target)) closeSuggestions();
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

  if (!isLoaded || !isAnimeLoaded) {
    await Promise.all([loadNextPublishedPage(), loadAnimePage()]);
  }
  renderSearchResults(term);
  renderSuggestions(term);
}

function updateSearchUrl(term) {
  const url = new URL(window.location.href);
  if (term) url.searchParams.set('q', term);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url);
}

async function loadAnimePage() {
  if (isAnimeLoaded || !db) return;

  try {
    const snapshot = await getDocs(query(
      collection(db, 'anime'),
      where('visibility', '==', 'published'),
      limit(50)
    ));
    animeResults = snapshot.docs.map(document => ({
      id: document.id,
      ...document.data()
    }));
    isAnimeLoaded = true;
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    isAnimeLoaded = true;
  }
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
  const animeContainer = document.getElementById('animeSearchResults');
  const animeSection = document.getElementById('animeSearchSection');
  if (!resultsContainer) return;

  const lower = term.toLowerCase();
  const matched = allPublishedPosts.filter(post => {
    const titleMatch = (post.title || '').toLowerCase().includes(lower);
    const slugMatch = (post.slug || '').toLowerCase().includes(lower);
    const excerptMatch = (post.excerpt || '').toLowerCase().includes(lower);
    const catMatch = (post.category || '').toLowerCase().includes(lower);
    const authorMatch = (post.authorName || '').toLowerCase().includes(lower);
    const tagMatch = (post.tags || []).some(tag => String(tag).toLowerCase().includes(lower));

    return titleMatch || slugMatch || excerptMatch || catMatch || authorMatch || tagMatch;
  });
  const matchedAnime = animeResults.filter(anime => [
    anime.title,
    anime.slug,
    anime.synopsis,
    anime.studio,
    ...(anime.alternativeTitles || []),
    ...(anime.genres || []),
    ...(anime.tags || []),
  ].some(value => String(value || '').toLowerCase().includes(lower)));

  if (resultsCount) {
    resultsCount.textContent = `Found ${matchedAnime.length} anime and ${matched.length} matching article${matched.length === 1 ? '' : 's'} in the loaded results.`;
  }

  if (animeContainer && animeSection) {
    animeContainer.replaceChildren();
    animeSection.hidden = matchedAnime.length === 0;
    matchedAnime.slice(0, 12).forEach(anime => {
      animeContainer.appendChild(createAnimeCard(anime));
    });
  }

  if (matched.length === 0) {
    resultsContainer.innerHTML = '';
    renderSearchMessage(matchedAnime.length > 0
      ? 'No matching articles found.'
      : hasMorePosts
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

function renderSuggestions(term) {
  const container = document.getElementById('searchSuggestions');
  if (!container) return;
  const normalizedTerm = term.toLowerCase();
  const anime = animeResults
    .filter(item => String(item.title || '').toLowerCase().includes(normalizedTerm))
    .slice(0, 3)
    .map(item => ({ label: item.title, type: 'ANIME', href: getAnimePath(item) }));
  const articles = allPublishedPosts
    .filter(post => [post.title, post.slug, post.category, ...(post.tags || [])]
      .some(value => String(value || '').toLowerCase().includes(normalizedTerm)))
    .slice(0, 5)
    .map(post => ({ label: post.title, type: 'ARTICLE', href: getArticlePath(post) }));
  const categories = [...new Set(allPublishedPosts
    .filter(post => String(post.category || '').toLowerCase().includes(normalizedTerm))
    .map(post => post.category))]
    .slice(0, 2)
    .map(category => ({
      label: category,
      type: 'CATEGORY',
      href: `/category.html?category=${encodeURIComponent(category)}`
    }));

  searchSuggestions = [...anime, ...articles, ...categories];
  activeSuggestionIndex = -1;
  container.replaceChildren();

  if (!searchSuggestions.length) {
    closeSuggestions();
    return;
  }

  searchSuggestions.forEach((suggestion, index) => {
    const option = document.createElement('a');
    option.id = `search-suggestion-${index}`;
    option.className = 'search-suggestion';
    option.href = suggestion.href;
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', 'false');
    const type = document.createElement('span');
    type.className = 'search-suggestion-type';
    type.textContent = suggestion.type;
    const label = document.createElement('span');
    label.textContent = suggestion.label;
    option.append(type, label);
    container.appendChild(option);
  });

  container.hidden = false;
  document.getElementById('searchInput')?.setAttribute('aria-expanded', 'true');
}

function handleSearchKeydown(event) {
  if (!searchSuggestions.length) return;

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    activeSuggestionIndex = (activeSuggestionIndex + direction + searchSuggestions.length) % searchSuggestions.length;
    updateActiveSuggestion();
  } else if (event.key === 'Escape') {
    closeSuggestions();
  } else if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
    event.preventDefault();
    window.location.assign(searchSuggestions[activeSuggestionIndex].href);
  }
}

function updateActiveSuggestion() {
  const input = document.getElementById('searchInput');
  const options = document.querySelectorAll('#searchSuggestions [role="option"]');
  options.forEach((option, index) => {
    const isActive = index === activeSuggestionIndex;
    option.setAttribute('aria-selected', String(isActive));
    if (isActive) input?.setAttribute('aria-activedescendant', option.id);
  });
}

function closeSuggestions() {
  const container = document.getElementById('searchSuggestions');
  const input = document.getElementById('searchInput');
  if (container) container.hidden = true;
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
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
