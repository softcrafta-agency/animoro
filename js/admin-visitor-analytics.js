import { auth } from './auth-init.js';
import { escapeHtml } from './html-utils.js';

const DEFAULT_RANGE_DAYS = 7;
let isSetup = false;
let range = null;
let eventCursor = '';
let eventCursorHistory = [];
let visitorId = '';
let visitorCursor = '';
let summary = null;
let searchTimer = 0;

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

function getRangeForPreset(preset) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let start = new Date(end);
  if (preset === 'yesterday') {
    end.setUTCDate(end.getUTCDate() - 1);
    start = new Date(end);
  } else if (preset === 'today') {
    start = new Date(end);
  } else {
    const days = Number(preset) || DEFAULT_RANGE_DAYS;
    start.setUTCDate(start.getUTCDate() - days + 1);
  }
  return { startDate: utcDateString(start), endDate: utcDateString(end) };
}

async function getAuthorizedJson(url) {
  if (!auth) throw new Error('Firebase Authentication is unavailable.');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as an administrator to view visitor analytics.');
  const token = await user.getIdToken();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Analytics request failed with HTTP ${response.status}.`);
  return payload;
}

function setStatus(message, isError = false) {
  const status = document.getElementById('analyticsDashboardStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function getRangeQuery(mode, extra = {}) {
  const params = new URLSearchParams({
    mode,
    startDate: range.startDate,
    endDate: range.endDate,
    ...extra,
  });
  return `/api/analytics?${params}`;
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatDuration(value) {
  const seconds = Math.max(0, Number(value) || 0);
  if (seconds < 60) return `${seconds} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function renderMetric(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderSummary(data) {
  summary = data;
  renderMetric('visitorMetricPageViews', formatCount(data.pageViews));
  renderMetric('visitorMetricUnique', formatCount(data.uniqueVisitors));
  renderMetric('visitorMetricToday', formatCount(data.todayVisitors));
  renderMetric('visitorMetricActive', formatCount(data.activeVisitors));
  renderMetric('visitorMetricReturning', formatCount(data.returningVisitors));
  renderMetric('visitorMetricEngagement', formatDuration(data.averageEngagementSeconds));
  const activeTime = document.getElementById('visitorMetricActiveTime');
  if (activeTime) activeTime.textContent = `Activity in last 5 minutes · updated ${new Date(data.activeVisitorsAsOf).toLocaleTimeString('en-US', { timeZone: 'UTC' })} UTC`;

  const hasEvents = data.pageViews > 0;
  renderTimeSeries('analyticsPageViewsChart', data.days, 'pageViews', 'Page views', hasEvents);
  renderTimeSeries('analyticsUniqueVisitorsChart', data.days, 'uniqueVisitors', 'Unique visitors', hasEvents);
  renderBreakdown('analyticsDeviceChart', data.deviceCounts, hasEvents);
  renderBreakdown('analyticsBrowserChart', data.browserCounts, hasEvents);
  renderBreakdown('analyticsOperatingSystemChart', data.operatingSystemCounts, hasEvents);
  renderBreakdown('analyticsTrafficSourceChart', data.trafficSourceCounts, hasEvents);
  renderTopArticles(data.topArticles || []);
  renderArticleOptions(data.articles || []);
}

function renderTimeSeries(containerId, days, field, label, hasEvents) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!hasEvents) {
    container.innerHTML = '<p class="analytics-empty-state">No consented analytics data in this date range.</p>';
    return;
  }
  const width = 620;
  const height = 190;
  const padding = { top: 14, right: 14, bottom: 34, left: 40 };
  const values = days.map(day => Number(day[field] || 0));
  const maxValue = Math.max(...values, 1);
  const x = index => padding.left + (days.length <= 1
    ? (width - padding.left - padding.right) / 2
    : index * (width - padding.left - padding.right) / (days.length - 1));
  const y = value => height - padding.bottom - (value / maxValue) * (height - padding.top - padding.bottom);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const labelIndexes = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
  container.innerHTML = `
    <svg class="analytics-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label} from ${escapeHtml(days[0]?.date || '')} to ${escapeHtml(days.at(-1)?.date || '')}">
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="analytics-axis"></line>
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" class="analytics-axis"></line>
      <polyline points="${points}" class="analytics-line"></polyline>
      ${labelIndexes.map(index => `<text x="${x(index)}" y="${height - 9}" text-anchor="${index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}">${escapeHtml(days[index].date.slice(5))}</text>`).join('')}
      <text x="${padding.left - 8}" y="${padding.top + 5}" text-anchor="end">${formatCount(maxValue)}</text>
      <text x="${padding.left - 8}" y="${height - padding.bottom}" text-anchor="end">0</text>
    </svg>
  `;
}

