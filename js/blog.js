import { formatDate, setupMobileNav } from './ui.js';
import {
  getArticlePath,
  getArticleSlug,
  getCanonicalArticleUrl,
  isValidArticleSlug,
  normalizeArticleSlug
} from './article-url.js';
import { getAnimePath, isValidAnimeSlug } from './anime-url.js';
import { sanitizeArticleEditorHtml } from './article-content.js';
import { getArticleSeo } from './article-seo.js';

const VISITOR_ID_KEY = 'animoro_visitor_id';
const THEME_STORAGE_KEY = 'animoro-theme';
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;
let firestoreRuntimePromise = null;

function getFirestoreRuntime() {
  if (!firestoreRuntimePromise) {
    firestoreRuntimePromise = Promise.all([
      import('firebase/firestore'),
      import('./firebase-init.js'),
    ]).then(([firestore, firebase]) => ({
      ...firebase,
      collection: firestore.collection,
      doc: firestore.doc,
      getDoc: firestore.getDoc,
      getDocs: firestore.getDocs,
      limit: firestore.limit,
      query: firestore.query,
      runTransaction: firestore.runTransaction,
      serverTimestamp: firestore.serverTimestamp,
      where: firestore.where,
    }));
  }
  return firestoreRuntimePromise;
}

function getPreferredTheme() {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      return savedTheme;
    }
  } catch (error) {
    console.warn('Unable to read saved theme preference:', error);
  }

  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyThemePreference(theme) {
  const nextTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nextTheme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (error) {
    console.warn('Unable to save theme preference:', error);
  }
  const toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.textContent = nextTheme === 'light' ? '☾' : '☀';
    toggle.setAttribute('aria-label', nextTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }
}

function initThemeToggle() {
  const toggle = document.querySelector('[data-theme-toggle]');
  if (!toggle) return;
  const initialTheme = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
  applyThemePreference(initialTheme);
  toggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    applyThemePreference(currentTheme === 'light' ? 'dark' : 'light');
  });
}

function generateVisitorId() {
  const buffer = new Uint8Array(16);
  if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
    window.crypto.getRandomValues(buffer);
  } else {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.floor(Math.random() * 256);
    }
  }

  const hex = Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
  return `animoro_visitor_${hex}`;
}

function getOrCreateVisitorId() {
  const existingId = localStorage.getItem(VISITOR_ID_KEY);
  if (existingId && /^animoro_visitor_[a-f0-9]+$/i.test(existingId)) {
    return existingId;
  }

  const nextId = generateVisitorId();
  localStorage.setItem(VISITOR_ID_KEY, nextId);
  return nextId;
}

