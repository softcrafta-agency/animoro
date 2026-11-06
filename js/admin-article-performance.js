import { signOut } from 'firebase/auth';
import { auth } from './auth-init.js';
import { escapeHtml } from './html-utils.js';

const REPORTING_TIME_ZONE = 'Asia/Kolkata';
let initialized = false;
let requestSequence = 0;
let pendingDate = '';
let pendingRequest = null;

function getLocalDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function formatPercentage(value) {
  if (value === null || !Number.isFinite(value)) return 'New';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

function getEditUrl(article) {
  return `/admin-post-editor.html?id=${encodeURIComponent(article.id)}`;
}

async function getPerformanceReport(date) {
  if (!auth) throw new Error('Firebase Authentication is unavailable.');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as an administrator to view article performance.');
  let token = await user.getIdToken();
  const url = `/api/analytics?mode=performance&date=${encodeURIComponent(date)}`;
  let response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (response.status === 401) {
      await signOut(auth);
      window.location.replace('/admin-login.html');
      throw new Error('Your admin session expired. Sign in again to view analytics.');
    }
  }
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (!response.ok) throw new Error(`Analytics request failed with HTTP ${response.status}.`);
    throw new Error('The analytics API returned an invalid response.');
  }
  if (!response.ok) {
    throw new Error(payload.detail
      ? `${payload.error || 'Analytics request failed.'} ${payload.detail}`
      : payload.error || `Analytics request failed with HTTP ${response.status}.`);
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('The analytics API returned an invalid response.');
  }
  return payload;
}

