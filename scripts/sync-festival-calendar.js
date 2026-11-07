import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  CALENDAR_TIME_ZONE,
  FESTIVAL_CATALOG,
  FESTIVAL_REFERENCE_SOURCES,
  FESTIVAL_SOURCES,
  createEmptyCalendar,
} from './festival-catalog.js';

const OUTPUT_PATH = fileURLToPath(new URL('../public/festival-calendar.json', import.meta.url));
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function unfoldIcs(text) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function unescapeIcs(value) {
  return value.replace(/\\[nN]/g, ' ').replace(/\\([,;\\/\\])/g, '$1').trim();
}

function readIcsProperty(block, property) {
  const line = block.split(/\r?\n/).find(entry => entry.startsWith(`${property}:`) || entry.startsWith(`${property};`));
  if (!line) return '';
  return unescapeIcs(line.slice(line.indexOf(':') + 1));
}

function toIsoDate(value) {
  if (!/^\d{8}$/.test(value)) return '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseFestivalCalendarIcs(text) {
  return unfoldIcs(text)
    .split('BEGIN:VEVENT')
    .slice(1)
    .map(block => {
      const start = readIcsProperty(block, 'DTSTART');
      const endExclusive = readIcsProperty(block, 'DTEND');
      const rawName = readIcsProperty(block, 'SUMMARY');
      const name = readIcsProperty(block, 'SUMMARY')
        .replace(/^India:\s*/i, '')
        .replace(/\s*\((?:Regional|National) Holiday\)\s*$/i, '')
        .replace(/\s*\(tentative\)\s*$/i, '')
        .trim();
      const date = toIsoDate(start);
      const endDate = toIsoDate(endExclusive);
      if (!date || !name || readIcsProperty(block, 'STATUS') === 'CANCELLED') return null;
      return {
        date,
        endDate: endDate && endDate > date ? addDays(endDate, -1) : date,
        name,
        tentative: /\btentative\b/i.test(`${rawName} ${readIcsProperty(block, 'DESCRIPTION')}`),
      };
    })
    .filter(Boolean);
}

