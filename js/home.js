import {
  createAnimeCard,
  createArticleCard,
  createUpcomingAnimeCard,
  formatDate,
  setupMobileNav,
} from './ui.js';
import { getArticlePath } from './article-url.js';
import { escapeHtml, getSafeImageUrl } from './html-utils.js';
import { selectPopularAnime } from './anime-popular.js';
import { getUpcomingReleaseTimestamp } from './upcoming-date.js';

export { createArticleCard, formatDate, formatViews, setupMobileNav } from './ui.js';

let featuredSlides = [];
let currentSlideIndex = 0;
let slideInterval = null;
let lastArticleDoc = null;
let isLoadingMore = false;
let latestArticlesPromise = null;
let featuredFeedPromise = null;
let firestoreDependenciesPromise = null;
const ARTICLES_PER_PAGE = 6;
const AUTO_SLIDE_INTERVAL_MS = 5000;
const INITIAL_AUTO_SLIDE_DELAY_MS = 30000;
const FALLBACK_COVER_IMAGE = 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1600&q=80';

function getFirestoreDependencies() {
  if (!firestoreDependenciesPromise) {
    firestoreDependenciesPromise = Promise.all([
      import('firebase/firestore'),
      import('./firebase-init.js'),
    ]).then(([firestore, firebase]) => ({
      ...firebase,
      collection: firestore.collection,
      getDocs: firestore.getDocs,
      limit: firestore.limit,
      orderBy: firestore.orderBy,
      query: firestore.query,
      startAfter: firestore.startAfter,
      where: firestore.where,
    })).catch(error => {
      firestoreDependenciesPromise = null;
      throw error;
    });
  }
  return firestoreDependenciesPromise;
}

function getFeaturedFeed() {
  if (!featuredFeedPromise) {
    featuredFeedPromise = fetch('/api/featured', {
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) {
          throw new Error(`Featured feed returned HTTP ${response.status}.`);
        }
        const feed = await response.json();
        if (!Array.isArray(feed.featured) || !Array.isArray(feed.latest)) {
          throw new Error('Featured feed returned an invalid response.');
        }
        return feed;
      })
      .catch(error => {
        console.warn('Could not load the optimized featured feed; using Firestore directly.', error);
        return null;
      });
  }
  return featuredFeedPromise;
}

/**
 * Load and render Hero Slider from Firestore
 */
async function initHeroSlider() {
  const container = document.getElementById('heroSliderContainer');
  if (!container) return;

  try {
    const featuredFeed = await getFeaturedFeed();
    let isFallbackToLatest = false;
    if (featuredFeed) {
      featuredSlides = featuredFeed.featured.length
        ? featuredFeed.featured
        : featuredFeed.latest;
      isFallbackToLatest = featuredFeed.featured.length === 0;
    } else {
      const { collection, db, getDocs, isConfigured, limit, query, where } =
        await getFirestoreDependencies();
      if (!isConfigured || !db) {
        renderSliderEmptyState(container, "Configure Firebase in Settings to load featured stories from your database.");
        return;
      }

      const q = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('featured', '==', true),
        limit(5)
      );

      let snapshot = await getDocs(q);
      if (snapshot.empty) {
        const latestResult = await getLatestArticlesSnapshot();
        snapshot = latestResult.snapshot;
        isFallbackToLatest = true;
      }
      featuredSlides = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }

    if (featuredSlides.length === 0) {
      renderSliderEmptyState(container, "No featured anime stories yet. Mark published articles as featured in the Admin panel.");
      return;
    }

    // Sort by featuredOrder if present, or by publishedAt/createdAt if fallback
    if (!isFallbackToLatest) {
      featuredSlides.sort((a, b) => (a.featuredOrder || 99) - (b.featuredOrder || 99));
    } else {
      featuredSlides.sort((a, b) => {
        const tA = a.publishedAt?.toDate?.() || new Date(a.publishedAt || a.createdAt || 0);
        const tB = b.publishedAt?.toDate?.() || new Date(b.publishedAt || b.createdAt || 0);
        return tB - tA;
      });
    }

    if (featuredFeed?.imagesDeferred) {
      featuredSlides = featuredSlides.map((post, index) => ({
        ...post,
        coverImageDeferred: index > 0,
      }));
    }

    renderSlides(container, featuredSlides);
    setupSliderControls(container);
    if (featuredFeed?.imagesDeferred) {
      startAutoSlideWhenHeroReady(container);
    } else {
      startAutoSlide(INITIAL_AUTO_SLIDE_DELAY_MS);
    }
  } catch (error) {
    console.error('Featured story loading failed:', error);
    featuredFeedPromise = null;
    renderSliderEmptyState(
      container,
      'Unable to load featured stories. Please verify your connection and try again.',
      () => initHeroSlider()
    );
  }
}

