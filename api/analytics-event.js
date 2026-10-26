import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminServices } from './_lib/firebase-admin.js';
import {
  classifyTrafficSource,
  getClientCategories,
  getRateLimitDocumentId,
  getTrustedClientIp,
  isAllowedPublicPath,
  isKnownBot,
  isValidAnalyticsId,
  sanitizeCampaignValue,
  sanitizeLabel,
  sanitizeReferrer,
  toUtcDay,
} from './_lib/analytics.js';

const MAX_BODY_BYTES = 4096;
const SESSION_EVENT_INTERVAL_MS = 750;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 600;
const RATE_LIMIT_RETENTION_MS = 30 * 60 * 1000;
const EVENT_RETENTION_DAYS = 90;
const SESSION_RETENTION_DAYS = 1;
const VISITOR_RETENTION_DAYS = 180;
const DAILY_VISITOR_RETENTION_DAYS = 90;

function sendJson(response, statusCode, payload) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.statusCode = statusCode;
  return response.end(JSON.stringify(payload));
}

function readBody(request) {
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body, 'utf8') > MAX_BODY_BYTES) return null;
    return JSON.parse(request.body);
  }
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return null;
  if (Buffer.byteLength(JSON.stringify(request.body), 'utf8') > MAX_BODY_BYTES) return null;
  return request.body;
}

function hasOnlyFields(body, fields) {
  return Object.keys(body).every(field => fields.has(field));
}

function isValidPageViewPayload(body) {
  const fields = new Set([
    'eventType',
    'eventId',
    'visitorId',
    'sessionId',
    'pagePath',
    'pageTitle',
    'articleSlug',
    'utmSource',
    'utmMedium',
    'utmCampaign',
  ]);
  if (!hasOnlyFields(body, fields) ||
      !isValidAnalyticsId(body.eventId) ||
      typeof body.pagePath !== 'string' ||
      typeof body.pageTitle !== 'string' ||
      body.pageTitle.length > 200) {
    return false;
  }
  if (body.articleSlug !== undefined &&
      (typeof body.articleSlug !== 'string' || body.articleSlug.length > 200)) {
    return false;
  }
  return ['utmSource', 'utmMedium', 'utmCampaign'].every(field =>
    body[field] === undefined ||
    (typeof body[field] === 'string' && body[field].length <= 100)
  );
}

function isValidEngagementPayload(body) {
  const fields = new Set([
    'eventType',
    'pageViewEventId',
    'visitorId',
    'sessionId',
    'engagementSeconds',
  ]);
  return hasOnlyFields(body, fields) &&
    isValidAnalyticsId(body.pageViewEventId) &&
    typeof body.engagementSeconds === 'number' &&
    Number.isInteger(body.engagementSeconds) &&
    body.engagementSeconds >= 1 &&
    body.engagementSeconds <= 3600;
}

async function consumeRequestQuota(firestore, request, now, secret, maxRequests) {
  const clientIp = getTrustedClientIp(request);
  if (!clientIp) return { status: 'unavailable' };
  const windowStart = Math.floor(now.getTime() / RATE_LIMIT_WINDOW_MS);
  const documentId = getRateLimitDocumentId(clientIp, windowStart, secret);
  if (!documentId) return { status: 'unavailable' };

  const quotaRef = firestore.collection('analytics_rate_limits').doc(documentId);
  return firestore.runTransaction(async transaction => {
    const snapshot = await transaction.get(quotaRef);
    const currentCount = snapshot.exists ? Number(snapshot.data()?.requestCount || 0) : 0;
    if (currentCount >= maxRequests) return { status: 'limited' };
    transaction.set(quotaRef, {
      requestCount: currentCount + 1,
      windowStart: Timestamp.fromDate(new Date(windowStart * RATE_LIMIT_WINDOW_MS)),
      expireAt: Timestamp.fromDate(new Date(now.getTime() + RATE_LIMIT_RETENTION_MS)),
    }, { merge: true });
    return { status: 'accepted' };
  });
}

function parsePublicPage(body) {
  const pagePath = body.pagePath;
  if (!isAllowedPublicPath(pagePath)) return null;
  const match = /^\/blog\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i.exec(pagePath);
  const title = sanitizeLabel(body.pageTitle, 200);
  if (match) {
    const requestedSlug = match[1].toLowerCase();
    if (body.articleSlug && body.articleSlug !== requestedSlug) return null;
    return { pagePath: `/blog/${requestedSlug}`, pageTitle: title, articleSlug: requestedSlug };
  }
  if (body.articleSlug || body.articleId) return null;
  return { pagePath, pageTitle: title, articleSlug: '' };
}

