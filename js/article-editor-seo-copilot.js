import {
  analyzeArticle,
  decideRecommendation,
  getEditorArticlePayload,
  getSeoCopilotJson,
  renderAnalysisSummary,
  renderContentQuality,
  renderRecommendationList,
  createInternalLinkList,
} from './seo-copilot-client.js';

let analysisTimer = 0;
let activeRequest = null;
let lastAnalyzedSnapshot = '';
let currentAnalysis = null;
let initialized = false;
const notifiedRecommendationIds = new Set();

function setStatus(message, isError = false) {
  const status = document.getElementById('seoCopilotStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function appendTextList(container, items, emptyMessage) {
  if (!container) return;
  container.replaceChildren();
  if (!items?.length) {
    const empty = document.createElement('p');
    empty.className = 'seo-copilot-empty';
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }
  const list = document.createElement('ul');
  items.forEach(item => {
    const row = document.createElement('li');
    if (typeof item === 'string') {
      row.textContent = item;
    } else {
      row.textContent = `${item.level}: ${item.text} — ${item.reason}`;
    }
    list.appendChild(row);
  });
  container.appendChild(list);
}

function renderSearchConsole(searchConsole) {
  const status = document.getElementById('seoCopilotSearchConsole');
  const list = document.getElementById('seoCopilotSearchConsoleRows');
  if (!status || !list) return;
  list.replaceChildren();
  if (searchConsole?.status !== 'connected') {
    status.textContent = searchConsole?.message ||
      'Search Console is not connected. No impressions, clicks, CTR, or average position were inferred.';
    return;
  }
  status.textContent = `Real Google Search Console query data · ${searchConsole.dateRange?.startDate || ''} to ${searchConsole.dateRange?.endDate || ''}.`;
  if (!searchConsole.rows?.length) {
    list.textContent = 'No query rows returned for this page and date range.';
    return;
  }
  const table = document.createElement('table');
  table.className = 'seo-copilot-search-table';
  const head = document.createElement('tr');
  ['Query', 'Clicks', 'Impressions', 'CTR', 'Avg. position'].forEach(label => {
    const cell = document.createElement('th');
    cell.textContent = label;
    head.appendChild(cell);
  });
  const thead = document.createElement('thead');
  thead.appendChild(head);
  const tbody = document.createElement('tbody');
  searchConsole.rows.slice(0, 20).forEach(row => {
    const tr = document.createElement('tr');
    [
      row.query,
      Number(row.clicks).toLocaleString(),
      Number(row.impressions).toLocaleString(),
      `${(Number(row.ctr) * 100).toFixed(1)}%`,
      Number(row.averagePosition).toFixed(1),
    ].forEach(value => {
      const cell = document.createElement('td');
      cell.textContent = value;
      tr.appendChild(cell);
    });
    tbody.appendChild(tr);
  });
  table.append(thead, tbody);
  list.appendChild(table);
}

function renderAnalysis(result) {
  currentAnalysis = result;
  const analysis = result.analysis || {};
  renderAnalysisSummary(document.getElementById('seoCopilotSummary'), analysis);
  renderContentQuality(document.getElementById('seoCopilotQuality'), analysis.contentQuality);
  appendTextList(
    document.getElementById('seoCopilotHeadings'),
    analysis.headingSuggestions,
    'No heading suggestions returned.'
  );
  appendTextList(
    document.getElementById('seoCopilotFaqs'),
    (analysis.faqRecommendations || []).map(item => `${item.question} — ${item.reason}`),
    'No FAQ opportunities returned.'
  );
  createInternalLinkList(
    document.getElementById('seoCopilotInternalLinks'),
    analysis.internalLinkOpportunities
  );
  renderSearchConsole(analysis.searchConsole);
  const recommendationList = document.getElementById('seoCopilotRecommendations');
  renderRecommendationList(recommendationList, analysis.recommendations, { allowInsert: true });

  const notice = document.getElementById('seoCopilotOpportunityNotice');
  const newOpportunity = (analysis.recommendations || []).find(item =>
    item.status === 'pending' && !notifiedRecommendationIds.has(item.id)
  );
  (analysis.recommendations || []).forEach(item => notifiedRecommendationIds.add(item.id));
  if (notice) {
    if (newOpportunity) {
      notice.hidden = false;
      notice.textContent = `Sir, I found a new keyword opportunity: ${newOpportunity.keyword}. Review its recommendation below.`;
    } else {
      notice.hidden = true;
      notice.textContent = '';
    }
  }

  const provenance = document.getElementById('seoCopilotProvenance');
  if (provenance) {
    const cost = result.usage?.costUsd === null || result.usage?.costUsd === undefined
      ? 'Cost unavailable (configure optional token rates)'
      : `Estimated API cost $${Number(result.usage.costUsd).toFixed(6)}`;
    provenance.textContent = `${result.cached ? 'Cached analysis' : 'New analysis'} · ${result.model || 'Groq model'} · ${Number(result.usage?.totalTokens || 0).toLocaleString()} tokens · ${cost}`;
  }
  setStatus(result.cached ? 'Analysis loaded from cache.' : 'Analysis complete.', false);
}

async function runAnalysis(force = false) {
  const payload = getEditorArticlePayload();
  const plainText = document.getElementById('richEditorArea')?.innerText || '';
  if (!payload.title.trim() || plainText.trim().length < 200) {
    setStatus('Add a title and at least 200 characters of article content to start analysis.');
    return;
  }
  const snapshot = JSON.stringify(payload);
  if (!force && snapshot === lastAnalyzedSnapshot) return;
  lastAnalyzedSnapshot = snapshot;
  if (activeRequest) activeRequest.abort();
  const controller = new AbortController();
  activeRequest = controller;
  setStatus('Analyzing article with Groq…');
  const button = document.getElementById('seoCopilotRun');
  if (button) button.disabled = true;
  try {
    const result = await analyzeArticle(payload, { force, signal: controller.signal });
    if (activeRequest !== controller) return;
    renderAnalysis(result);
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStatus(error.message || 'Analysis failed. Retry or continue editing.', true);
  } finally {
    if (activeRequest === controller) {
      activeRequest = null;
      if (button) button.disabled = false;
    }
  }
}

function scheduleAnalysis(force = false) {
  window.clearTimeout(analysisTimer);
  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
    const runButton = document.getElementById('seoCopilotRun');
    if (runButton) runButton.disabled = false;
  }
  const payload = getEditorArticlePayload();
  if (JSON.stringify(payload) === lastAnalyzedSnapshot && !force) return;
  setStatus('Article changed; analysis will refresh shortly.');
  analysisTimer = window.setTimeout(() => void runAnalysis(force), force ? 0 : 1400);
}

