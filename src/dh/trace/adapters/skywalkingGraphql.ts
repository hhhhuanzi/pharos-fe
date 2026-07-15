import request from '@/utils/request';
import { RequestMethod } from '@/store/common';
import { N9E_PATHNAME } from '@/utils/constant';

/** POST GraphQL body to SkyWalking OAP through N9E datasource proxy. */
export function graphqlRequest(dataSourceId: number, query: string, variables?: Record<string, unknown>): Promise<any> {
  return request(`/api/${N9E_PATHNAME}/proxy/${dataSourceId}/graphql`, {
    method: RequestMethod.Post,
    data: {
      query,
      variables,
    },
  }).then((res: { errors?: Array<{ message?: string }>; data?: any }) => {
    // proxy returns the upstream OAP GraphQL body as-is: { data, errors }
    if (res?.errors?.length) {
      const msg = res.errors.map((e) => e.message || JSON.stringify(e)).join('; ');
      return Promise.reject(new Error(msg));
    }
    return res?.data ?? res;
  });
}

/** Format ms timestamp to SkyWalking Duration string: yyyy-MM-dd HHmm (MINUTE step) */
export function toSwDurationTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/** Fixed MINUTE step so start/end format (yyyy-MM-dd HHmm) always matches OAP's Duration parser. */
export function buildDuration(startMs: number, endMs: number) {
  return {
    start: toSwDurationTime(startMs),
    end: toSwDurationTime(endMs),
    step: 'MINUTE' as const,
  };
}
