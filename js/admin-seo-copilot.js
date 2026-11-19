import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db, isConfigured } from './firebase-init.js';
import {
  analyzeArticle,
  decideRecommendation,
  getSeoCopilotJson,
  renderAnalysisSummary,
  renderContentQuality,
  renderRecommendationList,
  createInternalLinkList,
} from './seo-copilot-client.js';

let initialized = false;
let articles = [];
let currentRecommendations = [];

function setDashboardStatus(message, isError = false) {
  const status = document.getElementById('seoCopilotDashboardStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatNumber(value) {
  return value === null || value === undefined
    ? 'Not recorded'
    : Number(value).toLocaleString('en-US');
}

function getFilters() {
  const values = {
    articleId: document.getElementById('seoCopilotFilterArticle')?.value || '',
    status: document.getElementById('seoCopilotFilterStatus')?.value || 'all',
    type: document.getElementById('seoCopilotFilterType')?.value || 'all',
    startDate: document.getElementById('seoCopilotFilterStart')?.value || '',
    endDate: document.getElementById('seoCopilotFilterEnd')?.value || '',
  };
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value));
}

function renderRecommendationSection(id, items, emptyMessage) {
  const container = document.getElementById(id);
  if (!container) return;
  if (!items.length) {
    container.textContent = emptyMessage;
    return;
  }
  renderRecommendationList(container, items);
}

