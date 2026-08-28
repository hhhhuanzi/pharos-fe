export function sortBoardsByFavorite<T extends { id: number | string; update_at?: number }>(list: T[], favoriteIds: Set<number>): T[] {
  return [...list].sort((a, b) => {
    const af = favoriteIds.has(Number(a.id)) ? 0 : 1;
    const bf = favoriteIds.has(Number(b.id)) ? 0 : 1;
    if (af !== bf) return af - bf;
    return (b.update_at || 0) - (a.update_at || 0);
  });
}
