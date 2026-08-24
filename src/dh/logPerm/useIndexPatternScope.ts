import { useCallback, useContext, useMemo } from 'react';

import { CommonStateContext } from '@/App';

import { extractGrantedScopes, filterIndexPatternsByScopes, NamedIndexPattern } from './indexPatternScope';

export function useIndexPatternScope() {
  const { perms, profile } = useContext(CommonStateContext);
  const unrestricted = profile?.admin === true || perms === undefined;
  const grantedScopes = useMemo(() => extractGrantedScopes(perms), [perms]);
  const filter = useCallback(
    <T extends NamedIndexPattern>(list: T[]) => {
      if (unrestricted) {
        return list;
      }
      return filterIndexPatternsByScopes(list, grantedScopes);
    },
    [unrestricted, grantedScopes],
  );

  return { unrestricted, grantedScopes, filter };
}

export function useVisibleIndexPatterns<T extends NamedIndexPattern>(list: T[] | undefined): T[] {
  const { filter } = useIndexPatternScope();
  return useMemo(() => filter(list ?? []), [filter, list]);
}
