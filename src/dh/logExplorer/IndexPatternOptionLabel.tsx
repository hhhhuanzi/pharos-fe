import React from 'react';

import {
  INDEX_PATTERN_SELECT_DROPDOWN_CLASS,
  IndexPatternOptionSource,
  buildIndexPatternSearchIndex,
  normalizeIndexPatternOption,
} from './indexPatternOption';

import './IndexPatternOptionLabel.less';

interface IndexPatternOptionLabelProps {
  name: string;
  note: string;
}

export default function IndexPatternOptionLabel(props: IndexPatternOptionLabelProps) {
  const { name, note } = props;

  if (!note) {
    return (
      <span className='block truncate font-mono text-sm text-main' title={name}>
        {name}
      </span>
    );
  }

  return (
    <span className='block min-w-0'>
      <span className='block truncate text-sm font-medium text-title' title={note}>
        {note}
      </span>
      <span className='mt-1 block truncate font-mono text-xs text-hint' title={name}>
        {name}
      </span>
    </span>
  );
}

export function mapIndexPatternSelectOptions(indexPatterns: IndexPatternOptionSource[] | undefined) {
  if (!Array.isArray(indexPatterns)) return [];
  return indexPatterns.map((item) => {
    const { name, note } = normalizeIndexPatternOption(item);
    return {
      label: <IndexPatternOptionLabel name={name} note={note} />,
      originLabel: name,
      searchIndex: buildIndexPatternSearchIndex(name, note),
      value: item.id,
    };
  });
}

export function getIndexPatternSelectOptionProps(indexPatterns: IndexPatternOptionSource[] | undefined) {
  return {
    options: mapIndexPatternSelectOptions(indexPatterns),
    dropdownClassName: INDEX_PATTERN_SELECT_DROPDOWN_CLASS,
    optionFilterProp: 'searchIndex' as const,
    optionLabelProp: 'originLabel' as const,
  };
}
