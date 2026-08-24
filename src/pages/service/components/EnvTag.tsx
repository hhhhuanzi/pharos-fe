import React from 'react';

import { formatEnv } from '../format';

type EnvTone = 'prod' | 'pre' | 'test' | 'dev';

/**
 * `deployment.environment.name` is set per cluster, so casing and spelling vary. Match
 * case-insensitively and fall back to a neutral tint instead of guessing a tone.
 */
const TONE_BY_VALUE: Record<string, EnvTone> = {
  prod: 'prod',
  production: 'prod',
  pre: 'pre',
  staging: 'pre',
  test: 'test',
  qa: 'test',
  dev: 'dev',
  development: 'dev',
};

/** Tints 1–8 are alpha overlays; 4 reads as a filled block in both themes, 11 is the text step. */
const CLASS_BY_TONE: Record<EnvTone, string> = {
  prod: 'bg-[var(--fc-red-4)] text-[var(--fc-red-11)]',
  pre: 'bg-[var(--fc-orange-4)] text-[var(--fc-orange-11)]',
  test: 'bg-[var(--fc-indigo-4)] text-[var(--fc-indigo-11)]',
  dev: 'bg-[var(--fc-green-4)] text-[var(--fc-green-11)]',
};

const UNKNOWN_CLASS = 'bg-fc-200 text-main';

interface Props {
  value?: string;
}

export default function EnvTag(props: Props) {
  const value = props.value?.trim();
  if (!value) return <span className='text-soft'>{formatEnv(value)}</span>;
  const tone = TONE_BY_VALUE[value.toLowerCase()];
  return (
    <span className={`inline-flex h-5 max-w-full items-center truncate rounded px-2 text-base leading-none ${tone ? CLASS_BY_TONE[tone] : UNKNOWN_CLASS}`} title={value}>
      {value}
    </span>
  );
}
