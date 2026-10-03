import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db, isConfigured, handleFirestoreError } from './firebase-init.js';
import { getAnimePath } from './anime-url.js';
import { setupMobileNav } from './ui.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let scheduledAnime = [];
let selectedFilter = 'today';

async function initAnimeCalendar() {
  setupMobileNav();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
  const timezoneLabel = document.getElementById('calendarTimezone');
  if (timezoneLabel) timezoneLabel.textContent = `Times display in each anime's listed timezone, or your local timezone (${timezone}) when none is listed.`;

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
    renderEmptyState(container, 'The release calendar is unavailable until Firebase is configured.');
    return;
  }

  try {
    const snapshot = await getDocs(query(
      collection(db, 'anime'),
      where('visibility', '==', 'published'),
      where('releaseDay', 'in', WEEKDAYS),
      limit(500)
    ));
    scheduledAnime = snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }))
      .filter(anime => WEEKDAYS.includes(anime.releaseDay) && isValidTime(anime.releaseTime));
    renderCalendar();
  } catch (error) {
    handleFirestoreError(error, 'list', 'anime');
    renderEmptyState(container, 'Unable to load release schedules. Please try again later.');
  }
}

function renderCalendar() {
  const container = document.getElementById('animeCalendarContainer');
  if (!container) return;

  const currentLocalDay = new Date().getDay();
  const visible = scheduledAnime
    .filter(anime => matchesFilter(anime, currentLocalDay))
    .sort((left, right) =>
      WEEKDAYS.indexOf(left.releaseDay) - WEEKDAYS.indexOf(right.releaseDay) ||
      left.releaseTime.localeCompare(right.releaseTime)
    );

  if (visible.length === 0) {
    const labels = { today: 'today', tomorrow: 'tomorrow', week: 'this week' };
    renderEmptyState(container, `No release schedules have been added for ${labels[selectedFilter]}.`);
    return;
  }

  const grouped = new Map();
  visible.forEach(anime => {
    if (!grouped.has(anime.releaseDay)) grouped.set(anime.releaseDay, []);
    grouped.get(anime.releaseDay).push(anime);
  });

  container.replaceChildren();
  grouped.forEach((entries, day) => {
    const section = document.createElement('section');
    section.className = 'calendar-day';
    const heading = document.createElement('h2');
    heading.className = 'section-title';
    heading.textContent = day;
    const list = document.createElement('div');
    list.className = 'calendar-release-list';
    entries.forEach(anime => list.appendChild(createReleaseItem(anime)));
    section.append(heading, list);
    container.appendChild(section);
  });
}

function matchesFilter(anime, currentLocalDay) {
  const releaseDay = WEEKDAYS.indexOf(anime.releaseDay);
  if (selectedFilter === 'week') return true;
  if (selectedFilter === 'today') return releaseDay === getAnimeLocalDay(anime, 0, currentLocalDay);
  return releaseDay === getAnimeLocalDay(anime, 1, currentLocalDay);
}

function getAnimeLocalDay(anime, dayOffset, currentLocalDay) {
  const today = new Date();
  today.setDate(today.getDate() + dayOffset);
  if (!anime.timezone) return (currentLocalDay + dayOffset) % 7;
  try {
    const dayName = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      timeZone: anime.timezone
    }).format(today);
    return WEEKDAYS.indexOf(dayName);
  } catch (error) {
    console.warn(`Invalid schedule timezone for anime ${anime.slug}:`, error);
    return (currentLocalDay + dayOffset) % 7;
  }
}

function createReleaseItem(anime) {
  const item = document.createElement('article');
  item.className = 'calendar-release-item';
  const time = document.createElement('time');
  time.className = 'calendar-release-time';
  time.textContent = formatAnimeTime(anime);
  const content = document.createElement('div');
  const title = document.createElement('h3');
  const link = document.createElement('a');
  link.href = getAnimePath(anime);
  link.textContent = anime.title;
  title.appendChild(link);
  content.appendChild(title);
  if (anime.nextEpisode !== undefined && anime.nextEpisode !== null && anime.nextEpisode !== '') {
    const episode = document.createElement('p');
    episode.textContent = `Episode ${anime.nextEpisode}`;
    content.appendChild(episode);
  }
  item.append(time, content);
  return item;
}

function formatAnimeTime(anime) {
  const [hours, minutes] = anime.releaseTime.split(':').map(Number);
  const date = new Date(Date.UTC(2020, 0, 1, hours, minutes));
  const displayTimezone = anime.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const formattedTime = new Intl.DateTimeFormat('en', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC'
    }).format(date);
    return `${formattedTime} (${displayTimezone || 'local time'})`;
  } catch (error) {
    console.warn(`Invalid release timezone for anime ${anime.slug}:`, error);
    return `${anime.releaseTime} (${displayTimezone || 'local time'})`;
  }
}

function isValidTime(value) {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function renderEmptyState(container, message) {
  container.replaceChildren();
  const state = document.createElement('div');
  state.className = 'empty-state';
  const text = document.createElement('p');
  text.className = 'empty-state-desc';
  text.textContent = message;
  state.appendChild(text);
  container.appendChild(state);
}

initAnimeCalendar();
