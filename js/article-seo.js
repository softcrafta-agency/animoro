const MAX_DESCRIPTION_LENGTH = 160;

function getNonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function decodeHtmlEntities(value) {
  return value.replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    const namedEntities = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };
    if (!code.startsWith('#')) return namedEntities[code.toLowerCase()] || entity;

    const numericValue = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    try {
      return numericValue > 0 && numericValue <= 0x10ffff
        ? String.fromCodePoint(numericValue)
        : ' ';
    } catch {
      return ' ';
    }
  });
}

function getArticleText(content) {
  return decodeHtmlEntities(String(content ?? '')
    .replace(/<(script|style|iframe|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' '))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitDescription(value) {
  if (value.length <= MAX_DESCRIPTION_LENGTH) return value;
  const shortened = value.slice(0, MAX_DESCRIPTION_LENGTH - 1);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${(lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened).trimEnd()}…`;
}

export function getArticleSeo(post) {
  const title = getNonEmptyString(post?.seoTitle) ||
    getNonEmptyString(post?.title) ||
    'Animoro Article';
  const description = getNonEmptyString(post?.seoDescription) ||
    limitDescription(getNonEmptyString(post?.excerpt) || getArticleText(post?.content)) ||
    `Read ${getNonEmptyString(post?.title) || 'this article'} on Animoro.`;

  return { title, description };
}
