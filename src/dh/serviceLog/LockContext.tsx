import React, { createContext, useContext, useMemo } from 'react';

import { filterLockedIndexPatterns, stripLockedQueryKeys, type LockableIndexPattern, type ServiceLogLock } from './lock';

/**
 * 只有服务详情页日志 Tab 会挂 Provider。全局日志分析入口（/log/explorer）拿到的是
 * undefined，useLogExplorerLock 返回恒等函数与 locked=false，行为与改动前完全一致。
 */
const ServiceLogLockContext = createContext<ServiceLogLock | undefined>(undefined);

interface ProviderProps {
  lock?: ServiceLogLock;
  children: React.ReactNode;
}

export function ServiceLogLockProvider({ lock, children }: ProviderProps) {
  return <ServiceLogLockContext.Provider value={lock}>{children}</ServiceLogLockContext.Provider>;
}

export interface LogExplorerLock {
  /** 是否处于服务下钻锁定态 */
  locked: boolean;
  lock?: ServiceLogLock;
  /** 索引模式候选过滤；未锁定时恒等 */
  filterIndexPatterns: <T extends LockableIndexPattern>(list: T[]) => T[];
  /** 清洗回填到表单的 query（历史记录等）；未锁定时恒等 */
  sanitizeRestoredQuery: <T extends Record<string, unknown>>(query: T) => Partial<T>;
}

export function useLogExplorerLock(): LogExplorerLock {
  const lock = useContext(ServiceLogLockContext);

  return useMemo<LogExplorerLock>(
    () => ({
      locked: lock !== undefined,
      lock,
      filterIndexPatterns: (list) => (lock ? filterLockedIndexPatterns(list, lock) : list),
      sanitizeRestoredQuery: (query) => (lock ? stripLockedQueryKeys(query) : query),
    }),
    [lock],
  );
}
