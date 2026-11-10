import { createArticleCard, setupMobileNav } from './ui.js';
import { getArticleCategories } from './article-editor-fields.js';

let firestoreRuntime = null;
let selectedCategory = 'all';
let currentSort = 'latest'; // latest, popular, oldest
let lastDoc = null;
let pendingBlogPosts = [];
let isLoading = false;
const PAGE_SIZE = 9;
const CATEGORY_SCAN_SIZE = 30;

async function getFirestoreRuntime() {
  if (!firestoreRuntime) {
    firestoreRuntime = Promise.all([
      import('firebase/firestore'),
      import('./firebase-init.js'),
    ]).then(([firestore, firebase]) => ({
      ...firebase,
      collection: firestore.collection,
      getDocs: firestore.getDocs,
      limit: firestore.limit,
      orderBy: firestore.orderBy,
      or: firestore.or,
      query: firestore.query,
      startAfter: firestore.startAfter,
      where: firestore.where,
    }));
  }
  return firestoreRuntime;
}

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
    pendingBlogPosts = [];
    container.querySelector('[data-listing-error]')?.remove();
    if (!container.querySelector('.article-card')) {
      container.innerHTML = '<div class="home-loading-state" role="status" aria-label="Loading articles"><span class="home-loading-line"></span><span class="home-loading-line"></span><span class="home-loading-line"></span></div>';
    }
  }

  isLoading = true;
  container.setAttribute('aria-busy', 'true');
  if (loadMoreBtn) loadMoreBtn.textContent = 'Loading stories...';

  let firestoreErrorHandler;
  try {
    const runtime = await getFirestoreRuntime();
    firestoreErrorHandler = runtime.handleFirestoreError;
    const {
      collection, db, getDocs, isConfigured, limit, orderBy, query, startAfter, where,
    } = runtime;

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

    let orderField = 'publishedAt';
    let orderDir = 'desc';

    if (currentSort === 'popular') {
      orderField = 'views';
      orderDir = 'desc';
    } else if (currentSort === 'oldest') {
      orderField = 'publishedAt';
      orderDir = 'asc';
    }

    let scanCursor = reset ? null : lastDoc;
    let hasMore = true;
    const docs = pendingBlogPosts.splice(0, PAGE_SIZE);
    const isCategoryFilter = selectedCategory && selectedCategory !== 'all';
    const scanSize = isCategoryFilter ? CATEGORY_SCAN_SIZE : PAGE_SIZE;
    while (docs.length < PAGE_SIZE && hasMore) {
      let snap;
      let orderedDocs;
      const constraints = [
        where('status', '==', 'published'),
        orderBy(orderField, orderDir)
      ];
      if (isCategoryFilter) {
        constraints.push(or(
          where('categories', 'array-contains', selectedCategory),
          where('category', '==', selectedCategory)
        ));
      }
      if (scanCursor) constraints.push(startAfter(scanCursor));
      constraints.push(limit(scanSize));
      try {
        snap = await getDocs(query(collection(db, 'posts'), ...constraints));
        orderedDocs = snap.docs;
      } catch (orderErr) {
        console.warn("Ordered query in blogs.js failed, attempting status fallback:", orderErr);
        const simpleConstraints = [where('status', '==', 'published')];
        if (scanCursor) simpleConstraints.push(startAfter(scanCursor));
        simpleConstraints.push(limit(scanSize));
        snap = await getDocs(query(collection(db, 'posts'), ...simpleConstraints));
        orderedDocs = [...snap.docs].sort((a, b) => {
          const pA = a.data();
          const pB = b.data();
          if (currentSort === 'popular') return (pB.views || 0) - (pA.views || 0);
          const tA = pA.publishedAt?.toDate ? pA.publishedAt.toDate().getTime() : (pA.publishedAt ? new Date(pA.publishedAt).getTime() : 0);
          const tB = pB.publishedAt?.toDate ? pB.publishedAt.toDate().getTime() : (pB.publishedAt ? new Date(pB.publishedAt).getTime() : 0);
          return currentSort === 'oldest' ? tA - tB : tB - tA;
        });
      }

      if (snap.empty) {
        hasMore = false;
        break;
      }
      scanCursor = snap.docs.at(-1) || scanCursor;
      hasMore = snap.docs.length === scanSize;
      pendingBlogPosts.push(...orderedDocs.filter(postDoc =>
        !isCategoryFilter || getArticleCategories(postDoc.data()).includes(selectedCategory)
      ));
      docs.push(...pendingBlogPosts.splice(0, PAGE_SIZE - docs.length));
    }

    if (reset) {
      container.innerHTML = '';
    }

    if (!docs.length && reset) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <h3 class="empty-state-title">No stories found</h3>
          <p class="empty-state-desc">There are no articles published in this category yet. Check back soon!</p>
        </div>
      `;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    if (docs.length > 0) {
      lastDoc = scanCursor;
      docs.forEach(doc => {
        container.appendChild(createArticleCard(doc.id, doc.data()));
      });
    } else {
      lastDoc = scanCursor;
    }

    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Load More Articles';
      loadMoreBtn.style.display = hasMore || pendingBlogPosts.length ? 'inline-flex' : 'none';
    }

  } catch (error) {
    if (firestoreErrorHandler) {
      firestoreErrorHandler(error, 'list', 'posts');
    } else {
      console.error('Could not load Firestore for the article listing.', error);
    }
    if (reset) {
      const hasRenderedArticles = container.querySelector('.article-card');
      if (hasRenderedArticles) {
        const errorMessage = document.createElement('p');
        errorMessage.className = 'empty-state-desc';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.setAttribute('data-listing-error', '');
        errorMessage.textContent = 'Could not refresh articles. Showing the stories already available on this page.';
        container.appendChild(errorMessage);
      } else {
        container.innerHTML = `
          <div class="empty-state" style="grid-column: 1 / -1;">
            <h3 class="empty-state-title">Unable to load stories</h3>
            <p class="empty-state-desc">Please verify your Firebase configuration and Firestore index rules.</p>
          </div>
        `;
      }
    }
  } finally {
    isLoading = false;
    container.removeAttribute('aria-busy');
    if (loadMoreBtn && loadMoreBtn.textContent === 'Loading stories...') {
      loadMoreBtn.textContent = 'Load More Articles';
    }
  }
}

initBlogsPage();
