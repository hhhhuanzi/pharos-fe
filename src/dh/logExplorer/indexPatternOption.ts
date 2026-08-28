export const INDEX_PATTERN_SELECT_DROPDOWN_CLASS = 'dh-index-pattern-option-dropdown';

export interface IndexPatternOptionSource {
  id: number | string;
  name?: string;
  note?: string;
}

export function normalizeIndexPatternOption(item: IndexPatternOptionSource): { name: string; note: string } {
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const note = typeof item.note === 'string' ? item.note.trim() : '';
  return { name, note };
}

export function buildIndexPatternSearchIndex(name: string, note: string): string {
  return [name, note].filter(Boolean).join(' ');
}
