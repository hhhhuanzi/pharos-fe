import { CONFIG_STORAGE_KEY, DEFAULT_TRACE_ID_FIELDS } from './constants';

export interface LogExplorerTarget {
  datasourceId: number;
  indexPattern?: number;
  index?: string;
}

export interface LogTraceConfig {
  /** 识别为链路 ID 的字段名，比较时忽略大小写与 `_` `-` `.` */
  traceIdFields: string[];
  /**
   * 跳转使用的链路数据源。只有一个候选数据源时不需要它；
   * 有多个时用户在跳转入口里选一次，选中的会记在这里，之后直接用。
   */
  traceDatasourceId?: number;
  /** 链路 → 日志：ES 数据源 ID（「数据源」页） */
  logDatasourceId?: number;
  /** 链路 → 日志：索引模式 ID（「日志 → 索引模式」页）；与 logIndex 至少填一个 */
  logIndexPattern?: number;
  /** 链路 → 日志：原始索引名；有 logIndexPattern 时优先用模式 */
  logIndex?: string;
}

const DEFAULT_CONFIG: LogTraceConfig = {
  traceIdFields: DEFAULT_TRACE_ID_FIELDS,
};

/**
 * 读取二开本地配置。不新增后端接口与表，用户也可在浏览器控制台直接改：
 * localStorage.setItem('n9e-dh-log-trace-config', JSON.stringify({
 *   traceIdFields: ['trace_id', 'my_tid'],
 *   logDatasourceId: 1,
 *   logIndexPattern: 2,
 * }))
 */
export function getLogTraceConfig(): LogTraceConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LogTraceConfig>;
    const traceIdFields = Array.isArray(parsed.traceIdFields) ? parsed.traceIdFields.filter((item) => typeof item === 'string' && !!item) : [];
    const logIndex = typeof parsed.logIndex === 'string' ? parsed.logIndex.trim() : '';
    return {
      traceIdFields: traceIdFields.length > 0 ? traceIdFields : DEFAULT_TRACE_ID_FIELDS,
      traceDatasourceId: typeof parsed.traceDatasourceId === 'number' ? parsed.traceDatasourceId : undefined,
      logDatasourceId: typeof parsed.logDatasourceId === 'number' ? parsed.logDatasourceId : undefined,
      logIndexPattern: typeof parsed.logIndexPattern === 'number' ? parsed.logIndexPattern : undefined,
      logIndex: logIndex || undefined,
    };
  } catch (e) {
    console.warn('[dh/logTrace] invalid local config, fallback to defaults', e);
    return DEFAULT_CONFIG;
  }
}

/** 链路 → 日志要用的 ES 数据源 + 索引；缺任一侧就返回 null，调用方提示去配，不要空跳 */
export function getLogExplorerTarget(config: LogTraceConfig = getLogTraceConfig()): LogExplorerTarget | null {
  if (typeof config.logDatasourceId !== 'number' || !Number.isInteger(config.logDatasourceId) || config.logDatasourceId <= 0) {
    return null;
  }
  const hasPattern = typeof config.logIndexPattern === 'number' && Number.isInteger(config.logIndexPattern) && config.logIndexPattern > 0;
  const hasIndex = typeof config.logIndex === 'string' && !!config.logIndex;
  if (!hasPattern && !hasIndex) return null;
  return {
    datasourceId: config.logDatasourceId,
    indexPattern: hasPattern ? config.logIndexPattern : undefined,
    index: hasPattern ? undefined : config.logIndex,
  };
}

/** 记住用户这次实际跳转到的链路数据源，下次不再让他选 */
export function rememberTraceDatasourceId(datasourceId: number): void {
  try {
    const current = getLogTraceConfig();
    if (current.traceDatasourceId === datasourceId) return;
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify({ ...current, traceDatasourceId: datasourceId }));
  } catch (e) {
    console.warn('[dh/logTrace] failed to persist trace datasource choice', e);
  }
}