function getSafeViews(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function isPublicArticlePage() {
  const pathname = window.location.pathname.toLowerCase();
  return pathname === '/blog.html' || pathname.startsWith('/blog.html/') ||
    pathname.startsWith('/blog/');
}

function isPreviewRequest() {
  const params = new URLSearchParams(window.location.search);
  return params.has('preview') || params.get('mode') === 'preview' || params.has('adminPreview');
}

async function shouldSkipPublicViewTracking() {
  if (!isPublicArticlePage() || isPreviewRequest()) {
    return true;
  }

  if (localStorage.getItem('animoro_admin_user')) {
    return true;
  }

  try {
    const [{ auth }, { verifyAdminStatus }] = await Promise.all([
      import('./auth-init.js'),
      import('./auth.js'),
    ]);
    if (!auth || !auth.currentUser) {
      return false;
    }
    return await verifyAdminStatus(auth.currentUser);
  } catch (error) {
    console.warn('Unable to verify admin status for article view check:', error);
    return false;
  }
}

async function initBlogPage() {
  setupMobileNav();
  initThemeToggle();

  const renderedDataElement = document.getElementById('serverRenderedArticleData');
  if (renderedDataElement) {
    try {
      const renderedData = JSON.parse(renderedDataElement.textContent || '');
      if (renderedData?.id && renderedData?.canonicalUrl) {
        await hydrateServerRenderedArticle(renderedData);
        return;
      }
      throw new Error('Server-rendered article data was incomplete.');
    } catch (error) {
      console.error('Could not initialize the server-rendered article.', error);
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const articleId = urlParams.get('id');
  const requestedSlug = getRequestedSlug();

  const mainContainer = document.getElementById('blogArticleContainer');
  if (!mainContainer) return;

  if (!articleId && !requestedSlug) {
    window.location.replace('/404.html');
    return;
  }

  let runtime;
  try {
    runtime = await getFirestoreRuntime();
  } catch (error) {
    console.error('Could not load Firebase for this article.', error);
    renderArticleError(mainContainer, "Unable to load article. Please check your network connection.");
    return;
  }
  const { db, isConfigured, handleFirestoreError } = runtime;
  if (!isConfigured || !db) {
    renderArticleError(mainContainer, "Firebase is not configured yet. Connect Firebase in Settings to load this article.");
    return;
  }

  try {
    const { collection, doc, getDoc, getDocs, limit, query, where } = runtime;
    let postSnap;
    if (requestedSlug) {
      const postQuery = query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('slug', '==', requestedSlug),
        limit(1)
      );
      const matchingPosts = await getDocs(postQuery);
      postSnap = matchingPosts.docs[0] || null;
    } else {
      postSnap = await getDoc(doc(db, 'posts', articleId));
    }

    if (!postSnap || !postSnap.exists()) {
      window.location.replace('/404.html');
      return;
    }

    const post = postSnap.data();
    const postId = postSnap.id;

    // Check status: only show published articles to public visitors
    if (post.status !== 'published') {
      const isAdminSession = localStorage.getItem('animoro_admin_user');
      if (!isAdminSession) {
        renderArticleError(mainContainer, "This article is currently saved as a draft and is not public.");
        return;
      }
    }

    let slug = getArticleSlug(post);
    let shouldCanonicalizeLegacyUrl = true;
    if (!requestedSlug && !isValidArticleSlug(post.slug)) {
      const legacySlug = await resolveLegacyArticleSlug(articleId, post.title);
      slug = legacySlug.slug;
      shouldCanonicalizeLegacyUrl = legacySlug.persisted;
    }
    const articlePath = getArticlePath({ ...post, slug });
    const canonicalUrl = getCanonicalArticleUrl({ ...post, slug });

    if (shouldCanonicalizeLegacyUrl &&
        (window.location.pathname !== articlePath || urlParams.has('id'))) {
      window.location.replace(articlePath);
      return;
    }

    // Update dynamic SEO tags
    updateSeoTags(post, canonicalUrl);

    // Render article contents
    renderArticle(mainContainer, post, canonicalUrl);

    // Record a single unique public view per anonymous browser visitor per article.
    void recordCooldownArticleView(postId);

    // Load related articles
    void loadRelatedArticles(post, postId);

  } catch (error) {
    handleFirestoreError(error, requestedSlug ? 'list' : 'get', requestedSlug ? 'posts' : `posts/${articleId}`);
    renderArticleError(mainContainer, "Unable to load article. Please check your network connection.");
  }
}

async function hydrateServerRenderedArticle({ id, canonicalUrl }) {
  const container = document.getElementById('blogArticleContainer');
  if (!container) return;

  enhanceArticleLayout(container);

  const coverImage = container.querySelector('.article-cover-img');
  if (coverImage) {
    coverImage.addEventListener('error', () => {
      renderCoverImageFallback(coverImage.closest('.article-cover-wrap'));
    }, { once: true });
  }
  container.querySelectorAll('.article-content-container img').forEach(image => {
    image.loading = 'lazy';
    image.decoding = 'async';
  });

  const copyBtn = document.getElementById('copyShareBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  if (copyBtn && copyBtnText) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(canonicalUrl);
        copyBtnText.textContent = 'Copied!';
        setTimeout(() => { copyBtnText.textContent = 'Copy Link'; }, 2500);
      } catch {
        copyBtnText.textContent = 'Link copied';
      }
    });
  }

  void recordCooldownArticleView(id);
}

