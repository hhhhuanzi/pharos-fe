import React, { useEffect, useMemo, useState } from 'react';
import { Input, Space, Spin, Tooltip } from 'antd';
import { DownOutlined, RightOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { NAME_SPACE as logExplorerNS } from '@/pages/logExplorer/constants';
import FieldsItem from '@/pages/logExplorer/components/FieldsList/FieldsItem';
import { TYPE_MAP } from '@/pages/logExplorer/components/FieldsList/constants';
import { Field, StatsResult } from '@/pages/logExplorer/components/FieldsList/types';

import { NS } from '../constants';
import groupFields from '../groupFields';
import { FieldsScope, PopularCounts, getPopularFields, increasePopularField } from '../popularFields';
import { getScopeKey, useResultFields } from '../resultFieldsStore';

import '@/pages/logExplorer/components/FieldsList/style.less';

/**
 * 官方 `@/pages/logExplorer/components/FieldsList` 的增强版：
 * 在原有「显示字段 / 可用字段」两组之外，增加「常用字段」置顶与「空字段」折叠。
 *
 * 之所以另起一个组件而不是改官方那个：官方组件被 Elasticsearch / Doris / ClickHouse
 * 三个插件共用，且是 upstream 高频修改区。这里只复用官方的 `FieldsItem`、`TYPE_MAP`
 * 与样式，字段项渲染仍跟着官方走；分组逻辑独立在 `src/dh/fieldsSidebar`。
 */
interface Props {
  /** 用于隔离「常用字段」频次统计与结果字段集合，不传则退化为官方三组行为（无空字段分组） */
  scope?: FieldsScope;
  typeMap?: Record<string, string>;
  organizeFieldNames?: string[];
  onOperClick: (field: string, type: 'show' | 'available') => void;
  fields: Field[];
  enableStats?: boolean;
  disableEmptyValueClick?: boolean;
  onValueFilter?: (parmas: { key: string; value: any; operator: string }) => void;
  fetchStats?: (field: Field) => Promise<StatsResult>;
  loading?: boolean;
  renderStatsPopoverTitleExtra?: (options: {
    index: Field;
    stats?: {
      [index: string]: number;
    };
    setTopNVisible: React.Dispatch<React.SetStateAction<boolean>>;
  }) => React.ReactNode;
  renderFieldNameExtra?: (field: Field) => React.ReactNode;
  onStatisticClick?: (
    type: string,
    options: {
      func: string;
      field?: string;
      ref?: string;
      group_by?: string;
      field_filter?: string;
    },
  ) => void;
}

export default function DhFieldsList(props: Props) {
  const { t } = useTranslation(NS);
  const { t: tLogExplorer } = useTranslation(logExplorerNS);
  const {
    scope,
    typeMap = TYPE_MAP,
    organizeFieldNames,
    onOperClick,
    fields,
    enableStats = true,
    disableEmptyValueClick = true,
    onValueFilter,
    fetchStats,
    loading,
    renderStatsPopoverTitleExtra,
    renderFieldNameExtra,
    onStatisticClick,
  } = props;

  const [fieldsSearch, setFieldsSearch] = useState('');
  const [selectedCollapsed, setSelectedCollapsed] = useState(false);
  const [popularCollapsed, setPopularCollapsed] = useState(false);
  const [availableCollapsed, setAvailableCollapsed] = useState(false);
  const [emptyCollapsed, setEmptyCollapsed] = useState(true);

  const scopeKey = getScopeKey(scope ?? {});
  const resultFields = useResultFields(scope ?? {});
  const [popularCounts, setPopularCounts] = useState<PopularCounts>(() => getPopularFields(scope ?? {}));

  useEffect(() => {
    setPopularCounts(getPopularFields(scope ?? {}));
  }, [scopeKey]);

  const groups = useMemo(
    () => groupFields({ fields, organizeFieldNames, popularCounts, resultFields }),
    [fields, organizeFieldNames, popularCounts, resultFields],
  );

  const searchTokens = useMemo(() => fieldsSearch.trim().toLowerCase().split(/\s+/).filter(Boolean), [fieldsSearch]);
  const filterBySearch = (list: Field[]) => {
    if (searchTokens.length === 0) return list;
    return list.filter((item) => {
      const name = item.field.toLowerCase();
      return searchTokens.every((token) => name.includes(token));
    });
  };

  const handleOperClick = (field: string, type: 'show' | 'available') => {
    if (type === 'available' && scopeKey) {
      setPopularCounts(increasePopularField(scope ?? {}, field));
    }
    onOperClick(field, type);
  };

  const renderGroup = (options: { title: string; tip?: string; list: Field[]; operType: 'show' | 'available'; collapsed: boolean; onToggle: () => void }) => {
    const { title, tip, list, operType, collapsed, onToggle } = options;
    return (
      <div className='mb-2'>
        <div className='ml-2 mb-2 pr-1 flex items-center justify-between gap-2'>
          <Space className='cursor-pointer font-bold' onClick={onToggle}>
            {collapsed ? <RightOutlined /> : <DownOutlined />}
            {title}
          </Space>
          <Space size={4} className='shrink-0'>
            {tip && (
              <Tooltip title={tip}>
                <QuestionCircleOutlined className='text-hint' />
              </Tooltip>
            )}
            <span className='text-hint'>{list.length}</span>
          </Space>
        </div>
        <div style={{ display: collapsed ? 'none' : 'block' }}>
          {list.map((item) => (
            <FieldsItem
              key={item.field}
              operType={operType}
              onOperClick={() => {
                handleOperClick(item.field, operType);
              }}
              field={item}
              disableEmptyValueClick={disableEmptyValueClick}
              onValueFilter={onValueFilter}
              typeMap={typeMap}
              fetchStats={fetchStats}
              enableStats={enableStats}
              renderStatsPopoverTitleExtra={renderStatsPopoverTitleExtra}
              renderFieldNameExtra={renderFieldNameExtra}
              onStatisticClick={onStatisticClick}
            />
          ))}
        </div>
      </div>
    );
  };

  const selected = filterBySearch(groups.selected);
  const popular = filterBySearch(groups.popular);
  const available = filterBySearch(groups.available);
  const empty = filterBySearch(groups.empty);

  return (
    <div className='h-full min-h-0'>
      <Input
        style={{
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
        placeholder={tLogExplorer('field_search_placeholder')}
        value={fieldsSearch}
        onChange={(e) => {
          setFieldsSearch(e.target.value);
        }}
        allowClear
      />
      <div
        style={{
          height: 'calc(100% - 31px)',
        }}
        className='best-looking-scroll overflow-y-auto mt-[-1px] border border-antd border-t-0 rounded-bl-sm rounded-br-sm py-2'
      >
        <Spin spinning={loading}>
          {selected.length > 0 &&
            renderGroup({
              title: tLogExplorer('field_list.show_fields'),
              list: selected,
              operType: 'show',
              collapsed: selectedCollapsed,
              onToggle: () => setSelectedCollapsed(!selectedCollapsed),
            })}
          {popular.length > 0 &&
            renderGroup({
              title: t('popular_fields'),
              tip: t('popular_fields_tip'),
              list: popular,
              operType: 'available',
              collapsed: popularCollapsed,
              onToggle: () => setPopularCollapsed(!popularCollapsed),
            })}
          {renderGroup({
            title: tLogExplorer('field_list.available_fields'),
            list: available,
            operType: 'available',
            collapsed: availableCollapsed,
            onToggle: () => setAvailableCollapsed(!availableCollapsed),
          })}
          {empty.length > 0 &&
            renderGroup({
              title: t('empty_fields'),
              tip: t('empty_fields_tip'),
              list: empty,
              operType: 'available',
              // 搜索时强制展开，否则用户会以为字段不存在
              collapsed: searchTokens.length > 0 ? false : emptyCollapsed,
              onToggle: () => setEmptyCollapsed(!emptyCollapsed),
            })}
        </Spin>
      </div>
    </div>
  );
}
