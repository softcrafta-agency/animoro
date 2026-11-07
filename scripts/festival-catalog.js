export const CALENDAR_TIME_ZONE = 'Asia/Kolkata';

export const FESTIVAL_SOURCES = [
  {
    id: 'google-india-calendar',
    name: 'Google Calendar — Holidays in India',
    url: 'https://calendar.google.com/calendar/ical/en.indian%23holiday%40group.v.calendar.google.com/public/basic.ics',
  },
  {
    id: 'officeholidays-india',
    name: 'Office Holidays — India',
    url: 'https://www.officeholidays.com/ics/india',
  },
];

export const DIWALI_REFERENCE_SOURCE = {
  id: 'drik-panchang',
  name: 'Drik Panchang — Shrirangapattana, Karnataka',
  url: 'https://www.drikpanchang.com/diwali/diwali-puja-calendar.html?year=2026&geoname-id=1256421',
};

export const DIWALI_2027_REFERENCE_SOURCE = {
  ...DIWALI_REFERENCE_SOURCE,
  url: 'https://www.drikpanchang.com/diwali/diwali-puja-calendar.html?year=2027&geoname-id=1256421',
};

export const FESTIVAL_REFERENCE_SOURCES = [
  ...FESTIVAL_SOURCES,
  DIWALI_REFERENCE_SOURCE,
  DIWALI_2027_REFERENCE_SOURCE,
];

const palettes = {
  diwali: ['#fbbf24', '#fb923c', 'sparkles', ['diyas', 'golden glow']],
  dhanteras: ['#f59e0b', '#fcd34d', 'sparkles', ['gold ornaments', 'warm light']],
  govardhan: ['#65a30d', '#a3e635', 'pattern', ['floral rangoli', 'leaf motifs']],
  bhaidooj: ['#e879f9', '#fb7185', 'sparkles', ['sibling lights', 'petal motifs']],
  chhath: ['#fb923c', '#facc15', 'sparkles', ['sunrise glow', 'water shimmer']],
  gurunanak: ['#fbbf24', '#fde68a', 'pattern', ['golden floral pattern', 'soft light']],
  christmas: ['#34d399', '#f87171', 'snowfall', ['snowfall', 'festive lights']],
  newyear: ['#a78bfa', '#f472b6', 'confetti', ['confetti', 'celebration glow']],
  lohri: ['#fb923c', '#fbbf24', 'embers', ['bonfire glow', 'embers']],
  makar: ['#38bdf8', '#facc15', 'confetti', ['kite silhouettes', 'sunlight']],
  pongal: ['#f97316', '#facc15', 'sparkles', ['harvest motifs', 'sun glow']],
  republic: ['#f97316', '#22c55e', 'tricolor', ['tricolor ribbons', 'subtle glow']],
  vasant: ['#eab308', '#a3e635', 'petals', ['yellow blossoms', 'petals']],
  valentine: ['#fb7185', '#f472b6', 'petals', ['rose petals', 'soft hearts']],
  shivratri: ['#8b5cf6', '#38bdf8', 'glow', ['moonlit glow', 'mandala']],
  ramadan: ['#a78bfa', '#fbbf24', 'crescent', ['crescent moon', 'lantern glow']],
  eid: ['#34d399', '#fbbf24', 'crescent', ['crescent moon', 'lanterns']],
  holi: ['#f472b6', '#38bdf8', 'color', ['soft color clouds', 'color particles']],
  ugadi: ['#84cc16', '#fbbf24', 'petals', ['mango leaves', 'spring blossoms']],
  gudipadwa: ['#fb923c', '#22c55e', 'pattern', ['gudi-inspired pattern', 'spring glow']],
  ramnavami: ['#f97316', '#fbbf24', 'glow', ['saffron glow', 'lotus pattern']],
  baisakhi: ['#facc15', '#22c55e', 'confetti', ['harvest motifs', 'sunlight']],
  mahavir: ['#fbbf24', '#fb923c', 'glow', ['golden aura', 'lotus pattern']],
  buddha: ['#fbbf24', '#a78bfa', 'petals', ['lotus petals', 'calm glow']],
  eiduladha: ['#34d399', '#a78bfa', 'crescent', ['crescent moon', 'geometric pattern']],
  rathyatra: ['#f97316', '#fbbf24', 'confetti', ['festive streamers', 'warm glow']],
  gurupurnima: ['#c084fc', '#fbbf24', 'glow', ['moonlit glow', 'soft particles']],
  muharram: ['#64748b', '#cbd5e1', 'glow', ['quiet silver glow', 'geometric pattern']],
  independence: ['#f97316', '#22c55e', 'tricolor', ['tricolor light', 'subtle ribbons']],
  raksha: ['#fb7185', '#fbbf24', 'sparkles', ['rakhi-inspired motifs', 'warm lights']],
  janmashtami: ['#38bdf8', '#facc15', 'sparkles', ['peacock-feather colors', 'starlight']],
  ganesh: ['#fb923c', '#fbbf24', 'pattern', ['festive floral pattern', 'warm lights']],
  onam: ['#facc15', '#22c55e', 'petals', ['pookalam petals', 'harvest glow']],
  navratri: ['#ec4899', '#fbbf24', 'pattern', ['garba-inspired geometry', 'festive glow']],
  durgapuja: ['#e11d48', '#fbbf24', 'pattern', ['alpana-inspired pattern', 'warm lights']],
  dussehra: ['#f97316', '#facc15', 'embers', ['victory glow', 'embers']],
  karwachauth: ['#e11d48', '#fbbf24', 'crescent', ['crescent moon', 'lantern glow']],
  milad: ['#34d399', '#c4b5fd', 'crescent', ['crescent moon', 'geometric pattern']],
  goodfriday: ['#64748b', '#94a3b8', 'glow', ['quiet silver glow', 'soft gradient']],
  easter: ['#c084fc', '#f9a8d4', 'petals', ['spring blossoms', 'soft color']],
  gandhijayanti: ['#f8fafc', '#86efac', 'glow', ['soft tricolor glow', 'gentle light']],
  children: ['#38bdf8', '#f472b6', 'confetti', ['colorful confetti', 'soft glow']],
  teachers: ['#a78bfa', '#fbbf24', 'sparkles', ['star motifs', 'warm light']],
  gurugobind: ['#fbbf24', '#f97316', 'glow', ['golden light', 'floral pattern']],
  holikadahan: ['#fb923c', '#e11d48', 'embers', ['bonfire glow', 'embers']],
};

