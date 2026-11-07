import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FESTIVAL_CATALOG,
  FESTIVAL_SOURCES,
  createEmptyCalendar,
} from './festival-catalog.js';
import {
  createSyncedCalendar,
  parseFestivalCalendarIcs,
} from './sync-festival-calendar.js';

function sourceEvents(sourceIndex, events) {
  return { source: FESTIVAL_SOURCES[sourceIndex], events };
}

test('parses all-day dates, folded lines, escaped names, and multi-day ranges', () => {
  const parsed = parseFestivalCalendarIcs([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261108',
    'DTEND;VALUE=DATE:20261109',
    'SUMMARY:Diwali/Deepavali',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261224',
    'DTEND;VALUE=DATE:20261227',
    'SUMMARY;LANGUAGE=en-us:India: Christmas Day',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260219',
    'SUMMARY:Ramadan Start (tentative)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'));

  assert.deepEqual(parsed, [
    { date: '2026-11-08', endDate: '2026-11-08', name: 'Diwali/Deepavali', tentative: false },
    { date: '2026-12-24', endDate: '2026-12-26', name: 'Christmas Day', tentative: false },
    { date: '2026-02-19', endDate: '2026-02-19', name: 'Ramadan Start', tentative: true },
  ]);
});

test('only promotes matching source-verified dates and respects the requested Diwali window', () => {
  const calendar = createSyncedCalendar(createEmptyCalendar(), [
    sourceEvents(0, [{ date: '2026-11-08', endDate: '2026-11-08', name: 'Diwali/Deepavali' }]),
    sourceEvents(1, [{ date: '2026-11-08', endDate: '2026-11-08', name: 'Diwali/Deepavali' }]),
  ], '2026-01-01T00:00:00.000Z');
  const diwali = calendar.festivals.find(festival => festival.id === 'diwali');

  assert.equal(diwali.dates['2026'].festivalDate, '2026-11-08');
  assert.equal(diwali.dates['2026'].startDate, '2026-11-07');
  assert.equal(diwali.dates['2026'].endDate, '2026-11-12');
  assert.equal(diwali.dates['2026'].status, 'verified');
  assert.equal(diwali.dates['2026'].sources.length, 2);
  assert.equal(diwali.dates['2026'].verifiedAt, '2026-11-07T19:27:22+05:30');
});

test('leaves prior verified dates unchanged when sources disagree or one is unavailable', () => {
  const existing = createEmptyCalendar();
  const diwali = existing.festivals.find(festival => festival.id === 'diwali');
  diwali.dates['2026'] = {
    festivalDate: '2026-11-08',
    startDate: '2026-11-07',
    endDate: '2026-11-12',
    status: 'verified',
    sources: [{ id: 'existing', url: 'https://example.test/calendar' }],
    verifiedAt: '2025-12-01T00:00:00.000Z',
  };

  const mismatch = createSyncedCalendar(existing, [
    sourceEvents(0, [{ date: '2026-11-08', endDate: '2026-11-08', name: 'Diwali/Deepavali' }]),
    sourceEvents(1, [{ date: '2026-11-09', endDate: '2026-11-09', name: 'Diwali/Deepavali' }]),
  ]);
  const missing = createSyncedCalendar(existing, [
    sourceEvents(0, [{ date: '2026-11-08', endDate: '2026-11-08', name: 'Diwali/Deepavali' }]),
  ]);

  for (const result of [mismatch, missing]) {
    assert.deepEqual(result.festivals.find(festival => festival.id === 'diwali').dates['2026'], diwali.dates['2026']);
  }
});

test('removes duplicate calendar records without discarding the first verified fallback', () => {
  const existing = createEmptyCalendar();
  const diwali = existing.festivals.find(festival => festival.id === 'diwali');
  const duplicate = { ...diwali, dates: {} };
  const calendar = createSyncedCalendar({
    ...existing,
    festivals: [...existing.festivals, duplicate],
  }, []);

  assert.equal(calendar.festivals.filter(festival => festival.id === 'diwali').length, 1);
  assert.equal(
    calendar.festivals.find(festival => festival.id === 'diwali').dates['2026'].startDate,
    '2026-11-07',
  );
});