function getRequestedSlug() {
  const pathname = window.location.pathname;
  const prefix = ['/blog/', '/blog.html/'].find(candidate => pathname.startsWith(candidate));
  if (!prefix) return '';

  const encodedSlug = pathname.slice(prefix.length);
  if (!encodedSlug || encodedSlug.includes('/')) return '';

  try {
    const decodedSlug = decodeURIComponent(encodedSlug);
    if (decodedSlug.includes('/') || decodedSlug.includes('\\')) return '';
    return isValidArticleSlug(decodedSlug) ? decodedSlug : '';
  } catch (error) {
    console.warn('Invalid encoded article slug in URL:', error);
    return '';
  }
}

async function resolveLegacyArticleSlug(articleId, title) {
  try {
    const response = await fetch(`/api/article-slug?id=${encodeURIComponent(articleId)}`);
    if (!response.ok) {
      throw new Error(`Article slug migration returned HTTP ${response.status}.`);
    }

    const result = await response.json();
    if (typeof result.slug !== 'string' || !result.slug) {
      throw new Error('Article slug migration returned an invalid slug.');
    }
    return { slug: result.slug, persisted: true };
  } catch (error) {
    console.error('Could not persist a slug for this legacy article:', error);
    return { slug: normalizeArticleSlug(title), persisted: false };
  }
}

/**
 * Atomically count one view per anonymous browser every 24 hours per article.
 */
async function recordCooldownArticleView(articleId) {
  if (!articleId) {
    return;
  }

  try {
    if (await shouldSkipPublicViewTracking()) {
      return;
    }

    const { db, doc, runTransaction, serverTimestamp } = await getFirestoreRuntime();
    if (!db) return;
    const postRef = doc(db, 'posts', articleId);
    const visitorId = getOrCreateVisitorId();

    await runTransaction(db, async (transaction) => {
      const viewerRef = doc(db, 'posts', articleId, 'viewers', visitorId);
      const viewerSnap = await transaction.get(viewerRef);
      const previousView = viewerSnap.data()?.viewedAt?.toMillis?.() || 0;
      if (Date.now() - previousView < VIEW_COOLDOWN_MS) {
        return;
      }

      const postSnap = await transaction.get(postRef);
      const currentViews = getSafeViews(postSnap.data()?.views);
      const nextViews = currentViews + 1;

      const viewerData = { viewedAt: serverTimestamp() };
      if (viewerSnap.exists()) transaction.update(viewerRef, viewerData);
      else transaction.set(viewerRef, viewerData);
      transaction.update(postRef, {
        views: nextViews,
        lastViewedAt: serverTimestamp()
      });
    });
  } catch (error) {
    console.warn('Could not record public article view:', error);
  }
}

/**
 * Update Page Title & OpenGraph Meta Tags
 */
function updateSeoTags(post, canonicalUrl) {
  const { title, description } = getArticleSeo(post);
  document.title = `${title} — Animoro`;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', description);

  setSingleMetaTag('property', 'og:type', 'article');
  setSingleMetaTag('property', 'og:title', title);
  setSingleMetaTag('property', 'og:description', description);
  setSingleMetaTag('property', 'og:url', canonicalUrl);
  if (post.coverImage) {
    setSingleMetaTag('property', 'og:image', post.coverImage);
    setSingleMetaTag('name', 'twitter:image', post.coverImage);
  }
  setSingleMetaTag('name', 'twitter:card', post.coverImage ? 'summary_large_image' : 'summary');
  setSingleMetaTag('name', 'twitter:title', title);
  setSingleMetaTag('name', 'twitter:description', description);

  const canonicalLinks = [...document.querySelectorAll('link[rel~="canonical"]')];
  const canonicalLink = canonicalLinks.shift() || document.createElement('link');
  canonicalLink.rel = 'canonical';
  canonicalLink.href = canonicalUrl;
  if (!canonicalLink.isConnected) document.head.appendChild(canonicalLink);
  canonicalLinks.forEach(link => link.remove());
  setArticleStructuredData(post, canonicalUrl, title, description);
}