function setStatus(message, isError = false) {
  const status = document.getElementById('articlePerformanceStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function renderArticleList(containerId, articles, emptyMessage) {
  const list = document.getElementById(containerId);
  if (!list) return;
  if (!articles.length) {
    list.innerHTML = `<li class="performance-empty-state">${escapeHtml(emptyMessage)}</li>`;
    return;
  }
  list.innerHTML = articles.map((article, index) => `
    <li>
      <span class="performance-article-rank">${index + 1}</span>
      <div class="performance-article-copy">
        ${article.editable
          ? `<a href="${getEditUrl(article)}">${escapeHtml(article.title)}</a>`
          : `<span>${escapeHtml(article.title)}</span>`}
        <small>${escapeHtml(article.category || 'Uncategorized')}</small>
      </div>
      <strong>${formatCount(article.pageViews ?? article.yesterdayViews)} <small>views</small></strong>
    </li>
  `).join('');
}

function renderComparisonChart(report) {
  const container = document.getElementById('performanceChart');
  const comparisonLabel = document.getElementById('performanceComparisonLabel');
  const change = document.getElementById('performanceTrafficChange');
  if (!container || !comparisonLabel || !change) return;
  const [previous, selected] = report.chart;
  const maximum = Math.max(previous.pageViews, selected.pageViews, 1);
  const chartHeight = 142;
  const barWidth = 84;
  const barX = [86, 250];
  const barHeight = item => Math.max(item.pageViews ? 4 : 0, Math.round(item.pageViews / maximum * chartHeight));
  const trend = report.summary.trend;
  change.textContent = `${formatPercentage(report.summary.changePercent)}${trend === 'down' ? ' ↓' : trend === 'up' ? ' ↑' : ''}`;
  change.classList.toggle('is-positive', trend === 'up');
  change.classList.toggle('is-negative', trend === 'down');
  comparisonLabel.textContent = `${report.date} compared with ${report.previousDate}`;
  container.innerHTML = `
    <svg viewBox="0 0 420 210" role="img" aria-label="Page views: ${formatCount(previous.pageViews)} on ${escapeHtml(previous.date)} and ${formatCount(selected.pageViews)} on ${escapeHtml(selected.date)}">
      <line x1="34" y1="${chartHeight + 20}" x2="386" y2="${chartHeight + 20}" class="performance-chart-axis"></line>
      ${[previous, selected].map((item, index) => {
        const height = barHeight(item);
        const y = chartHeight + 19 - height;
        return `<g>
          <rect x="${barX[index]}" y="${y}" width="${barWidth}" height="${height}" rx="7" class="performance-chart-bar ${index ? 'selected' : ''}"></rect>
          <text x="${barX[index] + barWidth / 2}" y="${Math.max(14, y - 9)}" text-anchor="middle" class="performance-chart-count">${formatCount(item.pageViews)}</text>
          <text x="${barX[index] + barWidth / 2}" y="${chartHeight + 47}" text-anchor="middle" class="performance-chart-date">${escapeHtml(item.date)}</text>
          <text x="${barX[index] + barWidth / 2}" y="${chartHeight + 68}" text-anchor="middle" class="performance-chart-label">${index ? 'Selected day' : 'Previous day'}</text>
        </g>`;
      }).join('')}
    </svg>
  `;
}

function makeFindings(report) {
  const findings = [];
  const summary = report.summary;
  if (summary.pageViews === 0 && summary.previousDayPageViews === 0) {
    findings.push('No consented page-view events were recorded on either comparison day, so there is not enough traffic data to rank improvements.');
  } else if (summary.trend === 'down') {
    findings.push(`Public page views fell from ${formatCount(summary.previousDayPageViews)} to ${formatCount(summary.pageViews)} (${formatPercentage(summary.changePercent)}). Review recent search snippets, distribution, and internal links.`);
  } else if (summary.trend === 'up') {
    findings.push(`Public page views grew from ${formatCount(summary.previousDayPageViews)} to ${formatCount(summary.pageViews)} (${formatPercentage(summary.changePercent)}). Identify the channels and articles driving the lift.`);
  }

  const zeroViewArticles = report.articles.filter(article => article.yesterdayViews === 0);
  if (zeroViewArticles.length) {
    const titles = zeroViewArticles.slice(0, 3).map(article => article.title).join(', ');
    findings.push(`${zeroViewArticles.length} published ${zeroViewArticles.length === 1 ? 'article had' : 'articles had'} no views (${titles}${zeroViewArticles.length > 3 ? ', and more' : ''}). Review indexing and add relevant internal links.`);
  }

  const declining = report.articles
    .filter(article => article.trend === 'down')
    .sort((left, right) => left.change - right.change)
    .slice(0, 3);
  for (const article of declining) {
    findings.push(`“${article.title}” declined from ${formatCount(article.previousDayViews)} to ${formatCount(article.yesterdayViews)} views. Refresh its search title and description, then check whether its internal links remain relevant.`);
  }

  const popular = report.topArticles[0];
  if (popular) {
    findings.push(`“${popular.title}” led with ${formatCount(popular.pageViews)} article views. Add useful links to related stories, strengthen its featured image and engagement, and consider a companion topic in ${popular.category}.`);
  }
  const topCategory = report.categories[0];
  if (topCategory) {
    findings.push(`“${topCategory.category}” received the most category traffic (${formatCount(topCategory.pageViews)} article views). Prioritize a fresh, closely related story in this category.`);
  }
  if (!findings.length) findings.push('No published articles or consented traffic were available for this date. Check again after public visits are recorded.');
  return findings;
}

function renderSuggestions(report) {
  const findings = document.getElementById('performanceFindings');
  const general = document.getElementById('performanceGeneralSuggestions');
  const categoryInsight = document.getElementById('performanceCategoryInsight');
  if (!findings || !general || !categoryInsight) return;
  findings.innerHTML = makeFindings(report).map(item => `<li>${escapeHtml(item)}</li>`).join('');
  general.innerHTML = [
    'Keep article titles specific and descriptions compelling without changing the article’s intended meaning.',
    'Use a relevant, high-quality featured image and clear section headings to support reader engagement.',
    'Revisit evergreen articles periodically and verify that their links and factual details are still useful.',
  ].map(item => `<li>${escapeHtml(item)}</li>`).join('');
  if (!report.categories.length) {
    categoryInsight.textContent = 'Category trends will appear when published articles receive consented views.';
    return;
  }
  categoryInsight.innerHTML = `<strong>Category leaders:</strong> ${report.categories.slice(0, 3)
    .map(item => `${escapeHtml(item.category)} (${formatCount(item.pageViews)})`).join(' · ')}`;
}

function renderPerformance(report) {
  const summary = report.summary;
  const isYesterday = report.date === shiftDate(getLocalDateString(), -1);
  const title = document.getElementById('articlePerformanceTitle');
  const currentDayHeading = document.getElementById('performanceCurrentDayHeading');
  if (title) title.textContent = isYesterday ? 'Yesterday’s performance' : `Performance · ${report.date}`;
  if (currentDayHeading) currentDayHeading.textContent = isYesterday ? 'Yesterday views' : `${report.date} views`;
  document.getElementById('performancePageViews').textContent = formatCount(summary.pageViews);
  document.getElementById('performanceUniqueVisitors').textContent = formatCount(summary.uniqueVisitors);
  document.getElementById('performanceArticleViews').textContent = formatCount(summary.articleViews);
  document.getElementById('performancePublishedArticles').textContent = formatCount(summary.publishedArticles);
  renderComparisonChart(report);
  renderArticleList(
    'performanceTopArticles',
    report.topArticles.map(article => ({ ...article, editable: Boolean(report.articles.some(item => item.id === article.id)) })),
    'No article views were recorded for this day.',
  );
  renderArticleList('performanceLowestArticles', report.lowestArticles, 'No published articles are available.');
  renderSuggestions(report);

  const table = document.getElementById('performanceArticleTable');
  if (!report.articles.length) {
    table.innerHTML = '<tr><td colspan="5" class="performance-empty-state">No published articles to compare.</td></tr>';
  } else {
    table.innerHTML = report.articles.map(article => `
      <tr>
        <td><a class="performance-edit-link" href="${getEditUrl(article)}">${escapeHtml(article.title)}</a></td>
        <td>${formatCount(article.yesterdayViews)}</td>
        <td>${formatCount(article.previousDayViews)}</td>
        <td class="${article.change > 0 ? 'is-positive' : article.change < 0 ? 'is-negative' : ''}">${article.change > 0 ? '+' : ''}${formatCount(article.change)}</td>
        <td><span class="performance-trend ${article.trend}">${article.trend === 'up' ? '↑ Up' : article.trend === 'down' ? '↓ Down' : article.trend === 'new' ? 'New' : '—'}</span></td>
      </tr>
    `).join('');
  }
  setStatus(`Showing ${report.date} in ${report.timeZone}. All values use complete calendar days.`);
}

async function loadPerformance() {
  const dashboard = document.getElementById('articlePerformanceDashboard');
  const error = document.getElementById('articlePerformanceError');
  const dateInput = document.getElementById('performanceDate');
  const refreshButton = document.getElementById('refreshArticlePerformance');
  if (!dashboard || !dateInput || !error) return;

  const date = dateInput.value;
  if (pendingRequest && pendingDate === date) return pendingRequest;
  const sequence = ++requestSequence;
  const request = getPerformanceReport(date);
  pendingDate = date;
  pendingRequest = request;
  dashboard.classList.add('is-loading');
  dashboard.setAttribute('aria-busy', 'true');
  error.hidden = true;
  if (refreshButton) refreshButton.disabled = true;
  setStatus('Loading analytics…');
  try {
    const report = await request;
    if (sequence !== requestSequence) return;
    renderPerformance(report);
  } catch (loadError) {
    if (sequence !== requestSequence) return;
    error.textContent = loadError.message;
    error.hidden = false;
    setStatus('Analytics could not be loaded.', true);
  } finally {
    if (pendingRequest === request) {
      pendingRequest = null;
      pendingDate = '';
    }
    if (sequence === requestSequence) {
      dashboard.classList.remove('is-loading');
      dashboard.setAttribute('aria-busy', 'false');
      if (refreshButton) refreshButton.disabled = false;
    }
  }
}

export function setupAdminArticlePerformance() {
  if (initialized) return;
  initialized = true;
  const dateInput = document.getElementById('performanceDate');
  const dashboard = document.getElementById('articlePerformanceDashboard');
  if (!dateInput || !dashboard) return;

  const yesterday = shiftDate(getLocalDateString(), -1);
  dateInput.value = yesterday;
  dateInput.max = yesterday;
  dateInput.min = shiftDate(yesterday, -88);
  dateInput.addEventListener('change', () => void loadPerformance());
  document.getElementById('refreshArticlePerformance')?.addEventListener('click', () => void loadPerformance());
  window.addEventListener('animoro:articles-tab-open', () => void loadPerformance());
}
