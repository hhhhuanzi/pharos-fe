/**
 * 服务详情页日志 Tab 的「查询目标锁定」纯逻辑。
 *
 * 全局日志分析入口（/log/explorer）不锁定，仍走 src/dh/logPerm 的索引域权限过滤；
 * 只有服务下钻场景把索引模式与数据源钉死在「所属业务 + 环境」算出来的那一个上。
 * React 侧的注入见 ./LockContext。
 */

export interface ServiceLogLock {
  /** 锁定的数据源 id，对应 Explorer 表单的 datasourceValue */
  datasourceValue: number;
  /** 锁定的索引模式 id，对应 query.index_pattern */
  indexPatternId: number;
  /** 锁定的索引模式名，用于提示文案，例如 `turms-test*` */
  indexPatternName: string;
}

export interface LockableIndexPattern {
  id?: number;
}

/**
 * 锁定态下索引模式候选只留锁定的那一项。
 *
 * 控件本身也会置为 disabled，这里再收敛候选是第二道保险：即使某条路径绕过了
 * disabled（例如程序化 setFieldsValue 后重新渲染），下拉里也拿不到别的索引。
 */
export function filterLockedIndexPatterns<T extends LockableIndexPattern>(list: T[], lock: ServiceLogLock): T[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return list.filter((item) => item?.id === lock.indexPatternId);
}

/**
 * 历史查询记录里会改变「查到哪个索引」的字段。
 *
 * 官方 QUERY_CACHE_PICK_KEYS 把 mode / index / index_pattern / date_field 一起存进
 * localStorage，且该缓存按数据源分组、与全局日志分析入口共享。用户在日志分析里查过
 * `trade*`，回到服务页点一条历史记录就会把索引换掉，因此锁定态必须剔除这些字段。
 */
export const LOCKED_QUERY_STRIP_KEYS = ['mode', 'index', 'index_pattern', 'date_field', 'allow_hide_system_indices', 'cross_cluster_enabled', 'sql'] as const;

/**
 * 锁定态下清洗「待回填到表单」的 query 对象：剔除查询目标相关字段，并挡掉 SQL 语法
 * （SQL 可以自己写 FROM，等于绕过索引锁定）。返回新对象，不改入参。
 */
export function stripLockedQueryKeys<T extends Record<string, unknown>>(query: T): Partial<T> {
  if (query == null || typeof query !== 'object') {
    return {} as Partial<T>;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if ((LOCKED_QUERY_STRIP_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    if (key === 'syntax' && value === 'sql') {
      continue;
    }
    next[key] = value;
  }
  return next as Partial<T>;
}