function summarizeEventFields(body, request, page, article, now) {
  const userAgent = typeof request.headers?.['user-agent'] === 'string'
    ? request.headers['user-agent'].slice(0, 1000)
    : '';
  const referrer = sanitizeReferrer(request.headers?.referer || request.headers?.referrer || '');
  const utm = {
    source: sanitizeCampaignValue(body.utmSource),
    medium: sanitizeCampaignValue(body.utmMedium),
    campaign: sanitizeCampaignValue(body.utmCampaign),
  };
  const categories = getClientCategories(userAgent);
  return {
    eventType: 'page_view',
    visitorId: body.visitorId,
    sessionId: body.sessionId,
    ...(article ? {
      articleId: article.id,
      articleSlug: article.slug,
      articleTitle: article.title,
      canonicalUrl: `https://www.animoro.in${page.pagePath}`,
    } : {}),
    pagePath: page.pagePath,
    pageTitle: page.pageTitle || page.pagePath,
    ...categories,
    country: null,
    city: null,
    referrer,
    trafficSource: classifyTrafficSource(referrer, utm),
    ...(utm.source ? { utmSource: utm.source } : {}),
    ...(utm.medium ? { utmMedium: utm.medium } : {}),
    ...(utm.campaign ? { utmCampaign: utm.campaign } : {}),
    timestamp: FieldValue.serverTimestamp(),
    receivedAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromDate(new Date(now.getTime() + EVENT_RETENTION_DAYS * 86400000)),
    engagementSeconds: 0,
  };
}

async function findPublishedArticle(firestore, slug) {
  if (!slug) return null;
  const snapshot = await firestore.collection('posts')
    .where('status', '==', 'published')
    .where('slug', '==', slug)
    .limit(1)
    .get();
  const document = snapshot.docs.find(item =>
    item.data()?.status === 'published' && item.data()?.slug === slug
  );
  return document ? { id: document.id, slug, title: sanitizeLabel(document.data().title, 200) } : null;
}

async function savePageView(firestore, body, request, page, article, now) {
  const eventRef = firestore.collection('analytics_events').doc(body.eventId);
  const visitorRef = firestore.collection('analytics_visitors').doc(body.visitorId);
  const sessionRef = firestore.collection('analytics_sessions').doc(body.sessionId);
  const dayRef = firestore.collection('analytics_daily_summaries').doc(toUtcDay(now));
  const dailyVisitorRef = dayRef.collection('visitors').doc(body.visitorId);
  const event = summarizeEventFields(body, request, page, article, now);
  const dayCounters = {
    pageViews: FieldValue.increment(1),
    deviceCounts: { [event.deviceCategory]: FieldValue.increment(1) },
    browserCounts: { [event.browser]: FieldValue.increment(1) },
    operatingSystemCounts: { [event.operatingSystem]: FieldValue.increment(1) },
    trafficSourceCounts: { [event.trafficSource]: FieldValue.increment(1) },
    ...(article ? { topArticles: { [article.id]: FieldValue.increment(1) } } : {}),
  };
  const transactionResult = await firestore.runTransaction(async transaction => {
    const [existingEvent, visitorSnapshot, sessionSnapshot, dailyVisitorSnapshot] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(visitorRef),
      transaction.get(sessionRef),
      transaction.get(dailyVisitorRef),
    ]);
    if (existingEvent.exists) return { status: 'duplicate' };
    const lastEventAt = sessionSnapshot.data()?.lastEventAtMillis || 0;
    if (now.getTime() - lastEventAt < SESSION_EVENT_INTERVAL_MS) return { status: 'throttled' };

    const serverTime = FieldValue.serverTimestamp();
    transaction.create(eventRef, event);
    transaction.set(visitorRef, {
      ...(visitorSnapshot.exists ? {} : { firstSeenAt: serverTime }),
      lastSeenAt: serverTime,
      expireAt: Timestamp.fromDate(new Date(now.getTime() + VISITOR_RETENTION_DAYS * 86400000)),
    }, { merge: true });
    transaction.set(sessionRef, {
      visitorId: body.visitorId,
      ...(sessionSnapshot.exists ? {} : { startedAt: serverTime }),
      lastActivityAt: serverTime,
      lastEventAtMillis: now.getTime(),
      lastPagePath: page.pagePath,
      expireAt: Timestamp.fromDate(new Date(now.getTime() + SESSION_RETENTION_DAYS * 86400000)),
    }, { merge: true });
    transaction.set(dayRef, {
      ...dayCounters,
      ...(dailyVisitorSnapshot.exists ? {} : { uniqueVisitors: FieldValue.increment(1) }),
    }, { merge: true });
    if (!dailyVisitorSnapshot.exists) {
      transaction.create(dailyVisitorRef, {
        createdAt: serverTime,
        expireAt: Timestamp.fromDate(new Date(now.getTime() + DAILY_VISITOR_RETENTION_DAYS * 86400000)),
      });
    }
    return { status: 'recorded' };
  });
  return transactionResult;
}

