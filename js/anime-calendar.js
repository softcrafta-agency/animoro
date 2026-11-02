import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { getAnimePath } from './anime-url.js';
import { getSafeImageUrl } from './html-utils.js';
import { setupMobileNav } from './ui.js';
import {
  formatCalendarDate,
  getBroadcastSchedulesForPeriod,
  getCalendarDateKey,
  getSchedulesForPeriod,
} from './anime-release-calendar.js';
import { getAllAnimeSchedules } from './anime-api.js';

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const FIRESTORE_SCHEDULE_LIMIT = 300;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let publishedAnimeSchedules = [];
let tenraiSchedules = [];
let selectedFilter = 'today';
let viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let latestLoad = 0;
let apiUnavailable = false;
let adminSchedulesUnavailable = false;
let calendarHasLoaded = false;

async function loadPublishedAnimeSchedules() {
  if (!isConfigured || !db) {
    const error = new Error('Firebase is not configured.');
    error.code = 'failed-precondition';
    throw error;
  }
  const snapshot = await getDocs(query(
    collection(db, 'anime'),
    where('visibility', '==', 'published'),
    limit(FIRESTORE_SCHEDULE_LIMIT)
  ));
  return snapshot.docs
    .map(document => ({ id: document.id, ...document.data() }))
    .filter(anime => anime.calendarEnabled === true);
}

async function loadCalendar({ showLoading = false } = {}) {
  const container = document.getElementById('animeCalendarContainer');
  if (!container) return;
  const loadId = ++latestLoad;
  if (showLoading) renderLoading(container);

  const [apiResult, adminResult] = await Promise.allSettled([
    getAllAnimeSchedules({ limit: 100 }),
    loadPublishedAnimeSchedules(),
  ]);
  if (loadId !== latestLoad) return;

  apiUnavailable = apiResult.status === 'rejected';
  adminSchedulesUnavailable = adminResult.status === 'rejected';
  if (apiResult.status === 'fulfilled') {
    tenraiSchedules = apiResult.value.items;
  } else {
    tenraiSchedules = [];
    console.warn('Could not load Tenrai broadcast schedules.', apiResult.reason);
  }
  if (adminResult.status === 'fulfilled') {
    publishedAnimeSchedules = adminResult.value;
  } else {
    publishedAnimeSchedules = [];
    if (adminResult.reason?.code !== 'failed-precondition') {
      handleFirestoreError(adminResult.reason, 'list', 'anime');
    }
  }

  calendarHasLoaded = true;
  renderSourceNote(apiResult.status === 'fulfilled' ? Boolean(apiResult.value.stale) : false);
  renderCalendar();
}

function renderSourceNote(stale) {
  const note = document.getElementById('calendarTimezone');
  if (!note) return;
  const sourceNotes = [
    `Times are shown in your timezone (${viewerTimezone}).`,
    'Tenrai entries are recurring weekly broadcast listings, not episode-specific confirmations.',
    'Exact episode dates and episode numbers come only from published Animoro schedules.',
    stale ? 'Tenrai is temporarily unavailable; recently cached schedules are being shown.' : '',
    apiUnavailable ? 'The live Tenrai schedule could not be refreshed.' : '',
    adminSchedulesUnavailable ? 'Published Animoro episode schedules could not be loaded.' : '',
  ].filter(Boolean);
  note.textContent = sourceNotes.join(' ');
}

