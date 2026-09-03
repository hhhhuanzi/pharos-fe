/**
 * Shared trace query types. Adapters (skywalking / otel / jaeger) map backend
 * responses directly into the Jaeger `TraceResponse` consumed by traceCpt UI.
 */
import type { SearchTraceType, TraceResponse } from '@/pages/traceCpt/type';

export type TracePluginType = 'jaeger' | 'skywalking' | 'otel';

/**
 * 链路探索页内部的查询态。
 *
 * 在上游 `SearchTraceType` 上补 dh 独有的维度，而不是改上游类型：这个形状只在
 * `src/dh/trace/explorer/**` 之间流转（Search -> TraceExplorer -> TraceList），上游代码不消费它。
 */
export type TraceSearchState = SearchTraceType & {
  /** 环境维度收窄，口径见 `./env.ts`。全局页必填三档之一；详情页锁定态可为空（不加过滤）。 */
  env?: string;
};

export interface UnifiedKeyValue {
  key: string;
  value: string;
}

export interface UnifiedServiceOption {
  /** Display name */
  label: string;
  /** Value used in subsequent queries (Jaeger: name; SkyWalking: service id) */
  value: string;
  /** Optional group label (e.g. SkyWalking's `group::name` service auto-grouping). Datasources without grouping leave this undefined. */
  group?: string;
}

export interface TraceSearchParams {
  data_source_id: number;
  plugin_type: TracePluginType;
  service: string;
  operation?: string;
  start_time_min: number;
  start_time_max: number;
  /**
   * 环境维度收窄（`deployment.environment.name`）。后端把它折成 `query.attributes`，前端不自己拼
   * 属性名 —— 口径见 `./env.ts`。空值表示不过滤（软降级，仅详情页未带 identity.env 时），
   * 不是「过滤空环境」。全局探索页始终传 test / pre / prod 之一。
   */
  env?: string;
  attributes?: Record<string, string> | null;
  duration_max?: string;
  duration_min?: string;
  num_traces?: number;
  /** Optional service instance filter (e.g. SkyWalking `serviceInstanceId`); ignored by datasources without instance-level query support. */
  instance?: string;
  /** Display short name of the selected service (used to build the lightweight list `traceName`). */
  service_name?: string;
  /** 1-based page number for lightweight list pagination (SkyWalking `queryBasicTraces`). */
  page_num?: number;
  /** Page size for lightweight list pagination. */
  page_size?: number;
}

/**
 * A single page of full traces for the search result list.
 * The page's trace ids come from a cheap list query (e.g. SkyWalking `queryBasicTraces`),
 * then each trace on the page is fetched in full so the list row can show span count / services.
 */
export interface TracePageResult {
  /** Full traces (Jaeger-compatible `TraceResponse`) for the current page. */
  traces: TraceResponse[];
  /** True when the current page is full, i.e. there may be more pages to load. */
  hasMore: boolean;
}

export interface TraceByIdParams {
  data_source_id: number;
  plugin_type: TracePluginType;
  traceID: string;
}