function renderSearchConsole(analysis) {
  const status = document.getElementById('seoCopilotDashboardGscStatus');
  const rows = document.getElementById('seoCopilotDashboardGscRows');
  const data = analysis?.analysis?.searchConsole;
  if (!status || !rows) return;
  rows.replaceChildren();
  if (data?.status !== 'connected') {
    status.textContent = data?.message || 'Search Console data is not connected. No impressions, clicks, CTR, or average positions are inferred.';
    return;
  }
  status.textContent = `Real Google Search Console query data · ${data.dateRange?.startDate || ''} to ${data.dateRange?.endDate || ''}.`;
  if (!data.rows?.length) {
    rows.textContent = 'No query data for this article in the selected Search Console range.';
    return;
  }
  const table = document.createElement('table');
  table.className = 'admin-table';
  table.innerHTML = '<thead><tr><th>Query</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Average position</th></tr></thead>';
  const body = document.createElement('tbody');
  data.rows.slice(0, 30).forEach(item => {
    const row = document.createElement('tr');
    [item.query, formatNumber(item.clicks), formatNumber(item.impressions), `${(Number(item.ctr) * 100).toFixed(1)}%`, Number(item.averagePosition).toFixed(1)]
      .forEach(value => {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
    body.appendChild(row);
  });
  table.appendChild(body);
  rows.appendChild(table);
}

function renderAnalysisSections(analysis) {
  const output = analysis?.analysis;
  if (!output) return;
  renderAnalysisSummary(document.getElementById('seoCopilotDashboardSemantic'), output);
  renderContentQuality(document.getElementById('seoCopilotDashboardQuality'), output.contentQuality);
  createInternalLinkList(
    document.getElementById('seoCopilotDashboardInternalLinks'),
    output.internalLinkOpportunities
  );
  const headingContainer = document.getElementById('seoCopilotDashboardHeadings');
  if (headingContainer) {
    headingContainer.replaceChildren();
    const list = document.createElement('ul');
    (output.headingSuggestions || []).forEach(item => {
      const row = document.createElement('li');
      row.textContent = `${item.level}: ${item.text} — ${item.reason}`;
      list.appendChild(row);
    });
    if (!list.childElementCount) {
      headingContainer.textContent = 'No heading suggestions from the latest analysis.';
    } else {
      headingContainer.appendChild(list);
    }
  }
  renderSearchConsole(analysis);
}

function renderPerformance(report) {
  const container = document.getElementById('seoCopilotArticlePerformance');
  if (!container) return;
  if (!report) {
    container.textContent = 'Select an article to view its recorded performance.';
    return;
  }
  container.replaceChildren();
  const values = [
    ['Lifetime article views', formatNumber(report.totalViews), report.totalViewsSource],
    ['Last 7 days', formatNumber(report.last7Days), trendLabel(report.trend7Days)],
    ['Last 30 days', formatNumber(report.last30Days), trendLabel(report.trend30Days)],
  ];
  values.forEach(([label, value, source]) => {
    const card = document.createElement('article');
    card.className = 'seo-copilot-performance-card';
    const name = document.createElement('span');
    name.textContent = label;
    const count = document.createElement('strong');
    count.textContent = value;
    const attribution = document.createElement('small');
    attribution.textContent = source;
    card.append(name, count, attribution);
    container.appendChild(card);
  });
  const note = document.createElement('p');
  note.className = 'seo-copilot-data-note';
  note.textContent = `${report.note} Recent trends compare equal-length periods and use only consented page-view events. ${report.shortRangeCapped ? 'The queried event sample reached its limit; trends are unavailable.' : report.shortRangeEventCount === 0 ? 'No consented page-view events were recorded in the last 60 days.' : 'These counts may be incomplete because visitors can decline analytics.'}`;
  container.appendChild(note);
}

function trendLabel(trend) {
  if (!trend || trend.direction === 'unavailable') return 'Trend unavailable';
  if (trend.changePercent === null) return 'Increasing from 0 recorded views in the prior period';
  if (trend.direction === 'stable') return 'No change from prior period';
  return `${trend.direction === 'up' ? 'Up' : 'Down'} ${Math.abs(trend.changePercent)}% vs. prior period`;
}

function renderHistory(history) {
  const container = document.getElementById('seoCopilotHistory');
  if (!container) return;
  container.replaceChildren();
  if (!history.length) {
    container.textContent = 'No saved analysis history matches these filters.';
    return;
  }
  history.forEach(item => {
    const details = document.createElement('details');
    details.className = 'seo-copilot-history-item';
    const summary = document.createElement('summary');
    const created = item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Date unavailable';
    summary.textContent = `${item.articleTitle || 'Article'} · ${created} · ${item.model || 'Groq model'} · ${Number(item.usage?.totalTokens || 0).toLocaleString()} tokens`;
    details.appendChild(summary);
    const summaryText = document.createElement('p');
    summaryText.textContent = item.analysis?.summary || 'No summary saved.';
    const usage = document.createElement('small');
    usage.textContent = item.usage?.costUsd === null || item.usage?.costUsd === undefined
      ? 'Estimated cost unavailable; configure optional token-rate values.'
      : `Estimated cost: $${Number(item.usage.costUsd).toFixed(6)}`;
    details.append(summaryText, usage);
    container.appendChild(details);
  });
}

function populateArticleSelectors() {
  const filter = document.getElementById('seoCopilotFilterArticle');
  const performance = document.getElementById('seoCopilotPerformanceArticle');
  [filter, performance].forEach(select => {
    if (!select) return;
    const selected = select.value;
    select.replaceChildren(new Option('All articles', ''));
    articles.forEach(article => {
      const option = new Option(`${article.status === 'published' ? '' : '[Draft] '}${article.title || 'Untitled'}`, article.id);
      select.appendChild(option);
    });
    if (performance) performance.options[0].textContent = 'Select an article';
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  });
}

async function loadArticles() {
  if (!isConfigured || !db) throw new Error('Firebase is not configured.');
  const snapshot = await getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc')));
  articles = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  populateArticleSelectors();
}

function renderDashboard(data) {
  currentRecommendations = data.recommendations || [];
  const pending = currentRecommendations.filter(item => item.status === 'pending');
  const consoleItems = currentRecommendations.filter(item => item.source === 'search-console');
  const accepted = currentRecommendations.filter(item => item.status === 'accepted');
  const rejected = currentRecommendations.filter(item => item.status === 'rejected');
  renderRecommendationSection('seoCopilotDashboardSuggestions', pending, 'No pending recommendations match these filters.');
  renderRecommendationSection('seoCopilotDashboardConsoleSuggestions', consoleItems, 'No Search Console opportunities were returned. This panel only displays real Search Console-sourced suggestions.');
  renderRecommendationSection('seoCopilotAccepted', accepted, 'No accepted recommendations match these filters.');
  renderRecommendationSection('seoCopilotRejected', rejected, 'No rejected recommendations match these filters.');
  renderHistory(data.history || []);

  const totals = data.totals || {};
  setText('seoCopilotUsageSummary',
    `${formatNumber(totals.inputTokens)} prompt tokens · ${formatNumber(totals.outputTokens)} completion tokens · ${totals.costUsd === null ? 'Cost not configured' : `$${Number(totals.costUsd).toFixed(6)} estimated`}${totals.capped ? ' · Showing the latest capped records' : ''}`);
  const latest = (data.history || [])[0];
  if (latest) renderAnalysisSections(latest);
  else {
    setText('seoCopilotDashboardSemantic', 'Run an analysis to see semantic SEO findings.');
    setText('seoCopilotDashboardQuality', 'Content quality results will appear after analysis.');
  }
  const gscStatus = document.getElementById('seoCopilotDashboardGscStatus');
  if (gscStatus && !latest) {
    gscStatus.textContent = data.searchConsoleConfigured
      ? 'Search Console is configured; run an article analysis to load its page-level data.'
      : 'Search Console is not connected. No Search Console metrics are available.';
  }
  setDashboardStatus(`Loaded ${currentRecommendations.length} recommendations and ${(data.history || []).length} analysis records.`);
}

async function loadDashboard() {
  const params = new URLSearchParams(getFilters());
  setDashboardStatus('Loading SEO Copilot records…');
  try {
    const payload = await getSeoCopilotJson(`/api/analytics?service=seo-copilot&${params}`);
    renderDashboard(payload);
  } catch (error) {
    setDashboardStatus(error.message || 'SEO Copilot data could not be loaded.', true);
  }
}

async function loadArticlePerformance() {
  const articleId = document.getElementById('seoCopilotPerformanceArticle')?.value;
  if (!articleId) {
    renderPerformance(null);
    return;
  }
  setDashboardStatus('Loading recorded article views…');
  try {
    const params = new URLSearchParams({ mode: 'performance', articleId });
    const report = await getSeoCopilotJson(`/api/analytics?service=seo-copilot&${params}`);
    renderPerformance(report);
    setDashboardStatus(`Showing view counts for ${report.articleTitle}.`);
  } catch (error) {
    setDashboardStatus(error.message || 'Article performance could not be loaded.', true);
  }
}

async function analyzeSelectedArticle() {
  const articleId = document.getElementById('seoCopilotPerformanceArticle')?.value ||
    document.getElementById('seoCopilotFilterArticle')?.value;
  const article = articles.find(item => item.id === articleId);
  if (!article) {
    setDashboardStatus('Select a published article or draft to analyze.', true);
    return;
  }
  if (article.status !== 'published' && article.status !== 'draft') {
    setDashboardStatus('The selected article has an unsupported status.', true);
    return;
  }
  const button = document.getElementById('seoCopilotAnalyzeSelected');
  if (button) button.disabled = true;
  setDashboardStatus(`Analyzing “${article.title}” with Groq. Published content will not be modified.`);
  try {
    const result = await analyzeArticle({
      articleId: article.id,
      title: article.title,
      slug: article.slug,
      excerpt: article.excerpt,
      content: article.content,
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      category: article.category,
      animeTitle: article.animeTitle,
      tags: article.tags,
      searchIntent: article.searchIntent,
    }, { force: true });
    renderAnalysisSections(result);
    setDashboardStatus(`Analysis complete for “${article.title}”. No article content was changed.`);
    await loadDashboard();
  } catch (error) {
    setDashboardStatus(error.message || 'Selected article analysis failed.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleRecommendationAction(event) {
  const button = event.target.closest('[data-copilot-action]');
  if (!button) return;
  const action = button.dataset.copilotAction;
  if (!['accept', 'reject'].includes(action)) return;
  button.disabled = true;
  try {
    await decideRecommendation(button.dataset.recommendationId, action === 'accept' ? 'accepted' : 'rejected');
    setDashboardStatus(action === 'accept'
      ? 'Suggestion accepted and saved. Use the article editor to insert the draft manually.'
      : 'Suggestion rejected and saved; it will not be suggested again for that article.');
    await loadDashboard();
  } catch (error) {
    button.disabled = false;
    setDashboardStatus(error.message || 'Could not save this decision.', true);
  }
}

function setupFilters() {
  ['seoCopilotFilterArticle', 'seoCopilotFilterStatus', 'seoCopilotFilterType', 'seoCopilotFilterStart', 'seoCopilotFilterEnd']
    .forEach(id => document.getElementById(id)?.addEventListener('change', () => void loadDashboard()));
  document.getElementById('seoCopilotRefresh')?.addEventListener('click', () => void loadDashboard());
  document.getElementById('seoCopilotPerformanceArticle')?.addEventListener('change', () => void loadArticlePerformance());
  document.getElementById('seoCopilotAnalyzeSelected')?.addEventListener('click', () => void analyzeSelectedArticle());
  document.getElementById('seoCopilotDashboardSuggestions')?.addEventListener('click', handleRecommendationAction);
  document.getElementById('seoCopilotDashboardConsoleSuggestions')?.addEventListener('click', handleRecommendationAction);
  document.getElementById('seoCopilotAccepted')?.addEventListener('click', handleRecommendationAction);
  document.getElementById('seoCopilotRejected')?.addEventListener('click', handleRecommendationAction);
}

export async function setupAdminSeoCopilot() {
  if (initialized) return;
  initialized = true;
  if (!document.getElementById('tab-seo-copilot')) return;
  setupFilters();
  try {
    await loadArticles();
    await loadDashboard();
  } catch (error) {
    setDashboardStatus(error.message || 'SEO Copilot could not be initialized.', true);
  }
}

