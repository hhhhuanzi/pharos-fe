/**
 * Pointwise sum of several series. Same timestamps add; a timestamp that only some series
 * carry is still included (the missing ones contribute 0). Does not mutate the input.
 */
export function sumSeriesAtTimestamps(series: Array<{ points: Array<[number, number]> }>): Array<[number, number]> {
  const totals = new Map<number, number>();
  series.forEach((item) => {
    item.points.forEach(([ts, value]) => {
      if (!Number.isFinite(ts) || !Number.isFinite(value)) return;
      totals.set(ts, (totals.get(ts) ?? 0) + value);
    });
  });
  return [...totals.entries()].sort((left, right) => left[0] - right[0]);
}

export interface MonitoringAllOmitable {
  emphasis?: 'all';
  reference?: string;
}

/**
 * All means "every pod together". One measured peer makes All a duplicate stroke and a stacked
 * fill — keep the named pod (it is the actual replica). Keep All when it is the only reading, or
 * when two or more peers make a total worth drawing.
 */
export function omitRedundantAllSeries<T extends MonitoringAllOmitable>(series: T[]): T[] {
  const peers = series.filter((item) => item.reference === undefined && item.emphasis !== 'all');
  if (peers.length !== 1) return series;
  return series.filter((item) => item.emphasis !== 'all');
}