const VERIFIED_SEED_DATES = {
  'diwali': { 2026: '2026-11-08', 2027: '2027-10-29' },
  'new-year': { 2026: '2026-01-01', 2027: '2027-01-01' },
  'vasant-panchami': { 2026: '2026-01-23', 2027: '2027-02-11' },
  'republic-day': { 2026: '2026-01-26', 2027: '2027-01-26' },
  'maha-shivratri': { 2026: '2026-02-15', 2027: '2027-03-06' },
  'ugadi': { 2026: '2026-03-19', 2027: '2027-04-07' },
  'mahavir-jayanti': { 2026: '2026-03-31' },
  'good-friday': { 2026: '2026-04-03', 2027: '2027-03-26' },
  'baisakhi': { 2026: '2026-04-14', 2027: '2027-04-14' },
  'buddha-purnima': { 2026: '2026-05-01', 2027: '2027-05-20' },
  'independence-day': { 2026: '2026-08-15', 2027: '2027-08-15' },
  'janmashtami': { 2026: '2026-09-04', 2027: '2027-08-25' },
  'ganesh-chaturthi': { 2026: '2026-09-14', 2027: '2027-09-04' },
  'onam': { 2026: '2026-08-26', 2027: '2027-09-12' },
  'dussehra': { 2027: '2027-10-09' },
  'govardhan-puja': { 2026: '2026-11-09', 2027: '2027-10-30' },
  'christmas': { 2026: '2026-12-25', 2027: '2027-12-25' },
  'pongal': { 2027: '2027-01-15' },
  'ram-navami': { 2027: '2027-04-15' },
  'raksha-bandhan': { 2027: '2027-08-17' },
  'bhai-dooj': { 2027: '2027-10-31' },
  'chhath-puja': { 2027: '2027-11-04' },
};

function theme(id, priority = 10, extra = {}) {
  const [accent, glow, animation, decorations] = palettes[id];
  return {
    themeCss: id,
    colors: { accent, glow },
    decorations,
    animation,
    priority,
    enabled: true,
    ...extra,
  };
}

