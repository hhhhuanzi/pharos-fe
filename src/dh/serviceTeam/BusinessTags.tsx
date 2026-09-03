import React from 'react';

import type { NamedTeam } from './types';

/**
 * Outlined, not filled, and deliberately a step lighter than anything `EnvTag` uses.
 *
 * Business and environment tags sit in neighbouring columns of the service list. They used to
 * share one recipe (tint 4 fill + tint 11 text), so a business tag that hashed into the same hue
 * family as an environment rendered the exact same swatch — identical pixels, not merely similar.
 * Keeping the hash palette but changing the *treatment* means the two columns stay tellable apart
 * whatever the hash lands on: environment reads as a solid block, business as a hairline pill.
 */
const TONES = [
  'bg-[var(--fc-violet-2)] border-[var(--fc-violet-6)] text-[var(--fc-violet-11)]',
  'bg-[var(--fc-indigo-2)] border-[var(--fc-indigo-6)] text-[var(--fc-indigo-11)]',
  'bg-[var(--fc-red-2)] border-[var(--fc-red-6)] text-[var(--fc-red-11)]',
  'bg-[var(--fc-orange-2)] border-[var(--fc-orange-6)] text-[var(--fc-orange-11)]',
  'bg-[var(--fc-yellow-2)] border-[var(--fc-yellow-6)] text-[var(--fc-yellow-11)]',
  'bg-[var(--fc-green-2)] border-[var(--fc-green-6)] text-[var(--fc-green-11)]',
] as const;

/** 同一业务在所有行颜色一致：优先按 user_group_id 哈希，没有 id 再按 name。 */
export function businessToneClass(id: number, name: string): string {
  const key = id > 0 ? String(id) : name;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TONES[hash % TONES.length];
}

interface Props {
  teams?: NamedTeam[];
}

export default function BusinessTags(props: Props) {
  const teams = Array.isArray(props.teams) ? props.teams.filter((item) => item && item.name) : [];
  if (teams.length === 0) return null;
  return (
    <span className='inline-flex max-w-full flex-wrap items-center gap-1'>
      {teams.map((team) => (
        <span
          key={team.id || team.name}
          className={`inline-flex h-5 max-w-full items-center truncate rounded-full border border-solid px-2 text-base leading-none ${businessToneClass(team.id, team.name)}`}
          title={team.name}
        >
          {team.name}
        </span>
      ))}
    </span>
  );
}
