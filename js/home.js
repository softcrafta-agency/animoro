import { createArticleCard, formatDate, setupMobileNav } from './ui.js';
import { getArticlePath } from './article-url.js';

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
    }));
  }
  return firestoreDependenciesPromise;
}

function getFeaturedFeed() {
  if (!featuredFeedPromise) {
    featuredFeedPromise = fetch('/api/featured', { cache: 'no-cache' })
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
    let deferredSection = '';
    if (featuredFeed) {
      featuredSlides = featuredFeed.featured.length
        ? featuredFeed.featured
        : featuredFeed.latest;
      isFallbackToLatest = featuredFeed.featured.length === 0;
      deferredSection = featuredFeed.deferredSection;
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
      loadDeferredSlideImagesWhenHeroReady(container, deferredSection);
    } else {
      startAutoSlide(INITIAL_AUTO_SLIDE_DELAY_MS);
    }
  } catch (error) {
    console.error('Featured story loading failed:', error);
    renderSliderEmptyState(container, "Unable to load featured stories. Please verify your Firestore connection.");
  }
}

function renderSliderEmptyState(container, message) {
  container.innerHTML = `
    <div class="empty-state" style="height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
      <h3 class="empty-state-title">No Featured Stories</h3>
      <p class="empty-state-desc">${message}</p>
    </div>
  `;
}

function renderSlides(container, slides) {
  const trackHtml = slides.map((post, idx) => {
    const articlePath = getArticlePath(post);
    const coverImage = post.coverImageDeferred
      ? ''
      : post.coverImage || FALLBACK_COVER_IMAGE;
    return `
    <div class="slider-slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
      <img class="slide-bg" ${coverImage ? `src="${coverImage}"` : ''} alt="${post.title}" width="1600" height="900" loading="${idx === 0 ? 'eager' : 'lazy'}" fetchpriority="${idx === 0 ? 'high' : 'auto'}" decoding="async" />
      <div class="slide-overlay"></div>
      <div class="slide-content">
        <span class="badge-featured">Featured Story</span>
        <span class="badge-category">${post.category || 'Anime'}</span>
        <h2 class="slide-title">
          <a href="${articlePath}">${post.title}</a>
        </h2>
        <p class="slide-excerpt">${post.excerpt || ''}</p>
        <div class="slide-meta">
          <div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            <span>${post.authorName || 'Animoro Editor'}</span>
          </div>
          <div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span>${formatDate(post.publishedAt || post.createdAt)}</span>
          </div>
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

async function loadDeferredSlideImages(container, section) {
  const imageProperty = section === 'featured' ? 'featuredImages' : 'latestImages';
  try {
    const response = await fetch('/api/featured?images=1', { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`Featured image feed returned HTTP ${response.status}.`);
    }
    const feed = await response.json();
    const images = feed[imageProperty];
    if (!Array.isArray(images)) {
      throw new Error('Featured image feed returned an invalid response.');
    }

    const coverImages = new Map(images.map(image => [image.id, image.coverImage]));
    featuredSlides = featuredSlides.map(post => ({
      ...post,
      coverImage: post.coverImage || coverImages.get(post.id) || '',
    }));
  } catch (error) {
    console.warn('Could not load all featured images; using the default cover image where needed.', error);
  }

  featuredSlides.forEach((post, index) => {
    const image = container.querySelector(`.slider-slide[data-index="${index}"] .slide-bg`);
    if (image && !image.getAttribute('src')) {
      image.src = post.coverImage || FALLBACK_COVER_IMAGE;
    }
  });
}

function loadDeferredSlideImagesWhenHeroReady(container, section) {
  const firstImage = container.querySelector('.slider-slide.active .slide-bg');
  let started = false;
  const loadImages = () => {
    if (started) return;
    started = true;
    const hydrate = () => {
      loadDeferredSlideImages(container, section)
        .finally(() => startAutoSlide(INITIAL_AUTO_SLIDE_DELAY_MS));
    };

    if (!firstImage || typeof firstImage.decode !== 'function') {
      hydrate();
      return;
    }
    firstImage.decode().then(hydrate, error => {
      console.warn('Could not decode the initial featured image before loading the other slides.', error);
      hydrate();
    });
  };

  if (!firstImage || firstImage.complete) {
    loadImages();
  } else {
    firstImage.addEventListener('load', loadImages, { once: true });
    firstImage.addEventListener('error', loadImages, { once: true });
  }
}

function goToSlide(index) {
  if (!featuredSlides.length) return;
  const slides = document.querySelectorAll('.slider-slide');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (index >= featuredSlides.length) index = 0;
  if (index < 0) index = featuredSlides.length - 1;
  
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

  const { collection, db, getDocs, handleFirestoreError, isConfigured, limit, orderBy, query, where } =
    await getFirestoreDependencies();
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
      loadMoreBtn.addEventListener('click', loadMoreArticles);
    }
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 class="empty-state-title">Unable to load articles</h3>
        <p class="empty-state-desc">Please check your Firebase connection and permissions.</p>
      </div>
    `;
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
    })();
  }
  return latestArticlesPromise;
}

async function loadMoreArticles() {
  if (!lastArticleDoc || isLoadingMore) return;
  const {
    collection, db, getDocs, handleFirestoreError, isConfigured, limit,
    orderBy, query, startAfter, where,
  } = await getFirestoreDependencies();
  if (!isConfigured || !db) return;
  isLoadingMore = true;
  const loadMoreBtn = document.getElementById('loadMoreArticlesBtn');
  if (loadMoreBtn) loadMoreBtn.textContent = 'Loading...';

  try {
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
    handleFirestoreError(error, 'list', 'posts');
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

  const { collection, db, getDocs, handleFirestoreError, isConfigured, limit, orderBy, query, where } =
    await getFirestoreDependencies();
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
      ...lifetimeDocs.filter(post => !recentIds.has(post.id))
    ].slice(0, 5);

    if (docs.length === 0) {
      const fallbackSnapshot = await getDocs(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        limit(5)
      ));
      docs.push(...fallbackSnapshot.docs);
    }

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
      return `
        <div class="trending-item">
          <span class="trending-rank">0${idx + 1}</span>
          <img class="trending-thumb" src="${post.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=200&q=80'}" alt="${post.title}" width="200" height="150" loading="lazy" decoding="async" />
          <div class="trending-info">
            <span class="trending-category">${post.category || 'Anime'}</span>
            <h4 class="trending-title">
              <a href="${getArticlePath(post)}">${post.title}</a>
            </h4>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px 16px;">
        <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
      </div>
    `;
  }
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