function renderBreakdown(containerId, values, hasEvents) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const rows = Object.entries(values || {}).filter(([, count]) => Number(count) > 0)
    .sort((left, right) => right[1] - left[1]);
  if (!hasEvents || !rows.length) {
    container.innerHTML = '<p class="analytics-empty-state">No consented analytics data in this date range.</p>';
    return;
  }
  const maximum = Math.max(...rows.map(([, count]) => Number(count)));
  container.innerHTML = `<div class="analytics-breakdown">${rows.map(([name, count]) => `
    <div class="analytics-breakdown-row">
      <div><span>${escapeHtml(name.replaceAll('_', ' '))}</span><strong>${formatCount(count)}</strong></div>
      <div class="analytics-breakdown-track"><span style="width:${Math.max(2, Math.round(Number(count) / maximum * 100))}%"></span></div>
    </div>`).join('')}</div>`;
}

function renderTopArticles(articles) {
  const tbody = document.getElementById('analyticsTopArticlesBody');
  if (!tbody) return;
  if (!articles.length) {
    tbody.innerHTML = '<tr><td colspan="2" class="analytics-empty-state">No article page views in this date range.</td></tr>';
    return;
  }
  tbody.innerHTML = articles.map(article => `
    <tr>
      <td>${article.slug
        ? `<a href="/blog/${encodeURIComponent(article.slug)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.title)}</a>`
        : escapeHtml(article.title)}</td>
      <td>${formatCount(article.pageViews)}</td>
    </tr>
  `).join('');
}

function renderArticleOptions(articles) {
  const select = document.getElementById('analyticsArticleFilter');
  if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">All articles</option>' + articles.map(article => (
    `<option value="${escapeHtml(article.id)}">${escapeHtml(article.title)}</option>`
  )).join('');
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function getEventFilters() {
  return {
    q: document.getElementById('analyticsEventSearch')?.value.trim() || '',
    device: document.getElementById('analyticsDeviceFilter')?.value || '',
    articleId: document.getElementById('analyticsArticleFilter')?.value || '',
    source: document.getElementById('analyticsSourceFilter')?.value || '',
  };
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' });
}

function eventRow(event) {
  const path = typeof event.pagePath === 'string' && event.pagePath.startsWith('/') && !event.pagePath.startsWith('//')
    ? event.pagePath
    : '';
  const title = event.articleTitle || event.pageTitle || path || 'Public page';
  return `<tr>
    <td><button type="button" class="analytics-visitor-link" data-visitor-id="${escapeHtml(event.visitorId)}">${escapeHtml(event.visitorId.slice(0, 12))}…</button></td>
    <td>${escapeHtml(event.deviceCategory || '—')}</td>
    <td>${escapeHtml(event.browser || '—')}</td>
    <td>${escapeHtml(event.operatingSystem || '—')}</td>
    <td>${escapeHtml(event.country || event.city ? [event.city, event.country].filter(Boolean).join(', ') : 'Not collected')}</td>
    <td>${path ? `<a href="${escapeHtml(path)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>` : escapeHtml(title)}</td>
    <td>${escapeHtml(event.referrer || '—')}<small>${escapeHtml(String(event.trafficSource || 'unknown').replaceAll('_', ' '))}</small></td>
    <td>${escapeHtml(formatTimestamp(event.timestamp))}</td>
    <td>${escapeHtml(event.eventType === 'page_view' ? 'Page view' : 'Engagement')}</td>
  </tr>`;
}

async function loadEvents(cursor = '') {
  const tbody = document.getElementById('analyticsEventsBody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9">Loading visitor activity…</td></tr>';
  const params = { ...getEventFilters(), ...(cursor ? { cursor } : {}) };
  try {
    const result = await getAuthorizedJson(getRangeQuery('events', params));
    tbody.innerHTML = result.events.length
      ? result.events.map(eventRow).join('')
      : '<tr><td colspan="9" class="analytics-empty-state">No matching visitor activity was recorded.</td></tr>';
    tbody.querySelectorAll('[data-visitor-id]').forEach(button => {
      button.addEventListener('click', () => {
        void loadVisitorHistory(button.dataset.visitorId);
      });
    });
    const pageStatus = document.getElementById('analyticsEventsPageStatus');
    if (pageStatus) pageStatus.textContent = `${result.events.length} event${result.events.length === 1 ? '' : 's'}${result.partial ? ' · more matching records are available' : ''}`;
    document.getElementById('analyticsEventsPrevious').disabled = eventCursorHistory.length === 0;
    document.getElementById('analyticsEventsNext').disabled = !result.nextCursor;
    document.getElementById('analyticsEventsNext').dataset.cursor = result.nextCursor || '';
    if (result.partial) setStatus('Some filtered activity is beyond the per-request scan limit; continue with Next for more results.');
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="9" class="analytics-empty-state">Visitor activity could not be loaded.</td></tr>';
    setStatus(error.message, true);
  }
}

async function loadVisitorHistory(id, cursor = '') {
  visitorId = id;
  visitorCursor = cursor;
  const panel = document.getElementById('analyticsVisitorDetails');
  const tbody = document.getElementById('analyticsVisitorHistoryBody');
  const label = document.getElementById('analyticsVisitorDetailsLabel');
  if (!panel || !tbody) return;
  panel.hidden = false;
  label.textContent = `Anonymous visitor ${id} · page-view history for this selected date range`;
  tbody.innerHTML = '<tr><td colspan="4">Loading visitor history…</td></tr>';
  try {
    const result = await getAuthorizedJson(getRangeQuery('visitor', {
      visitorId: id,
      ...(cursor ? { cursor } : {}),
    }));
    tbody.innerHTML = result.events.length
      ? result.events.map(event => {
        const path = event.pagePath.startsWith('/') && !event.pagePath.startsWith('//') ? event.pagePath : '';
        return `<tr><td>${path ? `<a href="${escapeHtml(path)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.articleTitle || event.pageTitle || path)}</a>` : escapeHtml(event.pageTitle || 'Page')}</td><td>${escapeHtml(event.deviceCategory || '—')}</td><td>${escapeHtml(event.referrer || '—')}</td><td>${escapeHtml(formatTimestamp(event.timestamp))}</td></tr>`;
      }).join('')
      : '<tr><td colspan="4" class="analytics-empty-state">No page-view history exists for this visitor in the selected period.</td></tr>';
    const nextButton = document.getElementById('analyticsVisitorHistoryNext');
    nextButton.hidden = !result.nextCursor;
    nextButton.dataset.cursor = result.nextCursor || '';
    nextButton.textContent = result.partial ? 'Load Older Activity (more available)' : 'Load Older Activity';
  } catch (error) {
    tbody.innerHTML = '<tr><td colspan="4" class="analytics-empty-state">Visitor history could not be loaded.</td></tr>';
    setStatus(error.message, true);
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetEventPagination() {
  eventCursor = '';
  eventCursorHistory = [];
  void loadEvents();
}

async function loadAnalytics({ includeEvents = true } = {}) {
  if (!range) range = getRangeForPreset(String(DEFAULT_RANGE_DAYS));
  setStatus('Loading consented visitor analytics…');
  try {
    const data = await getAuthorizedJson(getRangeQuery('summary'));
    renderSummary(data);
    const activeWindow = document.getElementById('visitorMetricActiveTime');
    if (activeWindow) activeWindow.title = 'Activity received in the last five minutes; refreshed when this dashboard is open.';
    setStatus(data.pageViews
      ? `Showing ${data.range.startDate} through ${data.range.endDate} (UTC).`
      : `No consented analytics data recorded from ${data.range.startDate} through ${data.range.endDate} (UTC).`);
    if (includeEvents) {
      eventCursor = '';
      eventCursorHistory = [];
      await loadEvents();
    }
    if (visitorId) await loadVisitorHistory(visitorId, visitorCursor);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function applyCustomRange() {
  const startDate = document.getElementById('analyticsStartDate')?.value || '';
  const endDate = document.getElementById('analyticsEndDate')?.value || '';
  if (!startDate || !endDate) {
    setStatus('Choose both a start date and an end date to apply a custom range.');
    return;
  }
  range = { startDate, endDate };
  eventCursor = '';
  eventCursorHistory = [];
  visitorCursor = '';
  void loadAnalytics();
}

export function setupVisitorAnalytics() {
  if (isSetup) return;
  isSetup = true;
  const preset = document.getElementById('analyticsDatePreset');
  if (!preset) return;
  range = getRangeForPreset(preset.value);
  const customDates = document.getElementById('analyticsCustomDates');
  preset.addEventListener('change', () => {
    customDates.hidden = preset.value !== 'custom';
    if (preset.value !== 'custom') {
      range = getRangeForPreset(preset.value);
      visitorId = '';
      document.getElementById('analyticsVisitorDetails').hidden = true;
      void loadAnalytics();
    }
  });
  document.getElementById('analyticsStartDate')?.addEventListener('change', applyCustomRange);
  document.getElementById('analyticsEndDate')?.addEventListener('change', applyCustomRange);
  document.getElementById('refreshVisitorAnalytics')?.addEventListener('click', () => void loadAnalytics());
  document.getElementById('analyticsDeviceFilter')?.addEventListener('change', resetEventPagination);
  document.getElementById('analyticsArticleFilter')?.addEventListener('change', resetEventPagination);
  document.getElementById('analyticsSourceFilter')?.addEventListener('change', resetEventPagination);
  document.getElementById('analyticsEventSearch')?.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(resetEventPagination, 250);
  });
  document.getElementById('analyticsEventsNext')?.addEventListener('click', event => {
    const next = event.currentTarget.dataset.cursor;
    if (!next) return;
    eventCursorHistory.push(eventCursor);
    eventCursor = next;
    void loadEvents(eventCursor);
  });
  document.getElementById('analyticsEventsPrevious')?.addEventListener('click', () => {
    eventCursor = eventCursorHistory.pop() || '';
    void loadEvents(eventCursor);
  });
  document.getElementById('closeAnalyticsVisitorDetails')?.addEventListener('click', () => {
    visitorId = '';
    document.getElementById('analyticsVisitorDetails').hidden = true;
  });
  document.getElementById('analyticsVisitorHistoryNext')?.addEventListener('click', event => {
    const next = event.currentTarget.dataset.cursor;
    if (next && visitorId) void loadVisitorHistory(visitorId, next);
  });
  window.addEventListener('animoro:analytics-tab-open', () => void loadAnalytics());
  window.setInterval(() => {
    if (window.location.hash === '#analytics') void loadAnalytics({ includeEvents: false });
  }, 60000);
}
