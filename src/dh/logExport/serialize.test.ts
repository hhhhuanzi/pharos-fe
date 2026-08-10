import { MAX_CELL_CHARS } from './constants';
import { guardRowValueSize, rowsToJsonlChunk, rowsToRawChunk } from './serialize';
import { LogRow } from './types';

describe('guardRowValueSize', () => {
  it('未命中上限时返回同一个引用，调用方可以用 !== 零成本判断是否发生过截断', () => {
    const row: LogRow = { a: '1', b: 'short value' } as const;
    expect(guardRowValueSize(row)).toBe(row);
  });

  it('截断超过 MAX_CELL_CHARS 的字符串字段，并保留原长度信息', () => {
    const huge = 'x'.repeat(MAX_CELL_CHARS + 100);
    const row: LogRow = { message: huge, other: 'ok' };
    const guarded = guardRowValueSize(row);

    expect(guarded).not.toBe(row);
    expect((guarded.message as string).length).toBeLessThan(huge.length);
    expect((guarded.message as string).startsWith('x'.repeat(100))).toBe(true);
    expect((guarded.message as string).includes(`original length ${huge.length}`)).toBe(true);
    // 未超限的字段不受影响
    expect(guarded.other).toBe('ok');
  });

  it('恰好等于上限时不截断（边界值）', () => {
    const exact = 'x'.repeat(MAX_CELL_CHARS);
    const row: LogRow = { message: exact };
    expect(guardRowValueSize(row)).toBe(row);
  });

  it('非字符串值（数字/布尔/null）不受影响，即使数字很大也不会被当成字符串处理', () => {
    const row: LogRow = { count: 999999999999, ok: true, missing: null };
    expect(guardRowValueSize(row)).toBe(row);
  });

  it('同一行有多个超限字段时，逐个截断，互不影响', () => {
    const hugeA = 'a'.repeat(MAX_CELL_CHARS + 10000);
    const hugeB = 'b'.repeat(MAX_CELL_CHARS + 20000);
    const row: LogRow = { fieldA: hugeA, fieldB: hugeB, fieldC: 'ok' };
    const guarded = guardRowValueSize(row);

    expect((guarded.fieldA as string).length).toBeLessThan(hugeA.length);
    expect((guarded.fieldB as string).length).toBeLessThan(hugeB.length);
    expect(guarded.fieldC).toBe('ok');
  });
});

describe('guardRowValueSize 与序列化函数组合：截断必须在 CSV/JSONL/原始文本三种格式里都生效', () => {
  const huge = 'y'.repeat(MAX_CELL_CHARS + 10000);

  it('JSONL：截断后的行依然是合法 JSON，且体积远小于原始值', () => {
    const row = guardRowValueSize({ message: huge } as LogRow);
    const chunk = rowsToJsonlChunk([row]);
    expect(chunk.length).toBeLessThan(huge.length);
    expect(() => JSON.parse(chunk.trim())).not.toThrow();
  });

  it('原始日志：完整文档中的超大字段同样被截断', () => {
    const row = guardRowValueSize({ message: huge } as const);
    const chunk = rowsToRawChunk([row]);
    expect(chunk.length).toBeLessThan(huge.length);
    expect(() => JSON.parse(chunk.trim())).not.toThrow();
  });
});

describe('rowsToRawChunk', () => {
  it('文档有 message 字段时仍输出整份文档 JSON，不单独挑选 message', () => {
    const row = { message: 'service started', stream: 'stdout', host: { name: 'node-1' } } as const;

    expect(rowsToRawChunk([row])).toBe(`${JSON.stringify(row)}\n`);
  });

  it('文档没有 message 字段时也输出整份文档 JSON', () => {
    const row = { log: 'real log line', 'kubernetes.pod_name': 'dolphinscheduler-api-6d6887bf6f-744dr' } as const;

    expect(rowsToRawChunk([row])).toBe(`${JSON.stringify(row)}\n`);
  });
});