export const FESTIVAL_CATALOG = [
  {
    id: 'diwali',
    name: 'Diwali',
    aliases: ['Diwali', 'Deepavali', 'Diwali/Deepavali'],
    theme: theme('diwali', 100, { enabled: false, startOffsetDays: -1, endOffsetDays: 4 }),
    windowOverrides: {
      2026: { startDate: '2026-11-07', endDate: '2026-11-12', configuredBy: 'user' },
    },
  },
  { id: 'dhanteras', name: 'Dhanteras', aliases: ['Dhanteras', 'Dhantrayodashi'], theme: theme('dhanteras', 55) },
  { id: 'govardhan-puja', name: 'Govardhan Puja', aliases: ['Govardhan Puja', 'Annakut'], theme: theme('govardhan', 60) },
  { id: 'bhai-dooj', name: 'Bhai Dooj', aliases: ['Bhai Dooj', 'Bhai Duj', 'Bhaiya Dooj', 'Bhai Bij'], theme: theme('bhaidooj', 55) },
  { id: 'chhath-puja', name: 'Chhath Puja', aliases: ['Chhath Puja', 'Chhat Puja (Pratihar Sashthi/Surya Sashthi)'], theme: theme('chhath', 50) },
  { id: 'guru-nanak-jayanti', name: 'Guru Nanak Jayanti', aliases: ['Guru Nanak Jayanti', 'Guru Nanak Gurpurab'], theme: theme('gurunanak', 55) },
  { id: 'christmas', name: 'Christmas', aliases: ['Christmas', 'Christmas Day'], theme: theme('christmas', 80, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'new-year', name: 'New Year', aliases: ["New Year's Day", 'New Year'], theme: theme('newyear', 75, { startOffsetDays: -1, endOffsetDays: 0 }) },
  { id: 'lohri', name: 'Lohri', aliases: ['Lohri'], theme: theme('lohri', 45) },
  { id: 'makar-sankranti', name: 'Makar Sankranti', aliases: ['Makar Sankranti', 'Sankranti'], theme: theme('makar', 50) },
  { id: 'pongal', name: 'Pongal', aliases: ['Pongal'], theme: theme('pongal', 50) },
  { id: 'republic-day', name: 'Republic Day', aliases: ['Republic Day'], theme: theme('republic', 65, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'vasant-panchami', name: 'Vasant Panchami', aliases: ['Vasant Panchami', 'Basant Panchami'], theme: theme('vasant', 45) },
  { id: 'valentines-day', name: "Valentine's Day", aliases: ["Valentine's Day", 'Valentine Day'], theme: theme('valentine', 30) },
  { id: 'maha-shivratri', name: 'Maha Shivratri', aliases: ['Maha Shivratri', 'Maha Shivaratri'], theme: theme('shivratri', 55) },
  { id: 'ramadan', name: 'Ramadan', aliases: ['Ramadan Start', 'Ramadan Begins'], theme: theme('ramadan', 60, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'eid-ul-fitr', name: 'Eid-ul-Fitr', aliases: ['Eid al-Fitr', 'Eid-ul-Fitr', 'Ramzan Id', 'Id-ul-Fitr'], theme: theme('eid', 70, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'holi', name: 'Holi', aliases: ['Holi', 'Dolyatra'], theme: theme('holi', 80, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'ugadi', name: 'Ugadi', aliases: ['Ugadi', 'Yugadi'], theme: theme('ugadi', 50) },
  { id: 'gudi-padwa', name: 'Gudi Padwa', aliases: ['Gudi Padwa'], theme: theme('gudipadwa', 50) },
  { id: 'ram-navami', name: 'Ram Navami', aliases: ['Ram Navami', 'Rama Navami'], theme: theme('ramnavami', 50) },
  { id: 'baisakhi', name: 'Baisakhi', aliases: ['Baisakhi', 'Vaisakhi'], theme: theme('baisakhi', 50) },
  { id: 'mahavir-jayanti', name: 'Mahavir Jayanti', aliases: ['Mahavir Jayanti'], theme: theme('mahavir', 45) },
  { id: 'buddha-purnima', name: 'Buddha Purnima', aliases: ['Buddha Purnima', 'Buddha Jayanti'], theme: theme('buddha', 45) },
  { id: 'eid-ul-adha', name: 'Eid-ul-Adha', aliases: ['Eid al-Adha', 'Eid-ul-Adha', 'Bakrid', 'Bakra Eid'], theme: theme('eiduladha', 65, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'rath-yatra', name: 'Rath Yatra', aliases: ['Rath Yatra', 'Ratha Yatra'], theme: theme('rathyatra', 45) },
  { id: 'guru-purnima', name: 'Guru Purnima', aliases: ['Guru Purnima'], theme: theme('gurupurnima', 40) },
  { id: 'muharram', name: 'Muharram', aliases: ['Muharram', 'Muharram/Ashura', 'Ashura'], theme: theme('muharram', 55) },
  { id: 'independence-day', name: 'Independence Day', aliases: ['Independence Day'], theme: theme('independence', 65, { startOffsetDays: -1, endOffsetDays: 1 }) },
  { id: 'raksha-bandhan', name: 'Raksha Bandhan', aliases: ['Raksha Bandhan', 'Rakhi'], theme: theme('raksha', 50) },
  { id: 'janmashtami', name: 'Janmashtami', aliases: ['Janmashtami', 'Janmashtami (Smarta)', 'Krishna Janmashtami'], theme: theme('janmashtami', 60) },
  { id: 'ganesh-chaturthi', name: 'Ganesh Chaturthi', aliases: ['Ganesh Chaturthi', 'Ganeshotsav'], theme: theme('ganesh', 60) },
  { id: 'onam', name: 'Onam', aliases: ['Onam', 'Thiruvonam'], theme: theme('onam', 55) },
  { id: 'navratri', name: 'Navratri', aliases: ['Sharad Navratri', 'First Day of Sharad Navratri', 'Navratri'], theme: theme('navratri', 60, { startOffsetDays: 0, endOffsetDays: 8 }) },
  { id: 'durga-puja', name: 'Durga Puja', aliases: ['Durga Puja', 'First Day of Durga Puja Festivities', 'Maha Saptami'], theme: theme('durgapuja', 75, { startOffsetDays: 0, endOffsetDays: 4 }) },
  { id: 'dussehra', name: 'Dussehra', aliases: ['Dussehra', 'Vijayadashami', 'Vijaya Dashami'], theme: theme('dussehra', 70) },
  { id: 'karwa-chauth', name: 'Karwa Chauth', aliases: ['Karwa Chauth', 'Karva Chauth'], theme: theme('karwachauth', 45) },
  { id: 'milad-un-nabi', name: 'Milad-un-Nabi', aliases: ['Milad un-Nabi', 'Milad-un-Nabi', 'Eid-e-Milad'], theme: theme('milad', 45) },
  { id: 'good-friday', name: 'Good Friday', aliases: ['Good Friday'], theme: theme('goodfriday', 45) },
  { id: 'easter', name: 'Easter', aliases: ['Easter Sunday', 'Easter'], theme: theme('easter', 45, { startOffsetDays: -1, endOffsetDays: 0 }) },
  { id: 'gandhi-jayanti', name: 'Gandhi Jayanti', aliases: ['Mahatma Gandhi Jayanti', 'Gandhi Jayanti'], theme: theme('gandhijayanti', 40) },
  { id: 'childrens-day', name: "Children's Day", aliases: ["Children's Day", 'Childrens Day'], theme: theme('children', 35) },
  { id: 'teachers-day', name: "Teachers' Day", aliases: ["Teachers' Day", 'Teachers Day'], theme: theme('teachers', 35) },
  { id: 'guru-gobind-singh-jayanti', name: 'Guru Gobind Singh Jayanti', aliases: ['Guru Gobind Singh Jayanti'], theme: theme('gurugobind', 45) },
  { id: 'holika-dahan', name: 'Holika Dahan', aliases: ['Holika Dahan', 'Holika Dahana'], theme: theme('holikadahan', 55) },
];

export function createEmptyCalendar() {
  const calendar = {
    version: 1,
    timeZone: CALENDAR_TIME_ZONE,
    sources: FESTIVAL_REFERENCE_SOURCES,
    festivals: FESTIVAL_CATALOG.map(({ id, name, theme: festivalTheme }) => ({
      id,
      name,
      enabled: festivalTheme.enabled,
      theme: festivalTheme,
      dates: {},
    })),
  };
  const verifiedAt = '2026-11-07T19:27:22+05:30';
  for (const festival of calendar.festivals) {
    const definition = FESTIVAL_CATALOG.find(item => item.id === festival.id);
    for (const [year, date] of Object.entries(VERIFIED_SEED_DATES[festival.id] || {})) {
      const override = definition.windowOverrides?.[year];
      const startDate = override?.startDate ||
        addCalendarDays(date, definition.theme.startOffsetDays || 0);
      const endDate = override?.endDate ||
        addCalendarDays(date, definition.theme.endOffsetDays || 0);
      const sourceDefinitions = festival.id === 'diwali'
        ? [FESTIVAL_SOURCES[0]]
        : FESTIVAL_SOURCES;
      const sources = sourceDefinitions.map(source => ({
          id: source.id,
          name: source.name,
          url: source.url,
          observedDate: date,
          checkedAt: verifiedAt,
        }));
      if (festival.id === 'diwali') {
        const source = year === '2026' ? DIWALI_REFERENCE_SOURCE : DIWALI_2027_REFERENCE_SOURCE;
        sources.push({ ...source, observedDate: date, checkedAt: verifiedAt });
      }
      festival.dates[year] = {
        festivalDate: date,
        startDate,
        endDate,
        status: 'verified',
        ...(override ? { windowSource: override.configuredBy === 'user' ? 'user-specified-theme-window' : 'source-derived' } : {}),
        sources,
        verifiedAt,
      };
    }
  }
  return calendar;
}

function addCalendarDays(date, amount) {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + amount));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}
