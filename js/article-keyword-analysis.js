import { ARTICLE_KEYWORD_GROUPS, normalizeKeywordGroupValues } from './article-keyword-groups.js';

const BLOCK_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'figcaption', 'td', 'th',
]);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe']);
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been', 'but', 'by', 'can', 'did',
  'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'in', 'into', 'is', 'it', 'its',
  'of', 'on', 'or', 'that', 'the', 'their', 'them', 'there', 'these', 'they', 'this', 'those',
  'to', 'was', 'were', 'what', 'when', 'where', 'which', 'who', 'whom', 'whose', 'why', 'will',
  'with', 'would', 'you', 'your', 'about', 'after', 'before', 'does', 'explain', 'tell',
  'anime', 'manga', 'story', 'character', 'characters', 'article', 'series',
]);
const WORD_RELATIONS = new Map([
  ['strongest', 'powerful'], ['stronger', 'powerful'], ['strong', 'powerful'],
  ['best', 'top'],
  ['worst', 'weak'], ['weakest', 'weak'], ['begins', 'start'], ['started', 'start'],
  ['began', 'start'], ['ends', 'end'], ['ending', 'end'], ['abilities', 'power'],
  ['powers', 'power'], ['powerful', 'power'],
]);

function decodeHtmlEntities(value) {
  const named = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"', copy: '©',
    ndash: '-', mdash: '-', hellip: '…', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"',
  };
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z][\da-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? entity;
    const number = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    try {
      return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
    } catch {
      return entity;
    }
  });
}

function normalizedText(value) {
  return decodeHtmlEntities(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en')
    .match(/[\p{L}\p{N}]+/gu)?.join(' ') || '';
}

function meaningfulTokens(value) {
  return normalizedText(value)
    .split(' ')
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

function hasPhrase(text, phrase) {
  const normalizedPhrase = normalizedText(phrase);
  if (!normalizedPhrase) return false;
  const normalizedSource = ` ${normalizedText(text)} `;
  return normalizedSource.includes(` ${normalizedPhrase} `);
}

function isHiddenAttribute(attributes) {
  return /\shidden(?:\s|=|$)/i.test(attributes) ||
    /\saria-hidden\s*=\s*["']?true\b/i.test(attributes) ||
    /\sstyle\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes);
}

export function extractArticleAnalysisBlocks(html) {
  const blocks = [];
  let current = null;
  let skipStack = [];
  let paragraphIndex = 0;
  const tokens = String(html ?? '').match(/<!--[\s\S]*?-->|<\/?[a-z][\w:-]*\b[^>]*>|[^<]+|</gi) || [];

  const finish = () => {
    if (current) {
      const text = decodeHtmlEntities(current.text).replace(/\s+/g, ' ').trim();
      if (text) {
        if (current.tag === 'p') paragraphIndex += 1;
        blocks.push({ tag: current.tag, text, paragraphIndex });
      }
      current = null;
    }
  };

  for (const token of tokens) {
    if (token.startsWith('<!--')) continue;
    const tagMatch = token.match(/^<(\/?)\s*([a-z][\w:-]*)\b([^>]*)>$/i);
    if (!tagMatch) {
      if (!skipStack.length && !token.startsWith('<')) {
        if (!current) current = { tag: 'body', text: '' };
        current.text += ` ${token}`;
      }
      continue;
    }

    const [, closing, tagValue, attributes] = tagMatch;
    const tag = tagValue.toLowerCase();
    if (skipStack.length) {
      if (closing) {
        const index = skipStack.lastIndexOf(tag);
        if (index >= 0) skipStack.splice(index);
      } else if (!/\/\s*>$/.test(token) && !['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr'].includes(tag)) {
        skipStack.push(tag);
      }
      continue;
    }

    if (!closing && (SKIP_TAGS.has(tag) || isHiddenAttribute(attributes))) {
      if (!/\/\s*>$/.test(token)) skipStack.push(tag);
      continue;
    }

    if (!BLOCK_TAGS.has(tag)) continue;
    if (closing) {
      if (current?.tag === tag) finish();
      continue;
    }
    finish();
    current = { tag, text: '' };
    if (/\/\s*>$/.test(token)) finish();
  }
  finish();
  return blocks;
}

function articleRegions(blocks) {
  const paragraphBlocks = blocks.filter(block => block.tag === 'p');
  const firstHeadingIndex = blocks.findIndex(block => /^h[2-6]$/.test(block.tag));
  const introBlock = paragraphBlocks.find(block => {
    const blockIndex = blocks.indexOf(block);
    return firstHeadingIndex < 0 || blockIndex < firstHeadingIndex;
  }) || paragraphBlocks[0] || null;

  let conclusionBlocks = [];
  const conclusionHeadingIndex = blocks.findIndex(block =>
    /^h[2-6]$/.test(block.tag) &&
    /\b(conclusion|final thoughts|in summary|wrapping up|overall)\b/i.test(block.text)
  );
  if (conclusionHeadingIndex >= 0) {
    for (let index = conclusionHeadingIndex + 1; index < blocks.length; index += 1) {
      if (/^h[2-6]$/.test(blocks[index].tag)) break;
      if (blocks[index].tag === 'p') conclusionBlocks.push(blocks[index]);
    }
  } else if (paragraphBlocks.length > 1) {
    conclusionBlocks = [paragraphBlocks[paragraphBlocks.length - 1]];
  }

  const h2 = blocks.filter(block => block.tag === 'h2');
  const h3 = blocks.filter(block => block.tag === 'h3');
  const headings = blocks.filter(block => /^h[1-6]$/.test(block.tag));
  const contentBlocks = blocks.filter(block => !/^h[1-6]$/.test(block.tag));
  const introSet = new Set(introBlock ? [introBlock] : []);
  const conclusionSet = new Set(conclusionBlocks);
  const bodyBlocks = contentBlocks.filter(block => !introSet.has(block) && !conclusionSet.has(block));

  return {
    introBlock,
    conclusionBlocks,
    h2,
    h3,
    headings,
    contentBlocks,
    bodyBlocks,
  };
}

function intersectionCount(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left)].filter(token => rightSet.has(token)).length;
}

