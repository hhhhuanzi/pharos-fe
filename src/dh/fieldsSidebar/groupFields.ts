import { Field } from '@/pages/logExplorer/types';

import { POPULAR_GROUP_MAX } from './constants';
import { PopularCounts } from './popularFields';
import getRecommendedRank from './recommendedFields';

export interface FieldGroups {
  /** 已加入表格列的字段，按列顺序排列 */
  selected: Field[];
  /** 用户高频使用的字段 + 命中内置推荐词表的字段 */
  popular: Field[];
  /** 在当前结果样本里有值的字段（结果未知时是全部字段） */
  available: Field[];
  /** 在当前结果样本里没有值的字段，默认折叠；结果未知时为空 */
  empty: Field[];
}

export interface GroupFieldsParams {
  fields: Field[];
  /** 已加入表格列的字段名，顺序即列顺序 */
  organizeFieldNames?: string[];
  /** 字段 -> 被加入「显示字段」的次数 */
  popularCounts?: PopularCounts;
  /** 当前结果样本里出现过的叶子字段路径；undefined 表示还没有结果 */
  resultFields?: string[];
  popularGroupMax?: number;
}

/**
 * 把 mapping 全量字段拆成四组。
 *
 * `resultFields` 是叶子路径，mapping 字段可能比它浅（`object` 类型）也可能比它深，
 * 所以这里把每个叶子路径的所有祖先前缀也加进「有值」集合，两个方向都能对上。
 */
function buildPresentSet(resultFields: string[]): Set<string> {
  const present = new Set<string>();
  resultFields.forEach((path) => {
    const segments = path.split('.');
    let prefix = '';
    segments.forEach((segment) => {
      prefix = prefix ? `${prefix}.${segment}` : segment;
      present.add(prefix);
    });
  });
  return present;
}

export default function groupFields(params: GroupFieldsParams): FieldGroups {
  const { fields, organizeFieldNames, popularCounts = {}, resultFields, popularGroupMax = POPULAR_GROUP_MAX } = params;

  const selectedNames = organizeFieldNames ?? [];
  const hasResultInfo = Array.isArray(resultFields) && resultFields.length > 0;
  const presentSet = hasResultInfo ? buildPresentSet(resultFields as string[]) : undefined;
  const isPresent = (field: Field) => (presentSet ? presentSet.has(field.field) : true);

  const selected: Field[] = [];
  const rest: Field[] = [];
  fields.forEach((item) => {
    if (selectedNames.includes(item.field)) {
      selected.push(item);
    } else {
      rest.push(item);
    }
  });
  // 与右侧表格列顺序保持一致，比字母序更符合直觉
  selected.sort((a, b) => selectedNames.indexOf(a.field) - selectedNames.indexOf(b.field));

  // 用户显式用过的字段优先，即使它在当前结果里没有值也保留（是明确的用户意图）
  const userPopular = rest
    .filter((item) => (popularCounts[item.field] ?? 0) > 0)
    .sort((a, b) => (popularCounts[b.field] ?? 0) - (popularCounts[a.field] ?? 0) || a.field.localeCompare(b.field));

  // 内置推荐字段：mapping 里几百个字段中总会有同名的噪音字段，所以有结果时要求它在结果里真的有值
  const recommended = rest
    .filter((item) => {
      if ((popularCounts[item.field] ?? 0) > 0) return false;
      if (getRecommendedRank(item.field) === undefined) return false;
      return isPresent(item);
    })
    .sort((a, b) => (getRecommendedRank(a.field) ?? 0) - (getRecommendedRank(b.field) ?? 0) || a.field.localeCompare(b.field));

  const popular = userPopular.concat(recommended).slice(0, popularGroupMax);
  const popularNames = new Set(popular.map((item) => item.field));

  const available: Field[] = [];
  const empty: Field[] = [];
  rest.forEach((item) => {
    if (popularNames.has(item.field)) return;
    if (hasResultInfo && !isPresent(item)) {
      empty.push(item);
    } else {
      available.push(item);
    }
  });

  return { selected, popular, available, empty };
}
