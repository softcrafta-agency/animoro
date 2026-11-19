import { auth } from './auth-init.js';

const API_URL = '/api/analytics?service=seo-copilot';

export async function getSeoCopilotJson(url = API_URL, options = {}) {
  if (!auth) throw new Error('Firebase Authentication is unavailable.');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in as an administrator to use SEO Copilot.');

  let token = await user.getIdToken();
  const request = () => fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  let response = await request();
  if (response.status === 401) {
    token = await user.getIdToken(true);
    response = await request();
  }
  const responseText = await response.text();
  let payload = {};
  try {
    payload = responseText ? JSON.parse(responseText) : {};
  } catch {
    throw new Error(`SEO Copilot returned an invalid response (HTTP ${response.status}).`);
  }
  if (response.status === 401) throw new Error('Your admin session expired. Sign in again.');
  if (!response.ok) throw new Error(payload.error || `SEO Copilot request failed with HTTP ${response.status}.`);
  return payload;
}

export function getEditorArticlePayload() {
  const content = document.getElementById('richEditorArea')?.innerHTML || '';
  let draftKey = sessionStorage.getItem('animoro-seo-copilot-draft-key');
  if (!draftKey) {
    draftKey = globalThis.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    sessionStorage.setItem('animoro-seo-copilot-draft-key', draftKey);
  }
  return {
    articleId: new URLSearchParams(window.location.search).get('id') || '',
    draftKey,
    title: document.getElementById('postTitle')?.value || '',
    slug: document.getElementById('postSlug')?.value || '',
    excerpt: document.getElementById('postExcerpt')?.value || '',
    content,
    seoTitle: document.getElementById('postSeoTitle')?.value || '',
    seoDescription: document.getElementById('postSeoDescription')?.value || '',
    category: document.getElementById('postCategoryChips')?.textContent || '',
    animeTitle: document.getElementById('postAnimeTitle')?.value || '',
    searchIntent: document.getElementById('postSearchIntent')?.value || '',
  };
}

export async function analyzeArticle(article, { force = false, signal } = {}) {
  return getSeoCopilotJson(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ action: 'analyze', ...article, force }),
  });
}

export async function decideRecommendation(recommendationId, status) {
  return getSeoCopilotJson(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'decision', recommendationId, status }),
  });
}

export async function linkDraftRecommendations(draftKey, articleId) {
  return getSeoCopilotJson(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'link-draft', draftKey, articleId }),
  });
}

function appendText(parent, tagName, text, className = '') {
  if (!text) return;
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.appendChild(element);
}

function appendList(container, values, emptyMessage) {
  container.replaceChildren();
  if (!values?.length) {
    appendText(container, 'p', emptyMessage, 'seo-copilot-empty');
    return;
  }
  const list = document.createElement('ul');
  values.forEach(value => appendText(list, 'li', value));
  container.appendChild(list);
}

