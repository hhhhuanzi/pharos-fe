/**
 * Jaeger adapter: thin wrappers over existing Jaeger HTTP APIs via N9E proxy.
 * Kept for symmetry with SkyWalking / future OTel adapters.
 */
import _ from 'lodash';
import request from '@/utils/request';
import { RequestMethod } from '@/store/common';
import { N9E_PATHNAME } from '@/utils/constant';
import { TraceByIdParams, TraceSearchParams, UnifiedServiceOption } from '../types';

export async function getJaegerServices(dataSourceId: number): Promise<UnifiedServiceOption[]> {
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/api/services`, {
    method: RequestMethod.Get,
  });
  const list: string[] = res.data || res || [];
  return list.map((name) => ({ label: name, value: name }));
}

export async function getJaegerOperations(dataSourceId: number, service: string): Promise<string[]> {
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/api/services/${service}/operations`, {
    method: RequestMethod.Get,
  });
  return res.data || res || [];
}

export async function searchJaegerTraces(params: TraceSearchParams) {
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${params.data_source_id}/api/traces`, {
    method: RequestMethod.Get,
    params: _.omit(params, ['data_source_id', 'plugin_type']),
  });
  return res.data || res || [];
}

export async function getJaegerTraceById(params: TraceByIdParams) {
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${params.data_source_id}/api/traces/${params.traceID}`, {
    method: RequestMethod.Get,
  });
  return res.data || res || [];
}

export async function getJaegerDependencies(dataSourceId: number) {
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/api/dependencies`, {
    method: RequestMethod.Get,
    params: {
      endTs: Date.now(),
      lookback: 86400000,
    },
  });
  return res.data || res || [];
}
