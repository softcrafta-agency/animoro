import { setupMobileNav, createAnimeCard, createUpcomingAnimeCard } from './ui.js';
import {
  getMyList,
  getListKey,
  attachMyListToggle,
  readUserList,
  showPendingMyListActionNotice,
} from './my-list.js';
import { watchAuthState } from './auth.js';
import { auth } from './auth-init.js';
import { isConfigured } from './firebase-init.js';
import { getAllAnimeSchedules } from './anime-api.js';
import {
  getAnimeReminderLastNotified,
  getNextAnimeReminder,
  isAnimeReminderEnabled,
  markAnimeReminderNotified,
  setAnimeReminderEnabled,
} from './anime-reminders.js';

const AUTH_TIMEOUT_MS = 10000;
const LIST_TIMEOUT_MS = 12000;
let initializationPromise = null;
let authListenerAttached = false;
let currentList = [];
let currentUserId = '';
let scheduleByMalId = new Map();
let reminderTimer = null;

function getAnimeMalId(item) {
  const storedId = Number(item?.malId);
  if (Number.isInteger(storedId) && storedId > 0) return storedId;
  const slugId = String(item?.slug || '').match(/--([1-9]\d*)$/)?.[1];
  return slugId ? Number(slugId) : null;
}

function hasBroadcastDay(item) {
  return typeof item?.broadcast?.day === 'string' && item.broadcast.day.trim().length > 0;
}

function withSchedule(item) {
  if (hasBroadcastDay(item)) return item;
  const malId = getAnimeMalId(item);
  const scheduled = malId ? scheduleByMalId.get(malId) : null;
  return scheduled ? { ...item, malId, broadcast: scheduled.broadcast } : item;
}

function renderReminderNotice(message) {
  const note = document.getElementById('myListReminderNote');
  if (note && message) note.textContent = message;
}

function appendReminderControl(card, item) {
  const scheduledItem = withSchedule(item);
  const reminder = getNextAnimeReminder(scheduledItem);
  const body = card.querySelector('.card-body');
  if (!body) return;

  const scheduleLabel = document.createElement('p');
  scheduleLabel.className = 'my-list-schedule-label';
  if (reminder) {
    scheduleLabel.textContent = reminder.kind === 'broadcast'
      ? `Next listed broadcast: ${reminder.label}${reminder.canRemind ? ' (weekly schedule)' : ''}`
      : `Listed release date: ${reminder.label} (reminder at ${reminder.reminderTimeLabel} local time)`;
  } else {
    scheduleLabel.textContent = 'No upcoming airing or exact release date is listed.';
  }
  body.appendChild(scheduleLabel);

  const reminderButton = document.createElement('button');
  reminderButton.type = 'button';
  reminderButton.className = 'btn-outline my-list-reminder-btn';
  const key = getListKey(item);
  const enabled = isAnimeReminderEnabled(key, currentUserId);
  reminderButton.textContent = enabled ? 'Reminder set' : 'Set reminder';
  reminderButton.setAttribute('aria-pressed', String(enabled));
  reminderButton.disabled = !reminder?.canRemind;
  if (reminder?.kind === 'broadcast' && !reminder.canRemind) {
    reminderButton.title = 'A broadcast day is listed, but no exact time is available for a reminder.';
  } else if (!reminder) {
    reminderButton.title = 'A reminder needs a listed weekly broadcast or exact release date.';
  }
  reminderButton.addEventListener('click', () => {
    try {
      setAnimeReminderEnabled(key, !isAnimeReminderEnabled(key, currentUserId), currentUserId);
      renderMyListPage(currentList);
      checkAnimeReminders();
    } catch (error) {
      console.error('Could not update this anime reminder:', error);
      renderReminderNotice('Could not save your reminder on this device. Check browser storage settings and try again.');
    }
  });
  body.appendChild(reminderButton);
}

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
  currentList = items;
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
        <a href="/anime-list" class="btn-cta" style="margin-top: 16px;">Explore Anime</a>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const record = { ...item, kind: item.kind || 'anime' };
    const scheduledRecord = withSchedule(record);
    const card = scheduledRecord.kind === 'upcoming'
      ? createUpcomingAnimeCard(scheduledRecord)
      : createAnimeCard(scheduledRecord);
    const button = card.querySelector('.btn-outline');
    if (button) {
      attachMyListToggle(button, record);
      button.textContent = 'Remove from My List';
    }
    appendReminderControl(card, scheduledRecord);
    fragment.appendChild(card);
  });
  container.replaceChildren(fragment);
  checkAnimeReminders();
}

function checkAnimeReminders() {
  if (!currentUserId || !currentList.length) return;
  const now = Date.now();
  for (const item of currentList) {
    const key = getListKey(item);
    if (!isAnimeReminderEnabled(key, currentUserId)) continue;
    const reminder = getNextAnimeReminder(withSchedule(item), new Date(now));
    if (!reminder?.canRemind || reminder.eventAt <= now || reminder.remindAt > now) continue;

    const occurrenceKey = String(reminder.eventAt);
    if (getAnimeReminderLastNotified(key, currentUserId) === occurrenceKey) continue;
    const notifications = document.getElementById('animeReminderNotifications');
    if (!notifications) continue;
    markAnimeReminderNotified(key, occurrenceKey, currentUserId);
    const notice = document.createElement('p');
    notice.className = 'my-list-reminder-notice';
    notice.textContent = reminder.kind === 'broadcast'
      ? `${item.title || 'Anime'}: a listed weekly broadcast is coming up at ${reminder.label}.`
      : `${item.title || 'Anime'}: the listed release-date reminder for ${reminder.label} is due now.`;
    notifications.appendChild(notice);
  }
}

async function loadReminderSchedules(list) {
  const needsLookup = list.some(item =>
    (item.kind || 'anime') === 'anime' && !hasBroadcastDay(item) && getAnimeMalId(item)
  );
  if (!needsLookup) return;

  try {
    const result = await getAllAnimeSchedules({ limit: 100, maxPages: 10 });
    scheduleByMalId = new Map(result.items
      .filter(item => Number.isInteger(item.malId) && item.malId > 0 && item.broadcast)
      .map(item => [item.malId, item]));
    renderMyListPage(currentList);
    if (result.stale) {
      renderReminderNotice('Showing cached weekly broadcast schedules. Times are estimates, not episode-specific confirmations.');
    }
  } catch (error) {
    console.warn('Could not load weekly schedules for My List reminders:', error);
    renderReminderNotice('Weekly schedules could not be loaded. Saved anime and exact release-date reminders remain available.');
  }
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
      currentUserId = '';
      if (reminderTimer) window.clearInterval(reminderTimer);
      reminderTimer = null;
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
    currentUserId = user.uid;
    showPendingMyListActionNotice(container, list => renderMyListPage(list));
    const list = await withTimeout(readUserList(user), LIST_TIMEOUT_MS, 'Loading your list');
    renderMyListPage(list);
    void loadReminderSchedules(list);
    if (reminderTimer) window.clearInterval(reminderTimer);
    reminderTimer = window.setInterval(checkAnimeReminders, 30000);
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
