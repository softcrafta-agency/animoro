import { setupMobileNav, createAnimeCard, createUpcomingAnimeCard } from './ui.js';
import {
  getMyList,
  attachMyListToggle,
  readUserList,
  showPendingMyListActionNotice,
} from './my-list.js';
import { watchAuthState } from './auth.js';
import { auth } from './auth-init.js';
import { isConfigured } from './firebase-init.js';

const AUTH_TIMEOUT_MS = 10000;
const LIST_TIMEOUT_MS = 12000;
let initializationPromise = null;
let authListenerAttached = false;

function ensureMetaTag(attribute, name, value) {
  const selector = `meta[${attribute}="${name}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', value);
}

function ensureCanonical(url) {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = url;
}

function renderMyListPage(list) {
  const items = Array.isArray(list) ? list : (list?.detail?.list || getMyList());
  const canonicalUrl = new URL('/my-list.html', 'https://www.animoro.in').toString();
  document.title = 'My List — Saved Anime | Animoro';
  ensureMetaTag('name', 'description', 'Save and manage your favorite anime in your personal Animoro list.');
  ensureMetaTag('name', 'robots', 'noindex, nofollow');
  ensureMetaTag('property', 'og:title', 'My List — Saved Anime | Animoro');
  ensureMetaTag('property', 'og:description', 'Save and manage your favorite anime in your personal Animoro list.');
  ensureMetaTag('property', 'og:url', canonicalUrl);
  ensureCanonical(canonicalUrl);

  const container = document.getElementById('myListContainer');
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3 style="font-size: 1.7rem; margin-bottom: 12px;">Your list is empty</h3>
        <p class="empty-state-desc">Start adding anime you want to watch later.</p>
        <a href="/anime" class="btn-cta" style="margin-top: 16px;">Explore Anime</a>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const record = { ...item, kind: item.kind || 'anime' };
    const card = record.kind === 'upcoming' ? createUpcomingAnimeCard(record) : createAnimeCard(record);
    const button = card.querySelector('.btn-outline');
    if (button) {
      attachMyListToggle(button, record);
      button.textContent = 'Remove from My List';
    }
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
}

function withTimeout(promise, timeoutMs, operation) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      const error = new Error(`${operation} timed out.`);
      error.code = 'my-list/timeout';
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function showSignedOutState(container) {
  const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  container.innerHTML = `
    <div class="empty-state" role="status" style="grid-column: 1 / -1;">
      <h3 style="font-size: 1.7rem; margin-bottom: 12px;">Sign in to view your list</h3>
      <p class="empty-state-desc">Your saved anime will be here after you sign in.</p>
      <a href="/login.html?redirect=${redirect}" class="btn-cta" style="margin-top: 16px;">Sign in</a>
    </div>
  `;
}

function showLoadError(container, error) {
  const message = error?.code === 'permission-denied' || error?.code === 'firestore/permission-denied'
    ? 'Unable to load your saved list due to permission restrictions. Please try again later.'
    : error?.code === 'my-list/timeout'
      ? 'Loading your list took too long. Check your connection and try again.'
      : 'We could not load your list. Check your connection and try again.';

  container.innerHTML = `
    <div class="empty-state" role="alert" style="grid-column: 1 / -1;">
      <p class="empty-state-desc">${message}</p>
      <button type="button" class="btn-cta" data-my-list-retry style="margin-top: 16px;">Retry</button>
    </div>
  `;
  container.querySelector('[data-my-list-retry]')?.addEventListener('click', initializeMyListPage, { once: true });
}

function watchForSignOut() {
  if (authListenerAttached) return;
  authListenerAttached = true;
  watchAuthState((currentUser) => {
    const container = document.getElementById('myListContainer');
    if (!currentUser && container) {
      showSignedOutState(container);
    }
  });
}

async function loadMyListPage() {
  const container = document.getElementById('myListContainer');
  if (!container) return;

  setupMobileNav();
  if (!isConfigured || !auth) {
    document.documentElement.classList.remove('auth-checking');
    showLoadError(container, new Error('Authentication is unavailable.'));
    return;
  }

  try {
    await withTimeout(auth.authStateReady(), AUTH_TIMEOUT_MS, 'Authentication');
    document.documentElement.classList.remove('auth-checking');
    const user = auth.currentUser;
    if (!user) {
      showSignedOutState(container);
      return;
    }

    watchForSignOut();
    showPendingMyListActionNotice(container, list => renderMyListPage(list));
    const list = await withTimeout(readUserList(user), LIST_TIMEOUT_MS, 'Loading your list');
    renderMyListPage(list);
  } catch (error) {
    document.documentElement.classList.remove('auth-checking');
    console.error('Could not load the authenticated user My List:', error);
    showLoadError(container, error);
  }
}

function initializeMyListPage() {
  if (initializationPromise) return initializationPromise;
  initializationPromise = loadMyListPage().finally(() => {
    initializationPromise = null;
  });
  return initializationPromise;
}

document.addEventListener('animoro-my-list-change', renderMyListPage);
document.addEventListener('DOMContentLoaded', initializeMyListPage, { once: true });
