import type { TracePluginType } from '@/dh/trace';

import { LOG_TRACE_TARGET_CATES, TRACE_EXPLORER_PATH } from './constants';

export interface TraceDeepLink {
  traceId?: string;
  datasourceId?: number;
  pluginType?: TracePluginType;
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
