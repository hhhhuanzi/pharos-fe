import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { CommonStateContext } from '@/App';
import { parseServiceDetailLocation, pickLogToTraceUrl } from '@/dh/service';
import type { FieldConfigVersion2 } from '@/pages/log/IndexPatterns/types';

import { NS } from './constants';
import { getLogTraceConfig } from './config';
import { getTraceDatasourceTargets } from './traceDatasource';
import { isTraceIdField, normalizeTraceIdValue } from './traceId';

interface Params {
  /** 字段名 */
  name: string;
  /** 嵌套 JSON 的父级字段名，官方按父级过滤链接，会误伤兄弟字段，故嵌套场景不注入 */
  parentKey?: string;
  /** 完整字段值 */
  fieldValue: unknown;
}

/**
 * 把「查看链路」作为一条内置关联链接合进日志字段配置。
 *
 * 复用官方 index pattern 的字段链接（linkArr）机制：注入后字段值会自动带下划线与跳转图标，
 * 字段操作菜单里也会多出一项，无需再改日志表格与菜单组件。
 * 字段不是链路 ID、值为空/占位、或没有配置链路数据源时原样返回，不产生任何入口。
 */
export default function useTraceLinkFieldConfig(fieldConfig: FieldConfigVersion2 | undefined, params: Params): FieldConfigVersion2 | undefined {
  const { t } = useTranslation(NS);
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const location = useLocation();
  const { name, parentKey, fieldValue } = params;

  return useMemo(() => {
    if (parentKey) return fieldConfig;

    const config = getLogTraceConfig();
    if (!isTraceIdField(name, config.traceIdFields)) return fieldConfig;

    const traceId = normalizeTraceIdValue(fieldValue);
    if (!traceId) return fieldConfig;

    const targets = getTraceDatasourceTargets(groupedDatasourceList, config.traceDatasourceId);
    if (targets.length === 0) return fieldConfig;

    const identity = parseServiceDetailLocation(location.pathname, location.search);
    const traceLinks = targets.map((target) => ({
      name: targets.length > 1 ? t('view_trace_in', { datasource: target.name }) : t('view_trace'),
      urlTemplate: pickLogToTraceUrl(identity, { traceId, datasourceId: target.id, pluginType: target.pluginType }),
      field: name,
    }));

    return {
      arr: [],
      version: 2,
      ...(fieldConfig || {}),
      linkArr: [...(fieldConfig?.linkArr || []), ...traceLinks],
    };
  }, [fieldConfig, name, parentKey, fieldValue, groupedDatasourceList, location.pathname, location.search, t]);
}
