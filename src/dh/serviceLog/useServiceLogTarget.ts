import { useEffect, useRef, useState } from 'react';

import { fetchMonitoringScopes } from '@/dh/service/monitoring/api';
import { timeRangeUnix } from '@/components/TimeRangePicker';
import { getESIndexPatterns } from '@/pages/log/IndexPatterns/services';

import {
  buildServiceLogIndexPatternName,
  hasAmbiguousNamespaces,
  matchIndexPattern,
  pickNamespace,
  uniqueNamespaces,
  type IndexPatternCandidate,
} from './indexPattern';
import { buildServiceLogFormValues, type ServiceLogFormValues } from './resolve';

export interface UseServiceLogTargetInput {
  service?: string;
  env?: string;
  namespace?: string;
  associationNamespaces?: string[];
  associationReady: boolean;
  promId?: number;
}

export type ServiceLogTargetStatus = 'loading' | 'ready' | 'missing_scope' | 'ambiguous_namespace' | 'pattern_missing' | 'error';

export interface ServiceLogTargetState {
  status: ServiceLogTargetStatus;
  formValues?: ServiceLogFormValues;
  indexPatternName?: string;
}

async function resolveNamespaceFromMetrics(promId: number, service: string): Promise<string[] | undefined> {
  try {
    const { end } = timeRangeUnix({ start: 'now-1h', end: 'now' });
    const scopes = await fetchMonitoringScopes(promId, service, end);
    return uniqueNamespaces(scopes.map((item) => item.namespace ?? ''));
  } catch {
    return undefined;
  }
}

export function useServiceLogTarget(input: UseServiceLogTargetInput): ServiceLogTargetState {
  const [state, setState] = useState<ServiceLogTargetState>({ status: 'loading' });
  const seqRef = useRef(0);

  const service = typeof input.service === 'string' ? input.service.trim() : '';
  const env = typeof input.env === 'string' ? input.env.trim() : '';
  const urlNamespace = typeof input.namespace === 'string' ? input.namespace.trim() : '';
  const associationNamespaces = input.associationNamespaces;
  const associationReady = input.associationReady;
  const promId = input.promId;
  const associationKey = Array.isArray(associationNamespaces) ? associationNamespaces.join('\0') : '';

  useEffect(() => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;

    if (!env) {
      setState({ status: 'missing_scope' });
      return;
    }

    if (!urlNamespace && !associationReady) {
      setState({ status: 'loading' });
      return;
    }

    if (hasAmbiguousNamespaces(urlNamespace, associationNamespaces)) {
      setState({ status: 'ambiguous_namespace' });
      return;
    }

    const run = async () => {
      let namespace = pickNamespace(urlNamespace, associationNamespaces);
      if (!namespace && promId != null && service) {
        const fromMetrics = await resolveNamespaceFromMetrics(promId, service);
        if (seqRef.current !== seq) return;
        if (fromMetrics && fromMetrics.length > 1) {
          setState({ status: 'ambiguous_namespace' });
          return;
        }
        namespace = fromMetrics?.[0];
      }

      const indexPatternName = buildServiceLogIndexPatternName(namespace, env);
      if (!indexPatternName) {
        setState({ status: 'missing_scope' });
        return;
      }

      setState({ status: 'loading', indexPatternName });
      try {
        const list = (await getESIndexPatterns()) as IndexPatternCandidate[];
        if (seqRef.current !== seq) return;
        const pattern = matchIndexPattern(Array.isArray(list) ? list : [], indexPatternName);
        const formValues = buildServiceLogFormValues(pattern, service);
        if (!formValues) {
          setState({ status: 'pattern_missing', indexPatternName });
          return;
        }
        setState({ status: 'ready', formValues, indexPatternName });
      } catch {
        if (seqRef.current !== seq) return;
        setState({ status: 'error', indexPatternName });
      }
    };

    void run();
  }, [service, env, urlNamespace, associationReady, promId, associationKey]);

  return state;
}
