import type { TraceKeyValuePair, TraceResponse, TraceSpanData } from '@/pages/traceCpt/type';

export type ServiceResourceFieldId = 'service_instance' | 'environment' | 'namespace' | 'host' | 'pod';

export interface ServiceResourceField {
  id: ServiceResourceFieldId;
  values: string[];
  sourceKeys: string[];
}

export const SERVICE_RESOURCE_FIELDS: ReadonlyArray<{ id: ServiceResourceFieldId; keys: readonly string[] }> = [
  { id: 'service_instance', keys: ['service.instance.id', 'service.instance'] },
  { id: 'environment', keys: ['deployment.environment.name', 'deployment.environment'] },
  { id: 'namespace', keys: ['service.namespace', 'k8s.namespace.name'] },
  { id: 'host', keys: ['host.name', 'k8s.node.name'] },
  { id: 'pod', keys: ['k8s.pod.name'] },
];

function stringifyTagValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function firstKeyedValue(tags: TraceKeyValuePair[] | undefined, keys: readonly string[]): { key: string; value: string } | undefined {
  if (!tags || tags.length === 0) return undefined;
  for (const key of keys) {
    const hit = tags.find((tag) => tag.key === key);
    if (hit == null) continue;
    const text = stringifyTagValue(hit.value);
    if (!text) continue;
    return { key, value: text };
  }
  return undefined;
}

function tagsOf(span: TraceSpanData, trace: TraceResponse): TraceKeyValuePair[] {
  const processTags = trace.processes?.[span.processID]?.tags || [];
  return [...processTags, ...(span.tags || [])];
}

/**
 * Curate resource/process attributes from traces of an RPC service. Process tags first
 * (that's where OTel resource lives on Jaeger). Does not invent missing keys.
 */
export function aggregateServiceResources(traces: TraceResponse[]): ServiceResourceField[] {
  const values = new Map<ServiceResourceFieldId, Set<string>>();
  const keys = new Map<ServiceResourceFieldId, Set<string>>();

  traces.forEach((trace) => {
    (trace.spans || []).forEach((span) => {
      const tags = tagsOf(span, trace);
      SERVICE_RESOURCE_FIELDS.forEach((field) => {
        const hit = firstKeyedValue(tags, field.keys);
        if (!hit) return;
        let valueSet = values.get(field.id);
        if (!valueSet) {
          valueSet = new Set<string>();
          values.set(field.id, valueSet);
        }
        valueSet.add(hit.value);
        let keySet = keys.get(field.id);
        if (!keySet) {
          keySet = new Set<string>();
          keys.set(field.id, keySet);
        }
        keySet.add(hit.key);
      });
    });
  });

  const curated: ServiceResourceField[] = [];
  SERVICE_RESOURCE_FIELDS.forEach((field) => {
    const fieldValues = [...(values.get(field.id) || [])].sort();
    if (fieldValues.length === 0) return;
    curated.push({
      id: field.id,
      values: fieldValues,
      sourceKeys: field.keys.filter((key) => keys.get(field.id)?.has(key)),
    });
  });
  return curated;
}
