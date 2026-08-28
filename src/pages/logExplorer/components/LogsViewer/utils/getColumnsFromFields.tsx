import React from 'react';
import _ from 'lodash';
import moment from 'moment';
import i18next from 'i18next';
import { Space, Tooltip } from 'antd';
import { PlusCircleOutlined } from '@ant-design/icons';

import { ClampedFieldCell, fieldValueToText, shouldShowViewAll } from '@/dh/logExplorer';

import { Field } from '../../../types';
import LogFieldValue from '../components/LogFieldValue';
import { OptionsType, OnValueFilterParams, FieldValueType } from '../types';

export default function getColumnsFromFields(params: {
  id_key: string;
  colWidths?: { [key: string]: number };
  indexData?: Field[];
  fields: string[];
  timeField?: string;
  options?: OptionsType;
  onValueFilter?: (parmas: OnValueFilterParams) => void;
  data?: any[];
  highlights?: {
    [key: string]: string[];
  }[];
  tableColumnsWidthCacheKey?: string;
  onOpenOrganizeFieldsModal?: () => void;
  setLogViewerDrawerState?: React.Dispatch<React.SetStateAction<{ visible: boolean; currentIndex: number }>>;
  timeColumnWidth?: number;
  timeFieldColumnFormat?: (timeFieldValue: string | number) => React.ReactNode;
  linesColumnFormat?: (linesValue: number) => React.ReactNode;
  adjustFieldValue?: (formatedValue: FieldValueType, highlightValue?: string[]) => React.ReactNode;
  showExistsAction?: boolean;
}) {
  const {
    id_key,
    colWidths,
    indexData,
    fields,
    timeField: time_field,
    options,
    onValueFilter,
    data,
    highlights,
    tableColumnsWidthCacheKey,
    onOpenOrganizeFieldsModal,
    setLogViewerDrawerState,
    timeColumnWidth = 140,
    timeFieldColumnFormat,
    linesColumnFormat,
    adjustFieldValue,
    showExistsAction,
  } = params;

  let tableColumnsWidthCacheValue: { [index: string]: number | undefined } = {};
  if (tableColumnsWidthCacheKey) {
    const cacheStr = localStorage.getItem(tableColumnsWidthCacheKey);
    if (cacheStr) {
      try {
        tableColumnsWidthCacheValue = JSON.parse(cacheStr);
      } catch (e) {
        console.warn('Parse table columns width cache value error', e);
      }
    }
  }

  const columns: any[] = _.map(fields, (item) => {
    const organizeFields = options?.organizeFields || [];
    const iconsWidth = _.includes(organizeFields, item) ? 0 : 20; // 预留图标宽度
    let realName = item;
    if (indexData && !_.find(indexData, { field: item })) {
      const firstPart = item.split('.')[0];
      if (_.find(indexData, { field: firstPart })) {
        realName = firstPart;
      }
    }
    const width = tableColumnsWidthCacheValue[item];
    const baseWidth = iconsWidth + 20;
    const minWidth = 60;
    const isLastField = item === fields[fields.length - 1];

    return {
      minWidth,
      // 最后一列交给 RDG 吃满剩余视口；过长内容在单元格内换行，而不是把列宽锁死在 600px
      ...(isLastField ? {} : { width: (width ? width : colWidths?.[item] || minWidth) + baseWidth }),
      key: item,
      headerCellClass: 'group',
      cellClass: 'n9e-log-field-cell whitespace-pre-wrap break-all text-clip',
      name: (
        <Space>
          {item}
          {onOpenOrganizeFieldsModal && (
            <PlusCircleOutlined
              className='invisible group-hover:visible'
              onClick={() => {
                onOpenOrganizeFieldsModal();
              }}
            />
          )}
        </Space>
      ),
      formatter: (params) => {
        const record = params.row;
        const idx = _.findIndex(data, { [id_key]: params.row[id_key] });
        const highlight = highlights?.[idx] || {};
        let fieldValue = record[item];

        // 对象和数组类型的字段值进行字符串化展示
        if (_.isPlainObject(fieldValue) || _.isArray(fieldValue)) {
          fieldValue = JSON.stringify(fieldValue);
        }

        const overflow = shouldShowViewAll(fieldValueToText(fieldValue));

        return (
          <ClampedFieldCell
            estimatedOverflow={overflow}
            onViewAll={
              setLogViewerDrawerState
                ? () => {
                    setLogViewerDrawerState({ visible: true, currentIndex: idx });
                  }
                : undefined
            }
          >
            {/* 即使当前数据源不支持添加筛选条件，也需保留字段值组件提供的下钻链接和操作菜单。 */}
            <LogFieldValue
              enableTooltip={!overflow}
              fieldValueClassName='whitespace-pre-wrap break-all max-w-full'
              name={item}
              value={fieldValue}
              onTokenClick={onValueFilter}
              rawValue={record}
              highlight={highlight}
              adjustFieldValue={adjustFieldValue}
              showExistsAction={showExistsAction}
            />
          </ClampedFieldCell>
        );
      },
    };
  });
  if (time_field && options?.time === 'true') {
    columns.unshift({
      name: i18next.t('log_explorer:logs.settings.time'),
      key: '___time___',
      width: timeColumnWidth,
      sortable: true,
      resizable: false,
      formatter: ({ row }) => {
        const idx = _.findIndex(data, { [id_key]: row[id_key] });
        return (
          <Tooltip title={i18next.t('log_explorer:log_viewer_drawer_trigger_tip')}>
            <div
              className='cursor-pointer'
              onClick={() => {
                setLogViewerDrawerState?.({ visible: true, currentIndex: idx });
              }}
            >
              {timeFieldColumnFormat ? timeFieldColumnFormat(row[time_field]) : moment(row[time_field]).format('MM-DD HH:mm:ss.SSS')}
            </div>
          </Tooltip>
        );
      },
    });
  }
  if (options?.lines === 'true') {
    columns.unshift({
      name: i18next.t('log_explorer:logs.settings.lines'),
      key: '___lines___',
      width: 40,
      resizable: false,
      formatter: ({ row }) => {
        const idx = _.findIndex(data, { [id_key]: row[id_key] });
        return (
          <Tooltip title={i18next.t('log_explorer:log_viewer_drawer_trigger_tip')}>
            <div
              className='cursor-pointer'
              onClick={() => {
                setLogViewerDrawerState?.({ visible: true, currentIndex: idx });
              }}
            >
              {linesColumnFormat ? linesColumnFormat(idx + 1) : idx + 1}
            </div>
          </Tooltip>
        );
      },
    });
  }
  return columns;
}
