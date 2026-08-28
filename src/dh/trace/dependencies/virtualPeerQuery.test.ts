import type { TraceResponse } from '@/pages/traceCpt/type';
import { searchTraces } from '../api';
import type { PharosServiceEdge } from '../contract';
import { fetchPeerMetasForGraph, fetchVirtualPeerMeta, PEER_CLIENT_LIMIT } from './virtualPeerQuery';

jest.mock('../api', () => ({
  searchTraces: jest.fn(),
}));

const mockedSearch = searchTraces as jest.MockedFunction<typeof searchTraces>;

function tags(pairs: Record<string, string | number | boolean>) {
  return Object.entries(pairs).map(([key, value]) => ({ key, value }));
}

function edge(client: string, server: string, requestCount: number, connectionType = 'database'): PharosServiceEdge {
  return { client, server, connectionType, requestCount, failedCount: 0, errorRate: 0 };
}

/** One trace with two emitters hitting the same shared mysql: the caller we asked for, and another team's service. */
function sharedMysqlTrace(): TraceResponse {
  return {
    traceID: 'shared',
    processes: {
      p0: { serviceName: 'turms-gateway', tags: [] },
      p1: { serviceName: 'nome-sec-admin', tags: [] },
    },
    spans: [
      {
        spanID: 'gateway-sql',
        traceID: 'shared',
        processID: 'p0',
        operationName: 'SELECT turms',
        startTime: 1,
        duration: 2,
        logs: [],
        flags: 0,
        tags: tags({ 'span.kind': 'client', 'db.system': 'mysql', 'db.statement': 'SELECT * FROM turms_user' }),
      },
      {
        spanID: 'admin-sql',
        traceID: 'shared',
        processID: 'p1',
        operationName: 'SELECT sec',
        startTime: 3,
        duration: 4,
        logs: [],
        flags: 0,
        tags: tags({ 'span.kind': 'client', 'db.system': 'mysql', 'db.statement': 'SELECT * FROM sec_secret' }),
      },
    ],
  };
}

function queriedServices(): string[] {
  return [...new Set(mockedSearch.mock.calls.map(([params]) => params.service))];
}

const baseInput = {
  dataSourceId: 7,
  pluginType: 'jaeger' as const,
  nodeName: 'mysql',
  startMs: 1_700_000_000_000,
  endMs: 1_700_000_060_000,
};

describe('fetchVirtualPeerMeta client whitelist', () => {
  it('never queries a caller outside the whitelist', async () => {
    mockedSearch.mockResolvedValue([]);

    const result = await fetchVirtualPeerMeta({
      ...baseInput,
      clients: ['nome-sec-admin', 'turms-gateway', 'other-team-job'],
      allowedServices: new Set(['turms-gateway']),
    });

    expect(result.queriedClients).toEqual(['turms-gateway']);
    expect(result.skippedClients).toEqual([]);
    expect(queriedServices()).toEqual(['turms-gateway']);
  });

  it('applies PEER_CLIENT_LIMIT after the whitelist, so invisible callers cannot eat the budget', async () => {
    mockedSearch.mockResolvedValue([]);
    const invisible = Array.from({ length: 12 }, (_, i) => `foreign-${i}`);
    const visible = Array.from({ length: PEER_CLIENT_LIMIT + 1 }, (_, i) => `mine-${i}`);

    const result = await fetchVirtualPeerMeta({
      ...baseInput,
      clients: [...invisible, ...visible],
      allowedServices: new Set(visible),
    });

    expect(result.queriedClients).toEqual(visible.slice(0, PEER_CLIENT_LIMIT));
    expect(result.skippedClients).toEqual([visible[PEER_CLIENT_LIMIT]]);
    expect(queriedServices()).toEqual(visible.slice(0, PEER_CLIENT_LIMIT));
  });

  it('fails closed when no whitelist entry matches: no trace query at all', async () => {
    mockedSearch.mockResolvedValue([]);

    const result = await fetchVirtualPeerMeta({
      ...baseInput,
      clients: ['turms-gateway', 'nome-sec-admin'],
      allowedServices: new Set<string>(),
    });

    expect(result.queriedClients).toEqual([]);
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(result.matchedSpans).toEqual([]);
  });

  it('keeps only spans emitted by whitelisted services out of a shared trace', async () => {
    mockedSearch.mockResolvedValue([sharedMysqlTrace()]);

    const result = await fetchVirtualPeerMeta({
      ...baseInput,
      clients: ['turms-gateway'],
      allowedServices: new Set(['turms-gateway']),
    });

    expect(result.matchedSpans.map((span) => span.service)).toEqual(['turms-gateway']);
    expect(result.curated.find((row) => row.id === 'statement')?.values).toEqual(['SELECT * FROM turms_user']);
  });
});

describe('fetchPeerMetasForGraph', () => {
  const edges = [
    edge('turms-gateway', 'mysql', 50),
    edge('nome-sec-admin', 'mysql', 90),
    edge('turms-gateway', 'order', 20, ''),
  ];

  it('only enriches from callers the user may see', async () => {
    mockedSearch.mockResolvedValue([]);

    const metas = await fetchPeerMetasForGraph({
      dataSourceId: 7,
      pluginType: 'jaeger',
      edges,
      startMs: baseInput.startMs,
      endMs: baseInput.endMs,
      allowedServices: new Set(['turms-gateway', 'order']),
    });

    expect(metas.get('mysql')?.queriedClients).toEqual(['turms-gateway']);
    expect(queriedServices()).toEqual(['turms-gateway']);
  });

  it('issues no trace query when the whitelist is empty', async () => {
    mockedSearch.mockResolvedValue([]);

    await fetchPeerMetasForGraph({
      dataSourceId: 7,
      pluginType: 'jaeger',
      edges,
      startMs: baseInput.startMs,
      endMs: baseInput.endMs,
      allowedServices: new Set<string>(),
    });

    expect(mockedSearch).not.toHaveBeenCalled();
  });
});
