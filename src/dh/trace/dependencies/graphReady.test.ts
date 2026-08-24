import { freezeLayoutPositions } from './graphReady';

describe('freezeLayoutPositions', () => {
  it('keeps first x/y when traces only add height so fill-back cannot restack at 0,0', () => {
    const first = [
      { id: 'web', x: 40, y: 80 },
      { id: 'redis', x: 436, y: 80 },
    ];
    const afterTraces = [
      { id: 'web', x: 40, y: 80 },
      { id: 'redis', x: 430, y: 72 },
    ];
    expect(freezeLayoutPositions(first, afterTraces)).toEqual(first);
  });

  it('takes the new layout when the node set changes', () => {
    const first = [{ id: 'web', x: 40, y: 80 }];
    const next = [
      { id: 'web', x: 40, y: 80 },
      { id: 'redis', x: 436, y: 80 },
    ];
    expect(freezeLayoutPositions(first, next)).toEqual(next);
  });
});
