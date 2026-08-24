import { useContext } from 'react';

import { CommonStateContext } from '@/App';

export const RAW_INDEX_PERM = '/log/index-patterns/raw-index';

export function useEsIndexTypeScope() {
  const { perms, profile } = useContext(CommonStateContext);
  const allowRawIndex = profile?.admin === true || perms === undefined || (Array.isArray(perms) && perms.includes(RAW_INDEX_PERM));
  const defaultIndexType = allowRawIndex ? 'index' : 'index_pattern';

  return { allowRawIndex, defaultIndexType };
}
