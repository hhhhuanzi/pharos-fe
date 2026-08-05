import { CONFIG_STORAGE_KEY, DEFAULT_TRACE_ID_FIELDS } from './constants';

export interface LogTraceConfig {
  /** 识别为链路 ID 的字段名，比较时忽略大小写与 `_` `-` `.` */
  traceIdFields: string[];
  /**
   * 跳转使用的链路数据源。只有一个候选数据源时不需要它；
   * 有多个时用户在跳转入口里选一次，选中的会记在这里，之后直接用。
   */
  traceDatasourceId?: number;
}

const DEFAULT_CONFIG: LogTraceConfig = {
  traceIdFields: DEFAULT_TRACE_ID_FIELDS,
};

/**
 * 读取二开本地配置。不新增后端接口与表，用户也可在浏览器控制台直接改：
 * localStorage.setItem('n9e-dh-log-trace-config', JSON.stringify({ traceIdFields: ['trace_id', 'my_tid'] }))
 */
export function getLogTraceConfig(): LogTraceConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LogTraceConfig>;
    const traceIdFields = Array.isArray(parsed.traceIdFields) ? parsed.traceIdFields.filter((item) => typeof item === 'string' && !!item) : [];
    return {
      traceIdFields: traceIdFields.length > 0 ? traceIdFields : DEFAULT_TRACE_ID_FIELDS,
      traceDatasourceId: typeof parsed.traceDatasourceId === 'number' ? parsed.traceDatasourceId : undefined,
    };
  } catch (e) {
    console.warn('[dh/logTrace] invalid local config, fallback to defaults', e);
    return DEFAULT_CONFIG;
  }
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
