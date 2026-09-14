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

let featuredSlides = [];
let currentSlideIndex = 0;
let slideInterval = null;
let lastArticleDoc = null;
let isLoadingMore = false;
const ARTICLES_PER_PAGE = 6;

// Format timestamp helper
export function formatDate(timestamp) {
  if (!timestamp) return 'Recent';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Format view count
export function formatViews(views) {
  const num = views || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

/**
 * Load and render Hero Slider from Firestore
 */
async function initHeroSlider() {
  const container = document.getElementById('heroSliderContainer');
  if (!container) return;

  if (!isConfigured || !db) {
    renderSliderEmptyState(container, "Configure Firebase in Settings to load featured stories from your database.");
    return;
  }

  try {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'published'),
      where('featured', '==', true),
      limit(5)
    );

    let snapshot = await getDocs(q);
    let isFallbackToLatest = false;
    if (snapshot.empty) {
      // Fallback: If no posts are explicitly marked featured, display the latest published posts
      const fallbackQ = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        limit(3)
      );
      snapshot = await getDocs(fallbackQ);
      isFallbackToLatest = true;
    }

    if (snapshot.empty) {
      renderSliderEmptyState(container, "No featured anime stories yet. Mark published articles as featured in the Admin panel.");
      return;
    }

    featuredSlides = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

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

    renderSlides(container, featuredSlides);
    setupSliderControls(container);
    startAutoSlide();
  } catch (error) {
    handleFirestoreError(error, 'list', 'posts');
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
  const trackHtml = slides.map((post, idx) => `
    <div class="slider-slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
      <img class="slide-bg" src="${post.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=1600&q=80'}" alt="${post.title}" loading="lazy" />
      <div class="slide-overlay"></div>
      <div class="slide-content">
        <span class="badge-featured">Featured Story</span>
        <span class="badge-category">${post.category || 'Anime'}</span>
        <h2 class="slide-title">
          <a href="blog.html?id=${post.id}">${post.title}</a>
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
          <div class="slide-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span>${formatViews(post.views)} views</span>
          </div>
        </div>
        <a href="blog.html?id=${post.id}" class="btn-cta">
          Read Article
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
        </a>
      </div>
    </div>
  `).join('');

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

function startAutoSlide() {
  stopAutoSlide();
  slideInterval = setInterval(() => {
    goToSlide(currentSlideIndex + 1);
  }, 5000);
}

function stopAutoSlide() {
  if (slideInterval) {
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
    let snapshot;
    let usedFallback = false;
    try {
      const q = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        orderBy('publishedAt', 'desc'),
        limit(ARTICLES_PER_PAGE)
      );
      snapshot = await getDocs(q);
    } catch (orderErr) {
      console.warn("Ordered query for latest articles failed, trying status filter:", orderErr);
      const fallbackQ = query(
        collection(db, 'posts'),
        where('status', '==', 'published')
      );
      snapshot = await getDocs(fallbackQ);
      usedFallback = true;
    }

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

async function loadMoreArticles() {
  if (!lastArticleDoc || isLoadingMore || !db) return;
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

export function createArticleCard(id, post) {
  const card = document.createElement('article');
  card.className = 'article-card';
  card.innerHTML = `
    <a href="blog.html?id=${id}" class="card-img-wrap">
      <img class="card-img" src="${post.coverImage || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80'}" alt="${post.title}" loading="lazy" />
      <span class="card-category-badge">${post.category || 'General'}</span>
      <span class="card-views-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
        ${formatViews(post.views)}
      </span>
    </a>
    <div class="card-body">
      <div class="card-meta">
        <span>${formatDate(post.publishedAt || post.createdAt)}</span>
      </div>
      <h3 class="card-title">
        <a href="blog.html?id=${id}">${post.title}</a>
      </h3>
      <p class="card-excerpt">${post.excerpt || ''}</p>
      <div class="card-footer">
        <div class="author-info">
          <div class="author-avatar">${(post.authorName || 'A')[0].toUpperCase()}</div>
          <span>${post.authorName || 'Animoro Editor'}</span>
        </div>
        <a href="blog.html?id=${id}" style="color: var(--accent-crimson); font-weight: 600; display: flex; align-items: center; gap: 4px;">
          Read
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </a>
      </div>
    </div>
  `;
  return card;
}

/**
 * Load and render Trending Articles ordered by views DESC
 */
async function initTrendingArticles() {
  const container = document.getElementById('trendingList');
  if (!container) return;

  if (!isConfigured || !db) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 32px 16px;">
        <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
      </div>
    `;
    return;
  }

  try {
    let snapshot;
    let usedFallback = false;
    try {
      const q = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        orderBy('views', 'desc'),
        limit(5)
      );
      snapshot = await getDocs(q);
    } catch (orderErr) {
      console.warn("Trending posts query with orderBy failed, using status filter:", orderErr);
      const fallbackQ = query(
        collection(db, 'posts'),
        where('status', '==', 'published')
      );
      snapshot = await getDocs(fallbackQ);
      usedFallback = true;
    }

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 32px 16px;">
          <p class="empty-state-desc">Trending stories will appear as readers discover Animoro.</p>
        </div>
      `;
      return;
    }

    let docs = [...snapshot.docs];
    if (usedFallback) {
      docs.sort((a, b) => (b.data().views || 0) - (a.data().views || 0));
      docs = docs.slice(0, 5);
    }

    container.innerHTML = docs.map((doc, idx) => {
      const post = doc.data();
      return `
        <div class="trending-item">
          <span class="trending-rank">0${idx + 1}</span>
          <img class="trending-thumb" src="${post.coverImage || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=200&q=80'}" alt="${post.title}" loading="lazy" />
          <div class="trending-info">
            <span class="trending-category">${post.category || 'Anime'}</span>
            <h4 class="trending-title">
              <a href="blog.html?id=${doc.id}">${post.title}</a>
            </h4>
            <div class="trending-views">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              <span>${formatViews(post.views)} views</span>
            </div>
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
export function setupMobileNav() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileBackdrop');
  const closeBtn = document.getElementById('drawerCloseBtn');

  if (!hamburgerBtn || !drawer || !backdrop) return;

  function openMenu() {
    drawer.classList.add('open');
    backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    document.body.style.overflow = '';
  }

  hamburgerBtn.addEventListener('click', openMenu);
  backdrop.addEventListener('click', closeMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupMobileNav();
  initHeroSlider();
  initLatestArticles();
  initTrendingArticles();
});
