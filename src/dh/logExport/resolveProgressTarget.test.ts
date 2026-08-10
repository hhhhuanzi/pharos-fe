import { resolveProgressTarget } from './resolveProgressTarget';

describe('resolveProgressTarget', () => {
  it('total 未知（首批响应之前）时，退回请求条数作为分母', () => {
    expect(resolveProgressTarget(100000, undefined)).toBe(100000);
  });

  it('total 为 null 时同样视为未知', () => {
    expect(resolveProgressTarget(100000, null as unknown as undefined)).toBe(100000);
  });

  it('回归：用户反馈的真实场景——请求上限 10 万，真实命中 47059，分母应收窄为 47059', () => {
    expect(resolveProgressTarget(100000, 47059)).toBe(47059);
  });

  it('命中数超过请求上限时，分母仍封顶在请求上限（超出部分本来就不会被导出）', () => {
    expect(resolveProgressTarget(10000, 667153)).toBe(10000);
  });

  it('命中数恰好等于请求上限时，分母不变', () => {
    expect(resolveProgressTarget(100000, 100000)).toBe(100000);
  });

  it('命中数为 0（真实查询 0 条）时，分母收窄为 0 而不是被当成"未知"', () => {
    expect(resolveProgressTarget(100000, 0)).toBe(0);
  });
});
