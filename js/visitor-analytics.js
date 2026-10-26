const CONSENT_KEY = 'animoro_analytics_consent_v1';
const VISITOR_COOKIE = 'animoro_analytics_visitor';
const SESSION_KEY = 'animoro_analytics_session';
const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const PUBLIC_PATHS = new Set([
  '/',
  '/anime',
  '/anime.html',
  '/anime-calendar.html',
  '/blogs.html',
  '/category.html',
  '/search.html',
  '/about.html',
  '/contact.html',
  '/privacy.html',
]);
let initialized = false;
let trackedPageViewId = '';
let pageStartedAt = 0;
let engagementSent = false;
let consentBanner;
let pageViewPromise = null;
let pendingArticle = null;

function getConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch (error) {
    console.warn('Analytics consent preference is unavailable; analytics will remain disabled.', error);
    return 'denied';
  }
}

function createId() {
  if (!window.crypto?.getRandomValues) return '';
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
}

function isPublicPage() {
  const { pathname, search } = window.location;
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (!/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(pathname)) return false;
  const params = new URLSearchParams(search);
  return !params.has('preview') && params.get('mode') !== 'preview' && !params.has('adminPreview');
}

function isArticlePage() {
  return /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(window.location.pathname);
}

function getVisitorId() {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${VISITOR_COOKIE}=([a-f0-9]{32})(?:;|$)`, 'i'));
  if (match) return match[1].toLowerCase();
  const id = createId();
  if (!id) return '';
  document.cookie = `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${VISITOR_MAX_AGE_SECONDS}; SameSite=Lax; Secure`;
  return id;
}

function getSessionId() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (/^[a-f0-9]{32}$/i.test(saved.id) && Date.now() - saved.lastActivity < SESSION_TIMEOUT_MS) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...saved, lastActivity: Date.now() }));
        return saved.id;
      }
    }
    const id = createId();
    if (!id) return '';
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, lastActivity: Date.now() }));
    return id;
  } catch (error) {
    console.warn('Analytics session storage is unavailable; analytics will remain disabled.', error);
    return '';
  }
}

function getUtmParameters() {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
  };
}

function sendJson(body, keepalive = false) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 2500);
  return fetch('/api/analytics-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    keepalive,
    signal: controller.signal,
    body: JSON.stringify(body),
  }).then(response => {
    if (!response.ok) throw new Error(`Analytics endpoint returned HTTP ${response.status}.`);
    return response.json();
  }).catch(error => {
    if (error.name !== 'AbortError') {
      console.warn('Analytics event submission failed; public page rendering is unaffected.', error);
    }
    return null;
  }).finally(() => window.clearTimeout(timeout));
}

function sendEngagement() {
  if (!trackedPageViewId || engagementSent || getConsent() !== 'accepted') return;
  const seconds = Math.floor((Date.now() - pageStartedAt) / 1000);
  if (seconds < 1) return;
  engagementSent = true;
  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  if (!visitorId || !sessionId) return;
  const body = JSON.stringify({
    eventType: 'engagement',
    pageViewEventId: trackedPageViewId,
    visitorId,
    sessionId,
    engagementSeconds: Math.min(seconds, 3600),
  });
  if (pageViewPromise) {
    void pageViewPromise.then(result => {
      if (result?.accepted) sendEngagementBeacon(body);
    });
    return;
  }
  sendEngagementBeacon(body);
}

function sendEngagementBeacon(body) {
  try {
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon('/api/analytics-event', blob)) {
      void sendJson(JSON.parse(body), true);
    }
  } catch (error) {
    console.warn('Analytics engagement could not be submitted.', error);
  }
}

function recordPageView(article = null) {
  if (getConsent() !== 'accepted' || !isPublicPage() || trackedPageViewId) return;
  if (isArticlePage() && !article) return;
  const visitorId = getVisitorId();
  const sessionId = getSessionId();
  const eventId = createId();
  if (!visitorId || !sessionId || !eventId) return;

  const pagePath = window.location.pathname;
  const title = document.title.slice(0, 200);
  const payload = {
    eventType: 'page_view',
    eventId,
    visitorId,
    sessionId,
    pagePath,
    pageTitle: title,
    ...getUtmParameters(),
  };
  if (article) payload.articleSlug = pagePath.slice('/blog/'.length);
  trackedPageViewId = eventId;
  pageStartedAt = Date.now();
  pageViewPromise = sendJson(payload, true);
}

function setConsent(value) {
  try {
    const previous = getConsent();
    localStorage.setItem(CONSENT_KEY, value);
    if (value === 'denied') {
      document.cookie = `${VISITOR_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch (error) {
        console.warn('Could not clear the analytics session identifier.', error);
      }
      trackedPageViewId = '';
      engagementSent = true;
    } else if (previous !== 'accepted') {
      trackedPageViewId = '';
      engagementSent = false;
      pageStartedAt = Date.now();
      recordPageView(pendingArticle);
    }
    consentBanner?.remove();
    consentBanner = null;
  } catch (error) {
    console.error('Could not save the analytics privacy choice.', error);
  }
}

export function showAnalyticsConsent() {
  if (!isPublicPage()) return;
  if (consentBanner?.isConnected) {
    consentBanner.focus();
    return;
  }
  const banner = document.createElement('section');
  banner.className = 'analytics-consent-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Analytics privacy choice');
  banner.tabIndex = -1;
  banner.innerHTML = `
    <div class="analytics-consent-copy">
      <strong>Privacy-friendly visitor analytics</strong>
      <p>With your permission, Animoro records page views using a random first-party ID and coarse device, browser, and referral categories. We do not store full IP addresses or precise location. <a href="/privacy.html">Read the privacy notice</a>.</p>
    </div>
    <div class="analytics-consent-actions">
      <button type="button" class="action-btn-sm" data-analytics-consent="denied">Decline</button>
      <button type="button" class="btn-cta" data-analytics-consent="accepted">Allow analytics</button>
    </div>
  `;
  banner.addEventListener('click', event => {
    const choice = event.target.closest('[data-analytics-consent]')?.dataset.analyticsConsent;
    if (choice === 'accepted' || choice === 'denied') setConsent(choice);
  });
  document.body.appendChild(banner);
  consentBanner = banner;
  banner.focus();
}

export function initializeVisitorAnalytics() {
  if (initialized) return;
  initialized = true;
  if (!isPublicPage()) return;
  window.AnimoroPrivacySettings = { open: showAnalyticsConsent };
  const consent = getConsent();
  if (consent === 'accepted') recordPageView();
  else if (consent !== 'denied') showAnalyticsConsent();
  window.addEventListener('pagehide', sendEngagement, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sendEngagement();
  });
}

export function trackArticlePageView(article) {
  if (!article || typeof article.id !== 'string' || !article.id) return;
  const slug = window.location.pathname.slice('/blog/'.length);
  if (slug !== article.slug || !/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(window.location.pathname)) return;
  pendingArticle = article;
  recordPageView(article);
}