function insertAcceptedText(recommendation, kind) {
  const editor = document.getElementById('richEditorArea');
  if (!editor) return;
  const value = kind === 'heading' ? recommendation.suggestedHeading : recommendation.suggestedParagraph;
  if (!value) return;
  const block = document.createElement(kind === 'heading' ? 'h2' : 'p');
  block.textContent = value;
  editor.appendChild(block);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  block.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function onRecommendationAction(event) {
  const button = event.target.closest('[data-copilot-action]');
  if (!button) return;
  const recommendation = currentAnalysis?.analysis?.recommendations?.find(item =>
    item.id === button.dataset.recommendationId
  );
  if (!recommendation) return;
  const action = button.dataset.copilotAction;
  if (action === 'insert-heading' || action === 'insert-paragraph') {
    insertAcceptedText(recommendation, action === 'insert-heading' ? 'heading' : 'paragraph');
    return;
  }
  if (!['accept', 'reject'].includes(action)) return;

  button.disabled = true;
  setStatus(action === 'accept' ? 'Saving recommendation acceptance…' : 'Saving recommendation rejection…');
  try {
    const decision = await decideRecommendation(
      recommendation.id,
      action === 'accept' ? 'accepted' : 'rejected'
    );
    recommendation.status = decision.status;
    renderRecommendationList(
      document.getElementById('seoCopilotRecommendations'),
      currentAnalysis.analysis.recommendations,
      { allowInsert: true }
    );
    setStatus(decision.status === 'accepted'
      ? 'Accepted. Review the optional draft and insert it manually if useful.'
      : 'Rejected. This keyword will not be suggested again for this article.');
  } catch (error) {
    button.disabled = false;
    setStatus(error.message || 'Could not save this decision.', true);
  }
}

export function setupEditorSeoCopilot() {
  if (initialized) return;
  initialized = true;
  const container = document.getElementById('seoCopilotPanel');
  if (!container) return;

  document.getElementById('seoCopilotRun')?.addEventListener('click', () => scheduleAnalysis(true));
  document.getElementById('seoCopilotRecommendations')?.addEventListener('click', onRecommendationAction);
  document.getElementById('postEditorForm')?.addEventListener('input', event => {
    const target = event.target;
    if (target?.id === 'richEditorArea' ||
        ['postTitle', 'postExcerpt', 'postSeoTitle', 'postSeoDescription', 'postAnimeTitle'].includes(target?.id)) {
      scheduleAnalysis();
    }
  });
  document.getElementById('postSearchIntent')?.addEventListener('change', () => scheduleAnalysis());
  const params = new URLSearchParams({
    mode: 'dashboard',
    ...(getEditorArticlePayload().articleId ? { articleId: getEditorArticlePayload().articleId } : {}),
  });
  if (params.has('articleId')) {
    void getSeoCopilotJson(`/api/analytics?service=seo-copilot&${params}`)
      .then(data => renderRecommendationList(
        document.getElementById('seoCopilotRecommendations'),
        data.recommendations.filter(item => item.status !== 'pending'),
        { allowInsert: true }
      ))
      .catch(error => setStatus(error.message || 'Could not load recommendation history.', true));
  }
  scheduleAnalysis();
}