function answerTermOverlap(question, answer) {
  const questionTerms = [...new Set(meaningfulTokens(question))];
  const answerTerms = new Set(meaningfulTokens(answer));
  const expandedAnswerTerms = new Set(answerTerms);
  for (const [token, related] of WORD_RELATIONS) {
    if (answerTerms.has(token)) expandedAnswerTerms.add(related);
    if (answerTerms.has(related)) expandedAnswerTerms.add(token);
  }
  return intersectionCount(questionTerms, [...expandedAnswerTerms]);
}

function findAnswerFollowingHeading(blocks, headingIndex) {
  for (let index = headingIndex + 1; index < blocks.length; index += 1) {
    if (/^h[1-6]$/.test(blocks[index].tag)) return null;
    if (blocks[index].text) return { block: blocks[index], index };
  }
  return null;
}

function getQuestionAnalysis(question, blocks, paragraphCount) {
  const normalizedQuestion = normalizedText(question);
  const headingIndex = blocks.findIndex(block =>
    ['h2', 'h3'].includes(block.tag) && hasPhrase(block.text, question)
  );
  if (!normalizedQuestion || headingIndex < 0) {
    return {
      question,
      headingFound: false,
      answered: false,
      status: 'Question not found in an H2/H3 heading',
      answerLocation: '',
      answerExcerpt: '',
    };
  }

  const answer = findAnswerFollowingHeading(blocks, headingIndex);
  if (!answer) {
    return {
      question,
      headingFound: true,
      answered: false,
      status: 'Question heading has no following answer',
      answerLocation: '',
      answerExcerpt: '',
    };
  }
  const wordCount = meaningfulTokens(answer.block.text).length;
  const terms = [...new Set(meaningfulTokens(question))];
  const overlap = answerTermOverlap(question, answer.block.text);
  const minimumOverlap = terms.length >= 5 ? 2 : 1;
  const enoughDetail = wordCount >= 8;
  const relevant = overlap >= minimumOverlap;
  const answered = enoughDetail && relevant;

  return {
    question,
    headingFound: true,
    answered,
    status: answered
      ? 'Answered'
      : !enoughDetail
        ? 'Answer may be too short'
        : 'Answer relevance needs review',
    answerLocation: `${answer.block.tag === 'li' ? 'List item' : 'Paragraph'} ${answer.block.paragraphIndex || answer.index + 1} after ${blocks[headingIndex].tag.toUpperCase()}`,
    answerExcerpt: answer.block.text.slice(0, 220),
    answerWordCount: wordCount,
    overlap,
    paragraphCount,
  };
}

