import { getPromData } from '@/components/PromGraphCpt/services';
import { fetchHistoryInstantBatch, fetchHistoryRangeBatch } from '@/services/dashboardV2';
import { N9E_PATHNAME } from '@/utils/constant';

import {
  buildInstantBatchPayload,
  buildRangeBatchPayload,
  zipInstantBatchResult,
  zipRangeBatchResult,
  type MonitoringInstantQuery,
  type MonitoringQueryResult,
  type MonitoringRangeQuery,
} from './query';
import { buildScopeDiscoveryQuery, parseScopeOptions, type MonitoringScopeOption } from './scope';

/**
 * One request per section instead of one per panel. `signalKey` aborts the section's previous
 * in-flight request, so changing the time range does not leave stale responses racing.
 */
export async function fetchMonitoringRangeBatch(
  datasourceId: number,
  queries: MonitoringRangeQuery[],
  startUnix: number,
  endUnix: number,
  step: number,
  signalKey: string,
): Promise<MonitoringQueryResult[]> {
  if (!queries.length) return [];
  const res = await fetchHistoryRangeBatch(buildRangeBatchPayload(datasourceId, queries, startUnix, endUnix, step), signalKey);
  return zipRangeBatchResult(queries, res?.dat);
}

export async function fetchMonitoringInstantBatch(
  datasourceId: number,
  queries: MonitoringInstantQuery[],
  timeUnix: number,
  signalKey: string,
): Promise<MonitoringQueryResult[]> {
  if (!queries.length) return [];
  const res = await fetchHistoryInstantBatch(buildInstantBatchPayload(datasourceId, queries, timeUnix), signalKey);
  return zipInstantBatchResult(queries, res?.dat);
}

export async function fetchMonitoringScopes(datasourceId: number, service: string, endUnix: number): Promise<MonitoringScopeOption[]> {
  const data = await getPromData(`/api/${N9E_PATHNAME}/proxy/${datasourceId}/api/v1/query`, {
    query: buildScopeDiscoveryQuery(service),
    time: endUnix,
  });
  const result = data?.result;
  return parseScopeOptions(Array.isArray(result) ? result : []);
}