function setArticleStructuredData(post, canonicalUrl, title, description) {
  const datePublished = toIsoDateTime(post.publishedAt);
  const dateModified = toIsoDateTime(post.updatedAt);
  const image = getPublicImageUrl(post.coverImage);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    publisher: {
      '@type': 'Organization',
      name: 'Animoro',
      url: 'https://www.animoro.in/'
    },
    ...(image ? { image: [image] } : {}),
    ...(post.authorName ? { author: { '@type': 'Person', name: post.authorName } } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
  };
  let script = document.getElementById('articleJsonLd');
  if (!script) {
    script = document.createElement('script');
    script.id = 'articleJsonLd';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
}

function toIsoDateTime(value) {
  if (!value) return '';
  const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getPublicImageUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function setSingleMetaTag(attribute, name, content) {
  const selector = `meta[${attribute}="${name}"]`;
  const tags = [...document.querySelectorAll(selector)];
  const meta = tags.shift() || document.createElement('meta');
  meta.setAttribute(attribute, name);
  meta.setAttribute('content', content);
  if (!meta.isConnected) document.head.appendChild(meta);
  tags.forEach(tag => tag.remove());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCoverImageSource(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return '';
}

function renderCoverImageFallback(wrap) {
  if (!wrap) return;
  wrap.innerHTML = `
    <p style="padding: 24px; color: var(--text-muted); text-align: center; margin: 0;">
      Cover image could not be loaded. The saved URL may not be a direct image link or may block external websites.
    </p>
  `;
}

function getArticleReadingTime(content) {
  const text = document.createElement('div');
  text.innerHTML = content;
  const words = text.textContent.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function renderArticleBreadcrumbs(post) {
  const category = typeof post.category === 'string' ? post.category.trim() : '';
  return `<nav aria-label="Breadcrumb" class="article-breadcrumbs"><ol>
    <li><a href="/">Home</a></li>
    <li><a href="/blogs.html">Articles</a></li>
    ${category ? `<li><a href="/category.html?category=${encodeURIComponent(category)}">${escapeHtml(category)}</a></li>` : ''}
    <li aria-current="page">${escapeHtml(post.title || 'Article')}</li>
  </ol></nav>`;
}

function renderArticle(container, post, canonicalUrl) {
  const tagsHtml = (post.tags || []).map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  const currentUrl = canonicalUrl;
  const coverSource = getCoverImageSource(post.coverImage);
  const category = typeof post.category === 'string' && post.category.trim()
    ? post.category.trim()
    : '';
  const publishedDate = post.publishedAt;
  const isoPublishedDate = toIsoDateTime(publishedDate);
  const visiblePublishedDate = formatDate(publishedDate);
  const authorName = typeof post.authorName === 'string' && post.authorName.trim()
    ? post.authorName.trim()
    : '';
  const articleContent = sanitizeArticleEditorHtml(post.content);
  const readingTime = getArticleReadingTime(articleContent);

  container.innerHTML = `
    ${renderArticleBreadcrumbs(post)}
    <header class="article-header${coverSource ? ' has-cover' : ''}">
      <div class="article-intro-copy">
        <div class="article-header-meta">
          ${category ? `<a href="/category.html?category=${encodeURIComponent(category)}" class="badge-category">${escapeHtml(category)}</a>` : ''}
          ${isValidAnimeSlug(post.animeSlug) ? `
            <a href="${getAnimePath({ slug: post.animeSlug, title: post.animeTitle })}" class="badge-category">
              ${escapeHtml(post.animeTitle || 'Anime')}
            </a>
          ` : ''}
          ${visiblePublishedDate ? `<time${isoPublishedDate ? ` datetime="${escapeHtml(isoPublishedDate)}"` : ''}>${escapeHtml(visiblePublishedDate)}</time>` : ''}
        </div>
        <h1 class="article-page-title">${escapeHtml(post.title || 'Untitled Article')}</h1>
        ${post.excerpt ? `<p class="article-excerpt-lead">${escapeHtml(post.excerpt)}</p>` : ''}
        <div class="article-author-bar">
          ${authorName ? `<div class="article-author-details">
            <div class="article-author-avatar-lg" aria-hidden="true">${escapeHtml(authorName.charAt(0).toUpperCase())}</div>
            <span class="article-author-name">${escapeHtml(authorName)}</span>
          </div>` : ''}
          <span class="article-reading-time">${readingTime} min read</span>
        </div>
      </div>
      ${coverSource ? `
        <div class="article-cover-wrap">
          <img class="article-cover-img" alt="${escapeHtml(post.title || 'Article cover')}" width="1600" height="900" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" />
        </div>
      ` : ''}
    </header>
    <div class="article-reading-progress" role="progressbar" aria-label="Article reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0% read">
      <span class="article-reading-progress-label">Reading progress</span>
      <span class="article-reading-progress-value">0%</span>
      <div class="article-reading-progress-track"><span></span></div>
    </div>
    <div class="article-reading-layout" id="articleReadingLayout">
      <main class="article-content-container" id="articleBody">
        ${articleContent}
        ${tagsHtml ? `<div class="article-tags-wrap"><span style="font-weight: 600; color: var(--text-muted); font-size: 0.85rem;">TAGS:</span> ${tagsHtml}</div>` : ''}
        <div class="article-share-bar">
          <span style="font-weight: 600; font-size: 0.88rem; color: var(--text-muted);">SHARE ARTICLE:</span>
          <button class="share-btn" id="copyShareBtn" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 0-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span id="copyBtnText">Copy Link</span>
          </button>
          <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(currentUrl)}" target="_blank" rel="noopener noreferrer">Twitter / X</a>
          <a class="share-btn" href="https://reddit.com/submit?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent(post.title)}" target="_blank" rel="noopener noreferrer">Reddit</a>
        </div>
      </main>
    </div>
    <section class="article-related-section" id="articleRelatedSection" aria-labelledby="articleRelatedHeading" hidden>
      <h2 id="articleRelatedHeading">Related Articles</h2>
      <div class="article-related-grid" id="relatedArticlesContainer"></div>
    </section>
  `;

  const coverImg = container.querySelector('.article-cover-img');
  if (coverImg) {
    coverImg.src = coverSource;
    coverImg.onerror = () => {
      const wrap = coverImg.closest('.article-cover-wrap');
      renderCoverImageFallback(wrap);
    };
  }

  container.querySelectorAll('.article-content-container img').forEach(image => {
    image.loading = 'lazy';
    image.decoding = 'async';
  });
  enhanceArticleLayout(container);

  // Attach share link copy handler
  const copyBtn = document.getElementById('copyShareBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  if (copyBtn && copyBtnText) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(canonicalUrl);
        copyBtnText.textContent = "Copied!";
        setTimeout(() => { copyBtnText.textContent = "Copy Link"; }, 2500);
      } catch (err) {
        copyBtnText.textContent = "Link copied";
      }
    });
  }
}

function enhanceArticleLayout(container) {
  const articleBody = container.querySelector('#articleBody');
  if (!articleBody || articleBody.dataset.editorialLayout === 'true') return;
  articleBody.dataset.editorialLayout = 'true';

  const headings = Array.from(articleBody.querySelectorAll('h2, h3'))
    .filter(heading => heading.textContent.trim());
  if (headings.length >= 2) {
    const headingSet = new Set(headings);
    const usedIds = new Set(Array.from(document.querySelectorAll('[id]'))
      .filter(element => !headingSet.has(element))
      .map(element => element.id));
    const items = headings.map((heading, index) => {
      const text = heading.textContent.trim();
      const slug = text.toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `section-${index + 1}`;
      const existingId = /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(heading.id) ? heading.id : '';
      const baseId = existingId && !usedIds.has(existingId) ? existingId : slug;
      let id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
      usedIds.add(id);
      heading.id = id;

      const item = document.createElement('li');
      if (heading.tagName === 'H3') item.className = 'article-toc-subitem';
      const link = document.createElement('a');
      link.href = `#${id}`;
      link.textContent = text;
      item.appendChild(link);
      return item;
    });

    const aside = document.createElement('aside');
    aside.className = 'article-toc-sidebar';
    aside.setAttribute('aria-label', 'Article navigation');
    const details = document.createElement('details');
    details.className = 'article-toc-panel';
    details.open = !window.matchMedia('(max-width: 1024px)').matches;
    const summary = document.createElement('summary');
    summary.textContent = 'Table of Contents';
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Table of contents');
    const list = document.createElement('ol');
    items.forEach(item => list.appendChild(item));
    nav.appendChild(list);
    details.append(summary, nav);
    aside.appendChild(details);

    const layout = container.querySelector('#articleReadingLayout');
    if (layout) {
      layout.insertBefore(aside, articleBody);
      layout.classList.add('has-toc');
    }

    const links = Array.from(aside.querySelectorAll('a'));
    let activeFrame = false;
    const updateActiveHeading = () => {
      activeFrame = false;
      let activeIndex = 0;
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= 120) activeIndex = index;
      });
      links.forEach((link, index) => {
        if (index === activeIndex) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    const scheduleActiveHeading = () => {
      if (activeFrame) return;
      activeFrame = true;
      window.requestAnimationFrame(updateActiveHeading);
    };
    window.addEventListener('scroll', scheduleActiveHeading, { passive: true });
    window.addEventListener('resize', scheduleActiveHeading);
    scheduleActiveHeading();
  }

  initReadingProgress(articleBody);
}

function initReadingProgress(articleBody) {
  if (articleBody.dataset.progressReady === 'true') return;
  articleBody.dataset.progressReady = 'true';

  const progress = articleBody.closest('#blogArticleContainer')?.querySelector('.article-reading-progress');
  const fill = progress?.querySelector('.article-reading-progress-track > span');
  const value = progress?.querySelector('.article-reading-progress-value');
  if (!progress || !fill || !value) return;

  let scheduled = false;
  const update = () => {
    scheduled = false;
    const rect = articleBody.getBoundingClientRect();
    const articleTop = rect.top + window.scrollY;
    const articleHeight = Math.max(1, articleBody.scrollHeight);
    const percent = Math.max(0, Math.min(100, Math.round(
      ((window.scrollY - articleTop) / articleHeight) * 100
    )));
    fill.style.transform = `scaleX(${percent / 100})`;
    progress.setAttribute('aria-valuenow', String(percent));
    progress.setAttribute('aria-valuetext', `${percent}% read`);
    value.textContent = `${percent}%`;
  };
  const scheduleUpdate = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate);
  scheduleUpdate();
}