function getRelatedKeywords(groupedKeywords) {
  const all = ARTICLE_KEYWORD_GROUPS.flatMap(({ key, label }) =>
    groupedKeywords[key].map(keyword => ({ keyword, groupKey: key, groupLabel: label }))
  );
  const related = new Map();
  const duplicateKeys = new Set();
  const similarKeys = new Set();
  const normalizeKey = value => normalizedText(value);

  all.forEach((item, index) => {
    const leftTokens = [...new Set(meaningfulTokens(item.keyword))];
    for (let nextIndex = index + 1; nextIndex < all.length; nextIndex += 1) {
      const other = all[nextIndex];
      const leftKey = `${item.groupKey}:${normalizeKey(item.keyword)}`;
      const rightKey = `${other.groupKey}:${normalizeKey(other.keyword)}`;
      if (leftKey === rightKey) continue;
      if (normalizeKey(item.keyword) === normalizeKey(other.keyword)) {
        duplicateKeys.add(rightKey);
        if (!related.has(leftKey)) related.set(leftKey, []);
        related.get(leftKey).push({ type: 'duplicate', keyword: other.keyword, group: other.groupLabel });
        continue;
      }
      const rightTokens = [...new Set(meaningfulTokens(other.keyword))];
      if (leftTokens.length < 2 || rightTokens.length < 2) continue;
      const common = intersectionCount(leftTokens, rightTokens);
      const similarity = common / (leftTokens.length + rightTokens.length - common);
      if (similarity >= 0.72) {
        similarKeys.add(leftKey);
        similarKeys.add(rightKey);
        if (!related.has(leftKey)) related.set(leftKey, []);
        related.get(leftKey).push({ type: 'similar', keyword: other.keyword, group: other.groupLabel });
      }
    }
  });
  return { related, duplicateKeys, similarKeys, all };
}

function getRelevance(keyword, articleText, foundInContent, relatedItems = []) {
  if (relatedItems.some(item => item.type === 'duplicate')) {
    return { status: 'Duplicate in another group', relevant: false, score: 0 };
  }
  if (relatedItems.some(item => item.type === 'similar')) {
    return { status: 'Similar keyword—review overlap', relevant: true, score: 0 };
  }
  if (foundInContent) return { status: 'Covered in article', relevant: true, score: 1 };
  const terms = [...new Set(meaningfulTokens(keyword))];
  if (!terms.length) return { status: 'Needs editorial review', relevant: true, score: 0 };
  const articleTerms = new Set(meaningfulTokens(articleText));
  const overlap = intersectionCount(terms, [...articleTerms]);
  const score = overlap / terms.length;
  if (score >= 0.5) return { status: 'Relevant—consider adding context', relevant: true, score };
  if (score > 0) return { status: 'May need more explanation', relevant: true, score };
  return { status: 'Potentially unrelated—review', relevant: false, score };
}

function getSuggestedPlacement(groupKey, relevanceStatus) {
  if (groupKey === 'questionBasedKeywords') return 'FAQ heading and answer, if supported';
  if (relevanceStatus.startsWith('Potentially unrelated')) return 'Review relevance before use';
  if (groupKey === 'longTailKeywords') return 'Relevant H2/H3 or explanatory paragraph';
  if (groupKey === 'storyCharacterKeywords') return 'Character/story paragraph or relevant heading';
  return 'Introduction or relevant paragraph';
}

