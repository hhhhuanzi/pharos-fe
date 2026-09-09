import { mergeNodePositions } from './mergeNodePositions';

describe('mergeNodePositions', () => {
  it('未拖过的节点跟新布局走，拖过的 id 保住坐标', () => {
    const prev = [
      { id: 'source', position: { x: 10, y: 20 } },
      { id: 'filter-1', position: { x: 80, y: 90 } },
    ];
    const next = [
      { id: 'source', position: { x: 24, y: 32 } },
      { id: 'filter-1', position: { x: 220, y: 32 } },
      { id: 'filter-2', position: { x: 220, y: 200 } },
    ];

    expect(mergeNodePositions(prev, next, ['filter-1'])).toEqual([
      { id: 'source', position: { x: 24, y: 32 } },
      { id: 'filter-1', position: { x: 80, y: 90 } },
      { id: 'filter-2', position: { x: 220, y: 200 } },
    ]);
  });

  it('没有 draggedIds 时全部采用新坐标；已删除的 id 不再出现', () => {
    const prev = [
      { id: 'a', position: { x: 1, y: 2 }, dragging: true, width: 180, height: 60, positionAbsolute: { x: 11, y: 22 } },
      { id: 'gone', position: { x: 9, y: 9 } },
    ];
    const next = [{ id: 'a', position: { x: 0, y: 0 } }];

    expect(mergeNodePositions(prev, next)).toEqual([{ id: 'a', position: { x: 0, y: 0 } }]);
    expect(mergeNodePositions(prev, next, ['a'])).toEqual([{ id: 'a', position: { x: 1, y: 2 }, dragging: true, width: 180, height: 60, positionAbsolute: { x: 11, y: 22 } }]);
  });

  it('prev 为空时等于 next（初次布局）；多次 merge 幂等', () => {
    const next = [
      { id: 'source', position: { x: 24, y: 32 } },
      { id: 'channel-1', position: { x: 480, y: 32 } },
    ];
    const first = mergeNodePositions([], next);
    const second = mergeNodePositions(first, next);
    expect(first).toEqual(next);
    expect(second).toEqual(first);
  });
});