function renderSliderEmptyState(container, message, onRetry = null) {
  container.innerHTML = `
    <div class="empty-state" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
      <h3 class="empty-state-title">No Featured Stories</h3>
      <p class="empty-state-desc">${message}</p>
      ${onRetry ? '<button class="btn-outline" id="retryFeaturedStoriesBtn" type="button">Retry loading stories</button>' : ''}
    </div>
  `;
  if (onRetry) {
    container.querySelector('#retryFeaturedStoriesBtn')
      ?.addEventListener('click', onRetry);
  }
}

function renderSlides(container, slides) {
  const trackHtml = slides.map((post, idx) => {
    const articlePath = getArticlePath(post);
    const coverImage = post.coverImageDeferred
      ? ''
      : getSafeImageUrl(post.coverImage, FALLBACK_COVER_IMAGE);
    const title = escapeHtml(post.title || 'Untitled article');
    const category = escapeHtml(post.category || '');
    const excerpt = escapeHtml(post.excerpt || '');
    const authorName = typeof post.authorName === 'string' && post.authorName.trim()
      ? escapeHtml(post.authorName.trim())
      : '';
    const publishedAt = post.publishedAt;
    return `
    <div class="slider-slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
      <img class="slide-bg" ${coverImage ? `src="${escapeHtml(coverImage)}"` : ''} alt="${title}" width="1600" height="900" loading="${idx === 0 ? 'eager' : 'lazy'}" fetchpriority="${idx === 0 ? 'high' : 'auto'}" decoding="async" />
      <div class="slide-overlay"></div>
      <div class="slide-content">
        <span class="badge-featured">Featured Story</span>
        ${category ? `<span class="badge-category">${category}</span>` : ''}
        <h2 class="slide-title">
          <a href="${articlePath}">${title}</a>
        </h2>
        ${excerpt ? `<p class="slide-excerpt">${excerpt}</p>` : ''}
        <div class="slide-meta">
          ${authorName ? `<div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>${authorName}</span>
          </div>` : ''}
          ${publishedAt ? `<div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>${escapeHtml(formatDate(publishedAt))}</span>
          </div>` : ''}
        </div>
        <a href="${articlePath}" class="btn-cta">
          Read Article
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </a>
      </div>
    </div>
  `;
  }).join('');

  const dotsHtml = slides.map((_, idx) => `
    <button class="slider-dot ${idx === 0 ? 'active' : ''}" data-index="${idx}" aria-label="Go to slide ${idx + 1}"></button>
  `).join('');

  container.innerHTML = `
    <div class="slider-track" id="sliderTrack">
      ${trackHtml}
    </div>
    <button class="slider-arrow slider-prev" id="sliderPrev" aria-label="Previous Slide">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
    </button>
    <button class="slider-arrow slider-next" id="sliderNext" aria-label="Next Slide">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
    </button>
    <div class="slider-dots" id="sliderDots">
      ${dotsHtml}
    </div>
  `;
}

