export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getSafeImageUrl(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;

  try {
    const url = new URL(value, 'https://www.animoro.in/');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      return fallback;
    }
    return url.href;
  } catch {
    return fallback;
  }
}
