import { csvHeader, formatCellValue, rowsToCsvChunk, sanitizeCsvCell, toCsvField } from './csv';

describe('sanitizeCsvCell', () => {
  it('prefixes = with a single quote (formula injection)', () => {
    expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
  });

  it('prefixes + with a single quote (formula injection)', () => {
    expect(sanitizeCsvCell('+cmd')).toBe("'+cmd");
  });

  it('prefixes - with a single quote (formula injection)', () => {
    expect(sanitizeCsvCell('-1+1')).toBe("'-1+1");
  });

  it('prefixes @ with a single quote (formula injection)', () => {
    expect(sanitizeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('prefixes leading tab / CR with a single quote', () => {
    expect(sanitizeCsvCell('\tfoo').startsWith("'")).toBe(true);
    expect(sanitizeCsvCell('\rfoo').startsWith("'")).toBe(true);
  });

  it('也会给负数加引号前缀 —— 这是已知的可接受副作用：宁可误伤 -1，也不能放过 -1+cmd|\'/c calc\'!A1', () => {
    expect(sanitizeCsvCell('-1')).toBe("'-1");
  });
});

describe('formatCellValue', () => {
  it('null -> empty string, not "null"', () => {
    expect(formatCellValue(null)).toBe('');
  });

  it('undefined -> empty string', () => {
    expect(formatCellValue(undefined)).toBe('');
  });

  it('number 0 -> "0", not falsy-empty', () => {
    expect(formatCellValue(0)).toBe('0');
  });

  it('boolean false -> "false"', () => {
    expect(formatCellValue(false)).toBe('false');
  });

  it('nested object -> JSON string', () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}');
  });

  it('array -> JSON string', () => {
    expect(formatCellValue([1, 2])).toBe('[1,2]');
  });
});

describe('toCsvField', () => {
  it('escapes double quotes', () => {
    expect(toCsvField('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('wraps comma-containing values without breaking columns', () => {
    expect(toCsvField('a,b,c')).toBe('"a,b,c"');
  });

  it('preserves newlines inside quoted field without breaking rows', () => {
    expect(toCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('sanitizes formula injection then quotes', () => {
    expect(toCsvField('=1+1')).toBe('"\'=1+1"');
  });

  it('null -> empty quoted field', () => {
    expect(toCsvField(null)).toBe('""');
  });

  it('undefined -> empty quoted field', () => {
    expect(toCsvField(undefined)).toBe('""');
  });

  it('number 0 -> "0"', () => {
    expect(toCsvField(0)).toBe('"0"');
  });

  it('nested object -> escaped JSON string', () => {
    expect(toCsvField({ a: 1 })).toBe('"{""a"":1}"');
  });
});

describe('rowsToCsvChunk', () => {
  it('aligns missing fields to empty cell without shifting columns', () => {
    const rows = [{ a: 1 }] as const;
    const columns = ['a', 'b'];
    expect(rowsToCsvChunk(rows as unknown as Record<string, unknown>[], columns)).toBe('"1",""\r\n');
  });

  it('orders cells by the given columns, not object key order', () => {
    const rows = [{ a: 1, b: 2 }] as const;
    const columns = ['b', 'a'];
    expect(rowsToCsvChunk(rows as unknown as Record<string, unknown>[], columns)).toBe('"2","1"\r\n');
  });
});

describe('csvHeader', () => {
  it('escapes column names that contain commas', () => {
    expect(csvHeader(['a,b', 'c'])).toBe('"a,b","c"\r\n');
  });
});
