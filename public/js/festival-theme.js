(function () {
  const TIME_ZONE = 'Asia/Kolkata';
  const COLOR_PATTERN = /^#[\da-f]{6}$/i;
  const ANIMATIONS = new Set([
    'sparkles', 'snowfall', 'confetti', 'embers', 'tricolor',
    'petals', 'crescent', 'pattern', 'color', 'glow',
  ]);
  let activeDate = '';
  let calendar = null;
  let nextCheck = 0;

  function getIndiaDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function findActiveFestival(date) {
    const active = (calendar?.festivals || [])
      .filter(festival => festival?.enabled !== false && festival?.theme?.enabled !== false)
      .flatMap(festival => Object.values(festival.dates || {}).map(occurrence => ({
        festival,
        occurrence,
      })))
      .filter(({ occurrence }) =>
        typeof occurrence?.startDate === 'string' &&
        typeof occurrence?.endDate === 'string' &&
        occurrence.startDate <= date &&
        date <= occurrence.endDate
      )
      .sort((left, right) =>
        Number(right.festival.theme.priority || 0) - Number(left.festival.theme.priority || 0) ||
        String(left.festival.id).localeCompare(String(right.festival.id))
      );
    return active[0] || null;
  }

  function clearFestivalTheme() {
    const root = document.documentElement;
    delete root.dataset.festivalTheme;
    delete root.dataset.festivalId;
    delete root.dataset.festivalAnimation;
    delete root.dataset.festivalDecorations;
    root.style.removeProperty('--festival-accent');
    root.style.removeProperty('--festival-glow');
  }

  function applyFestivalTheme(date) {
    if (date === activeDate) return;
    activeDate = date;
    const root = document.documentElement;
    const selected = findActiveFestival(date);
    if (!selected) {
      clearFestivalTheme();
      return;
    }

    const { festival } = selected;
    const { theme } = festival;
    root.dataset.festivalTheme = String(theme.themeCss || 'festive').replace(/[^a-z0-9-]/gi, '');
    root.dataset.festivalId = String(festival.id || '').replace(/[^a-z0-9-]/gi, '');
    root.dataset.festivalAnimation = ANIMATIONS.has(theme.animation) ? theme.animation : 'glow';
    root.dataset.festivalDecorations = Array.isArray(theme.decorations)
      ? theme.decorations.filter(item => typeof item === 'string').join(' ')
      : '';
    if (COLOR_PATTERN.test(theme.colors?.accent || '')) {
      root.style.setProperty('--festival-accent', theme.colors.accent);
    } else {
      root.style.removeProperty('--festival-accent');
    }
    if (COLOR_PATTERN.test(theme.colors?.glow || '')) {
      root.style.setProperty('--festival-glow', theme.colors.glow);
    } else {
      root.style.removeProperty('--festival-glow');
    }
  }

  function scheduleDateCheck() {
    window.clearTimeout(nextCheck);
    nextCheck = window.setTimeout(() => {
      applyFestivalTheme(getIndiaDate());
      scheduleDateCheck();
    }, 60_000);
  }

  async function start() {
    document.documentElement.dataset.festivalAtmosphere = 'diwali';
    try {
      const response = await fetch('/festival-calendar.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Calendar request failed (${response.status}).`);
      const candidate = await response.json();
      if (candidate?.version !== 1 || candidate?.timeZone !== TIME_ZONE || !Array.isArray(candidate.festivals)) {
        throw new Error('Festival calendar has an unsupported structure.');
      }
      calendar = candidate;
      applyFestivalTheme(getIndiaDate());
      scheduleDateCheck();
    } catch (error) {
      console.error('Festival theme could not load; Animoro keeps its original theme.', error);
    }
  }

  start();
}());