export function renderRecommendationList(container, recommendations, { allowInsert = false } = {}) {
  if (!container) return;
  container.replaceChildren();
  if (!recommendations?.length) {
    appendText(container, 'p', 'No recommendations match this view yet.', 'seo-copilot-empty');
    return;
  }

  recommendations.forEach(recommendation => {
    const card = document.createElement('article');
    card.className = `seo-copilot-recommendation is-${recommendation.status || 'pending'}`;
    const title = document.createElement('h4');
    title.textContent = recommendation.keyword || 'Editorial recommendation';
    const meta = document.createElement('p');
    const confidence = Number.isFinite(Number(recommendation.confidence))
      ? `${Math.round(Number(recommendation.confidence) * 100)}% confidence`
      : 'Confidence unavailable';
    meta.textContent = `${String(recommendation.category || 'semantic').replaceAll('-', ' ')} · ${recommendation.searchIntent || 'unclear'} intent · ${confidence} · ${recommendation.status || 'pending'}`;
    const reason = document.createElement('p');
    reason.textContent = recommendation.reason || 'Review whether this topic fits the article.';
    card.append(title, meta, reason);
    appendText(card, 'small', `Placement: ${recommendation.placement || 'editor review'} · Coverage: ${recommendation.contentCoverage || 'not assessed'} · Source: ${recommendation.source || 'AI content analysis'}`);
    if (recommendation.potentialBenefit) appendText(card, 'p', `Potential benefit: ${recommendation.potentialBenefit}`);

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'View Details';
    details.appendChild(summary);
    appendText(details, 'p', `Suggested heading: ${recommendation.suggestedHeading || 'None provided'}`);
    appendText(details, 'p', recommendation.suggestedParagraph || 'No optional paragraph draft was returned.');
    card.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'seo-copilot-actions';
    if (recommendation.status === 'pending') {
      const accept = document.createElement('button');
      accept.type = 'button';
      accept.className = 'action-btn-sm';
      accept.dataset.copilotAction = 'accept';
      accept.dataset.recommendationId = recommendation.id;
      accept.textContent = 'Accept';
      const reject = document.createElement('button');
      reject.type = 'button';
      reject.className = 'action-btn-sm';
      reject.dataset.copilotAction = 'reject';
      reject.dataset.recommendationId = recommendation.id;
      reject.textContent = 'Reject';
      actions.append(accept, reject);
    } else if (recommendation.status === 'accepted' && allowInsert) {
      const insertHeading = document.createElement('button');
      insertHeading.type = 'button';
      insertHeading.className = 'action-btn-sm';
      insertHeading.dataset.copilotAction = 'insert-heading';
      insertHeading.dataset.recommendationId = recommendation.id;
      insertHeading.textContent = 'Insert H2 at end';
      insertHeading.disabled = !recommendation.suggestedHeading;
      const insertParagraph = document.createElement('button');
      insertParagraph.type = 'button';
      insertParagraph.className = 'action-btn-sm';
      insertParagraph.dataset.copilotAction = 'insert-paragraph';
      insertParagraph.dataset.recommendationId = recommendation.id;
      insertParagraph.textContent = 'Insert paragraph at end';
      insertParagraph.disabled = !recommendation.suggestedParagraph;
      actions.append(insertHeading, insertParagraph);
    }
    if (actions.childElementCount) card.appendChild(actions);
    container.appendChild(card);
  });
}

export function renderAnalysisSummary(container, analysis) {
  if (!container || !analysis) return;
  container.replaceChildren();
  appendText(container, 'p', analysis.summary || 'Review the recommendations below.', 'seo-copilot-summary-copy');
  appendText(container, 'p', `Primary topic: ${analysis.primaryTopic || 'Not identified'} · Search intent: ${analysis.searchIntent?.intent || 'unclear'} (${Math.round((analysis.searchIntent?.confidence || 0) * 100)}% confidence)`);
  appendList(container, analysis.contentGaps, 'No content gaps were returned.');
}

export function renderContentQuality(container, quality) {
  if (!container || !quality) return;
  container.replaceChildren();
  appendText(container, 'p', `Readability: ${quality.readability || 'Not assessed'}`);
  appendText(container, 'p', `Naturalness: ${quality.naturalness || 'Not assessed'}`);
  appendText(container, 'p', `Authorship provenance: ${quality.authorshipAssessment || 'Not recorded'}. Naturalness is not evidence of AI or human authorship.`);
  appendText(container, 'p', `Factual consistency: ${quality.factualConsistency || 'Not assessed'} External fact-checking is not performed.`);
  appendList(container, quality.grammarFeedback, 'No grammar feedback returned.');
  appendList(container, quality.repetitiveLanguage, 'No repetitive-language notes returned.');
}

export function createInternalLinkList(container, links) {
  if (!container) return;
  container.replaceChildren();
  if (!links?.length) {
    appendText(container, 'p', 'No internal-link opportunities were returned.', 'seo-copilot-empty');
    return;
  }
  links.forEach(link => {
    const item = document.createElement('p');
    item.textContent = `${link.anchorText} → ${link.title}: ${link.reason}`;
    container.appendChild(item);
  });
}

