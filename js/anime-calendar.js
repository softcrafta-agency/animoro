import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { getAnimePath } from './anime-url.js';
import { getSafeImageUrl } from './html-utils.js';
import { setupMobileNav } from './ui.js';
import {
  formatCalendarDate,
  getCalendarDateKey,
  getCalendarWindow,
  getSchedulesForPeriod,
} from './anime-release-calendar.js';

let scheduledAnime = [];
let selectedFilter = 'today';
let viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function initAnimeCalendar() {
  setupMobileNav();
  const timezoneLabel = document.getElementById('calendarTimezone');
  if (timezoneLabel) {
    timezoneLabel.textContent = `Dates are filtered in your timezone (${viewerTimezone}); release times are shown in each schedule's timezone.`;
  }

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

  const container = document.getElementById('animeCalendarContainer');
  if (!container) return;
  if (!isConfigured || !db) {
    renderState(container, 'The release calendar is unavailable because the database is not configured.', 'error');
    return;
  }

  try {
    const window = getCalendarWindow(new Date(), viewerTimezone, 'week');
    const snapshot = await getDocs(query(
      collection(db, 'anime'),
      where('visibility', '==', 'published'),
      where('calendarEnabled', '==', true),
      where('episodeReleaseDate', '>=', window.startDate),
      where('episodeReleaseDate', '<=', window.endDate)
    ));
    scheduledAnime = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(anime => anime.visibility === 'published' &&
        anime.calendarEnabled === true &&
        ['Scheduled', 'Released', 'Delayed', 'Cancelled'].includes(anime.episodeReleaseStatus));
    renderCalendar();
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    renderState(container, 'Unable to load release schedules. Please try again later.', 'error');
  }
}

function renderCalendar() {
  const container = document.getElementById('animeCalendarContainer');
  if (!container) return;

  let visible;
  try {
    visible = getSchedulesForPeriod(scheduledAnime, new Date(), viewerTimezone, selectedFilter);
  } catch (error) {
    console.error('Could not calculate release calendar date boundaries:', error);
    renderState(container, 'Release dates could not be displayed in your timezone.', 'error');
    return;
  }
  if (visible.length === 0) {
    const labels = { today: 'today', tomorrow: 'tomorrow', week: 'the rest of this week' };
    renderState(container, `No release schedules are available for ${labels[selectedFilter]}.`, 'empty');
    return;
  }

  const grouped = new Map();
  visible.forEach(anime => {
    const day = getCalendarDateKey(new Date(anime.releaseInstant), viewerTimezone);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day).push(anime);
  });

  container.replaceChildren();
  grouped.forEach((entries, date) => {
    const section = document.createElement('section');
    section.className = 'calendar-day';
    const heading = document.createElement('h2');
    heading.className = 'section-title';
    heading.textContent = formatCalendarDate(
      new Date(`${date}T12:00:00Z`),
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

function createReleaseItem(anime) {
  const item = document.createElement('article');
  const status = anime.episodeReleaseStatus;
  item.className = `calendar-release-item calendar-release-${status.toLowerCase()}`;

  const posterUrl = getSafeImageUrl(anime.coverImage || anime.poster);
  if (posterUrl) {
    const poster = document.createElement('img');
    poster.className = 'calendar-release-poster';
    poster.src = posterUrl;
    poster.alt = `${anime.title || 'Anime'} poster`;
    poster.loading = 'lazy';
    poster.decoding = 'async';
    item.appendChild(poster);
  }

  const content = document.createElement('div');
  content.className = 'calendar-release-content';
  const time = document.createElement('time');
  time.className = 'calendar-release-time';
  if (anime.episodeReleaseTime) {
    time.dateTime = new Date(anime.releaseInstant).toISOString();
    time.textContent = `${formatCalendarDate(new Date(anime.releaseInstant), anime.episodeTimezone, {
      hour: 'numeric',
      minute: '2-digit',
    })} (${anime.episodeTimezone})`;
  } else {
    time.textContent = `Time TBA (${anime.episodeTimezone})`;
  }

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = getAnimePath(anime);
  link.textContent = anime.title || 'Untitled anime';
  title.appendChild(link);
  content.append(time, title);

  if (anime.episodeNumber || anime.episodeTitle) {
    const episode = document.createElement('p');
    episode.className = 'calendar-release-episode';
    episode.textContent = [
      anime.episodeNumber ? `Episode ${anime.episodeNumber}` : '',
      anime.episodeTitle || '',
    ].filter(Boolean).join(' — ');
    content.appendChild(episode);
  }

  const statusLabel = document.createElement('span');
  statusLabel.className = 'calendar-release-status';
  statusLabel.textContent = status;
  content.appendChild(statusLabel);

  if (anime.episodeScheduleNotes) {
    const notes = document.createElement('p');
    notes.className = 'calendar-release-notes';
    notes.textContent = anime.episodeScheduleNotes;
    content.appendChild(notes);
  }

  item.appendChild(content);
  return item;
}

function renderState(container, message, state) {
  container.replaceChildren();
  const panel = document.createElement('div');
  panel.className = `empty-state calendar-state calendar-state-${state}`;
  panel.setAttribute('role', state === 'error' ? 'alert' : 'status');
  const text = document.createElement('p');
  text.className = 'empty-state-desc';
  text.textContent = message;
  panel.appendChild(text);
  container.appendChild(panel);
}

initAnimeCalendar();
