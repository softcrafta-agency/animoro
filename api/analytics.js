import { Timestamp } from 'firebase-admin/firestore';
import { authorizeAdminRequest } from './_lib/admin-auth.js';
import { parseDateRange, isValidAnalyticsId, sanitizeLabel } from './_lib/analytics.js';

const PAGE_SIZE = 50;
const SCAN_SIZE = 150;
const MAX_SCANNED_EVENTS = 3000;
const DAY_MS = 86400000;

function sendJson(response, statusCode, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.statusCode = statusCode;
  return response.end(JSON.stringify(payload));
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function countQuery(query) {
  return query.count().get().then(snapshot => snapshot.data().count);
}

function mergeCounts(target, incoming = {}) {
  for (const [key, value] of Object.entries(incoming)) {
    if (Number.isFinite(value)) target[key] = (target[key] || 0) + value;
  }
}

function getDateParams(query, now) {
  const today = dateString(now);
  const startDate = typeof query.startDate === 'string' ? query.startDate : today;
  const endDate = typeof query.endDate === 'string' ? query.endDate : today;
  const range = parseDateRange({ startDate, endDate }, now);
  return range.error ? { error: range.error } : { ...range, startDate, endDate };
}

async function loadSummary(firestore, range, now) {
  const summaryRefs = [];
  for (let day = range.start.getTime(); day < range.end.getTime(); day += DAY_MS) {
    summaryRefs.push(firestore.collection('analytics_daily_summaries').doc(dateString(new Date(day))).get());
  }
  const snapshots = await Promise.all(summaryRefs);
  const days = snapshots.map((snapshot, index) => {
    const date = dateString(new Date(range.start.getTime() + index * DAY_MS));
    const data = snapshot.exists ? snapshot.data() : {};
    return {
      date,
      pageViews: Number(data.pageViews || 0),
      uniqueVisitors: Number(data.uniqueVisitors || 0),
      engagementTotalSeconds: Number(data.engagementTotalSeconds || 0),
      engagementEvents: Number(data.engagementEvents || 0),
    };
  });

  const from = Timestamp.fromDate(range.start);
  const to = Timestamp.fromDate(range.end);
  const visitors = firestore.collection('analytics_visitors')
    .where('lastSeenAt', '>=', from)
    .where('lastSeenAt', '<', to);
  const [uniqueVisitors, returningVisitors, todayVisitors, activeVisitors] = await Promise.all([
    countQuery(visitors),
    countQuery(visitors.where('firstSeenAt', '<', from)),
    countQuery(firestore.collection('analytics_visitors')
      .where('lastSeenAt', '>=', Timestamp.fromDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))))
      .where('lastSeenAt', '<', Timestamp.fromDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))))),
    countQuery(firestore.collection('analytics_visitors')
      .where('lastSeenAt', '>=', Timestamp.fromDate(new Date(now.getTime() - 5 * 60 * 1000)))),
  ]);

  const deviceCounts = {};
  const browserCounts = {};
  const operatingSystemCounts = {};
  const trafficSourceCounts = {};
  const articleCounts = {};
  snapshots.forEach(snapshot => {
    if (!snapshot.exists) return;
    const data = snapshot.data();
    mergeCounts(deviceCounts, data.deviceCounts);
    mergeCounts(browserCounts, data.browserCounts);
    mergeCounts(operatingSystemCounts, data.operatingSystemCounts);
    mergeCounts(trafficSourceCounts, data.trafficSourceCounts);
    mergeCounts(articleCounts, data.topArticles);
  });

  const topArticleIds = Object.entries(articleCounts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10);
  const articleSnapshots = await Promise.all(topArticleIds.map(([id]) =>
    firestore.collection('posts').doc(id).get()
  ));
  const topArticles = topArticleIds.map(([id, pageViews], index) => {
    const snapshot = articleSnapshots[index];
    const article = snapshot.exists ? snapshot.data() : {};
    return {
      id,
      slug: typeof article.slug === 'string' ? article.slug : '',
      title: sanitizeLabel(article.title, 200) || 'Deleted or unavailable article',
      pageViews,
    };
  });

  const articleSnapshot = await firestore.collection('posts')
    .where('status', '==', 'published')
    .orderBy('views', 'desc')
    .limit(200)
    .get();
  const articles = articleSnapshot.docs.map(document => ({
    id: document.id,
    title: sanitizeLabel(document.data().title, 200) || 'Untitled article',
    slug: typeof document.data().slug === 'string' ? document.data().slug : '',
  }));
  const pageViews = days.reduce((total, day) => total + day.pageViews, 0);
  const engagementTotalSeconds = days.reduce((total, day) => total + day.engagementTotalSeconds, 0);
  const engagementEvents = days.reduce((total, day) => total + day.engagementEvents, 0);
  return {
    range: { startDate: range.startDate, endDate: range.endDate },
    pageViews,
    uniqueVisitors,
    todayVisitors,
    activeVisitors,
    returningVisitors,
    averageEngagementSeconds: engagementEvents ? Math.round(engagementTotalSeconds / engagementEvents) : 0,
    days,
    deviceCounts,
    browserCounts,
    operatingSystemCounts,
    trafficSourceCounts,
    topArticles,
    articles,
    activeVisitorsAsOf: now.toISOString(),
    activeWindowSeconds: 300,
    timeZone: 'UTC',
  };
}