function renderCalendar() {
  const container = document.getElementById('animeCalendarContainer');
  if (!container || !calendarHasLoaded) return;

  let visible;
  try {
    const manual = getSchedulesForPeriod(
      publishedAnimeSchedules,
      new Date(),
      viewerTimezone,
      selectedFilter
    );
    const manualKeys = new Set(manual.map(getAnimeIdentity));
    const broadcasts = getBroadcastSchedulesForPeriod(
      tenraiSchedules,
      new Date(),
      viewerTimezone,
      selectedFilter
    ).filter(schedule => !manualKeys.has(getAnimeIdentity(schedule)));
    visible = [...manual, ...broadcasts].sort((left, right) => {
      if (left.calendarDate !== right.calendarDate) return left.calendarDate.localeCompare(right.calendarDate);
      return (left.releaseInstant ?? Number.MAX_SAFE_INTEGER) - (right.releaseInstant ?? Number.MAX_SAFE_INTEGER) ||
        String(left.title || '').localeCompare(String(right.title || ''));
    });
  } catch (error) {
    console.error('Could not filter anime release schedules:', error);
    renderState(container, 'Release schedules could not be displayed in your timezone. Please retry.', 'error', true);
    return;
  }

  if (!visible.length) {
    const label = { today: 'today', tomorrow: 'tomorrow', week: 'the rest of this week' }[selectedFilter];
    if (apiUnavailable && adminSchedulesUnavailable) {
      renderState(container, 'Neither Tenrai broadcast schedules nor published Animoro episode schedules could be loaded.', 'error', true);
    } else {
      const message = apiUnavailable
        ? `The live Tenrai schedule is unavailable, and no published Animoro episode schedule is listed for ${label}.`
        : `No scheduled broadcast is listed for ${label}. Tenrai provides weekly broadcast days and times, not episode-by-episode dates; confirmed episode schedules appear only after an administrator publishes them.`;
      renderState(container, message, 'empty', apiUnavailable || adminSchedulesUnavailable);
    }
    return;
  }

  const grouped = new Map();
  visible.forEach(anime => {
    if (!grouped.has(anime.calendarDate)) grouped.set(anime.calendarDate, []);
    grouped.get(anime.calendarDate).push(anime);
  });

  container.replaceChildren();
  grouped.forEach((entries, date) => {
    const section = document.createElement('section');
    section.className = 'calendar-day';
    const heading = document.createElement('h2');
    heading.className = 'section-title';
    heading.textContent = formatCalendarDate(
      new Date(`${date}T12:00:00.000Z`),
      'UTC',
      { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
    );
    const list = document.createElement('div');
    list.className = 'calendar-release-list';
    entries.forEach(anime => list.appendChild(createReleaseItem(anime)));
    section.append(heading, list);
    container.appendChild(section);
  });
}

function getAnimeIdentity(anime) {
  if (anime.malId) return `mal:${anime.malId}`;
  if (anime.mal_id) return `mal:${anime.mal_id}`;
  return `title:${String(anime.title || '').trim().toLowerCase()}`;
}

function createReleaseItem(anime) {
  const item = document.createElement('article');
  item.className = `calendar-release-item calendar-release-${String(anime.episodeReleaseStatus || 'scheduled').toLowerCase()}`;

  const imageUrl = getSafeImageUrl(anime.poster || anime.coverImage);
  if (imageUrl) {
    const poster = document.createElement('img');
    poster.className = 'calendar-release-poster';
    poster.src = imageUrl;
    poster.alt = `${anime.title || 'Anime'} poster`;
    poster.width = 160;
    poster.height = 240;
    poster.loading = 'lazy';
    poster.decoding = 'async';
    poster.addEventListener('error', () => { poster.src = '/favicon.svg'; }, { once: true });
    item.appendChild(poster);
  }

  const content = document.createElement('div');
  content.className = 'calendar-release-content';
  const date = document.createElement('time');
  date.className = 'calendar-release-time';
  date.dateTime = anime.calendarDate;
  date.textContent = formatCalendarDate(
    new Date(`${anime.calendarDate}T12:00:00.000Z`),
    'UTC',
    { month: 'short', day: 'numeric', year: 'numeric' }
  );
  content.appendChild(date);

  const releaseTime = getReleaseTime(anime);
  if (releaseTime) {
    const time = document.createElement('p');
    time.className = 'calendar-release-episode';
    time.textContent = releaseTime;
    content.appendChild(time);
  }

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = getAnimePath(anime);
  link.textContent = anime.title || 'Untitled anime';
  title.appendChild(link);
  content.appendChild(title);

  const episodeNumber = anime.episodeNumber || anime.nextEpisode;
  if (episodeNumber) {
    const episode = document.createElement('p');
    episode.className = 'calendar-release-episode';
    episode.textContent = `Episode ${episodeNumber}`;
    content.appendChild(episode);
  }
  if (anime.episodeTitle) {
    const episodeTitle = document.createElement('p');
    episodeTitle.className = 'calendar-release-episode';
    episodeTitle.textContent = anime.episodeTitle;
    content.appendChild(episodeTitle);
  }
  if (Array.isArray(anime.genres) && anime.genres.length) {
    const genres = document.createElement('p');
    genres.className = 'calendar-release-episode';
    genres.textContent = anime.genres.join(', ');
    content.appendChild(genres);
  }

  const source = document.createElement('span');
  source.className = 'calendar-release-status';
  source.textContent = anime.calendarSource || 'Published episode schedule';
  content.appendChild(source);

  if (anime.episodeScheduleNotes || anime.scheduleConfidence === 'weekly') {
    const note = document.createElement('p');
    note.className = 'calendar-release-episode';
    note.textContent = anime.episodeScheduleNotes ||
      'Weekly broadcast schedule only. The next episode number and episode-specific date are not provided by Tenrai.';
    content.appendChild(note);
  }

  item.appendChild(content);
  return item;
}

function getReleaseTime(anime) {
  const instant = anime.releaseInstant;
  if (Number.isFinite(instant)) {
    return formatCalendarDate(new Date(instant), viewerTimezone, {
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }
  if (anime.episodeReleaseTime && anime.episodeTimezone) {
    return `${anime.episodeReleaseTime} (${anime.episodeTimezone})`;
  }
  return '';
}

function renderLoading(container) {
  container.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'home-loading-state';
  loading.setAttribute('role', 'status');
  loading.setAttribute('aria-label', 'Loading release schedule');
  loading.innerHTML = '<span class="home-loading-line"></span><span class="home-loading-line"></span>';
  container.appendChild(loading);
}

function renderState(container, message, state, canRetry) {
  container.replaceChildren();
  const panel = document.createElement('div');
  panel.className = `empty-state calendar-state calendar-state-${state}`;
  panel.setAttribute('role', state === 'error' ? 'alert' : 'status');
  const text = document.createElement('p');
  text.className = 'empty-state-desc';
  text.textContent = message;
  panel.appendChild(text);
  if (canRetry) {
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn-outline';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => loadCalendar({ showLoading: true }));
    panel.appendChild(retry);
  }
  container.appendChild(panel);
}

function setupCalendarFilters() {
  document.querySelectorAll('[data-calendar-filter]').forEach(button => {
    button.addEventListener('click', () => {
      selectedFilter = button.dataset.calendarFilter;
      document.querySelectorAll('[data-calendar-filter]').forEach(filterButton => {
        const active = filterButton === button;
        filterButton.classList.toggle('active', active);
        filterButton.setAttribute('aria-pressed', String(active));
      });
      renderCalendar();
    });
  });
}

async function initAnimeCalendar() {
  setupMobileNav();
  setupCalendarFilters();
  const note = document.getElementById('calendarTimezone');
  if (note) note.textContent = `Loading Tenrai weekly broadcast listings and published episode schedules for ${viewerTimezone}…`;
  await loadCalendar();
  window.setInterval(() => {
    if (!document.hidden) loadCalendar();
  }, REFRESH_INTERVAL_MS);
  let renderedDate = getCalendarDateKey(new Date(), viewerTimezone);
  window.setInterval(() => {
    const currentDate = getCalendarDateKey(new Date(), viewerTimezone);
    if (currentDate !== renderedDate) {
      renderedDate = currentDate;
      renderCalendar();
    }
  }, 60 * 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAnimeCalendar, { once: true });
} else {
  initAnimeCalendar();
}