async function loadRelatedArticles(currentPost, currentId) {
  const container = document.getElementById('relatedArticlesContainer');
  const section = document.getElementById('articleRelatedSection');
  const category = currentPost.category;
  if (!container || !section) return;

  const hideSection = () => { section.hidden = true; };

  try {
    const { db, collection, limit, query, where } = await getFirestoreRuntime();
    if (!db) return;
    const tags = Array.isArray(currentPost.tags)
      ? currentPost.tags.filter(tag => typeof tag === 'string' && tag.trim()).slice(0, 10)
      : [];
    const keywords = [
      currentPost.primaryKeyword,
      ...(Array.isArray(currentPost.secondaryKeywords) ? currentPost.secondaryKeywords : []),
      ...(Array.isArray(currentPost.keywords) ? currentPost.keywords : []),
    ].filter(keyword => typeof keyword === 'string' && keyword.trim()).slice(0, 10);
    const queries = [];
    if (typeof category === 'string' && category.trim()) {
      queries.push(loadRelatedCandidates(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('category', '==', category.trim()),
        limit(18)
      )));
    }
    if (isValidAnimeSlug(currentPost.animeSlug)) {
      queries.push(loadRelatedCandidates(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('animeSlug', '==', currentPost.animeSlug),
        limit(12)
      )));
    }
    if (tags.length) {
      queries.push(loadRelatedCandidates(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('tags', 'array-contains-any', tags),
        limit(12)
      )));
    }
    if (keywords.length) {
      queries.push(loadRelatedCandidates(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('secondaryKeywords', 'array-contains-any', keywords),
        limit(12)
      )));
      queries.push(loadRelatedCandidates(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('keywords', 'array-contains-any', keywords),
        limit(12)
      )));
    }

    const candidateGroups = await Promise.all(queries);
    const candidatePosts = new Map();
    candidateGroups.flat().forEach(item => {
      if (item.status === 'published' && item.id !== currentId) candidatePosts.set(item.id, item);
    });
    const currentTags = new Set(tags.map(tag => tag.toLowerCase()));
    const currentTitleWords = new Set(
      String(currentPost.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3)
    );
    const seenRelatedSlugs = new Set();
    const related = [...candidatePosts.values()]
      .filter(post => post.id !== currentId)
      .map(post => {
        const postTags = Array.isArray(post.tags) ? post.tags : [];
        const matchingTags = postTags.filter(tag => currentTags.has(String(tag).toLowerCase())).length;
        const postKeywords = [
          ...(Array.isArray(post.secondaryKeywords) ? post.secondaryKeywords : []),
          ...(Array.isArray(post.keywords) ? post.keywords : []),
        ].map(keyword => String(keyword).toLowerCase());
        const currentKeywords = new Set(keywords.map(keyword => keyword.toLowerCase()));
        const matchingKeywords = postKeywords.filter(keyword => currentKeywords.has(keyword)).length;
        const sameAnime = currentPost.animeSlug && post.animeSlug === currentPost.animeSlug;
        const keywordMatch = [...currentTitleWords].some(word =>
          String(post.title || '').toLowerCase().includes(word)
        );
        const score = (sameAnime ? 100 : 0) + matchingKeywords * 15 + matchingTags * 10 +
          (category && post.category === category ? 5 : 0) + (keywordMatch ? 1 : 0);
        return { post, score };
      })
      .filter(item => item.score > 0 && isValidArticleSlug(item.post.slug) &&
        typeof item.post.title === 'string' && item.post.title.trim())
      .sort((a, b) => b.score - a.score)
      .filter(({ post }) => {
        if (seenRelatedSlugs.has(post.slug)) return false;
        seenRelatedSlugs.add(post.slug);
        return true;
      })
      .slice(0, 4)
      .map(item => item.post);

    if (related.length === 0) {
      hideSection();
      return;
    }

    container.replaceChildren();
    related.forEach(post => {
      const card = document.createElement('a');
      card.className = 'article-related-card';
      card.href = getArticlePath(post);
      const titleText = post.title.trim();

      const imageSource = getCoverImageSource(post.coverImage);
      if (imageSource) {
        const image = document.createElement('img');
        image.src = imageSource;
        image.alt = `${titleText} article cover`;
        image.width = 800;
        image.height = 450;
        image.loading = 'lazy';
        image.decoding = 'async';
        card.appendChild(image);
      } else {
        card.classList.add('article-related-card-no-image');
      }

      const copy = document.createElement('span');
      copy.className = 'article-related-copy';
      const title = document.createElement('span');
      title.className = 'article-related-title';
      title.textContent = titleText;
      copy.appendChild(title);

      const dateValue = post.publishedAt;
      const dateTime = toIsoDateTime(dateValue);
      const visibleDate = formatDate(dateValue);
      if (dateTime && visibleDate) {
        const time = document.createElement('time');
        time.dateTime = dateTime;
        time.textContent = visibleDate;
        copy.appendChild(time);
      }

      card.appendChild(copy);
      container.appendChild(card);
    });
    if (container.childElementCount) {
      section.hidden = false;
    } else {
      hideSection();
    }
  } catch (err) {
    console.warn("Could not load related articles:", err);
    hideSection();
  }
}

async function loadRelatedCandidates(candidateQuery) {
  try {
    const { getDocs } = await getFirestoreRuntime();
    const snapshot = await getDocs(candidateQuery);
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  } catch (error) {
    console.warn('A targeted related-article query was unavailable:', error);
    return [];
  }
}

function renderArticleError(container, message) {
  container.innerHTML = `
    <div class="empty-state" style="margin: 60px auto; max-width: 600px;">
      <div class="empty-state-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
      </div>
      <h2 class="empty-state-title">Article Not Available</h2>
      <p class="empty-state-desc">${message}</p>
      <div style="margin-top: 24px;">
        <a href="index.html" class="btn-cta">Return to Homepage</a>
      </div>
    </div>
  `;
}

initBlogPage();
