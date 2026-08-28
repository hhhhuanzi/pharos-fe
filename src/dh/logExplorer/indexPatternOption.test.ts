import {
  INDEX_PATTERN_SELECT_DROPDOWN_CLASS,
  buildIndexPatternSearchIndex,
  normalizeIndexPatternOption,
} from './indexPatternOption';

describe('normalizeIndexPatternOption', () => {
  it('trims name and note', () => {
    expect(normalizeIndexPatternOption({ id: 1, name: ' turms-test* ', note: ' 客服系统 ' })).toEqual({
      name: 'turms-test*',
      note: '客服系统',
    });
  });

  it('treats missing or blank note as empty', () => {
    expect(normalizeIndexPatternOption({ id: 2, name: 'trade*' }).note).toBe('');
    expect(normalizeIndexPatternOption({ id: 3, name: 'trade*', note: '  ' }).note).toBe('');
  });
});

describe('buildIndexPatternSearchIndex', () => {
  it('joins name and note for search', () => {
    expect(buildIndexPatternSearchIndex('turms-test*', '客服系统-测试环境')).toBe('turms-test* 客服系统-测试环境');
  });

  it('keeps glob-only items searchable by name', () => {
    expect(buildIndexPatternSearchIndex('trade*', '')).toBe('trade*');
  });
});

describe('INDEX_PATTERN_SELECT_DROPDOWN_CLASS', () => {
  it('stays a stable global class for the antd popup', () => {
    expect(INDEX_PATTERN_SELECT_DROPDOWN_CLASS).toBe('dh-index-pattern-option-dropdown');
  });
});