function decodeCursor(cursor) {
  if (typeof cursor !== 'string' || cursor.length > 500) return null;
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf8');
    return /^[a-zA-Z0-9_-]{1,150}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function encodeCursor(id) {
  return Buffer.from(id).toString('base64url');
}

function eventMatches(event, filters) {
  if (filters.device && event.deviceCategory !== filters.device) return false;
  if (filters.articleId && event.articleId !== filters.articleId) return false;
  if (filters.source && event.trafficSource !== filters.source) return false;
  if (filters.query) {
    const query = filters.query.toLowerCase();
    const searchable = [event.visitorId, event.articleTitle, event.pagePath, event.referrer]
      .filter(Boolean).join(' ').toLowerCase();
    if (!searchable.includes(query)) return false;
  }
  return true;
}

function serializeEvent(document) {
  const event = document.data();
  return {
    id: document.id,
    eventType: event.eventType,
    visitorId: event.visitorId,
    sessionId: event.sessionId,
    articleId: event.articleId || '',
    articleSlug: event.articleSlug || '',
    articleTitle: event.articleTitle || '',
    pagePath: event.pagePath,
    pageTitle: event.pageTitle,
    deviceCategory: event.deviceCategory,
    browser: event.browser,
    operatingSystem: event.operatingSystem,
    country: event.country || null,
    city: event.city || null,
    referrer: event.referrer || '',
    trafficSource: event.trafficSource,
    timestamp: event.timestamp?.toDate?.().toISOString() || null,
    engagementSeconds: Number(event.engagementSeconds || 0),
  };
}

async function readEventPage(firestore, range, queryParams, visitorId = '') {
  let baseQuery = firestore.collection('analytics_events')
    .where('timestamp', '>=', Timestamp.fromDate(range.start))
    .where('timestamp', '<', Timestamp.fromDate(range.end));
  if (visitorId) baseQuery = baseQuery.where('visitorId', '==', visitorId);
  baseQuery = baseQuery.orderBy('timestamp', 'desc');

  const cursorId = decodeCursor(queryParams.cursor);
  if (queryParams.cursor && !cursorId) return { error: 'Invalid event page cursor.' };
  if (cursorId) {
    const cursorSnapshot = await firestore.collection('analytics_events').doc(cursorId).get();
    if (!cursorSnapshot.exists) return { error: 'Event page cursor has expired. Refresh the activity list.' };
    baseQuery = baseQuery.startAfter(cursorSnapshot);
  }

  const filters = {
    device: ['mobile', 'desktop', 'tablet'].includes(queryParams.device) ? queryParams.device : '',
    articleId: typeof queryParams.articleId === 'string' ? queryParams.articleId.slice(0, 150) : '',
    source: ['organic_search', 'direct', 'referral', 'social', 'campaign', 'unknown'].includes(queryParams.source)
      ? queryParams.source
      : '',
    query: sanitizeLabel(queryParams.q, 100),
  };
  const events = [];
  let scanned = 0;
  let lastScanned = '';
  let moreAvailable = false;
  let pageQuery = baseQuery;
  while (scanned < MAX_SCANNED_EVENTS && events.length < PAGE_SIZE) {
    const batch = await pageQuery.limit(SCAN_SIZE).get();
    if (!batch.docs.length) break;
    for (const document of batch.docs) {
      scanned += 1;
      lastScanned = document.id;
      const event = document.data();
      if ((!visitorId || event.visitorId === visitorId) && eventMatches(event, filters)) {
        events.push(serializeEvent(document));
        if (events.length === PAGE_SIZE) {
          moreAvailable = scanned < MAX_SCANNED_EVENTS || batch.docs.length === SCAN_SIZE;
          break;
        }
      }
    }
    if (events.length === PAGE_SIZE || batch.docs.length < SCAN_SIZE || scanned >= MAX_SCANNED_EVENTS) break;
    const lastDocument = batch.docs[batch.docs.length - 1];
    pageQuery = baseQuery.startAfter(lastDocument);
  }

  if (scanned >= MAX_SCANNED_EVENTS && lastScanned) moreAvailable = true;
  return {
    events,
    nextCursor: moreAvailable && lastScanned ? encodeCursor(lastScanned) : '',
    partial: scanned >= MAX_SCANNED_EVENTS,
  };
}

export function createAnalyticsHandler({ authorize = authorizeAdminRequest, clock = () => new Date(), logger = console } = {}) {
  return async function analyticsHandler(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return sendJson(response, 405, { error: 'Method Not Allowed' });
    }
    const authorization = await authorize(request);
    if (!authorization.authorized) {
      return sendJson(response, authorization.status, { error: authorization.message });
    }

    const now = clock();
    const params = request.query || {};
    const range = getDateParams(params, now);
    if (range.error) return sendJson(response, 400, { error: range.error });
    const mode = typeof params.mode === 'string' ? params.mode : 'summary';
    try {
      if (mode === 'summary') {
        return sendJson(response, 200, await loadSummary(authorization.services.firestore, range, now));
      }
      if (mode === 'events') {
        const result = await readEventPage(authorization.services.firestore, range, params);
        return sendJson(response, result.error ? 400 : 200, result);
      }
      if (mode === 'visitor') {
        if (!isValidAnalyticsId(params.visitorId)) {
          return sendJson(response, 400, { error: 'A valid anonymous visitor ID is required.' });
        }
        const result = await readEventPage(authorization.services.firestore, range, params, params.visitorId);
        return sendJson(response, result.error ? 400 : 200, result);
      }
      return sendJson(response, 400, { error: 'Unsupported analytics request mode.' });
    } catch (error) {
      logger.error('Analytics dashboard query failed.', error);
      return sendJson(response, 503, { error: 'Analytics data is temporarily unavailable.' });
    }
  };
}

export default createAnalyticsHandler();
