const ALLOWED_TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'CAPTION', 'CODE', 'DEL', 'DIV', 'EM',
  'FIGCAPTION', 'FIGURE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
  'I', 'IMG', 'INS', 'LI', 'OL', 'P', 'PRE', 'S', 'SPAN', 'SUB', 'SUP',
  'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'U', 'UL', 'IFRAME',
]);

const DROP_CONTENT_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'MATH', 'OBJECT', 'EMBED', 'FORM']);
const ALLOWED_FONT_SIZES = new Set(['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '1.1rem']);
const ALLOWED_CLASSES = new Set(['article-content-image', 'article-figure', 'article-toc', 'article-code-block']);
const LEGACY_FONT_SIZES = { 1: '12px', 2: '14px', 3: '16px', 4: '20px', 5: '24px', 6: '28px', 7: '36px' };
const SAFE_COLOR = /^(?:#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})|rgba?\(\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\s*,\s*(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/i;

function safeUrl(value, { image = false, iframe = false } = {}) {
  const candidate = String(value || '').trim();
  if (!candidate || candidate.startsWith('//')) return '';

  try {
    const url = new URL(candidate, window.location.origin);
    if (url.username || url.password) return '';
    if (iframe) {
      if (!['www.youtube-nocookie.com', 'www.youtube.com'].includes(url.hostname) ||
          !/^\/embed\/[A-Za-z0-9_-]{6,20}\/?$/.test(url.pathname)) return '';
      return `https://www.youtube-nocookie.com${url.pathname}`;
    }
    if (image) return ['http:', 'https:'].includes(url.protocol) ? candidate : '';
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) || candidate.startsWith('#')
      ? candidate
      : '';
  } catch {
    return '';
  }
}

function cleanStyle(element) {
  const style = element.getAttribute('style');
  if (!style) return;

  const allowed = new Map();
  style.split(';').forEach((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 0) return;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (property === 'font-size' && ALLOWED_FONT_SIZES.has(value)) {
      allowed.set(property, value);
    } else if (['color', 'background-color'].includes(property) &&
        SAFE_COLOR.test(value)) {
      allowed.set(property, value);
    } else if (property === 'text-align' && ['left', 'center', 'right', 'justify'].includes(value)) {
      allowed.set(property, value);
    }
  });

  if (allowed.size) {
    element.setAttribute('style', Array.from(allowed, ([key, value]) => `${key}: ${value}`).join('; '));
  } else {
    element.removeAttribute('style');
  }
}

function cleanElement(element) {
  const tag = element.tagName;
  if (tag === 'FONT') {
    const span = document.createElement('span');
    const color = element.getAttribute('color');
    const size = LEGACY_FONT_SIZES[element.getAttribute('size')];
    if (color && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)) span.style.color = color;
    if (size) span.style.fontSize = size;
    span.append(...element.childNodes);
    element.replaceWith(span);
    cleanElement(span);
    return;
  }
  if (DROP_CONTENT_TAGS.has(tag) || (tag === 'IFRAME' && !safeUrl(element.getAttribute('src'), { iframe: true }))) {
    element.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    Array.from(element.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) cleanElement(child);
    });
    element.replaceWith(...element.childNodes);
    return;
  }

  const allowedAttributes = {
    A: new Set(['href', 'target', 'rel', 'title']),
    DIV: new Set(['class', 'style']),
    FIGURE: new Set(['class']),
    H1: new Set(['id', 'style']),
    H2: new Set(['id', 'style']),
    H3: new Set(['id', 'style']),
    H4: new Set(['id', 'style']),
    H5: new Set(['id', 'style']),
    H6: new Set(['id', 'style']),
    IMG: new Set(['src', 'alt', 'width', 'height', 'loading', 'decoding', 'class']),
    IFRAME: new Set(['src', 'title', 'width', 'height', 'loading', 'allow', 'allowfullscreen', 'referrerpolicy']),
    PRE: new Set(['class', 'style']),
    TD: new Set(['colspan', 'rowspan']),
    TH: new Set(['colspan', 'rowspan']),
  }[tag] || new Set(['style']);

  Array.from(element.attributes).forEach((attribute) => {
    const name = attribute.name.toLowerCase();
    if (name === 'style' && ['SPAN', 'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
      return;
    }
    if (!allowedAttributes.has(name)) {
      element.removeAttribute(name);
      return;
    }

    if (name === 'href') {
      const url = safeUrl(attribute.value);
      if (url) element.setAttribute(name, url);
      else element.removeAttribute(name);
    } else if (name === 'src') {
      const url = safeUrl(attribute.value, { image: tag === 'IMG', iframe: tag === 'IFRAME' });
      if (url) element.setAttribute(name, url);
      else element.removeAttribute(name);
    } else if (name === 'id') {
      if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(attribute.value)) element.removeAttribute(name);
    } else if (name === 'class') {
      const classes = attribute.value.split(/\s+/).filter(value => ALLOWED_CLASSES.has(value));
      if (classes.length) element.setAttribute(name, classes.join(' '));
      else element.removeAttribute(name);
    } else if (['width', 'height', 'colspan', 'rowspan'].includes(name)) {
      const maximum = name === 'colspan' || name === 'rowspan' ? 20 : 4000;
      const value = Number.parseInt(attribute.value, 10);
      if (!Number.isInteger(value) || value < 1 || value > maximum) element.removeAttribute(name);
      else element.setAttribute(name, String(value));
    } else if (name === 'target' && attribute.value !== '_blank' && attribute.value !== '_self') {
      element.removeAttribute(name);
    } else if (name === 'loading' && !['lazy', 'eager'].includes(attribute.value)) {
      element.removeAttribute(name);
    } else if (name === 'decoding' && !['async', 'sync', 'auto'].includes(attribute.value)) {
      element.removeAttribute(name);
    } else if (name === 'allow') {
      element.setAttribute(name, 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    } else if (name === 'allowfullscreen') {
      element.setAttribute(name, '');
    } else if (name === 'referrerpolicy') {
      element.setAttribute(name, 'strict-origin-when-cross-origin');
    }
  });

  if (tag === 'A' && element.getAttribute('target') === '_blank') {
    element.setAttribute('rel', 'noopener noreferrer');
  }
  if (tag === 'IMG') {
    if (!element.hasAttribute('src')) {
      element.remove();
      return;
    }
    element.setAttribute('loading', 'lazy');
    element.setAttribute('decoding', 'async');
    if (!element.hasAttribute('alt')) element.setAttribute('alt', 'Article image');
  }
  if (tag === 'IFRAME') {
    element.setAttribute('loading', 'lazy');
    element.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    element.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    element.setAttribute('allowfullscreen', '');
  }

  cleanStyle(element);
  Array.from(element.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) cleanElement(child);
  });
}

export function sanitizeArticleEditorHtml(value) {
  const parser = new DOMParser();
  const document = parser.parseFromString(String(value || ''), 'text/html');
  Array.from(document.body.childNodes).forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) cleanElement(child);
  });
  return document.body.innerHTML;
}
