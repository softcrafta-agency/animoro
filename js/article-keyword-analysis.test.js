import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeArticleKeywords, extractArticleAnalysisBlocks } from './article-keyword-analysis.js';

test('extracts visible article text without reading attributes, scripts, styles, or hidden elements', () => {
  const blocks = extractArticleAnalysisBlocks(`
    <p data-private="secret phrase">Visible opening <img alt="secret alt phrase" src="secret-image.png"></p>
    <script>const text = "secret script phrase";</script>
    <style>.secret-class { color: red; }</style>
    <div hidden><p>secret hidden phrase</p></div>
    <p>Visible &amp; readable content.</p>
  `);

  assert.deepEqual(blocks.map(block => block.text), [
    'Visible opening',
    'Visible & readable content.',
  ]);
});

test('detects normalized phrases in title, introduction, body, H2, H3, and conclusion', () => {
  const result = analyzeArticleKeywords({
    title: 'Black Torch: A Story Guide',
    content: `
      <p>The Black   Torch story follows Jiro Azuma through supernatural conflict.</p>
      <h2>Who is Jiro Azuma?</h2>
      <p>Jiro Azuma is a young ninja who teams up with a supernatural spirit and protects people from powerful enemies.</p>
      <h3>Jiro Azuma’s powers</h3>
      <p>His powers include enhanced strength and the ability to fight supernatural threats.</p>
      <h2>Conclusion</h2>
      <p>Black Torch brings its supernatural story to a close.</p>
    `,
    keywordGroups: {
      additionalSeoKeywords: ['black torch'],
      storyCharacterKeywords: ['Jiro Azuma'],
      longTailKeywords: ['supernatural threats'],
      questionBasedKeywords: ['Who is Jiro Azuma?'],
    },
  });

  const blackTorch = result.keywords.find(item => item.keyword === 'black torch');
  assert.equal(blackTorch.titleFound, true);
  assert.equal(blackTorch.introFound, true);
  assert.equal(blackTorch.conclusionFound, true);
  assert.equal(blackTorch.status, 'Found in multiple locations');

  const jiro = result.keywords.find(item => item.keyword === 'Jiro Azuma');
  assert.equal(jiro.h2Found, true);
  assert.equal(jiro.h3Found, true);
  assert.equal(jiro.contentFound, true);

  const threats = result.keywords.find(item => item.keyword === 'supernatural threats');
  assert.equal(threats.bodyFound, true);
  assert.equal(threats.h3Found, false);
  assert.equal(result.stats.total, 4);
});

test('detects a relevant answer immediately after a matching question heading', () => {
  const result = analyzeArticleKeywords({
    content: `
      <h2>Who Is the Strongest Anime Character?</h2>
      <p>Zeno is one of the most powerful characters in Dragon Ball Super because he can erase entire universes and timelines.</p>
    `,
    keywordGroups: {
      questionBasedKeywords: ['Who is the strongest anime character?'],
    },
  });

  assert.equal(result.stats.answeredQuestions, 1);
  assert.equal(result.stats.unansweredQuestions, 0);
  assert.equal(result.questions[0].answer.status, 'Answered');
  assert.match(result.questions[0].answer.answerLocation, /Paragraph 1 after H2/);
});

test('flags missing headings, missing answers, short answers, and weakly related answers', () => {
  const result = analyzeArticleKeywords({
    content: `
      <h2>Who is Jiro Azuma?</h2>
      <p>He is a ninja.</p>
      <h3>Where does the story take place?</h3>
      <p>The passage discusses colors, publication schedules, translation notes, and unrelated production details.</p>
    `,
    keywordGroups: {
      questionBasedKeywords: [
        'Who is Jiro Azuma?',
        'Where does the story take place?',
        'Why is Ichigo so strong?',
      ],
    },
  });

  assert.equal(result.stats.totalQuestions, 3);
  assert.equal(result.stats.answeredQuestions, 0);
  assert.equal(result.questions[0].answer.status, 'Answer may need more contextual detail');
  assert.equal(result.questions[1].answer.status, 'Answer may not directly answer the question');
  assert.equal(result.questions[1].answer.directAnswer, false);
  assert.equal(result.questions[2].answer.status, 'Question not found in an H2/H3 heading');
});

test('requires a relevant direct first-sentence answer instead of length or later keyword mention alone', () => {
  const result = analyzeArticleKeywords({
    content: `
      <h2>Who is the strongest anime villain?</h2>
      <p>This section starts with a vague statement. It later mentions the strongest villain and discusses abilities, story context, and supporting details in depth.</p>
    `,
    keywordGroups: {
      longTailKeywords: ['Who is the strongest anime villain?'],
      questionBasedKeywords: ['Who is the strongest anime villain?'],
    },
  });

  assert.equal(result.questions[0].answer.answered, false);
  assert.equal(result.questions[0].answer.directAnswer, false);
  assert.equal(result.stats.unansweredQuestions, 1);
  assert.equal(result.contentQuality.longTailChecks[0].sufficientlyAddressed, false);
  assert.ok(result.contentQuality.recommendations.some(item => item.type === 'long-tail-query-quality'));
});

