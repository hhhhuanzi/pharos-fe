/*
 * Copyright 2022 Nightingale Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */
import {
  getTraceServices as getUnifiedTraceServices,
  getTraceOperations as getUnifiedTraceOperations,
  getTraceInstances as getUnifiedTraceInstances,
  searchTraces as searchUnifiedTraces,
  searchTracesPaged as searchUnifiedTracesPaged,
  getTraceByID as getUnifiedTraceByID,
  getTraceDependencies as getUnifiedTraceDependencies,
  TracePluginType,
} from '@/dh/trace';
import type { TracePageResult } from '@/dh/trace';
import { SearchTraceType, SearchTraceIDType } from './type';

export type { TracePluginType, TracePageResult };

function pluginTypeOf(data: { plugin_type?: TracePluginType }): TracePluginType {
  return data.plugin_type || 'jaeger';
}

/**
 * Returns service options: { label, value, id? }
 * - Jaeger: value = service name
 * - SkyWalking: value/id = service id, label = name
 */
export const getTraceServices = async (
  data_source_id: number,
  plugin_type: TracePluginType = 'jaeger',
  startMs?: number,
  endMs?: number,
) => {
  const end = endMs ?? Date.now();
  const start = startMs ?? end - 12 * 60 * 60 * 1000;
  return getUnifiedTraceServices(plugin_type, data_source_id, { start, end });
};

export const getTraceOperation = async (
  data_source_id: number,
  service: string,
  plugin_type: TracePluginType = 'jaeger',
  startMs?: number,
  endMs?: number,
) => {
  const end = endMs ?? Date.now();
  const start = startMs ?? end - 12 * 60 * 60 * 1000;
  // For SkyWalking, `service` param from UI is already the service id (Select value)
  return getUnifiedTraceOperations(plugin_type, data_source_id, service, { start, end });
};

/**
 * Returns instance options for the given service: { label, value }
 * - SkyWalking: value = instance id, label = instance name (e.g. `instanceUUID@ip`)
 * - Jaeger/OTel: no instance-level query support, returns []
 */
export const getTraceInstances = async (
  data_source_id: number,
  service: string,
  plugin_type: TracePluginType = 'jaeger',
  startMs?: number,
  endMs?: number,
) => {
  const end = endMs ?? Date.now();
  const start = startMs ?? end - 12 * 60 * 60 * 1000;
  return getUnifiedTraceInstances(plugin_type, data_source_id, service, { start, end });
};

export const getTraceSearch = (data: SearchTraceType & { plugin_type?: TracePluginType }) => {
  return searchUnifiedTraces({
    data_source_id: data.data_source_id,
    plugin_type: pluginTypeOf(data),
    service: data.service,
    operation: data.operation,
    instance: data.instance,
    start_time_min: data.start_time_min,
    start_time_max: data.start_time_max,
    attributes: (data.attributes as unknown as Record<string, string>) || null,
    duration_max: data.duration_max,
    duration_min: data.duration_min,
    num_traces: data.num_traces,
  });
};

/**
 * Paginated full-trace list query (currently SkyWalking). Each page returns full traces
 * (with spans) so list rows can show span count / services, plus a `hasMore` flag for "load more".
 */
export const getTracePagedSearch = (
  data: SearchTraceType & { plugin_type?: TracePluginType; page_num?: number; page_size?: number },
): Promise<TracePageResult> => {
  return searchUnifiedTracesPaged({
    data_source_id: data.data_source_id,
    plugin_type: pluginTypeOf(data),
    service: data.service,
    service_name: data.service_name,
    operation: data.operation,
    instance: data.instance,
    start_time_min: data.start_time_min,
    start_time_max: data.start_time_max,
    attributes: (data.attributes as unknown as Record<string, string>) || null,
    duration_max: data.duration_max,
    duration_min: data.duration_min,
    page_num: data.page_num,
    page_size: data.page_size,
  });
};

export const getTraceByID = (data: SearchTraceIDType & { plugin_type?: TracePluginType }) => {
  return getUnifiedTraceByID({
    data_source_id: data.data_source_id,
    traceID: data.traceID,
    plugin_type: pluginTypeOf(data),
  });
};

export const getTraceDependencies = (id: number, plugin_type: TracePluginType = 'jaeger') => {
  return getUnifiedTraceDependencies(plugin_type, id);
};
