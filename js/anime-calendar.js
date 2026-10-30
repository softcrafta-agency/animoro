import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { getUpcomingAnimePath } from './upcoming-url.js';
import { getSafeImageUrl } from './html-utils.js';
import { setupMobileNav } from './ui.js';
import {
  formatCalendarDate,
  getUpcomingAnimeForPeriod,
} from './anime-release-calendar.js';

let publishedUpcomingAnime = [];
let selectedFilter = 'today';
let viewerTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

async function initAnimeCalendar() {
  setupMobileNav();
  const timezoneLabel = document.getElementById('calendarTimezone');
  if (timezoneLabel) {
    timezoneLabel.textContent = `Exact date-only releases are shown as entered; timestamp dates use your local timezone (${viewerTimezone}).`;
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
    const snapshot = await getDocs(query(
      collection(db, 'upcomingAnime'),
      where('status', '==', 'published'),
      limit(200)
    ));
    publishedUpcomingAnime = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }));
    renderCalendar();
  } catch (error) {
    handleFirestoreError(error, 'list', 'upcomingAnime');
    renderState(container, 'Unable to load release dates. Please try again later.', 'error');
  }
}

function renderCalendar() {
  const container = document.getElementById('animeCalendarContainer');
  if (!container) return;

  let visible;
  try {
    visible = getUpcomingAnimeForPeriod(
      publishedUpcomingAnime,
      new Date(),
      viewerTimezone,
      selectedFilter
    );
  } catch (error) {
    console.error('Could not filter Upcoming Anime release dates:', error);
    renderState(container, 'Release dates could not be displayed in your timezone.', 'error');
    return;
  }
  if (visible.length === 0) {
    const labels = { today: 'today', tomorrow: 'tomorrow', week: 'the rest of this week' };
    renderState(container, `No upcoming anime with an exact release date is listed for ${labels[selectedFilter]}.`, 'empty');
    return;
  }

  const grouped = new Map();
  visible.forEach(anime => {
    const day = anime.calendarDate;
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
  const status = anime.releaseStatus || 'TBA';
  const statusClass = status.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  item.className = `calendar-release-item calendar-release-${statusClass}`;

  const posterUrl = getSafeImageUrl(anime.poster);
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
  time.dateTime = anime.calendarDate;
  time.textContent = formatCalendarDate(
    new Date(`${anime.calendarDate}T12:00:00.000Z`),
    'UTC',
    { month: 'short', day: 'numeric', year: 'numeric' }
  );

  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = getUpcomingAnimePath(anime);
  link.textContent = anime.title || 'Untitled anime';
  title.appendChild(link);
  content.append(time, title);

  if (anime.shortDescription) {
    const description = document.createElement('p');
    description.className = 'calendar-release-episode';
    description.textContent = anime.shortDescription;
    content.appendChild(description);
  }

  const statusLabel = document.createElement('span');
  statusLabel.className = 'calendar-release-status';
  statusLabel.textContent = status;
  content.appendChild(statusLabel);

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
