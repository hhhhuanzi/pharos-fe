import type { TracePluginType } from '@/dh/trace';

import { getLogExplorerTarget, getLogTraceConfig } from './config';
import { LOG_DATASOURCE_CATE, LOG_EXPLORER_PATH, LOG_TIME_BUFFER_MS, LOG_TRACE_ID_FIELD, LOG_TRACE_TARGET_CATES, TRACE_EXPLORER_PATH } from './constants';

export interface TraceDeepLink {
  traceId?: string;
  datasourceId?: number;
  pluginType?: TracePluginType;
}

export interface LogDeepLinkParams {
  traceId: string;
  startMs: number;
  endMs: number;
  datasourceId: number;
  indexPattern?: number;
  index?: string;
}

/** 只对 Jaeger（LOG_TRACE_TARGET_CATES）开链路 → 日志；SkyWalking 不假装能跳 */
export function isLogJumpEnabled(pluginType?: string): boolean {
  return !!pluginType && LOG_TRACE_TARGET_CATES.includes(pluginType as TracePluginType);
}

/** 生成链路探索页直达地址（不带 basePrefix，由调用方或官方 handleNav 补齐） */
export function buildTraceDeepLink(params: { traceId: string; datasourceId: number; pluginType: TracePluginType }): string {
  const search = new URLSearchParams({
    traceId: params.traceId,
    datasourceValue: String(params.datasourceId),
    pluginType: params.pluginType,
  });
  return `${TRACE_EXPLORER_PATH}?${search.toString()}`;
}

/**
 * 链路起止（微秒）扩成日志 Explorer 的毫秒时间窗。
 * 列表用 start+duration，详情用整条 trace 起止，两侧都加同一缓冲。
 */
export function buildLogTimeWindow(startUs: number, durationUs: number, bufferMs = LOG_TIME_BUFFER_MS): { startMs: number; endMs: number } {
  const startMs = Math.floor(startUs / 1000) - bufferMs;
  const endMs = Math.ceil((startUs + Math.max(durationUs, 0)) / 1000) + bufferMs;
  const safeStart = Math.max(0, startMs);
  return {
    startMs: safeStart,
    endMs: Math.max(endMs, safeStart + 1),
  };
}

/** 生成日志 Explorer 直达地址（不带链路数据源 id，不按入口服务过滤） */
export function buildLogDeepLink(params: LogDeepLinkParams): string {
  const escapedTraceId = params.traceId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const search = new URLSearchParams({
    data_source_name: LOG_DATASOURCE_CATE,
    data_source_id: String(params.datasourceId),
    query: `${LOG_TRACE_ID_FIELD}:"${escapedTraceId}"`,
    start: String(params.startMs),
    end: String(params.endMs),
    __execute__: 'true',
  });
  if (params.indexPattern != null) {
    search.set('index_pattern', String(params.indexPattern));
  } else if (params.index) {
    search.set('index', params.index);
  }
  return `${LOG_EXPLORER_PATH}?${search.toString()}`;
}

/** 配齐 ES 数据源 + 索引后返回完整深链；缺配置返回 null，调用方提示，不要空跳 */
export function resolveLogDeepLink(params: { traceId: string; startUs: number; durationUs: number }): string | null {
  const target = getLogExplorerTarget(getLogTraceConfig());
  if (!target) return null;
  const { startMs, endMs } = buildLogTimeWindow(params.startUs, params.durationUs);
  return buildLogDeepLink({
    traceId: params.traceId,
    startMs,
    endMs,
    datasourceId: target.datasourceId,
    indexPattern: target.indexPattern,
    index: target.index,
  });
}

/** 解析链路探索页的直达参数，非法值一律忽略并退回页面默认行为 */
export function parseTraceDeepLink(search: string): TraceDeepLink {
  const params = new URLSearchParams(search);
  const traceId = params.get('traceId')?.trim();
  if (!traceId) return {};

  const datasourceValue = Number(params.get('datasourceValue'));
  const pluginType = params.get('pluginType') as TracePluginType | null;

  return {
    traceId,
    datasourceId: Number.isInteger(datasourceValue) && datasourceValue > 0 ? datasourceValue : undefined,
    pluginType: pluginType && LOG_TRACE_TARGET_CATES.includes(pluginType) ? pluginType : undefined,
  };
}
