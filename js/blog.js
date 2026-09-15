import { 
  doc, 
  getDoc, 
  updateDoc, 
  increment, 
  collection, 
  query, 
  where, 
  limit, 
  getDocs 
} from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { formatDate, formatViews, createArticleCard, setupMobileNav } from './home.js';

async function initBlogPage() {
  setupMobileNav();

  const urlParams = new URLSearchParams(window.location.search);
  const articleId = urlParams.get('id');

  const mainContainer = document.getElementById('blogArticleContainer');
  if (!mainContainer) return;

  if (!articleId) {
    renderArticleError(mainContainer, "No article ID provided in the URL.");
    return;
  }

  if (!isConfigured || !db) {
    renderArticleError(mainContainer, "Firebase is not configured yet. Connect Firebase in Settings to load this article.");
    return;
  }

  try {
    const postRef = doc(db, 'posts', articleId);
    const postSnap = await getDoc(postRef);

    if (!postSnap.exists()) {
      renderArticleError(mainContainer, "Article not found. It may have been deleted or moved.");
      return;
    }

    const post = postSnap.data();

    // Check status: only show published articles to public visitors
    if (post.status !== 'published') {
      const isAdminSession = localStorage.getItem('animoro_admin_user');
      if (!isAdminSession) {
        renderArticleError(mainContainer, "This article is currently saved as a draft and is not public.");
        return;
      }
    }

    // Atomic View Counter increment with sessionStorage throttle
    recordArticleView(postRef, articleId, post.views || 0);

    // Update dynamic SEO tags
    updateSeoTags(post);

    // Render article contents
    renderArticle(mainContainer, articleId, post);

    // Load related articles
    loadRelatedArticles(post.category, articleId);

  } catch (error) {
    handleFirestoreError(error, 'get', `posts/${articleId}`);
    renderArticleError(mainContainer, "Unable to load article. Please check your network connection.");
  }
}

/**
 * Safely increment view count once per user session using atomic increment(1)
 */
async function recordArticleView(postRef, articleId, currentViews) {
  const sessionKey = `animoro_viewed_${articleId}`;
  if (sessionStorage.getItem(sessionKey)) {
    return; // Already counted this visitor in the current session
  }

  try {
    await updateDoc(postRef, {
      views: increment(1)
    });
    sessionStorage.setItem(sessionKey, 'true');
    // Update view count in DOM if rendered
    const viewCountEl = document.getElementById('articleViewCount');
    if (viewCountEl) {
      viewCountEl.textContent = formatViews(currentViews + 1) + ' views';
    }
  } catch (err) {
    console.warn("Could not increment view count:", err);
  }
}

/**
 * Update Page Title & OpenGraph Meta Tags
 */
function updateSeoTags(post) {
  document.title = `${post.title} — Animoro`;

  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', post.excerpt || post.title);

  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', post.title);

  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', post.excerpt || post.title);

  let ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && post.coverImage) ogImage.setAttribute('content', post.coverImage);
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

function renderArticle(container, id, post) {
  const tagsHtml = (post.tags || []).map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join('');
  const currentUrl = window.location.href;
  const coverSource = getCoverImageSource(post.coverImage);

  container.innerHTML = `
    <header class="article-header">
      <div class="article-header-meta">
        <a href="category.html?category=${encodeURIComponent(post.category || 'Anime')}" class="badge-category" style="margin-left: 0;">
          ${escapeHtml(post.category || 'General')}
        </a>
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

        <div style="display: flex; align-items: center; gap: 16px;">
          <div id="articleViewCount" style="display: flex; align-items: center; gap: 6px; color: var(--text-secondary); font-weight: 500;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            <span>${formatViews(post.views)} views</span>
          </div>
        </div>
      </div>
    </header>

    ${coverSource ? `
      <div class="article-cover-wrap">
        <img class="article-cover-img" alt="${escapeHtml(post.title || 'Article cover')}" referrerpolicy="no-referrer" />
      </div>
    ` : ''}

    <main class="article-content-container" id="articleBody">
      ${post.content || ''}

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

  // Attach share link copy handler
  const copyBtn = document.getElementById('copyShareBtn');
  const copyBtnText = document.getElementById('copyBtnText');
  if (copyBtn && copyBtnText) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        copyBtnText.textContent = "Copied!";
        setTimeout(() => { copyBtnText.textContent = "Copy Link"; }, 2500);
      } catch (err) {
        copyBtnText.textContent = "Link copied";
      }
    });
  }
}

async function loadRelatedArticles(category, currentId) {
  const container = document.getElementById('relatedArticlesContainer');
  if (!container || !category || !db) return;

  try {
    const q = query(
      collection(db, 'posts'),
      where('status', '==', 'published'),
      where('category', '==', category),
      limit(4)
    );

    const snap = await getDocs(q);
    const related = snap.docs.filter(d => d.id !== currentId).slice(0, 3);

    if (related.length === 0) {
      const section = document.getElementById('relatedSection');
      if (section) section.style.display = 'none';
      return;
    }

    container.innerHTML = '';
    related.forEach(d => {
      container.appendChild(createArticleCard(d.id, d.data()));
    });
  } catch (err) {
    console.warn("Could not load related articles:", err);
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

document.addEventListener('DOMContentLoaded', initBlogPage);
