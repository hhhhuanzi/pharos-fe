import React, { useContext, useState } from 'react';
import { Form, Space } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { CommonStateContext } from '@/App';
import { parseRange } from '@/components/TimeRangePicker';
import { DatasourceCateEnum } from '@/utils/constant';

import { getLogExportAdapter } from '../adapters';
import { NS, OP_LOG_EXPORT } from '../constants';
import { LogExportContext } from '../types';
import LogExportModal from './LogExportModal';

interface Props {
  /** 由宿主插件传入，用于选 adapter。这是官方文件唯一需要提供的信息 */
  cate: DatasourceCateEnum;
}

/**
 * 各插件 MainMoreOperations 里插的导出菜单项。自足组件：不接收业务 props（除 cate），
 * 自己从 antd Form context 与 CommonStateContext 里取全部所需，与 ShareLinkText 的风格一致。
 */
export default function LogExportMenuItem(props: Props) {
  const { cate } = props;
  const { t } = useTranslation(NS);
  const { groupedDatasourceList, perms } = useContext(CommonStateContext);
  const form = Form.useFormInstance();
  const datasourceId = Form.useWatch('datasourceValue', form);
  const query = Form.useWatch('query', form);
  const [visible, setVisible] = useState(false);

  const adapter = getLogExportAdapter(cate);
  if (!perms?.includes(OP_LOG_EXPORT) || !adapter) return null;

  const disabled = !datasourceId;
  const datasourceName = (groupedDatasourceList[cate] || []).find((d) => d.id === datasourceId)?.name ?? '';

  const ctx: LogExportContext = (() => {
    const range = query?.range;
    const parsed = range ? parseRange(range) : undefined;
    return {
      cate,
      datasourceId: datasourceId ?? 0,
      datasourceName,
      start: parsed?.start ? parsed.start.valueOf() : 0,
      end: parsed?.end ? parsed.end.valueOf() : 0,
      rawRange: range,
      query: query ?? {},
      // 页面上的排序方向是 Main 组件的局部状态，没有向上传递到这里；导出统一按页面
      // 默认的「新到旧」排序，不随页面上临时切换的排序方向变化（见二开落点说明）。
      reverse: true,
    };
  })();

  return (
    <>
      <Space
        onClick={() => {
          if (disabled) return;
          setVisible(true);
        }}
        style={disabled ? { cursor: 'not-allowed', opacity: 0.5 } : undefined}
        title={disabled ? t('menu_item_no_datasource') : undefined}
      >
        <DownloadOutlined />
        {t('menu_item')}
      </Space>
      {!disabled && <LogExportModal visible={visible} onClose={() => setVisible(false)} ctx={ctx} adapter={adapter} />}
    </>
  );
}