function normalizeName(value) {
  return value.toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addDays(date, amount) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function aliasesFor(festival) {
  return festival.aliases.map(normalizeName);
}

function matchingEvents(events, festival) {
  const aliases = aliasesFor(festival);
  return events.filter(event => aliases.includes(normalizeName(event.name)));
}

function uniqueDatedEvents(events) {
  const byDate = new Map();
  for (const event of events) {
    const current = byDate.get(event.date);
    if (!current || event.endDate > current.endDate) byDate.set(event.date, event);
  }
  return [...byDate.values()];
}

function toSourceOccurrence(event, source, checkedAt) {
  return {
    date: event.date,
    endDate: event.endDate,
    source: {
      id: source.id,
      name: source.name,
      url: source.url,
      observedDate: event.date,
      checkedAt,
    },
  };
}

function occurrenceDates(event, festival) {
  const override = festival.windowOverrides?.[event.date.slice(0, 4)];
  if (override) {
    return { startDate: override.startDate, endDate: override.endDate };
  }
  const startDate = addDays(event.date, festival.theme.startOffsetDays || 0);
  const endDate = addDays(event.endDate, festival.theme.endOffsetDays || 0);
  if (!ISO_DATE_PATTERN.test(startDate) || !ISO_DATE_PATTERN.test(endDate) || endDate < startDate) {
    throw new Error(`Invalid theme window for ${festival.id}: ${startDate} through ${endDate}`);
  }
  return { startDate, endDate };
}

export function createSyncedCalendar(existing, sourceEvents, checkedAt = new Date().toISOString()) {
  const calendar = existing && existing.version === 1 ? structuredClone(existing) : createEmptyCalendar();
  calendar.version = 1;
  calendar.timeZone = CALENDAR_TIME_ZONE;
  calendar.sources = FESTIVAL_REFERENCE_SOURCES;
  calendar.festivals = Array.isArray(calendar.festivals) ? calendar.festivals : [];
  const uniqueFestivals = new Map();
  for (const festival of calendar.festivals) {
    if (typeof festival?.id === 'string' && !uniqueFestivals.has(festival.id)) {
      uniqueFestivals.set(festival.id, festival);
    }
  }
  calendar.festivals = [...uniqueFestivals.values()];
  const existingById = new Map(calendar.festivals.map(festival => [festival.id, festival]));

  for (const definition of FESTIVAL_CATALOG) {
    let festival = existingById.get(definition.id);
    if (!festival) {
      festival = {
        id: definition.id,
        name: definition.name,
        enabled: true,
        theme: definition.theme,
        dates: {},
      };
      calendar.festivals.push(festival);
      existingById.set(festival.id, festival);
    }

    festival.name = definition.name;
    festival.enabled = festival.enabled !== false && definition.theme.enabled;
    festival.theme = definition.theme;
    festival.dates ||= {};

    const matchingBySource = sourceEvents.map(({ source, events }) => ({
      source,
      events: uniqueDatedEvents(matchingEvents(events, definition)),
    }));
    const allYears = new Set(matchingBySource.flatMap(({ events }) => events.map(event => event.date.slice(0, 4))));

    for (const year of allYears) {
      const matches = matchingBySource.map(({ source, events }) => ({
        source,
        events: events.filter(event => event.date.startsWith(year)),
      }));
      if (matches.length < 2 || matches.some(match => match.events.length !== 1)) continue;
      if (matches.some(match => match.events[0].tentative)) continue;
      if (matches.some(match => match.events[0].date !== matches[0].events[0].date)) continue;

      const event = matches[0].events[0];
      const dates = occurrenceDates(event, definition);
      const sources = matches.map(match => toSourceOccurrence(match.events[0], match.source, checkedAt).source);
      const previous = festival.dates[year];
      const sameDates = previous?.festivalDate === event.date &&
        previous?.startDate === dates.startDate &&
        previous?.endDate === dates.endDate;
      festival.dates[year] = {
        ...(sameDates ? previous : {}),
        festivalDate: event.date,
        startDate: dates.startDate,
        endDate: dates.endDate,
        status: 'verified',
        sources: sameDates && Array.isArray(previous.sources) ? previous.sources : sources,
        verifiedAt: sameDates && previous.verifiedAt ? previous.verifiedAt : checkedAt,
      };
    }
  }

  calendar.festivals.sort((left, right) => left.id.localeCompare(right.id));
  return calendar;
}

async function fetchCalendar(source) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(source.url, {
        headers: { Accept: 'text/calendar' },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const error = new Error(`${source.name} returned HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) {
          error.retryable = false;
          throw error;
        }
        lastError = error;
      } else {
        const text = await response.text();
        if (!text.includes('BEGIN:VCALENDAR')) throw new Error(`${source.name} returned invalid calendar data`);
        const events = parseFestivalCalendarIcs(text);
        if (events.length === 0) throw new Error(`${source.name} returned no usable festival dates`);
        return { source, events };
      }
    } catch (error) {
      if (error.retryable === false) throw error;
      lastError = error;
      if (attempt === 3) break;
    }
    console.warn(`${source.name} request attempt ${attempt} failed; retrying.`);
    await new Promise(resolve => setTimeout(resolve, attempt * 1500));
  }
  throw new Error(`${source.name} could not be verified after three attempts.`, { cause: lastError });
}

export async function syncFestivalCalendar({ outputPath = OUTPUT_PATH, now = new Date() } = {}) {
  const sourceEvents = await Promise.all(FESTIVAL_SOURCES.map(fetchCalendar));
  const existing = JSON.parse(await readFile(outputPath, 'utf8'));
  const next = createSyncedCalendar(existing, sourceEvents, now.toISOString());
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const previous = JSON.stringify(existing, null, 2) + '\n';
  if (serialized !== previous) await writeFile(outputPath, serialized, 'utf8');
  return { changed: serialized !== previous, calendar: next };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const result = await syncFestivalCalendar();
    console.log(result.changed
      ? 'Festival calendar updated with matching dates from both configured sources.'
      : 'Festival calendar is current; no verified date changes were found.');
  } catch (error) {
    console.error('Festival calendar sync failed; the existing verified calendar was left unchanged.', error);
    process.exitCode = 1;
  }
}
