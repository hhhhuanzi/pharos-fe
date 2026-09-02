import React, { useMemo, useState } from 'react';
import { Modal } from 'antd';
import { CopyOutlined, ExpandAltOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { copy2ClipBoard } from '@/utils';

import { countLines, formatFullValue, isLongValue, previewValue } from './longValue';
import './longValue.css';

export { isLongValue };

interface Props {
  title: string;
  value: string;
}

/**
 * 长值（异常堆栈 / 大 SQL / 大 JSON）在 span 详情里的入口：行内只放摘要，全文走 Modal。
 *
 * 行内不铺全文有两个原因：瀑布图的行高是虚拟列表按测量值钉死的，铺全文会把行撑到几百像素；
 * 而且值单元格所在的 .KeyValueTable 自己是滚动容器，一滚就把操作入口带出视野。
 * 入口按钮放在摘要「上方」，这样它永远落在行的可视区里，不会被滚过去。
 */
export default function LongValueCell(props: Props) {
  const { title, value } = props;
  const { t } = useTranslation('trace');
  const [visible, setVisible] = useState(false);

  const preview = useMemo(() => previewValue(value), [value]);
  const rawLines = useMemo(() => countLines(value), [value]);
  // JSON.parse 一段 14KB 的值不便宜，等 Modal 真的打开再算。
  const fullText = useMemo(() => (visible ? formatFullValue(value) : ''), [visible, value]);

  return (
    <div className='LongValueCell'>
      <a className='LongValueCell--more' onClick={() => setVisible(true)}>
        <ExpandAltOutlined /> {rawLines > 1 ? t('span_value.expand_lines', { num: rawLines }) : t('span_value.expand_chars', { num: value.length })}
      </a>
      <div className='LongValueCell--preview'>{preview.text}</div>
      <Modal title={title} visible={visible} onCancel={() => setVisible(false)} footer={null} width='80vw' destroyOnClose>
        <div className='mb-2 flex items-center justify-between'>
          <span className='text-base text-hint'>{t('span_value.lines', { num: countLines(fullText) })}</span>
          <a onClick={() => copy2ClipBoard(value)}>
            <CopyOutlined /> {t('span_value.copy')}
          </a>
        </div>
        <pre className='LongValueCell--full'>{fullText}</pre>
      </Modal>
    </div>
  );
}
