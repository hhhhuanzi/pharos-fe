import { Field } from '@/pages/logExplorer/types';
import groupFields from '@/dh/fieldsSidebar/groupFields';
import { PopularCounts } from '@/dh/fieldsSidebar/popularFields';

export interface ResolveDefaultColumnsParams {
  /** 索引里能选的候选字段名（来自 `getFields`/`_mapping`），供「常用字段」排序/筛选使用 */
  fieldOptions: string[];
  /** 本次查询结果样本里实际出现过的叶子字段路径，来自 `ctx.resultFields`；undefined 表示还没有样本 */
  resultFields?: string[];
  /** 当前 scope（datasourceValue + index）下用户把哪些字段加入过「显示字段」的频次 */
  popularCounts: PopularCounts;
  /** 强制包含的基线列（页面当前的时间字段 + 日志正文字段），不受结果样本过滤——用户默认应该总能拿到这两列 */
  presetColumns: string[];
}

/**
 * 导出弹窗「导出字段」的默认值：不再要求用户手动选列或勾选「全部字段」，
 * 而是直接复用字段侧栏（`src/dh/fieldsSidebar`）同一套「常用字段」判定——
 * 内置推荐词表（`recommendedFields`）∪ 用户自定义常用字段（`popularFields`），
 * 有结果样本时还会与样本做交集，排掉 mapping 里存在但这次查询用不上的噪音字段
 * （见 `groupFields.ts` 的 `popular` 分组，逻辑与判定口径完全一致，不重复实现）。
 *
 * `presetColumns`（时间字段 + 日志正文字段）不参与样本交集：这两列几乎总有值，
 * 万一恰好不在样本或推荐词表命中范围内，也不应该从默认导出列里消失。
 */
export function resolveDefaultColumns(params: ResolveDefaultColumnsParams): string[] {
  const { fieldOptions, resultFields, popularCounts, presetColumns } = params;
  const fields: Field[] = fieldOptions.map((field) => ({ field, indexable: true, type: 'string' }));
  const groups = groupFields({ fields, popularCounts, resultFields });

  const merged = [...presetColumns.filter(Boolean), ...groups.popular.map((item) => item.field)];
  return Array.from(new Set(merged));
}
