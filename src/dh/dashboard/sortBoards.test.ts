import { sortBoardsByFavorite } from './sortBoards';

describe('sortBoardsByFavorite', () => {
  it('puts favorites first, then newer update_at', () => {
    const list = [
      { id: 1, update_at: 30 },
      { id: 2, update_at: 10 },
      { id: 3, update_at: 20 },
    ] as const;
    const sorted = sortBoardsByFavorite([...list], new Set([2, 3]));
    expect(sorted.map((item) => item.id)).toEqual([3, 2, 1]);
  });

  it('keeps update_at order when nothing is favorited', () => {
    const list = [
      { id: 1, update_at: 10 },
      { id: 2, update_at: 40 },
    ] as const;
    const sorted = sortBoardsByFavorite([...list], new Set());
    expect(sorted.map((item) => item.id)).toEqual([2, 1]);
  });
});
