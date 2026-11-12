import { normalizeArticleKeywords } from './article-editor-fields.js';

export const ARTICLE_KEYWORD_GROUPS = [
  {
    key: 'additionalSeoKeywords',
    label: 'Additional SEO Keywords',
    description: 'Supporting topic phrases that add useful context. Keep only phrases the article genuinely covers.',
    placeholder: 'e.g. Black Torch manga adaptation',
    suggestion: false,
  },
  {
    key: 'storyCharacterKeywords',
    label: 'Story and Character Keywords',
    description: 'Relevant story arcs, characters, relationships, powers, and themes discussed in the article.',
    placeholder: 'e.g. Jiro Azuma character analysis',
    suggestion: false,
  },
  {
    key: 'longTailKeywords',
    label: 'Long-tail SEO Keywords',
    description: 'Specific search phrases that match the article’s scope and likely reader intent.',
    placeholder: 'e.g. how Black Torch connects ninjas and supernatural lore',
    suggestion: false,
  },
  {
    key: 'questionBasedKeywords',
    label: 'Question-Based Keywords (AEO)',
    description: 'Questions the article answers well. Treat these as FAQ candidates, not instructions to add unsupported answers.',
    placeholder: 'e.g. Who is Jiro Azuma in Black Torch?',
    suggestion: true,
  },
];

export function normalizeKeywordGroupValues(values = {}) {
  return Object.fromEntries(ARTICLE_KEYWORD_GROUPS.map(({ key }) => [
    key,
    normalizeArticleKeywords(values[key]),
  ]));
}

export function buildArticleKeywordGroupsPayload(
  values,
  existingArticle = {},
  changedKeys = [],
  isNewArticle = false
) {
  const normalized = normalizeKeywordGroupValues(values);
  const changed = new Set(changedKeys);

  return Object.fromEntries(ARTICLE_KEYWORD_GROUPS
    .filter(({ key }) => isNewArticle ||
      Object.prototype.hasOwnProperty.call(existingArticle, key) ||
      changed.has(key))
    .map(({ key }) => [key, normalized[key]]));
}

