import { BEZIER_MIN_DX, edgeBezierFans, getOffsetBezierPath } from './edgePath';
import { edgeKey } from './promql';
import type { PharosServiceEdge } from '../contract';

function edge(client: string, server: string, connectionType = ''): PharosServiceEdge {
  return { client, server, connectionType, requestCount: 1, failedCount: 0, errorRate: 0 };
}

function pathXs(path: string): number[] {
  const nums = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return [nums[0], nums[2], nums[4], nums[6]];
}

describe('getOffsetBezierPath', () => {
  it('stays a cubic bezier and bows the label when offset', () => {
    const [path, x0, y0] = getOffsetBezierPath({ sourceX: 0, sourceY: 10, targetX: 200, targetY: 10, offset: 0 });
    const [, , y1] = getOffsetBezierPath({ sourceX: 0, sourceY: 10, targetX: 200, targetY: 10, offset: 32 });
    expect(path).toContain('C');
    expect(path).not.toMatch(/[LHQ]/);
    expect(x0).toBeGreaterThan(0);
    expect(x0).toBeLessThan(200);
    expect(y1).toBeGreaterThan(y0);
  });

  it('keeps the bow inside the rank corridor instead of looping around a card', () => {
    const sourceX = 200;
    const targetX = 400;
    const [path, labelX] = getOffsetBezierPath({ sourceX, sourceY: 40, targetX, targetY: 40, offset: 8 });
    expect(path).toContain('C');
    expect(path).not.toMatch(/[LHQ]/);
    const xs = pathXs(path);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(sourceX - BEZIER_MIN_DX);
    expect(Math.max(...xs)).toBeLessThanOrEqual(targetX + BEZIER_MIN_DX);
    expect(labelX).toBeGreaterThan(sourceX);
    expect(labelX).toBeLessThan(targetX);
  });
});

describe('edgeBezierFans', () => {
  it('gives a lone inbound a zero offset', () => {
    const fans = edgeBezierFans([edge('web', 'auth')], new Map([
      ['web', 0],
      ['auth', 0],
    ]));
    expect(fans.get(edgeKey('web', 'auth', ''))).toEqual({ curvature: 0.35, offset: 0 });
  });

  it('spreads fan-in to the same sink by source Y', () => {
    const fans = edgeBezierFans(
      [edge('quote', 'redis', 'database'), edge('kline', 'redis', 'database'), edge('auth', 'redis', 'database')],
      new Map([
        ['quote', 0],
        ['kline', 80],
        ['auth', 160],
        ['redis', 80],
      ]),
    );
    const offsets = [
      fans.get(edgeKey('quote', 'redis', 'database'))!.offset,
      fans.get(edgeKey('kline', 'redis', 'database'))!.offset,
      fans.get(edgeKey('auth', 'redis', 'database'))!.offset,
    ];
    expect(offsets[0]).toBeLessThan(offsets[1]);
    expect(offsets[1]).toBeLessThan(offsets[2]);
    expect(new Set(offsets).size).toBe(3);
  });
});