test('scores editorial coverage and returns actionable, localized recommendations', () => {
  const repeatedParagraph = 'Anime villains are powerful story characters with abilities and motivations that shape each conflict.';
  const stuffedParagraph = `${'Anime villains '.repeat(8)}remain central to this example.`;
  const result = analyzeArticleKeywords({
    title: 'Top 3 Anime Villains Ranked',
    seoTitle: 'Top 3 Anime Villains Ranked',
    primaryKeyword: 'anime villains',
    secondaryKeywords: ['Jiro Azuma'],
    searchIntent: 'informational',
    content: `
      <p>Anime villains shape the story through distinct abilities and motivations that readers can compare.</p>
      <h2>Overview</h2>
      <p>Jiro Azuma abilities officially confirmed are notable.</p>
      <p>${stuffedParagraph}</p>
      <p>${repeatedParagraph}</p>
      <p>${repeatedParagraph}</p>
    `,
    keywordGroups: {
      storyCharacterKeywords: ['Jiro Azuma abilities'],
      longTailKeywords: ['unrelated cooking recipes for beginners'],
      questionBasedKeywords: ['Who is Jiro Azuma?'],
    },
  });

  const { contentQuality } = result;
  assert.equal(contentQuality.searchIntent.queryFormat, 'list-based');
  assert.equal(contentQuality.searchIntent.titlePromises.some(item => item.promise === 'list' && !item.fulfilled), true);
  for (const score of Object.values(contentQuality.scores)) {
    assert.ok(Number.isInteger(score) && score >= 0 && score <= 100);
  }
  for (const recommendation of contentQuality.recommendations) {
    assert.ok(recommendation.issue);
    assert.ok(recommendation.why);
    assert.ok(recommendation.where);
    assert.ok(recommendation.improve);
  }
  for (const type of [
    'title-promise',
    'keyword-stuffing',
    'irrelevant-keyword',
    'long-tail-query-quality',
    'character-story-context',
    'weak-heading',
    'repeated-paragraph',
    'unsupported-claim-review',
  ]) {
    assert.ok(contentQuality.recommendations.some(item => item.type === type), `expected ${type} recommendation`);
  }
});

test('flags a weak introduction and selected intent without matching evidence', () => {
  const result = analyzeArticleKeywords({
    title: 'Where to Watch the Series',
    primaryKeyword: 'Where to watch the series',
    searchIntent: 'transactional',
    content: '<p>Colorful characters appear throughout this story.</p>',
  });

  assert.ok(result.contentQuality.recommendations.some(item => item.type === 'weak-introduction'));
  assert.ok(result.contentQuality.recommendations.some(item => item.type === 'search-intent'));
  assert.equal(result.contentQuality.searchIntent.selected, 'transactional');
});

test('reports exact duplicates, similar phrases, relevance, and human-reviewed suggestions', () => {
  const result = analyzeArticleKeywords({
    title: 'Black Torch review',
    content: '<p>Black Torch follows Jiro Azuma and his supernatural adventures.</p>',
    keywordGroups: {
      additionalSeoKeywords: ['Black Torch', 'Jiro Azuma character'],
      storyCharacterKeywords: ['black torch', 'Jiro Azuma characters'],
      longTailKeywords: ['unrelated cooking recipes'],
    },
  });

  assert.equal(result.stats.duplicates, 1);
  assert.equal(result.stats.similar, 2);
  assert.equal(result.keywords.find(item => item.keyword === 'unrelated cooking recipes').relevance, 'Potentially unrelated—review');
  assert.equal(result.suggestions.length, 3);
  assert.ok(result.suggestions.some(item => /Review relevance/.test(item.placement)));
});

test('matches complete phrases and reports punctuation variants duplicated in one group', () => {
  const result = analyzeArticleKeywords({
    title: 'Goku guide',
    content: '<h2>Black Torch story</h2><p>Gokushima protects the village.</p>',
    keywordGroups: {
      additionalSeoKeywords: ['Goku', 'Black Torch', 'Black-Torch'],
    },
  });

  assert.equal(result.keywords.find(item => item.keyword === 'Goku').titleFound, true);
  assert.equal(result.keywords.find(item => item.keyword === 'Goku').contentFound, false);
  assert.equal(result.stats.duplicates, 1);
  assert.equal(result.keywords.find(item => item.keyword === 'Black Torch').duplicate, true);
  assert.equal(result.keywords.find(item => item.keyword === 'Black-Torch').duplicate, true);
});

test('handles empty groups and punctuation-only or unusually long terms safely', () => {
  const longKeyword = `${'word '.repeat(60)}ending`;
  const result = analyzeArticleKeywords({
    title: 'A title',
    content: '<p>ordinary text</p>',
    keywordGroups: {
      additionalSeoKeywords: ['?!', longKeyword],
    },
  });

  assert.equal(result.stats.total, 2);
  assert.equal(result.keywords[1].keyword.length, longKeyword.trim().length);
  assert.equal(result.keywords[0].status, 'Not found');
  assert.equal(result.stats.missing, 2);
});