export function initializeArticleKeywordGroups(onChange = () => {}) {
  const state = new Map(ARTICLE_KEYWORD_GROUPS.map(({ key }) => [key, []]));
  const dirtyKeys = new Set();
  const controls = new Map();
  const analysisByKeyword = new Map();

  function normalizeKeyPhrase(keyword) {
    return keyword.normalize('NFKC')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLocaleLowerCase('en');
  }

  function getKeywordKey(key, keyword) {
    return `${key}:${normalizeKeyPhrase(keyword)}`;
  }

  function renderGroup(key) {
    const control = controls.get(key);
    if (!control) return;

    control.tags.replaceChildren();
    const count = control.root.querySelector('[data-keyword-count]');
    if (count) count.textContent = String(state.get(key).length);
    state.get(key).forEach((keyword, index) => {
      const tag = document.createElement('span');
      tag.className = 'article-keyword-tag';
      tag.setAttribute('role', 'listitem');
      const text = document.createElement('span');
      text.className = 'article-keyword-tag-text';
      text.textContent = keyword;
      const analysis = analysisByKeyword.get(getKeywordKey(key, keyword));
      const indicator = document.createElement('small');
      indicator.className = `article-keyword-status${analysis?.found ? ' is-found' : ''}`;
      indicator.textContent = analysis?.status || 'Analyzing…';
      indicator.setAttribute('aria-label', analysis
        ? `${analysis.status}${analysis.locations.length ? `: ${analysis.locations.join(', ')}` : ''}`
        : 'Keyword analysis pending');
      if (analysis?.locations.length) indicator.title = `Found in: ${analysis.locations.join(', ')}`;

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'article-keyword-tag-action';
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', `Edit ${keyword}`);
      edit.addEventListener('click', () => {
        state.set(key, state.get(key).filter((_, itemIndex) => itemIndex !== index));
        control.input.value = keyword;
        control.input.focus();
        markChanged(key);
        renderGroup(key);
      });

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'article-keyword-tag-action article-keyword-tag-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${keyword}`);
      remove.addEventListener('click', () => {
        state.set(key, state.get(key).filter((_, itemIndex) => itemIndex !== index));
        setStatus(key, `Removed “${keyword}”.`);
        markChanged(key);
        renderGroup(key);
      });

      tag.append(text, indicator, edit, remove);
      control.tags.appendChild(tag);
    });
  }

  function setStatus(key, message) {
    const status = controls.get(key)?.status;
    if (status) status.textContent = message;
  }

  function markChanged(key) {
    dirtyKeys.add(key);
    onChange(key);
  }

  function addInputValue(key) {
    const control = controls.get(key);
    if (!control) return;
    const phrases = normalizeArticleKeywords(control.input.value);
    control.input.value = '';
    if (!phrases.length) return;

    const current = state.get(key);
    const currentSet = new Set(ARTICLE_KEYWORD_GROUPS
      .flatMap(group => state.get(group.key))
      .map(normalizeKeyPhrase));
    const additions = phrases.filter(value => !currentSet.has(normalizeKeyPhrase(value)));
    const duplicates = phrases.length - additions.length;
    const duplicateGroup = ARTICLE_KEYWORD_GROUPS.find(group =>
      group.key !== key && state.get(group.key)
        .some(value => phrases.some(phrase => normalizeKeyPhrase(phrase) === normalizeKeyPhrase(value)))
    );
    if (additions.length) {
      state.set(key, [...current, ...additions]);
      setStatus(key, `Added ${additions.length} keyword${additions.length === 1 ? '' : 's'}${duplicates ? `; skipped ${duplicates} duplicate${duplicates === 1 ? '' : 's'}${duplicateGroup ? ` already listed under ${duplicateGroup.label}` : ''}` : ''}.`);
      markChanged(key);
      renderGroup(key);
    } else {
      setStatus(key, `That keyword${duplicates === 1 ? '' : 's'} already exists.`);
    }
  }

  for (const { key } of ARTICLE_KEYWORD_GROUPS) {
    const root = document.querySelector(`[data-keyword-group="${key}"]`);
    const input = root?.querySelector('[data-keyword-input]');
    const tags = root?.querySelector('[data-keyword-tags]');
    const status = root?.querySelector('[data-keyword-status]');
    if (!root || !input || !tags || !status) {
      throw new Error(`Keyword editor controls are missing for ${key}.`);
    }
    controls.set(key, { input, tags, status, root });
    input.addEventListener('input', () => {
      if (input.value.includes(',')) addInputValue(key);
      else markChanged(key);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addInputValue(key);
      }
    });
    input.addEventListener('blur', () => addInputValue(key));
    renderGroup(key);
  }

  return {
    getValues() {
      return normalizeKeywordGroupValues(Object.fromEntries(ARTICLE_KEYWORD_GROUPS.map(({ key }) => {
        const pending = controls.get(key)?.input.value || '';
        return [key, [...state.get(key), ...normalizeArticleKeywords(pending)]];
      })));
    },
    getDirtyKeys() {
      return [...dirtyKeys];
    },
    resetDirty() {
      dirtyKeys.clear();
    },
    setAnalysis(analysis) {
      analysisByKeyword.clear();
      for (const item of analysis || []) {
        analysisByKeyword.set(getKeywordKey(item.groupKey, item.keyword), item);
      }
      for (const { key } of ARTICLE_KEYWORD_GROUPS) renderGroup(key);
    },
    setValues(values = {}, { markDirty = false, dirtyKeys: keysToMark = [] } = {}) {
      const normalized = normalizeKeywordGroupValues(values);
      const dirty = new Set(keysToMark.filter(key => state.has(key)));
      for (const { key } of ARTICLE_KEYWORD_GROUPS) {
        state.set(key, normalized[key]);
        const control = controls.get(key);
        if (control) {
          control.input.value = '';
          setStatus(key, '');
        }
        renderGroup(key);
        if (markDirty || dirty.has(key)) dirtyKeys.add(key);
      }
      if (markDirty || dirty.size) onChange();
      else dirtyKeys.clear();
    },
  };
}
