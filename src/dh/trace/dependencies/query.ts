import { getPromData } from '@/components/PromGraphCpt/services';
import { N9E_PATHNAME } from '@/utils/constant';
import type { PharosServiceGraph } from '../contract';
import { buildServiceGraphQueries, mergeServiceGraphVectors, toPromRange, type PromVectorSample } from './promql';

export { buildServiceGraphQueries, edgeKey, mergeServiceGraphVectors, toPromRange, SERVICE_GRAPH_METRICS } from './promql';
export type { PromVectorSample } from './promql';

async function queryProm(datasourceId: number, query: string, time: number): Promise<PromVectorSample[]> {
  const data = await getPromData(`/api/${N9E_PATHNAME}/proxy/${datasourceId}/api/v1/query`, { query, time });
  const result = data?.result;
  return Array.isArray(result) ? result : [];
}

export async function fetchServiceGraph(datasourceId: number, startUnix: number, endUnix: number): Promise<PharosServiceGraph> {
  const range = toPromRange(Math.max(1, endUnix - startUnix));
  const queries = buildServiceGraphQueries(range);
  const [total, failed, p95] = await Promise.all([
    queryProm(datasourceId, queries.total, endUnix),
    queryProm(datasourceId, queries.failed, endUnix),
    queryProm(datasourceId, queries.p95, endUnix),
  ]);
  return { edges: mergeServiceGraphVectors({ total, failed, p95 }), source: 'service-graph' };
}
