import type { TracePluginType } from '@/dh/trace';

import { LOG_TRACE_TARGET_CATES } from './constants';

export interface TraceDatasourceTarget {
  id: number;
  name: string;
  pluginType: TracePluginType;
}

type GroupedDatasourceList = {
  [index: string]: { id: number; name: string; plugin_type: string }[];
};

/**
 * 日志 → 链路数据源的映射：
 * 候选只取 LOG_TRACE_TARGET_CATES 里的类型（本期只有 Jaeger）。
 * 记住过选择就只给那一个，否则给全部——只有一个时等价于自动选中，多个时由用户在跳转入口里选。
 */
export function getTraceDatasourceTargets(groupedDatasourceList: GroupedDatasourceList, rememberedDatasourceId?: number): TraceDatasourceTarget[] {
  const targets: TraceDatasourceTarget[] = [];
  LOG_TRACE_TARGET_CATES.forEach((cate) => {
    (groupedDatasourceList[cate] || []).forEach((item) => {
      targets.push({ id: item.id, name: item.name, pluginType: cate });
    });
  });

  if (rememberedDatasourceId !== undefined) {
    const remembered = targets.find((item) => item.id === rememberedDatasourceId);
    if (remembered) return [remembered];
  }
  return targets;
}
