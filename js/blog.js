import { 
  doc, 
  getDoc, 
  runTransaction, 
  serverTimestamp, 
  collection, 
  query, 
  where, 
  limit, 
  getDocs 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { auth } from './auth-init.js';
import { verifyAdminStatus } from './auth.js';
import { formatDate, createArticleCard, setupMobileNav } from './ui.js';
import {
  getArticlePath,
  getArticleSlug,
  getCanonicalArticleUrl,
  isValidArticleSlug,
  normalizeArticleSlug
} from './article-url.js';
import { getAnimePath, isValidAnimeSlug } from './anime-url.js';
import { sanitizeArticleEditorHtml } from './article-content.js';

const VISITOR_ID_KEY = 'animoro_visitor_id';
const VIEW_COOLDOWN_MS = 24 * 60 * 60 * 1000;

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
  return pathname === '/blog.html' || pathname.startsWith('/blog.html/');
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

  if (!auth || !auth.currentUser) {
    return false;
  }

  try {
    return await verifyAdminStatus(auth.currentUser);
  } catch (error) {
    console.warn('Unable to verify admin status for article view check:', error);
    return false;
  }
}

async function initBlogPage() {
  setupMobileNav();

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

  if (!isConfigured || !db) {
    renderArticleError(mainContainer, "Firebase is not configured yet. Connect Firebase in Settings to load this article.");
    return;
  }

  try {
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
    const postRef = doc(db, 'posts', postId);

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
    recordCooldownArticleView(postRef, postId);

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

  if (db) {
    recordCooldownArticleView(doc(db, 'posts', id), id);
  }
  if (!document.getElementById('relatedArticlesContainer')?.childElementCount) {
    const section = document.getElementById('relatedSection');
    if (section) section.style.display = 'none';
  }
}

function getRequestedSlug() {
  const prefix = '/blog.html/';
  const pathname = window.location.pathname;
  if (!pathname.startsWith(prefix)) return '';

  const encodedSlug = pathname.slice(prefix.length);
  if (!encodedSlug || encodedSlug.includes('/')) return '';

  try {
    const decodedSlug = decodeURIComponent(encodedSlug);
    if (decodedSlug.includes('/') || decodedSlug.includes('\\')) return '';
    return normalizeArticleSlug(decodedSlug);
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
async function recordCooldownArticleView(postRef, articleId) {
  if (!db || !articleId) {
    return;
  }

  try {
    if (await shouldSkipPublicViewTracking()) {
      return;
    }

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
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt || post.title;
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
  const datePublished = toIsoDateTime(post.publishedAt || post.createdAt);
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

function renderArticle(container, post, canonicalUrl) {
  const tagsHtml = (post.tags || []).map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  const currentUrl = canonicalUrl;
  const coverSource = getCoverImageSource(post.coverImage);

  container.innerHTML = `
    <header class="article-header">
      <div class="article-header-meta">
        <a href="category.html?category=${encodeURIComponent(post.category || 'Anime')}" class="badge-category" style="margin-left: 0;">
          ${escapeHtml(post.category || 'General')}
        </a>
        ${isValidAnimeSlug(post.animeSlug) ? `
          <a href="${getAnimePath({ slug: post.animeSlug, title: post.animeTitle })}" class="badge-category">
            ${escapeHtml(post.animeTitle || 'Anime')}
          </a>
        ` : ''}
        <span style="color: var(--text-muted); font-size: 0.85rem;">•</span>
        <span style="color: var(--text-secondary); font-size: 0.85rem;">${formatDate(post.publishedAt || post.createdAt)}</span>
      </div>

      <h1 class="article-page-title">${escapeHtml(post.title || 'Untitled Article')}</h1>
      
      ${post.excerpt ? `<p class="article-excerpt-lead">${escapeHtml(post.excerpt)}</p>` : ''}

      <div class="article-author-bar">
        <div class="article-author-details">
          <div class="article-author-avatar-lg">
            ${(post.authorName || 'A')[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight: 700; color: var(--text-primary);">${escapeHtml(post.authorName || 'Animoro Editor')}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Published in ${escapeHtml(post.category || 'Anime')}</div>
          </div>
        </div>

      </div>
    </header>

    ${coverSource ? `
      <div class="article-cover-wrap">
        <img class="article-cover-img" alt="${escapeHtml(post.title || 'Article cover')}" width="1600" height="900" loading="eager" fetchpriority="high" decoding="async" referrerpolicy="no-referrer" />
      </div>
    ` : ''}

    <main class="article-content-container" id="articleBody">
      ${sanitizeArticleEditorHtml(post.content)}

      ${tagsHtml ? `<div class="article-tags-wrap"><span style="font-weight: 600; color: var(--text-muted); font-size: 0.85rem;">TAGS:</span> ${tagsHtml}</div>` : ''}

      <div class="article-share-bar">
        <span style="font-weight: 600; font-size: 0.88rem; color: var(--text-muted);">SHARE ARTICLE:</span>
        <button class="share-btn" id="copyShareBtn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          <span id="copyBtnText">Copy Link</span>
        </button>
        <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(post.title)}&url=${encodeURIComponent(currentUrl)}" target="_blank" rel="noopener noreferrer">
          Twitter / X
        </a>
        <a class="share-btn" href="https://reddit.com/submit?url=${encodeURIComponent(currentUrl)}&title=${encodeURIComponent(post.title)}" target="_blank" rel="noopener noreferrer">
          Reddit
        </a>
      </div>
    </main>
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

async function loadRelatedArticles(currentPost, currentId) {
  const container = document.getElementById('relatedArticlesContainer');
  const category = currentPost.category;
  if (!container || !db) return;

  try {
    const tags = Array.isArray(currentPost.tags)
      ? currentPost.tags.filter(tag => typeof tag === 'string' && tag.trim()).slice(0, 10)
      : [];
    const queries = [
      loadRelatedCandidates(query(
        collection(db, 'posts'),
        where('status', '==', 'published'),
        where('category', '==', category || ''),
        limit(18)
      )),
    ];
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

    const candidateGroups = await Promise.all(queries);
    const candidatePosts = new Map();
    candidateGroups.flat().forEach(item => candidatePosts.set(item.id, item));
    const currentTags = new Set(tags.map(tag => tag.toLowerCase()));
    const currentTitleWords = new Set(
      String(currentPost.title || '').toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3)
    );
    const related = [...candidatePosts.values()]
      .filter(post => post.id !== currentId)
      .map(post => {
        const postTags = Array.isArray(post.tags) ? post.tags : [];
        const matchingTags = postTags.filter(tag => currentTags.has(String(tag).toLowerCase())).length;
        const sameAnime = currentPost.animeSlug && post.animeSlug === currentPost.animeSlug;
        const keywordMatch = [...currentTitleWords].some(word =>
          String(post.title || '').toLowerCase().includes(word)
        );
        const score = (sameAnime ? 100 : 0) + matchingTags * 10 +
          (category && post.category === category ? 5 : 0) + (keywordMatch ? 1 : 0);
        return { post, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(item => item.post);

    if (related.length === 0) {
      const section = document.getElementById('relatedSection');
      if (section) section.style.display = 'none';
      return;
    }

    container.innerHTML = '';
    related.forEach(post => {
      container.appendChild(createArticleCard(post.id, post));
    });
    const section = document.getElementById('relatedSection');
    if (section) section.style.display = '';
  } catch (err) {
    console.warn("Could not load related articles:", err);
    const section = document.getElementById('relatedSection');
    if (section) section.style.display = 'none';
  }
}

async function loadRelatedCandidates(candidateQuery) {
  try {
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
