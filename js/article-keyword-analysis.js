import { ARTICLE_KEYWORD_GROUPS, normalizeKeywordGroupValues } from './article-keyword-groups.js';
import { normalizeArticleKeywords } from './article-editor-fields.js';

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
      directAnswer: false,
      informative: false,
      relevant: false,
    };
  }
  const wordCount = meaningfulTokens(answer.block.text).length;
  const terms = [...new Set(meaningfulTokens(question))];
  const overlap = answerTermOverlap(question, answer.block.text);
  const minimumOverlap = terms.length >= 5 ? 2 : 1;
  const firstSentence = answer.block.text.match(/[^.!?]+(?:[.!?]+|$)/)?.[0] || answer.block.text;
  const directOverlap = answerTermOverlap(question, firstSentence);
  const directAnswer = directOverlap >= minimumOverlap;
  const questionTerms = new Set(terms);
  const supportingTerms = new Set(meaningfulTokens(answer.block.text)
    .filter(term => !questionTerms.has(term)));
  const enoughDetail = wordCount >= 8 && supportingTerms.size >= 3;
  const relevant = overlap >= minimumOverlap;
  const answered = directAnswer && enoughDetail && relevant;

  return {
    question,
    headingFound: true,
    answered,
    status: answered
      ? 'Answered'
      : !enoughDetail
        ? 'Answer may need more contextual detail'
        : !directAnswer
          ? 'Answer may not directly answer the question'
          : 'Answer relevance needs review',
    answerLocation: `${answer.block.tag === 'li' ? 'List item' : 'Paragraph'} ${answer.block.paragraphIndex || answer.index + 1} after ${blocks[headingIndex].tag.toUpperCase()}`,
    answerExcerpt: answer.block.text.slice(0, 220),
    answerWordCount: wordCount,
    overlap,
    directAnswer,
    directOverlap,
    informative: enoughDetail,
    supportingTermCount: supportingTerms.size,
    relevant,
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

function countPhraseOccurrences(text, phrase) {
  const source = normalizedText(text).split(' ').filter(Boolean);
  const target = normalizedText(phrase).split(' ').filter(Boolean);
  if (!target.length || target.length > source.length) return 0;
  let count = 0;
  for (let index = 0; index <= source.length - target.length; index += 1) {
    if (target.every((token, offset) => source[index + offset] === token)) count += 1;
  }
  return count;
}

function toScore(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function createRecommendation(type, issue, why, where, improve, evidence = '') {
  return { type, severity: 'review', issue, why, where, improve, evidence };
}

function getTitlePromises(title) {
  const promises = [];
  if (/\b(?:top\s+\d+|ranked|ranking|list of|best\s+\w+|\d+\s+(?:best|strongest|powerful|top))\b/i.test(title)) {
    promises.push('list');
  }
  if (/\b(?:vs\.?|versus|compare|comparison|differences between|better than)\b/i.test(title)) {
    promises.push('comparison');
  }
  if (/\b(?:how|why|who|what|explained|guide|meaning|ending)\b/i.test(title)) {
    promises.push('explanation');
  }
  return promises;
}

function analyzeArticleContentQuality({
  title,
  seoTitle,
  primaryKeyword,
  secondaryKeywords,
  searchIntent,
  blocks,
  regions,
  keywords,
  questions,
}) {
  const recommendations = [];
  const paragraphs = blocks.filter(block => block.tag === 'p');
  const headings = blocks.filter(block => ['h2', 'h3'].includes(block.tag));
  const bodyText = blocks.map(block => block.text).join(' ');
  const articleWordCount = meaningfulTokens(bodyText).length;
  const mainTopic = String(primaryKeyword || title).trim();
  const topicTerms = [...new Set(meaningfulTokens(mainTopic))];
  const introText = regions.introBlock?.text || '';
  const introTerms = new Set(meaningfulTokens(introText));
  const introOverlap = topicTerms.length
    ? intersectionCount(topicTerms, [...introTerms]) / topicTerms.length
    : 0;
  const introDirect = Boolean(introText) &&
    (hasPhrase(introText, mainTopic) || introOverlap >= 0.35);

  if (!introText || !introDirect) {
    recommendations.push(createRecommendation(
      'weak-introduction',
      'The introduction does not clearly establish the article topic.',
      'Readers should quickly see that the page addresses the search they opened it for.',
      'Introduction',
      `State the article's subject and directly answer or frame the main query${mainTopic ? ` (“${mainTopic}”)` : ''}.`,
      introText.slice(0, 180) || 'No visible introductory paragraph was found.'
    ));
  }

  const seoPromiseTitle = String(seoTitle || title || '');
  const promises = getTitlePromises(seoPromiseTitle);
  const fulfilledPromises = promises.filter(promise => {
    if (promise === 'list') {
      return blocks.filter(block => block.tag === 'li').length >= 3 ||
        headings.some(block => /\b(?:top|ranked|ranking|part \d+|\d+)\b/i.test(block.text));
    }
    if (promise === 'comparison') {
      return /\b(?:versus|vs\.?|compared|comparison|compare|differences|pros|cons)\b/i.test(bodyText);
    }
    return paragraphs.length >= 2 && (headings.length > 0 ||
      /\b(?:because|explains?|refers to|means|works|reason|analysis)\b/i.test(bodyText));
  });
  promises.forEach(promise => {
    if (fulfilledPromises.includes(promise)) return;
    recommendations.push(createRecommendation(
      'title-promise',
      `The SEO title promises a ${promise}, but the article structure does not clearly deliver it.`,
      'A mismatch between the search result promise and page content can frustrate readers.',
      'SEO title and article headings/body',
      `Add supported ${promise === 'list' ? 'list entries' : promise === 'comparison' ? 'comparison criteria' : 'explanatory sections'} if they fit the article, or revise the SEO title to match the existing content.`,
      seoPromiseTitle
    ));
  });

  const trackedKeywords = [
    ...(primaryKeyword ? [{
      keyword: String(primaryKeyword).trim(),
      groupKey: 'primaryKeyword',
      groupLabel: 'Primary focus keyword',
    }] : []),
    ...normalizeArticleKeywords(secondaryKeywords).map(keyword => ({
      keyword,
      groupKey: 'secondaryKeywords',
      groupLabel: 'Secondary keywords',
    })),
    ...keywords.map(item => ({
      keyword: item.keyword,
      groupKey: item.groupKey,
      groupLabel: item.groupLabel,
      analysis: item,
    })),
  ].filter(item => item.keyword);

  const contexts = trackedKeywords.map(item => {
    const phraseTerms = new Set(meaningfulTokens(item.keyword));
    const questionAnalysis = item.groupKey === 'questionBasedKeywords'
      ? questions.find(question => normalizedText(question.keyword) === normalizedText(item.keyword))
      : null;
    const matches = paragraphs
      .filter(block => hasPhrase(block.text, item.keyword))
      .map(block => ({
        block,
        contextTerms: new Set(meaningfulTokens(block.text)
          .filter(term => !phraseTerms.has(term))).size,
      }));
    const bestMatch = matches.reduce((best, current) =>
      !best || current.contextTerms > best.contextTerms ? current : best, null);
    const inHeading = headings.some(block => hasPhrase(block.text, item.keyword));
    const inTitle = hasPhrase(title, item.keyword);
    const articleTerms = new Set(meaningfulTokens(bodyText));
    const overlap = phraseTerms.size
      ? intersectionCount([...phraseTerms], [...articleTerms]) / phraseTerms.size
      : 0;
    const found = matches.length > 0 || inHeading || inTitle || Boolean(questionAnalysis?.answer.answered);
    const contextScore = questionAnalysis?.answer.answered
      ? 100
      : bestMatch
      ? bestMatch.contextTerms >= 8 ? 100 : bestMatch.contextTerms >= 4 ? 75 : 50
      : inHeading || inTitle ? 40 : overlap >= 0.5 ? 25 : 0;
    const occurrences = countPhraseOccurrences(bodyText, item.keyword);
    const density = occurrences * Math.max(1, phraseTerms.size) / Math.max(1, articleWordCount);
    return {
      ...item,
      found,
      inParagraph: matches.length > 0,
      questionAnswered: Boolean(questionAnalysis?.answer.answered),
      inHeading,
      inTitle,
      paragraphIndex: bestMatch?.block.paragraphIndex || 0,
      contextTerms: bestMatch?.contextTerms || 0,
      contextScore,
      overlap,
      occurrences,
      density,
    };
  });

  contexts.forEach(item => {
    if (item.analysis?.relevance?.startsWith('Potentially unrelated') ||
        (!item.found && item.overlap < 0.2)) {
      recommendations.push(createRecommendation(
        'irrelevant-keyword',
        `“${item.keyword}” has little visible topic overlap.`,
        'Unrelated targeting phrases can mislead editors and readers about what the article covers.',
        item.inParagraph ? `Paragraph ${item.paragraphIndex}` : 'Article body',
        'Confirm that the article substantively covers this topic; otherwise remove the phrase from the editorial keyword group.',
        item.keyword
      ));
    }

    if (item.groupKey === 'questionBasedKeywords') return;

    const longTailQuestionLike = /\?/.test(item.keyword);
    if (item.groupKey === 'longTailKeywords' &&
        (longTailQuestionLike || meaningfulTokens(item.keyword).length >= 3)) {
      const questionLike = longTailQuestionLike;
      const questionCheck = questionLike
        ? getQuestionAnalysis(item.keyword, blocks, regions.contentBlocks.length)
        : null;
      const sufficientlyAddressed = questionLike
        ? questionCheck?.answered
        : item.inParagraph && item.contextTerms >= 8;
      if (!sufficientlyAddressed) {
        recommendations.push(createRecommendation(
          'long-tail-query-quality',
          `The long-tail phrase “${item.keyword}” may not be fully addressed with contextual detail.`,
          'A specific search phrase should match the article’s actual scope and receive an explanation, not only a passing mention.',
          questionCheck?.headingFound
            ? questionCheck.answerLocation || `After the heading for “${item.keyword}”`
            : item.inParagraph ? `Paragraph ${item.paragraphIndex}` : 'Relevant H2/H3 and article paragraphs',
          questionLike
            ? 'Use a relevant H2/H3 followed by a direct, informative answer based on verified article content.'
            : 'Explain the complete topic in a relevant paragraph and confirm that the phrase fits the article’s scope.',
          questionCheck?.status || item.keyword
        ));
      }
    }

    if (!item.inParagraph) {
      recommendations.push(createRecommendation(
        'keyword-context',
        `“${item.keyword}” has no exact match in a visible paragraph.`,
        'A phrase present only in planning fields, the title, or a heading does not provide explanatory value to readers.',
        'Article paragraphs',
        'If it is genuinely within scope, explain it in a relevant paragraph; otherwise remove it from the keyword plan.',
        item.keyword
      ));
    } else if (item.contextTerms < 4) {
      recommendations.push(createRecommendation(
        'keyword-context',
        `“${item.keyword}” appears without enough surrounding explanation.`,
        'A passing mention may not answer the reader’s question or establish why the phrase matters.',
        `Paragraph ${item.paragraphIndex}`,
        'Add accurate context, examples, or supporting details around the mention, or remove the phrase if the article does not cover it.',
        item.keyword
      ));
    }

    if (item.occurrences >= 8 || (item.occurrences >= 5 && item.density >= 0.02)) {
      recommendations.push(createRecommendation(
        'keyword-stuffing',
        `“${item.keyword}” is repeated ${item.occurrences} times in the article text.`,
        'Unnatural repetition can make the writing harder to read and may indicate keyword stuffing.',
        'Article body',
        'Read the affected passages aloud and remove repetitions that do not add information. Keep only natural, useful mentions.',
        `${(item.density * 100).toFixed(1)}% approximate phrase-token density`
      ));
    }
  });

  const storyContexts = contexts.filter(item => item.groupKey === 'storyCharacterKeywords');
  storyContexts.forEach(item => {
    const analysis = item.analysis;
    const hasStoryDetailCue = /\b(?:power|powers|ability|abilities|skill|skills|technique|relationship|rival|friend|family|arc|backstory)\b/i.test(item.keyword);
    if (hasStoryDetailCue && item.contextTerms < 8) {
      recommendations.push(createRecommendation(
        'character-story-context',
        `The story/character phrase “${item.keyword}” may need more supporting detail.`,
        'Names and topic labels alone do not explain an ability, relationship, or story arc; the analyzer cannot verify anime canon.',
        item.inParagraph ? `Paragraph ${item.paragraphIndex}` : 'Article body',
        'Explain the relevant ability, relationship, or arc using supported article evidence. Check any canon-sensitive claim against a reliable source.',
        item.keyword
      ));
    }
    if (analysis?.similar && analysis.relatedItems?.length) {
      const related = analysis.relatedItems.find(value => value.type === 'similar');
      if (related) {
        recommendations.push(createRecommendation(
          'character-name-review',
          `“${item.keyword}” is similar to “${related.keyword}”.`,
          'Similar spellings or overlapping phrases may reflect a naming inconsistency, though they can also be distinct concepts.',
          'Story and Character Keywords',
          'Confirm the intended character/story term and use consistent naming. This is a review signal, not character-identity detection.',
          `${item.keyword} / ${related.keyword}`
        ));
      }
    }
  });

  questions.forEach(item => {
    if (item.answer.answered) return;
    const where = item.answer.headingFound
      ? item.answer.answerLocation || `After the H2/H3 for “${item.keyword}”`
      : 'H2/H3 headings';
    recommendations.push(createRecommendation(
      'unanswered-question',
      `“${item.keyword}” is not yet supported by a direct, contextual answer.`,
      'Question headings work best when the following text answers the question clearly and provides relevant detail.',
      where,
      'Add or revise an H2/H3 and the following answer using verified article information. Do not invent an answer to satisfy this check.',
      item.answer.status
    ));
  });

  const weakHeadings = headings.filter(block => {
    const terms = meaningfulTokens(block.text);
    return terms.length < 2 ||
      /^(?:introduction|overview|conclusion|summary|final thoughts|more)$/i.test(block.text.trim());
  });
  weakHeadings.forEach(block => {
    recommendations.push(createRecommendation(
      'weak-heading',
      `The ${block.tag.toUpperCase()} heading “${block.text}” is generic or too short to describe its section.`,
      'Specific headings help readers scan the page and understand what each section contributes.',
      `${block.tag.toUpperCase()} “${block.text}”`,
      'Replace it with a concise, accurate heading that names the section’s actual subject.',
      block.text
    ));
  });

  const paragraphByText = new Map();
  paragraphs.forEach(block => {
    const key = normalizedText(block.text);
    if (key.split(' ').filter(Boolean).length < 8) return;
    const previous = paragraphByText.get(key);
    if (previous) {
      recommendations.push(createRecommendation(
        'repeated-paragraph',
        'A paragraph repeats text already used earlier in the article.',
        'Repeated copy adds no new information and can interrupt the article’s flow.',
        `Paragraphs ${previous.paragraphIndex} and ${block.paragraphIndex}`,
        'Keep the clearest version and use the space for distinct, useful information.',
        block.text.slice(0, 180)
      ));
    } else {
      paragraphByText.set(key, block);
    }
  });

  const claimPattern = /\b(?:officially confirmed|confirmed by the creator|canonically|unquestionably|the only|the strongest|always|never|proves that)\b/i;
  paragraphs.forEach(block => {
    const match = block.text.match(claimPattern);
    if (!match) return;
    recommendations.push(createRecommendation(
      'unsupported-claim-review',
      `Potentially absolute or canon-sensitive wording needs a source check (“${match[0]}”).`,
      'This analyzer cannot verify anime canon or whether a strong claim is supported by evidence.',
      `Paragraph ${block.paragraphIndex}`,
      'Verify the statement against a reliable source and cite it visibly where appropriate, or qualify the wording.',
      block.text.slice(0, 220)
    ));
  });

  const titlePromises = getTitlePromises(seoPromiseTitle);
  const listEvidence = blocks.filter(block => block.tag === 'li').length >= 3 ||
    headings.some(block => /\b(?:top|ranked|ranking|part \d+|\d+)\b/i.test(block.text));
  const comparisonEvidence = /\b(?:versus|vs\.?|compared|comparison|compare|differences|pros|cons)\b/i.test(bodyText);
  const explanationEvidence = paragraphs.length >= 2 && (headings.length > 0 ||
    /\b(?:because|explains?|refers to|means|works|reason|analysis)\b/i.test(bodyText));
  const intentEvidence = {
    informational: explanationEvidence || headings.length > 0,
    commercial: comparisonEvidence || /\b(?:review|pros|cons|best|top|ranked)\b/i.test(bodyText),
    transactional: /\b(?:where to watch|stream|buy|purchase|subscribe|order|official site)\b/i.test(bodyText),
    navigational: hasPhrase(`${title} ${introText}`, mainTopic),
    listBased: listEvidence,
  };
  const selectedIntent = ['informational', 'commercial', 'transactional', 'navigational'].includes(searchIntent)
    ? searchIntent
    : 'informational';
  const intentMatch = intentEvidence[selectedIntent];
  const queryFormat = titlePromises.includes('comparison')
    ? 'comparative'
    : titlePromises.includes('list') || listEvidence
      ? 'list-based'
      : titlePromises.includes('explanation') || explanationEvidence
        ? 'explanatory'
        : 'informational';
  if (!intentMatch) {
    recommendations.push(createRecommendation(
      'search-intent',
      `The article has limited visible signals for its selected ${selectedIntent} search intent.`,
      'A page should make it clear that it satisfies the kind of task the searcher intended. This signal is heuristic, not a ranking prediction.',
      'Introduction and article structure',
      `Review whether the introduction and sections address the reader’s ${selectedIntent} task; adjust the editorial plan or selected intent if it does not.`,
      queryFormat
    ));
  }
  const promiseScore = titlePromises.length
    ? fulfilledPromises.length / titlePromises.length
    : 1;
  const bodySubstanceScore = Math.min(1, articleWordCount / 180);
  const searchIntentScore = toScore(
    (introOverlap * 0.35) +
    (bodySubstanceScore * 0.2) +
    ((intentMatch ? 1 : 0) * 0.25) +
    (promiseScore * 0.2)
  );
  const keywordCoverageScore = trackedKeywords.length
    ? toScore(contexts.filter(item => item.found).length / trackedKeywords.length)
    : 0;
  const contentRelevanceScore = contexts.length
    ? toScore(contexts.reduce((sum, item) => sum + item.contextScore, 0) / contexts.length / 100)
    : 0;
  const aeoCoverageScore = questions.length
    ? toScore(questions.filter(item => item.answer.answered).length / questions.length)
    : 0;
  const usefulHeadings = headings.filter(block => !weakHeadings.includes(block));
  let hasH2Parent = false;
  let hierarchyErrors = 0;
  blocks.forEach(block => {
    if (block.tag === 'h2') hasH2Parent = true;
    if (block.tag === 'h3' && !hasH2Parent) hierarchyErrors += 1;
  });
  const headingQualityScore = toScore(
    (headings.some(block => block.tag === 'h2') ? 0.3 : 0) +
    (headings.length ? usefulHeadings.length / headings.length * 0.5 : 0) +
    (headings.length && !hierarchyErrors ? 0.2 : 0)
  );
  const characterStoryScore = storyContexts.length
    ? toScore(storyContexts.reduce((sum, item) =>
      sum + (item.inParagraph ? 0.5 + (item.contextTerms >= 8 ? 0.5 : item.contextTerms >= 4 ? 0.3 : 0) : 0), 0
    ) / storyContexts.length)
    : 0;

  return {
    searchIntent: {
      selected: selectedIntent,
      queryFormat,
      formatSignals: titlePromises,
      introductionDirectlyAddressesTopic: introDirect,
      introductionTopicOverlap: Number(introOverlap.toFixed(2)),
      intentEvidence,
      titlePromises: titlePromises.map(promise => ({
        promise,
        fulfilled: fulfilledPromises.includes(promise),
      })),
    },
    keywordContexts: contexts,
    longTailChecks: contexts
      .filter(item => item.groupKey === 'longTailKeywords')
      .map(item => ({
        keyword: item.keyword,
        foundInParagraph: item.inParagraph,
        contextualTerms: item.contextTerms,
        sufficientlyAddressed: /\?/.test(item.keyword)
          ? getQuestionAnalysis(item.keyword, blocks, regions.contentBlocks.length).answered
          : item.inParagraph && item.contextTerms >= 8,
      })),
    articleWordCount,
    scores: {
      keywordCoverage: keywordCoverageScore,
      searchIntent: searchIntentScore,
      contentRelevance: contentRelevanceScore,
      aeoCoverage: aeoCoverageScore,
      headingQuality: headingQualityScore,
      characterStoryCoverage: characterStoryScore,
    },
    recommendations,
  };
}

export function analyzeArticleKeywords({
  title = '',
  seoTitle = '',
  primaryKeyword = '',
  secondaryKeywords = [],
  searchIntent = 'informational',
  content = '',
  keywordGroups = {},
} = {}) {
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
  const contentQuality = analyzeArticleContentQuality({
    title,
    seoTitle,
    primaryKeyword,
    secondaryKeywords,
    searchIntent,
    blocks,
    regions,
    keywords: analysis,
    questions: questionItems,
  });
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
      duplicates: duplicateKeys.size,
      similar: analysis.filter(item => item.similar).length,
      totalQuestions: questionItems.length,
      answeredQuestions: questionItems.filter(item => item.answer.answered).length,
      unansweredQuestions: questionItems.filter(item => !item.answer.answered).length,
    },
    contentQuality,
    blocks,
  };
}
