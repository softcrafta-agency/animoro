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
  assert.equal(result.questions[0].answer.status, 'Answer may be too short');
  assert.equal(result.questions[1].answer.status, 'Answer relevance needs review');
  assert.equal(result.questions[2].answer.status, 'Question not found in an H2/H3 heading');
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
