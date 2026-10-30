import { isIP } from 'node:net';
import { createHmac } from 'node:crypto';

const ID_PATTERN = /^[a-f0-9]{32}$/i;
const MAX_DATE_RANGE_DAYS = 90;
const PUBLIC_EXACT_PATHS = new Set([
  '/',
  '/blogs.html',
  '/category.html',
  '/search.html',
  '/about.html',
  '/contact.html',
  '/privacy.html',
]);

export function isValidAnalyticsId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function getTrustedClientIp(request) {
  const value = request.headers?.['x-vercel-forwarded-for'] ||
    request.headers?.['x-forwarded-for'];
  if (typeof value !== 'string') return '';
  const address = value.trim();
  return isIP(address) ? address : '';
}

export function getRateLimitDocumentId(clientIp, windowStart, secret) {
  if (!clientIp || typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) return '';
  return createHmac('sha256', secret)
    .update(`${clientIp}:${windowStart}`)
    .digest('hex');
}

export function isKnownBot(userAgent = '') {
  return /(bot|crawler|spider|slurp|preview|facebookexternalhit|whatsapp|telegrambot|discordbot|googleother|bingpreview|headless)/i
    .test(userAgent);
}

export function getClientCategories(userAgent = '') {
  const ua = userAgent.toLowerCase();
  const deviceCategory = /ipad|tablet|playbook|silk(?!.*mobile)/i.test(userAgent)
    ? 'tablet'
    : /mobile|iphone|ipod|android/i.test(userAgent)
      ? 'mobile'
      : 'desktop';
  let browser = 'Other';
  if (/edg\//i.test(userAgent)) browser = 'Edge';
  else if (/opr\/|opera/i.test(userAgent)) browser = 'Opera';
  else if (/firefox\//i.test(userAgent)) browser = 'Firefox';
  else if (/samsungbrowser/i.test(userAgent)) browser = 'Samsung Internet';
  else if (/crios\//i.test(userAgent)) browser = 'Chrome';
  else if (/fxios\//i.test(userAgent)) browser = 'Firefox';
  else if (/chrome\//i.test(userAgent) && !/edg\//i.test(userAgent)) browser = 'Chrome';
  else if (/safari\//i.test(userAgent) && !/chrome\//i.test(userAgent)) browser = 'Safari';
  let operatingSystem = 'Other';
  if (/android/i.test(ua)) operatingSystem = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) operatingSystem = 'iOS';
  else if (/windows/i.test(ua)) operatingSystem = 'Windows';
  else if (/macintosh|mac os x/i.test(ua)) operatingSystem = 'macOS';
  else if (/cros/i.test(ua)) operatingSystem = 'ChromeOS';
  else if (/linux/i.test(ua)) operatingSystem = 'Linux';
  return { deviceCategory, browser, operatingSystem };
}

export function sanitizeLabel(value, maxLength = 100) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

export function isAllowedPublicPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
  if (PUBLIC_EXACT_PATHS.has(value)) return true;
  return /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value);
}

export function parseDateRange(query, now = new Date()) {
  const start = parseDate(query.startDate);
  const end = parseDate(query.endDate);
  if (!start || !end || start > end) return { error: 'Provide a valid startDate and endDate.' };
  const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days > MAX_DATE_RANGE_DAYS) return { error: `Date ranges may not exceed ${MAX_DATE_RANGE_DAYS} days.` };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (end > today) return { error: 'The end date cannot be in the future.' };
  return {
    start,
    end: new Date(end.getTime() + 86400000),
    days,
  };
}

export function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function toUtcDay(date) {
  return date.toISOString().slice(0, 10);
}

export function classifyTrafficSource(referrer, utm = {}) {
  if (utm.source || utm.medium || utm.campaign) return 'campaign';
  if (!referrer) return 'unknown';
  let hostname;
  try {
    const source = /^https?:\/\//i.test(referrer) ? referrer : `https://${referrer}`;
    hostname = new URL(source).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
  if (!hostname || hostname === 'animoro.in' || hostname === 'www.animoro.in') return 'unknown';
  if (/google\.[a-z.]+$|bing\.com$|yahoo\.com$|duckduckgo\.com$|baidu\.com$|yandex\./.test(hostname)) {
    return 'organic_search';
  }
  if (/facebook\.com$|instagram\.com$|t\.co$|x\.com$|twitter\.com$|reddit\.com$|pinterest\./.test(hostname)) {
    return 'social';
  }
  return 'referral';
}

export function sanitizeReferrer(value, siteHost = 'www.animoro.in') {
  if (typeof value !== 'string' || !value) return '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    const hostname = url.hostname.toLowerCase();
    if (hostname === siteHost || hostname === siteHost.replace(/^www\./, '')) return '';
    return hostname.slice(0, 253);
  } catch {
    return '';
  }
}

export function sanitizeCampaignValue(value) {
  const label = sanitizeLabel(value, 100);
  return /^[a-z0-9_. -]*$/i.test(label) ? label : '';
}