function loadDeferredSlideImage(post, image) {
  if (post.imageRequest) return;
  const slideIndex = featuredSlides.indexOf(post);
  image.src = FALLBACK_COVER_IMAGE;

  post.imageRequest = fetch(
    `/api/featured?images=1&id=${encodeURIComponent(post.id)}`,
    { headers: { Accept: 'application/json' } }
  )
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Featured image returned HTTP ${response.status}.`);
      }
      const result = await response.json();
      if (result.id !== post.id || typeof result.coverImage !== 'string') {
        throw new Error('Featured image returned an invalid response.');
      }
      post.coverImage = result.coverImage;
      post.coverImageDeferred = false;
      if (currentSlideIndex === slideIndex && image.isConnected) {
        image.src = getSafeImageUrl(post.coverImage, FALLBACK_COVER_IMAGE);
      }
    })
    .catch(error => {
      console.warn(`Could not load the cover image for featured story ${post.id}.`, error);
      post.coverImageDeferred = false;
    });
}

function startAutoSlideWhenHeroReady(container) {
  const firstImage = container.querySelector('.slider-slide.active .slide-bg');
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    startAutoSlide(INITIAL_AUTO_SLIDE_DELAY_MS);
  };

  if (!firstImage || firstImage.complete) {
    start();
  } else {
    firstImage.addEventListener('load', start, { once: true });
    firstImage.addEventListener('error', start, { once: true });
  }
}

function goToSlide(index) {
  if (!featuredSlides.length) return;
  const slides = document.querySelectorAll('.slider-slide');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (index >= featuredSlides.length) index = 0;
  if (index < 0) index = featuredSlides.length - 1;
  
  const post = featuredSlides[index];
  const image = document.querySelector(`.slider-slide[data-index="${index}"] .slide-bg`);
  if (post.coverImageDeferred && image) {
    loadDeferredSlideImage(post, image);
  } else if (post.coverImage && image && image.getAttribute('src') !== post.coverImage) {
    image.src = post.coverImage;
  }

  slides.forEach((s, i) => s.classList.toggle('active', i === index));
  dots.forEach((d, i) => d.classList.toggle('active', i === index));
  currentSlideIndex = index;
}

function startAutoSlide(initialDelay = AUTO_SLIDE_INTERVAL_MS) {
  stopAutoSlide();
  slideInterval = window.setTimeout(() => {
    goToSlide(currentSlideIndex + 1);
    slideInterval = window.setInterval(() => {
      goToSlide(currentSlideIndex + 1);
    }, AUTO_SLIDE_INTERVAL_MS);
  }, initialDelay);
}

function stopAutoSlide() {
  if (slideInterval) {
    clearTimeout(slideInterval);
    clearInterval(slideInterval);
    slideInterval = null;
  }
}

function setupSliderControls(container) {
  const prevBtn = document.getElementById('sliderPrev');
  const nextBtn = document.getElementById('sliderNext');
  const dots = document.querySelectorAll('.slider-dot');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      goToSlide(currentSlideIndex - 1);
      startAutoSlide();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      goToSlide(currentSlideIndex + 1);
      startAutoSlide();
    });
  }

  dots.forEach(dot => {
    dot.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
      goToSlide(idx);
      startAutoSlide();
    });
  });

  // Pause on hover
  container.addEventListener('mouseenter', stopAutoSlide);
  container.addEventListener('mouseleave', startAutoSlide);

  // Keyboard accessibility
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      goToSlide(currentSlideIndex - 1);
    } else if (e.key === 'ArrowRight') {
      goToSlide(currentSlideIndex + 1);
    }
  });

  // Touch swipe support for mobile
  let touchStartX = 0;
  let touchEndX = 0;

  container.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    if (touchStartX - touchEndX > 50) {
      goToSlide(currentSlideIndex + 1);
    } else if (touchEndX - touchStartX > 50) {
      goToSlide(currentSlideIndex - 1);
    }
  }, { passive: true });
}

/**
 * Load and render Latest Articles from Firestore
 */
async function initLatestArticles() {
  const container = document.getElementById('latestArticlesContainer');
  const loadMoreBtn = document.getElementById('loadMoreArticlesBtn');
  if (!container) return;

  let runtime;
  try {
    runtime = await getFirestoreDependencies();
  } catch (error) {
    console.error('Could not initialize the homepage article list.', error);
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load articles</h3>
        <p class="empty-state-desc">Please check your connection and try again.</p>
        <button class="btn-outline" id="retryLatestArticlesBtn" type="button">Retry loading articles</button>
      </div>
    `;
    container.querySelector('#retryLatestArticlesBtn')
      ?.addEventListener('click', () => {
        latestArticlesPromise = null;
        initLatestArticles();
      });
    return;
  }
  const { collection, db, getDocs, handleFirestoreError, isConfigured, limit, orderBy, query, where } = runtime;
  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h3 class="empty-state-title">No Stories Yet</h3>
        <p class="empty-state-desc">Connect Firebase and publish articles via the Admin Dashboard to see real content here.</p>
      </div>
    `;
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    return;
  }

  try {
    const { snapshot, usedFallback } = await getLatestArticlesSnapshot();

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
          </div>
          <h3 class="empty-state-title">No stories yet.</h3>
          <p class="empty-state-desc">Fresh anime content is coming soon.</p>
        </div>
      `;
      if (loadMoreBtn) loadMoreBtn.style.display = 'none';
      return;
    }

    let docs = [...snapshot.docs];
    if (usedFallback) {
      docs.sort((a, b) => {
        const tA = a.data().publishedAt?.toDate ? a.data().publishedAt.toDate().getTime() : (a.data().publishedAt ? new Date(a.data().publishedAt).getTime() : 0);
        const tB = b.data().publishedAt?.toDate ? b.data().publishedAt.toDate().getTime() : (b.data().publishedAt ? new Date(b.data().publishedAt).getTime() : 0);
        return tB - tA;
      });
      docs = docs.slice(0, ARTICLES_PER_PAGE);
    }

    lastArticleDoc = docs[docs.length - 1];
    container.innerHTML = '';
    docs.forEach(doc => {
      container.appendChild(createArticleCard(doc.id, doc.data()));
    });

    if (loadMoreBtn) {
      loadMoreBtn.style.display = (!usedFallback && snapshot.docs.length === ARTICLES_PER_PAGE) ? 'inline-flex' : 'none';
      loadMoreBtn.onclick = loadMoreArticles;
    }
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    latestArticlesPromise = null;
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load articles</h3>
        <p class="empty-state-desc">Please check your Firebase connection and permissions.</p>
        <button class="btn-outline" id="retryLatestArticlesBtn" type="button">Retry loading articles</button>
      </div>
    `;
    container.querySelector('#retryLatestArticlesBtn')
      ?.addEventListener('click', () => initLatestArticles());
  }
}

function getPostViews(post) {
  const views = Number(post.views || 0);
  return Number.isFinite(views) && views > 0 ? views : 0;
}

function getLatestArticlesSnapshot() {
  if (!latestArticlesPromise) {
    latestArticlesPromise = (async () => {
      const { collection, db, getDocs, limit, orderBy, query, where } =
        await getFirestoreDependencies();
      try {
        const q = query(
          collection(db, 'posts'),
          where('status', '==', 'published'),
          orderBy('publishedAt', 'desc'),
          limit(ARTICLES_PER_PAGE)
        );
        return { snapshot: await getDocs(q), usedFallback: false };
      } catch (orderErr) {
        console.warn('Ordered query for latest articles failed; using a limited fallback:', orderErr);
        const fallbackQ = query(
          collection(db, 'posts'),
          where('status', '==', 'published'),
          limit(ARTICLES_PER_PAGE)
        );
        return { snapshot: await getDocs(fallbackQ), usedFallback: true };
      }
    })().catch(error => {
      latestArticlesPromise = null;
      throw error;
    });
  }
  return latestArticlesPromise;
}

async function loadMoreArticles() {
  if (!lastArticleDoc || isLoadingMore) return;
  isLoadingMore = true;
  const loadMoreBtn = document.getElementById('loadMoreArticlesBtn');
  if (loadMoreBtn) loadMoreBtn.textContent = 'Loading...';

  let handleFirestoreError;
  try {
    const runtime = await getFirestoreDependencies();
    const {
      collection, db, getDocs, isConfigured, limit,
      orderBy, query, startAfter, where,
    } = runtime;
    handleFirestoreError = runtime.handleFirestoreError;
    if (!isConfigured || !db) {
      throw new Error('Firestore is not configured for homepage pagination.');
    }

    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'published'),
      orderBy('publishedAt', 'desc'),
      startAfter(lastArticleDoc),
      limit(ARTICLES_PER_PAGE)
    );

    const snapshot = await getDocs(q);
    const container = document.getElementById('latestArticlesContainer');

    if (!snapshot.empty) {
      lastArticleDoc = snapshot.docs[snapshot.docs.length - 1];
      snapshot.forEach(doc => {
        container.appendChild(createArticleCard(doc.id, doc.data()));
      });
    }

    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Load More Stories';
      if (snapshot.docs.length < ARTICLES_PER_PAGE) {
        loadMoreBtn.style.display = 'none';
      }
    }
  } catch (error) {
    if (handleFirestoreError) {
      handleFirestoreError(error, 'list', 'posts');
    } else {
      console.error('Could not load more homepage articles.', error);
    }
    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Retry loading stories';
      loadMoreBtn.style.display = 'inline-flex';
    }
  } finally {
    isLoadingMore = false;
  }
}

/**
 * Prefer articles with recent activity, then fill remaining places by lifetime views.
 */
async function initTrendingArticles() {
  const container = document.getElementById('trendingList');
  if (!container) return;

  let runtime;
  try {
    runtime = await getFirestoreDependencies();
  } catch (error) {
    console.error('Could not initialize homepage trending stories.', error);
    renderTrendingError(container, () => initTrendingArticles());
    return;
  }
  const { collection, db, getDocs, handleFirestoreError, isConfigured, limit, orderBy, query, where } = runtime;
  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px;">
        <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
      </div>
    `;
    return;
  }

  try {
    let recentDocs = [];
    try {
      const recentQuery = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        orderBy('lastViewedAt', 'desc'),
        limit(5)
      );
      recentDocs = (await getDocs(recentQuery)).docs;
    } catch (recentQueryError) {
      console.warn('Recent trending query failed; falling back to lifetime views:', recentQueryError);
    }

    const recentIds = new Set(recentDocs.map(post => post.id));
    let lifetimeDocs = [];
    try {
      const lifetimeQuery = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        orderBy('views', 'desc'),
        limit(10)
      );
      lifetimeDocs = (await getDocs(lifetimeQuery)).docs;
    } catch (lifetimeQueryError) {
      console.warn('Lifetime trending query failed; using a limited published-post fallback:', lifetimeQueryError);
      lifetimeDocs = (await getDocs(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        limit(10)
      ))).docs.sort((left, right) =>
        getPostViews(right.data()) - getPostViews(left.data())
      );
    }
    const docs = [
      ...recentDocs,
      ...lifetimeDocs.filter(post => !recentIds.has(post.id) && getPostViews(post.data()) > 0)
    ].slice(0, 5);

    if (docs.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = docs.map((doc, idx) => {
      const post = doc.data();
      const title = escapeHtml(post.title || 'Untitled article');
      const category = escapeHtml(post.category || '');
      const coverImage = escapeHtml(getSafeImageUrl(
        post.coverImage,
        'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=200&q=80'
      ));
      return `
        <div class="trending-item">
          <span class="trending-rank">0${idx + 1}</span>
          <img class="trending-thumb" src="${coverImage}" alt="${title}" width="200" height="150" loading="lazy" decoding="async" />
          <div class="trending-info">
            ${category ? `<span class="trending-category">${category}</span>` : ''}
            <h4 class="trending-title">
              <a href="${getArticlePath(post)}">${title}</a>
            </h4>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    renderTrendingError(container, () => initTrendingArticles());
  }
}

async function initPopularAnime() {
  const container = document.getElementById('homePopularAnimeContainer');
  if (!container) return;

  try {
    const runtime = await getFirestoreDependencies();
    if (!runtime.isConfigured || !runtime.db) {
      renderHomeDataMessage(container, 'The anime catalogue is not available right now.');
      return;
    }

    const snapshot = await runtime.getDocs(runtime.query(
      runtime.collection(runtime.db, 'anime'),
      runtime.where('visibility', '==', 'published'),
      runtime.orderBy('rating', 'desc'),
      runtime.limit(12)
    ));
    const anime = selectPopularAnime(snapshot.docs.map(document => ({
      id: document.id,
      ...document.data(),
    })), 6);

    if (!anime.length) {
      renderHomeDataMessage(container, 'No published anime with a catalogue rating are available yet.');
      return;
    }
    container.replaceChildren(...anime.map(createAnimeCard));
  } catch (error) {
    console.error('Could not load the homepage popular anime list.', error);
    renderHomeDataMessage(container, 'Unable to load the rated anime list. Please try again.', () => initPopularAnime());
  }
}

async function initUpcomingAnime() {
  const container = document.getElementById('homeUpcomingAnimeContainer');
  if (!container) return;

  try {
    const runtime = await getFirestoreDependencies();
    if (!runtime.isConfigured || !runtime.db) {
      renderHomeDataMessage(container, 'Upcoming anime are not available right now.');
      return;
    }

    const snapshot = await runtime.getDocs(runtime.query(
      runtime.collection(runtime.db, 'upcomingAnime'),
      runtime.where('status', '==', 'published'),
      runtime.limit(30)
    ));
    const seenIds = new Set();
    const upcoming = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(item => {
        if (item.status !== 'published' || seenIds.has(item.id)) return false;
        seenIds.add(item.id);
        return true;
      })
      .sort((left, right) => {
        const leftDate = getUpcomingReleaseTimestamp(left.releaseDate);
        const rightDate = getUpcomingReleaseTimestamp(right.releaseDate);
        return leftDate - rightDate ||
          String(left.title || '').localeCompare(String(right.title || ''));
      })
      .slice(0, 6);

    if (!upcoming.length) {
      renderHomeDataMessage(container, 'No upcoming anime have been published yet.');
      return;
    }
    container.replaceChildren(...upcoming.map(createUpcomingAnimeCard));
  } catch (error) {
    console.error('Could not load the homepage upcoming anime list.', error);
    renderHomeDataMessage(container, 'Unable to load upcoming anime. Please try again.', () => initUpcomingAnime());
  }
}

function renderHomeDataMessage(container, message, onRetry = null) {
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
  container.replaceChildren(state);
}

function renderTrendingError(container, onRetry) {
  container.innerHTML = `
    <div class="empty-state" style="padding: 24px 16px;">
      <p class="empty-state-desc">Unable to load trending stories. Please try again.</p>
      <button class="btn-outline" id="retryTrendingStoriesBtn" type="button">Retry</button>
    </div>
  `;
  container.querySelector('#retryTrendingStoriesBtn')
    ?.addEventListener('click', onRetry);
}

/**
 * Mobile Navigation Menu Handler
 */
// Initialize on page load
function initHomepage() {
  setupMobileNav();
  initHeroSlider().then(() => {
    let secondaryContentStarted = false;
    const loadSecondaryContent = () => {
      if (secondaryContentStarted) return;
      secondaryContentStarted = true;
      requestAnimationFrame(() => {
        initLatestArticles();
        initTrendingArticles();
        initPopularAnime();
        initUpcomingAnime();
      });
    };
    const heroImage = document.querySelector('#heroSliderContainer .slider-slide.active .slide-bg');
    if (!heroImage || heroImage.complete) {
      loadSecondaryContent();
    } else {
      heroImage.addEventListener('load', loadSecondaryContent, { once: true });
      heroImage.addEventListener('error', loadSecondaryContent, { once: true });
    }
    window.setTimeout(loadSecondaryContent, 1200);
  });
}

if (document.getElementById('heroSliderContainer')) {
  initHomepage();
}