async function saveEngagement(firestore, body, now) {
  const seconds = Number(body.engagementSeconds);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) return { status: 'invalid' };
  const eventRef = firestore.collection('analytics_events').doc(body.pageViewEventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists) return { status: 'missing' };
  const event = eventSnapshot.data();
  if (event.eventType !== 'page_view' ||
      event.visitorId !== body.visitorId ||
      event.sessionId !== body.sessionId ||
      event.engagementSeconds > 0) {
    return { status: 'duplicate' };
  }
  const dayRef = firestore.collection('analytics_daily_summaries')
    .doc(toUtcDay(event.timestamp?.toDate?.() || now));
  await firestore.runTransaction(async transaction => {
    const current = await transaction.get(eventRef);
    if (!current.exists || current.data().engagementSeconds > 0 ||
        current.data().visitorId !== body.visitorId ||
        current.data().sessionId !== body.sessionId) return;
    transaction.update(eventRef, { engagementSeconds: seconds });
    transaction.set(dayRef, {
      engagementTotalSeconds: FieldValue.increment(seconds),
      engagementEvents: FieldValue.increment(1),
    }, { merge: true });
  });
  return { status: 'recorded' };
}

export function createAnalyticsEventHandler({
  getServices = getAdminServices,
  clock = () => new Date(),
  logger = console,
  rateLimitSecret = process.env.ANALYTICS_RATE_LIMIT_SECRET,
  maxRequestsPerWindow = RATE_LIMIT_MAX_REQUESTS,
} = {}) {
  return async function analyticsEventHandler(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { error: 'Method Not Allowed' });
    }

    let body;
    try {
      body = readBody(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid JSON payload.' });
    }
    if (!body) return sendJson(response, 413, { error: 'Request payload is missing or too large.' });
    if (!isValidAnalyticsId(body.visitorId) || !isValidAnalyticsId(body.sessionId)) {
      return sendJson(response, 400, { error: 'Valid anonymous visitor and session IDs are required.' });
    }
    const userAgent = request.headers?.['user-agent'] || '';
    if (typeof userAgent !== 'string' || !userAgent || isKnownBot(userAgent)) {
      return sendJson(response, 202, { accepted: false, reason: 'bot_or_missing_user_agent' });
    }

    if (body.eventType === 'page_view' && !isValidPageViewPayload(body)) {
      return sendJson(response, 400, { error: 'The page-view event payload is invalid.' });
    }
    if (body.eventType === 'engagement' && !isValidEngagementPayload(body)) {
      return sendJson(response, 400, { error: 'The engagement event payload is invalid.' });
    }
    if (!['page_view', 'engagement'].includes(body.eventType)) {
      return sendJson(response, 400, { error: 'Unsupported event type.' });
    }
    const page = body.eventType === 'page_view' ? parsePublicPage(body) : null;
    if (body.eventType === 'page_view' && !page) {
      return sendJson(response, 400, { error: 'The public page path is invalid.' });
    }
    if (typeof rateLimitSecret !== 'string' || Buffer.byteLength(rateLimitSecret, 'utf8') < 32) {
      logger.error('Analytics rate limiting is not configured with a sufficiently long secret.');
      return sendJson(response, 503, { error: 'Analytics is temporarily unavailable.' });
    }

    const now = clock();
    try {
      const { firestore } = getServices();
      const quota = await consumeRequestQuota(
        firestore,
        request,
        now,
        rateLimitSecret,
        maxRequestsPerWindow
      );
      if (quota.status === 'unavailable') {
        logger.error('Analytics rate limiting could not identify the Vercel-provided client address.');
        return sendJson(response, 503, { error: 'Analytics is temporarily unavailable.' });
      }
      if (quota.status === 'limited') {
        return sendJson(response, 429, { error: 'Too many analytics requests. Try again later.' });
      }

      if (body.eventType === 'engagement') {
        const result = await saveEngagement(firestore, body, now);
        return sendJson(response, result.status === 'invalid' ? 400 : 202, {
          accepted: result.status === 'recorded',
          reason: result.status,
        });
      }
      const article = await findPublishedArticle(firestore, page.articleSlug);
      if (page.articleSlug && !article) {
        return sendJson(response, 202, { accepted: false, reason: 'article_not_public' });
      }
      const result = await savePageView(firestore, body, request, page, article, now);
      return sendJson(response, 202, {
        accepted: result.status === 'recorded',
        reason: result.status,
      });
    } catch (error) {
      logger.error('Analytics event could not be recorded.', error);
      return sendJson(response, 503, { error: 'Analytics is temporarily unavailable.' });
    }
  };
}

export default createAnalyticsEventHandler();
