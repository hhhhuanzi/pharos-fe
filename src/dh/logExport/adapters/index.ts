import { DatasourceCateEnum } from '@/utils/constant';

import { LogExportAdapter } from '../types';
import elasticsearch from './elasticsearch';

/**
 * 已支持导出的数据源注册表。
 *
 * 本期只做 Elasticsearch —— VictoriaLogs / Loki 不在本期范围内。
 * 保持注册表结构而不是把 ES 硬编码进调用方，是为了让将来接入新数据源时
 * 只需要「加一个 adapter 文件 + 这里加一行」，不动任何已有代码。
 */
const ADAPTERS: Partial<Record<DatasourceCateEnum, LogExportAdapter>> = {
  [DatasourceCateEnum.elasticsearch]: elasticsearch,
};

/** 返回 undefined 表示该数据源不支持导出，调用方据此隐藏菜单项 */
export function getLogExportAdapter(cate: DatasourceCateEnum): LogExportAdapter | undefined {
  return ADAPTERS[cate];
}

/** 供 LogExportMenuItem 判断是否渲染 */
export function isLogExportSupported(cate: DatasourceCateEnum): boolean {
  return ADAPTERS[cate] != null;
}
