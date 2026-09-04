import { getPromData } from '@/components/PromGraphCpt/services';
import { N9E_PATHNAME } from '@/utils/constant';

import { pickSpanmetricsFamily, SPANMETRICS_NAME_MATCH, type SpanmetricsFamily } from './spanmetrics';

/**
 * Thanos aborts queries around 20s and a matcher-less spanmetrics selector fans out to every series
 * in the fleet, so which candidate names exist has to come from the index, never from an instant
 * vector. The match also covers `svc:*` recording rules; `pickSpanmetricsFamily` attaches them when
 * present and the catalog falls back to raw increase/rate when they are missing.
 */
const PROBE_URL_SUFFIX = 'api/v1/label/__name__/values';

/**
 * A wider range makes Thanos open older blocks for no extra information, so stay within a handful
 * of scrape intervals ending at the window the caller is already looking at.
 */
export const SPANMETRICS_PROBE_WINDOW_SECONDS = 600;

/** A service onboarded after the probe ran can add a family, so the result must expire. */
export const SPANMETRICS_PROBE_TTL_MS = 60_000;

interface ProbeEntry {
  promise: Promise<SpanmetricsFamily | undefined>;
  expiresAt: number;
}

const probeCache = new Map<number, ProbeEntry>();

export function resetSpanmetricsFamilyCache(): void {
  probeCache.clear();
}

async function fetchSpanmetricsNames(datasourceId: number, endUnix: number): Promise<string[]> {
  const data = await getPromData(`/api/${N9E_PATHNAME}/proxy/${datasourceId}/${PROBE_URL_SUFFIX}`, {
    'match[]': SPANMETRICS_NAME_MATCH,
    start: endUnix - SPANMETRICS_PROBE_WINDOW_SECONDS,
    end: endUnix,
  });
  if (!Array.isArray(data)) return [];
  return data.filter((name): name is string => typeof name === 'string' && name !== '');
}

/**
 * Shared by list, detail and top-series loaders.
 *
 * A failed probe rejects rather than resolving to `undefined`: RED has no second source any more,
 * so "Prometheus is unreachable" and "this Prometheus has no spanmetrics" must stay apart. The
 * first has to surface as a page error, the second legitimately leaves the RED columns blank.
 */
export function detectSpanmetricsFamily(datasourceId: number, endUnix: number): Promise<SpanmetricsFamily | undefined> {
  const now = Date.now();
  const cached = probeCache.get(datasourceId);
  if (cached && cached.expiresAt > now) return cached.promise;

  const entry: ProbeEntry = {
    expiresAt: now + SPANMETRICS_PROBE_TTL_MS,
    promise: fetchSpanmetricsNames(datasourceId, endUnix).then(pickSpanmetricsFamily),
  };
  /** Never cache a rejection, or one blip blanks RED for the whole TTL. */
  entry.promise.catch(() => {
    if (probeCache.get(datasourceId) === entry) probeCache.delete(datasourceId);
  });
  probeCache.set(datasourceId, entry);
  return entry.promise;
}
