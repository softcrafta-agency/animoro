/**
 * ANIMORO Real Data Analytics Visualizer
 * Renders real view counts per article using clean, modern SVG vector charts.
 * Strictly NO fake numbers or hardcoded telemetry.
 */

export function renderPerformanceChart(containerId, articles) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!articles || articles.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <h4 class="empty-state-title">No Performance Data Yet</h4>
        <p class="empty-state-desc">Articles published and viewed by readers will be graphed here with real view counts.</p>
      </div>
    `;
    return;
  }

  // Filter articles with views or take top 6
  const sortedArticles = [...articles].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 6);
  const maxViews = Math.max(...sortedArticles.map(a => a.views || 0), 1);

  const barsHtml = sortedArticles.map((art, idx) => {
    const views = art.views || 0;
    const pct = Math.max(Math.round((views / maxViews) * 100), 4);
    const shortTitle = (art.title || 'Untitled').length > 24 
      ? (art.title || '').substring(0, 24) + '...' 
      : art.title;

    return `
      <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.84rem;">
          <span style="color: var(--text-primary); font-weight: 600;">${idx + 1}. ${shortTitle}</span>
          <span style="color: var(--accent-crimson); font-family: var(--font-mono); font-weight: 700;">${views} view${views === 1 ? '' : 's'}</span>
        </div>
        <div style="width: 100%; height: 10px; background: rgba(255,255,255,0.05); border-radius: 9999px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, var(--accent-crimson), #f43f5e); border-radius: 9999px; transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);"></div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="padding: 10px 0;">
      ${barsHtml}
    </div>
  `;
}
