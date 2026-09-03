import React from 'react';

import { formatEnv } from './format';

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

/**
 * Two channels carry the environment, so neither has to work alone:
 *
 * - hue, walking red → amber → indigo → green as the blast radius of a mistake shrinks;
 * - fill weight, which also encodes that ranking (prod is the darkest chip in light theme and
 *   the brightest in dark theme, dev the faintest).
 *
 * The weight ramp is what makes `prod` and `pre` safe. Red and amber stay adjacent hues that
 * collapse into each other for red-green colour blindness, but the tint steps put ~14 L* between
 * them, so the pair survives deuteranopia and protanopia on lightness alone.
 *
 * Tints 1–8 are alpha overlays over the page fill; 11 and 12 are the text steps, both of which
 * invert between themes. 12 is used here because the heavier fills need the higher-contrast one.
 */
const CLASS_BY_TONE: Record<EnvTone, string> = {
  prod: 'bg-[var(--fc-red-7)] text-[var(--fc-red-12)]',
  pre: 'bg-[var(--fc-yellow-5)] text-[var(--fc-yellow-12)]',
  test: 'bg-[var(--fc-indigo-4)] text-[var(--fc-indigo-12)]',
  dev: 'bg-[var(--fc-green-3)] text-[var(--fc-green-12)]',
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