export function analyzeArticleKeywords({ title = '', content = '', keywordGroups = {} } = {}) {
  const groups = normalizeKeywordGroupValues(keywordGroups);
  const blocks = extractArticleAnalysisBlocks(content);
  const regions = articleRegions(blocks);
  const articleText = [
    title,
    ...blocks.map(block => block.text),
  ].join(' ');
  const { related, duplicateKeys, similarKeys, all } = getRelatedKeywords(groups);
  const analysis = [];

  for (const { key: groupKey, label: groupLabel } of ARTICLE_KEYWORD_GROUPS) {
    for (const keyword of groups[groupKey]) {
      const locations = [];
      const keywordBlocks = [
        ['introduction', regions.introBlock ? [regions.introBlock] : []],
        ['content', regions.bodyBlocks],
        ['conclusion', regions.conclusionBlocks],
        ['H2', regions.h2],
        ['H3', regions.h3],
      ];
      const matchedLocations = new Set();
      if (hasPhrase(title, keyword)) matchedLocations.add('title');
      for (const [location, regionBlocks] of keywordBlocks) {
        if (regionBlocks.some(block => hasPhrase(block.text, keyword))) matchedLocations.add(location);
      }
      locations.push(...matchedLocations);

      const titleFound = matchedLocations.has('title');
      const headingFound = matchedLocations.has('H2') || matchedLocations.has('H3');
      const contentFound = ['introduction', 'content', 'conclusion'].some(location => matchedLocations.has(location));
      const found = matchedLocations.size > 0;
      const status = !found
        ? 'Not found'
        : matchedLocations.size > 1
          ? 'Found in multiple locations'
          : titleFound
            ? 'Found in title'
            : headingFound
              ? 'Found in heading'
              : 'Found in content';

      const itemKey = `${groupKey}:${normalizedText(keyword)}`;
      const relatedItems = related.get(itemKey) || [];
      const relevance = getRelevance(
        keyword,
        articleText,
        contentFound || headingFound,
        similarKeys.has(itemKey) && !relatedItems.some(item => item.type === 'similar')
          ? [...relatedItems, { type: 'similar' }]
          : relatedItems
      );
      analysis.push({
        keyword,
        groupKey,
        groupLabel,
        locations,
        titleFound,
        introFound: matchedLocations.has('introduction'),
        bodyFound: contentFound,
        h2Found: matchedLocations.has('H2'),
        h3Found: matchedLocations.has('H3'),
        headingFound,
        conclusionFound: matchedLocations.has('conclusion'),
        contentFound,
        found,
        status,
        relevance: relevance.status,
        relevant: relevance.relevant,
        relevanceScore: relevance.score,
        relatedItems,
        duplicate: duplicateKeys.has(itemKey),
        similar: similarKeys.has(itemKey),
      });
    }
  }

  const questionItems = analysis
    .filter(item => item.groupKey === 'questionBasedKeywords')
    .map(item => ({
      ...item,
      answer: getQuestionAnalysis(item.keyword, blocks, regions.contentBlocks.length),
    }));
  const suggestions = analysis.filter(item => !item.found).map(item => ({
    keyword: item.keyword,
    groupKey: item.groupKey,
    groupLabel: item.groupLabel,
    reason: item.relevance.startsWith('Potentially unrelated')
      ? 'This phrase has little topical overlap with the visible article; review before adding.'
      : item.relevance.startsWith('Relevant')
        ? 'This phrase relates to article vocabulary but is not yet present in the visible content.'
        : item.relevance.startsWith('May') || item.relevance.startsWith('Similar')
          ? 'This phrase has partial topic overlap; use only if the article can explain it accurately.'
          : 'This phrase is not present in the visible article content.',
    placement: getSuggestedPlacement(item.groupKey, item.relevance),
    relevance: item.relevance,
  }));
  const foundInContent = analysis.filter(item => item.contentFound).length;
  const foundInHeadings = analysis.filter(item => item.headingFound).length;
  const foundInTitle = analysis.filter(item => item.titleFound).length;
  const missing = analysis.filter(item => !item.found).length;
  const duplicates = analysis.filter(item => item.duplicate).length;

  return {
    keywords: analysis,
    questions: questionItems,
    suggestions,
    stats: {
      total: all.length,
      foundInContent,
      foundInHeadings,
      foundInTitle,
      missing,
      relevant: analysis.filter(item => item.relevant).length,
      duplicates,
      similar: analysis.filter(item => item.similar).length,
      totalQuestions: questionItems.length,
      answeredQuestions: questionItems.filter(item => item.answer.answered).length,
      unansweredQuestions: questionItems.filter(item => !item.answer.answered).length,
    },
    blocks,
  };
}
