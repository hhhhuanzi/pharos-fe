import {
  EVENTER_ERROR_METRIC,
  EVENTER_NORMAL_METRIC,
  applyLastSeen,
  buildEventerMatcher,
  buildEventerQueries,
  buildGlobalEventerMatcher,
  buildGlobalEventerQueries,
  buildServiceNameRegex,
  classifyPodEvent,
  countEventsByType,
  filterEventsByCategory,
  filterEventsByType,
  formatEventObject,
  lastSeenFromValues,
  mergeServiceEvents,
  samplesToEvents,
  sortEvents,
  summarizePodEvents,
  type K8sEvent,
} from './events';
import type { PromVectorSample } from '@/dh/trace/dependencies/promql';

function sample(metric: Record<string, string>, value: string): PromVectorSample {
  return { metric, value: [1_700_000_000, value] };
}

describe('buildServiceNameRegex', () => {
  it('matches the service and kube-generated suffixes', () => {
    expect(buildServiceNameRegex('order-api')).toBe('^order-api(-[a-z0-9]+)*$');
  });

  it('escapes regex metacharacters in the service name', () => {
    expect(buildServiceNameRegex('order.api')).toBe('^order\\.api(-[a-z0-9]+)*$');
  });
});

describe('buildEventerMatcher / buildEventerQueries', () => {
  it('always filters by service name and adds cluster / namespace when known', () => {
    expect(buildEventerMatcher({ service: 'order' })).toBe('{name=~"^order(-[a-z0-9]+)*$"}');
    expect(buildEventerMatcher({ service: 'order', clusters: ['prod'], namespaces: ['pay', 'core'] })).toBe(
      '{name=~"^order(-[a-z0-9]+)*$",namespace=~"pay|core",cluster=~"prod"}',
    );
  });

  it('uses the n9e dashboard eventer counters', () => {
    const q = buildEventerQueries({ service: 'order' }, '1h');
    expect(q.warning).toBe(`increase(${EVENTER_ERROR_METRIC}{name=~"^order(-[a-z0-9]+)*$"}[1h])`);
    expect(q.normal).toBe(`increase(${EVENTER_NORMAL_METRIC}{name=~"^order(-[a-z0-9]+)*$"}[1h])`);
  });
});

describe('samplesToEvents / mergeServiceEvents', () => {
  it('drops zero / NaN increases and maps dashboard labels', () => {
    const events = samplesToEvents(
      [
        sample({ reason: 'BackOff', kind: 'Pod', name: 'order-1', namespace: 'pay', cluster: 'prod' }, '2.2'),
        sample({ reason: 'Pulled', kind: 'Pod', name: 'order-1' }, '0'),
        sample({ reason: 'Failed', kind: 'Pod', name: 'order-1' }, 'NaN'),
      ],
      'warning',
    );
    expect(events).toEqual([
      {
        id: 'warning|prod|pay|Pod|order-1|BackOff',
        type: 'warning',
        reason: 'BackOff',
        kind: 'Pod',
        name: 'order-1',
        namespace: 'pay',
        cluster: 'prod',
        count: 3,
      },
    ]);
  });

  it('attaches lastSeen from the range series and sorts newest first', () => {
    const merged = mergeServiceEvents({
      warning: [sample({ reason: 'BackOff', kind: 'Pod', name: 'order-1' }, '2')],
      normal: [sample({ reason: 'Pulled', kind: 'Pod', name: 'order-1' }, '1')],
      warningRange: [
        {
          metric: { reason: 'BackOff', kind: 'Pod', name: 'order-1' },
          values: [
            [100, '0'],
            [200, '1.4'],
            [300, '0'],
          ],
        },
      ],
    });
    expect(merged.map((item) => item.reason)).toEqual(['BackOff', 'Pulled']);
    expect(merged[0].lastSeenUnix).toBe(200);
    expect(merged[1].lastSeenUnix).toBeUndefined();
  });
});

