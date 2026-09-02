import { countLines, formatFullValue, isLongValue, previewValue, MIN_CHARS, MIN_LINES, PREVIEW_CHARS, PREVIEW_LINES } from './longValue';

describe('isLongValue', () => {
  it('takes a long single-line value, e.g. a big SQL statement', () => {
    expect(isLongValue('x'.repeat(MIN_CHARS))).toBe(true);
    expect(isLongValue('x'.repeat(MIN_CHARS - 1))).toBe(false);
  });

  it('takes a short but multi-line value, e.g. a truncated stack', () => {
    expect(isLongValue(Array(MIN_LINES).fill('at Foo.bar(Foo.java:1)').join('\n'))).toBe(true);
    expect(isLongValue(Array(MIN_LINES - 1).fill('at Foo.bar(Foo.java:1)').join('\n'))).toBe(false);
  });

  it('leaves ordinary tag values alone', () => {
    expect(isLongValue('SELECT conf10')).toBe(false);
    expect(isLongValue('mysql://172.22.17.18:3306')).toBe(false);
    expect(isLongValue('')).toBe(false);
  });

  it('ignores non-strings, since only strings hit the pre-wrap path', () => {
    expect(isLongValue(12345)).toBe(false);
    expect(isLongValue(null)).toBe(false);
    expect(isLongValue(undefined)).toBe(false);
    expect(isLongValue({ a: 'x'.repeat(MIN_CHARS) })).toBe(false);
  });

  it('matches the real exception.stacktrace that motivated this', () => {
    // 14,502 chars / 157 lines, trace 1145fbb7df34e3fcda54f21c97296ee9
    const stack = ['com.mysql.cj.jdbc.exceptions.CommunicationsException: The client was disconnected', ...Array(156).fill('\tat com.mysql.cj.jdbc.Foo.bar(Foo.java:165)')].join('\n');
    expect(isLongValue(stack)).toBe(true);
    expect(countLines(stack)).toBe(157);
  });
});

describe('previewValue', () => {
  it('keeps the first lines of a stack and marks it truncated', () => {
    const stack = ['CommunicationsException: disconnected', '\tat A.a(A.java:1)', '\tat B.b(B.java:2)', '\tat C.c(C.java:3)'].join('\n');
    const preview = previewValue(stack);
    expect(preview.truncated).toBe(true);
    expect(countLines(preview.text)).toBe(PREVIEW_LINES);
    expect(preview.text.startsWith('CommunicationsException: disconnected\n\tat A.a(A.java:1)')).toBe(true);
    expect(preview.text.endsWith('…')).toBe(true);
    expect(preview.text).not.toContain('C.c(C.java:3)');
  });

  it('falls back to a char cut when the value is one huge line, e.g. a 14KB JSON', () => {
    const json = `{"a":"${'x'.repeat(14000)}"}`;
    const preview = previewValue(json);
    expect(preview.truncated).toBe(true);
    expect(countLines(preview.text)).toBe(1);
    // PREVIEW_CHARS 个字符 + 省略号
    expect(preview.text).toHaveLength(PREVIEW_CHARS + 1);
    expect(preview.text.startsWith('{"a":"xxx')).toBe(true);
  });

  it('cuts by chars even when the line count is within budget', () => {
    const wide = [`a${'x'.repeat(PREVIEW_CHARS)}`, 'b', 'c'].join('\n');
    const preview = previewValue(wide);
    expect(preview.truncated).toBe(true);
    expect(preview.text).toHaveLength(PREVIEW_CHARS + 1);
  });

  it('returns the value untouched when it fits both budgets', () => {
    const short = 'CommunicationsException: disconnected\n\tat A.a(A.java:1)';
    expect(previewValue(short)).toEqual({ text: short, truncated: false });
  });

  it('does not leave dangling whitespace in front of the ellipsis', () => {
    const padded = ['line one', 'line two', 'line three   ', 'line four'].join('\n');
    expect(previewValue(padded).text.endsWith('line three…')).toBe(true);
  });

  it('honours explicit budgets', () => {
    expect(previewValue('a\nb\nc\nd', 1).text).toBe('a…');
    expect(previewValue('abcdef', PREVIEW_LINES, 3).text).toBe('abc…');
  });
});

describe('formatFullValue', () => {
  it('pretty-prints a JSON object so the modal is readable', () => {
    expect(formatFullValue('{"a":1,"b":{"c":2}}')).toBe(JSON.stringify({ a: 1, b: { c: 2 } }, null, 2));
  });

  it('pretty-prints a JSON array, and tolerates surrounding whitespace', () => {
    expect(formatFullValue('  [1,{"a":2}]  ')).toBe(JSON.stringify([1, { a: 2 }], null, 2));
  });

  it('leaves a stack trace alone', () => {
    const stack = 'CommunicationsException: disconnected\n\tat A.a(A.java:1)';
    expect(formatFullValue(stack)).toBe(stack);
  });

  it('leaves broken or non-object JSON-ish values alone', () => {
    expect(formatFullValue('{not json')).toBe('{not json');
    expect(formatFullValue('[1,2')).toBe('[1,2');
    expect(formatFullValue('12345')).toBe('12345');
    expect(formatFullValue('SELECT * FROM conf10')).toBe('SELECT * FROM conf10');
  });
});
