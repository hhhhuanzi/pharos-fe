import { useEffect, useRef, useState } from 'react';

import { getESIndexPatterns } from '@/pages/log/IndexPatterns/services';
import { isScopeCovered, toScopeSlug, useIndexPatternScope } from '@/dh/logPerm';
import { isValidTeamName } from '@/dh/serviceTeam/teamName';
import type { NamedTeam } from '@/dh/serviceTeam/types';

import { buildServiceLogIndexPatternName, matchIndexPattern, pickBoundTeam, type IndexPatternCandidate } from './indexPattern';
import { buildServiceLogFormValues, type ServiceLogFormValues } from './resolve';

export interface UseServiceLogTargetInput {
  service?: string;
  env?: string;
  teams?: NamedTeam[];
}

export type ServiceLogTargetStatus =
  | 'loading'
  | 'ready'
  | 'missing_env'
  | 'unbound'
  | 'ambiguous_team'
  | 'invalid_team_name'
  | 'pattern_missing'
  | 'pattern_forbidden'
  | 'error';

export interface ServiceLogTargetState {
  status: ServiceLogTargetStatus;
  formValues?: ServiceLogFormValues;
  indexPatternName?: string;
}

export function useServiceLogTarget(input: UseServiceLogTargetInput): ServiceLogTargetState {
  const [state, setState] = useState<ServiceLogTargetState>({ status: 'loading' });
  const seqRef = useRef(0);
  // 服务页把索引钉死后仍要判索引域权限：否则没被授权的用户也会拿到已填好 index 的表单，
  // 下拉被 logPerm 过滤成空但查询照样发得出去。
  const { unrestricted, grantedScopes } = useIndexPatternScope();
  const scopeKey = grantedScopes.join('\0');

  const service = typeof input.service === 'string' ? input.service.trim() : '';
  const env = typeof input.env === 'string' ? input.env.trim() : '';
  const teams = input.teams;
  const teamKey = Array.isArray(teams) ? teams.map((item) => `${item.id}:${item.name}`).join('\0') : '';

  useEffect(() => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;

    if (!env) {
      setState({ status: 'missing_env' });
      return;
    }

    const picked = pickBoundTeam(teams);
    if (picked.status === 'none') {
      setState({ status: 'unbound' });
      return;
    }
    if (picked.status === 'many') {
      setState({ status: 'ambiguous_team' });
      return;
    }
    if (!isValidTeamName(picked.name)) {
      setState({ status: 'invalid_team_name' });
      return;
    }

    const indexPatternName = buildServiceLogIndexPatternName(picked.name, env);
    if (!indexPatternName) {
      setState({ status: 'unbound' });
      return;
    }

    const run = async () => {
      setState({ status: 'loading', indexPatternName });
      try {
        const list = (await getESIndexPatterns()) as IndexPatternCandidate[];
        if (seqRef.current !== seq) return;
        const pattern = matchIndexPattern(Array.isArray(list) ? list : [], indexPatternName);
        if (pattern && !unrestricted && !isScopeCovered(toScopeSlug(pattern.name ?? ''), grantedScopes)) {
          setState({ status: 'pattern_forbidden', indexPatternName });
          return;
        }
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
  }, [service, env, teamKey, unrestricted, scopeKey]);

  return state;
}
