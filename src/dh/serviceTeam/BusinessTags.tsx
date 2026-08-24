import React from 'react';

import type { NamedTeam } from './types';

const TONES = [
  'bg-[var(--fc-violet-4)] text-[var(--fc-violet-11)]',
  'bg-[var(--fc-indigo-4)] text-[var(--fc-indigo-11)]',
  'bg-[var(--fc-red-4)] text-[var(--fc-red-11)]',
  'bg-[var(--fc-orange-4)] text-[var(--fc-orange-11)]',
  'bg-[var(--fc-yellow-4)] text-[var(--fc-yellow-11)]',
  'bg-[var(--fc-green-4)] text-[var(--fc-green-11)]',
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
          className={`inline-flex h-5 max-w-full items-center truncate rounded px-2 text-base leading-none ${businessToneClass(team.id, team.name)}`}
          title={team.name}
        >
          {team.name}
        </span>
      ))}
    </span>
  );
}