test('keeps the catalog unique and includes the requested festival coverage', () => {
  const ids = FESTIVAL_CATALOG.map(festival => festival.id);
  const names = FESTIVAL_CATALOG.map(festival => festival.name);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(names).size, names.length);
  for (const name of [
    'Diwali', 'Dhanteras', 'Govardhan Puja', 'Bhai Dooj', 'Chhath Puja',
    'Guru Nanak Jayanti', 'Christmas', 'New Year', 'Lohri', 'Makar Sankranti',
    'Pongal', 'Republic Day', 'Vasant Panchami', "Valentine's Day",
    'Maha Shivratri', 'Ramadan', 'Eid-ul-Fitr', 'Holi', 'Ugadi', 'Gudi Padwa',
    'Ram Navami', 'Baisakhi', 'Mahavir Jayanti', 'Buddha Purnima', 'Eid-ul-Adha',
    'Rath Yatra', 'Guru Purnima', 'Muharram', 'Independence Day', 'Raksha Bandhan',
    'Janmashtami', 'Ganesh Chaturthi', 'Onam', 'Navratri', 'Durga Puja',
    'Dussehra', 'Karwa Chauth', 'Milad-un-Nabi', 'Good Friday', 'Easter',
  ]) {
    assert.ok(names.includes(name), `Missing festival ${name}`);
  }
});

test('seeds the requested 2026 Diwali visual window with source evidence', () => {
  const calendar = createEmptyCalendar();
  const diwali = calendar.festivals.find(festival => festival.id === 'diwali');

  assert.equal(calendar.timeZone, 'Asia/Kolkata');
  assert.deepEqual(diwali.dates['2026'], {
    festivalDate: '2026-11-08',
    startDate: '2026-11-07',
    endDate: '2026-11-12',
    status: 'verified',
    windowSource: 'user-specified-theme-window',
    sources: [
      {
        id: 'google-india-calendar',
        name: FESTIVAL_SOURCES[0].name,
        url: FESTIVAL_SOURCES[0].url,
        observedDate: '2026-11-08',
        checkedAt: '2026-11-07T19:27:22+05:30',
      },
      {
        id: 'drik-panchang',
        name: 'Drik Panchang — Shrirangapattana, Karnataka',
        url: 'https://www.drikpanchang.com/diwali/diwali-puja-calendar.html?year=2026&geoname-id=1256421',
        observedDate: '2026-11-08',
        checkedAt: '2026-11-07T19:27:22+05:30',
      },
    ],
    verifiedAt: '2026-11-07T19:27:22+05:30',
  });
  assert.equal(diwali.dates['2027'].festivalDate, '2027-10-29');
  assert.equal(diwali.dates['2027'].startDate, '2027-10-28');
  assert.equal(diwali.dates['2027'].endDate, '2027-11-02');
  assert.equal(diwali.dates['2027'].sources[1].url.includes('year=2027'), true);
});

test('seeds only matching 2026 and 2027 dates with source evidence', () => {
  const calendar = createEmptyCalendar();
  const datesFor = id => calendar.festivals.find(festival => festival.id === id).dates;

  assert.equal(datesFor('onam')['2026'].festivalDate, '2026-08-26');
  assert.equal(datesFor('onam')['2027'].festivalDate, '2027-09-12');
  assert.equal(datesFor('bhai-dooj')['2027'].festivalDate, '2027-10-31');
  assert.equal(datesFor('chhath-puja')['2027'].festivalDate, '2027-11-04');
  assert.equal(datesFor('holi')['2026'], undefined);
  assert.equal(datesFor('eid-ul-fitr')['2027'], undefined);
  assert.equal(datesFor('easter')['2026'], undefined);

  for (const festival of calendar.festivals) {
    for (const occurrence of Object.values(festival.dates)) {
      assert.equal(occurrence.status, 'verified');
      assert.ok(occurrence.verifiedAt);
      assert.ok(occurrence.sources.length >= 2);
      assert.ok(occurrence.sources.every(source => source.observedDate === occurrence.festivalDate));
    }
  }
});

test('supports valid unique date entries and records both configured source identities', () => {
  const calendar = createSyncedCalendar(createEmptyCalendar(), [
    sourceEvents(0, [{ date: '2026-12-25', endDate: '2026-12-25', name: 'Christmas Day' }]),
    sourceEvents(1, [{ date: '2026-12-25', endDate: '2026-12-25', name: 'Christmas Day' }]),
  ]);
  const christmas = calendar.festivals.find(festival => festival.id === 'christmas');
  assert.equal(christmas.dates['2026'].startDate, '2026-12-24');
  assert.equal(christmas.dates['2026'].endDate, '2026-12-26');
  assert.deepEqual(
    christmas.dates['2026'].sources.map(source => source.id).sort(),
    FESTIVAL_SOURCES.map(source => source.id).sort(),
  );
});