describe('lastSeenFromValues / applyLastSeen / sortEvents', () => {
  it('walks the series backwards for the last positive point', () => {
    expect(
      lastSeenFromValues([
        [1, '0'],
        [2, '0.8'],
        [3, '0'],
      ]),
    ).toBe(2);
    expect(lastSeenFromValues([[1, '0']])).toBeUndefined();
  });

  it('keeps events without a lastSeen and sorts by time then count', () => {
    const a = { id: 'a', type: 'warning', reason: 'A', kind: 'Pod', name: 'n', count: 1 } as const satisfies K8sEvent;
    const b = { id: 'b', type: 'warning', reason: 'B', kind: 'Pod', name: 'n', count: 9, lastSeenUnix: 10 } as const satisfies K8sEvent;
    const c = { id: 'c', type: 'normal', reason: 'C', kind: 'Pod', name: 'n', count: 2, lastSeenUnix: 10 } as const satisfies K8sEvent;
    expect(sortEvents(applyLastSeen([a, b, c], [{ key: 'a', lastSeenUnix: 20 }])).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildGlobalEventerMatcher / buildGlobalEventerQueries', () => {
  it('omits the matcher when nothing is filtered', () => {
    expect(buildGlobalEventerMatcher({})).toBe('');
    expect(buildGlobalEventerQueries({}, '1h')).toEqual({
      warning: `increase(${EVENTER_ERROR_METRIC}[1h])`,
      normal: `increase(${EVENTER_NORMAL_METRIC}[1h])`,
    });
  });

  it('reuses the service-name regex when a service filter is present', () => {
    expect(buildGlobalEventerMatcher({ service: 'order' })).toBe('{name=~"^order(-[a-z0-9]+)*$"}');
  });
});

describe('classifyPodEvent / summarizePodEvents / filterEventsByCategory', () => {
  it('classifies well-known pod reasons and ignores other kinds', () => {
    expect(classifyPodEvent({ kind: 'Pod', reason: 'Killing' })).toBe('restart');
    expect(classifyPodEvent({ kind: 'Pod', reason: 'BackOff' })).toBe('crash');
    expect(classifyPodEvent({ kind: 'Pod', reason: 'FailedScheduling' })).toBe('pending');
    expect(classifyPodEvent({ kind: 'Deployment', reason: 'Killing' })).toBeUndefined();
    expect(classifyPodEvent({ kind: 'Pod', reason: 'Pulled' })).toBeUndefined();
  });

  it('counts occurrences and distinct pods; missing collection stays 0', () => {
    expect(summarizePodEvents([])).toEqual({
      restart: { events: 0, occurrences: 0, pods: 0 },
      crash: { events: 0, occurrences: 0, pods: 0 },
      pending: { events: 0, occurrences: 0, pods: 0 },
    });

    const events = [
      { id: '1', type: 'normal', reason: 'Killing', kind: 'Pod', name: 'order-1', namespace: 'pay', count: 2 },
      { id: '2', type: 'normal', reason: 'Started', kind: 'Pod', name: 'order-1', namespace: 'pay', count: 2 },
      { id: '3', type: 'warning', reason: 'BackOff', kind: 'Pod', name: 'order-2', namespace: 'pay', count: 5 },
      { id: '4', type: 'warning', reason: 'FailedScheduling', kind: 'Pod', name: 'order-3', namespace: 'core', count: 1 },
      { id: '5', type: 'normal', reason: 'Pulled', kind: 'Pod', name: 'order-1', count: 3 },
    ] as const satisfies readonly K8sEvent[];

    expect(summarizePodEvents(events)).toEqual({
      restart: { events: 2, occurrences: 4, pods: 1 },
      crash: { events: 1, occurrences: 5, pods: 1 },
      pending: { events: 1, occurrences: 1, pods: 1 },
    });
    expect(filterEventsByCategory(events, 'crash')).toHaveLength(1);
    expect(filterEventsByCategory(events, 'all')).toHaveLength(5);
  });
});

describe('filterEventsByType / countEventsByType / formatEventObject', () => {
  const events = [
    { id: 'w', type: 'warning', reason: 'BackOff', kind: 'Pod', name: 'order-1', count: 2 },
    { id: 'n', type: 'normal', reason: 'Pulled', kind: 'Pod', name: 'order-1', count: 1 },
  ] as const satisfies readonly K8sEvent[];

  it('filters and counts rows, not occurrences', () => {
    expect(filterEventsByType(events, 'warning')).toHaveLength(1);
    expect(countEventsByType(events)).toEqual({ warning: 1, normal: 1 });
  });

  it('renders kind/name and falls back to —', () => {
    expect(formatEventObject(events[0])).toBe('Pod/order-1');
    expect(formatEventObject({ kind: '', name: '' })).toBe('—');
  });
});
