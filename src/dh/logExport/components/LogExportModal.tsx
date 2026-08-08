import React, { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Form, InputNumber, Modal, Progress, Radio, Select, Space, message } from 'antd';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import { getFields } from '@/plugins/elasticsearch/services';

import { BATCH_SIZE_TIER2, DEFAULT_EXPORT_ROWS, NS, WARN_ROWS } from '../constants';
import useLogExport from '../useLogExport';
import { ExportFormat, LogExportAdapter, LogExportContext, LogExportFormValues } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  ctx: LogExportContext;
  adapter: LogExportAdapter;
}

function formatBytes(chars: number): string {
  const mb = chars / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(chars / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

/** 语言无关的粗略时长展示（m:ss），避免为一个估算值再引入一套本地化时间单位 */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m${r}s` : `${r}s`;
}

const DEFAULT_MAX_ROWS_FALLBACK = 10_000;

export default function LogExportModal(props: Props) {
  const { visible, onClose, ctx, adapter } = props;
  const { t } = useTranslation(NS);
  const [form] = Form.useForm<LogExportFormValues>();
  const [fieldOptions, setFieldOptions] = useState<string[]>([]);
  const [maxRows, setMaxRows] = useState<number>(DEFAULT_MAX_ROWS_FALLBACK);
  const { progress, start, cancel, flushPartial, retryBatch, reset } = useLogExport();

  const format: ExportFormat = Form.useWatch('format', form) ?? 'csv';
  const rows: number = Form.useWatch('rows', form) ?? 0;
  const columns: string[] = Form.useWatch('columns', form) ?? [];
  const allFields: boolean = Form.useWatch('allFields', form) ?? false;

  // 弹窗打开时才拉取字段与上限，避免每次页面渲染都发请求；关闭时清理，避免下次打开回显旧数据
  useEffect(() => {
    if (!visible) {
      form.resetFields();
      reset();
      setFieldOptions([]);
      return;
    }
    const query = ctx.query as { index?: string; date_field?: string };
    const defaultColumns = query.date_field ? [query.date_field, adapter.rawKey] : [adapter.rawKey];
    form.setFieldsValue({
      format: 'csv',
      rows: DEFAULT_EXPORT_ROWS,
      columns: defaultColumns,
      allFields: false,
    });
    adapter.getMaxRows(ctx).then(setMaxRows).catch(() => setMaxRows(DEFAULT_MAX_ROWS_FALLBACK));
    if (query.index) {
      getFields(ctx.datasourceId, query.index)
        .then((res) => setFieldOptions(res.allFields.map((f) => f.field)))
        .catch(() => setFieldOptions(defaultColumns));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const columnsCount = format === 'csv' ? (allFields ? fieldOptions.length || 10 : columns.length || 1) : 1;

  // 导出结束后用 toast 反馈，不常驻弹窗；撞字节闸门时文件仍然下载，但要用 Modal.info
  // 承载降级建议（§10.7），一条自动消失的 toast 放不下这个信息量
  useEffect(() => {
    if (progress.phase === 'done') {
      if (progress.fetched === 0) {
        message.info(t('result.empty'));
      } else if (progress.stopReason === 'byte_limit') {
        Modal.info({
          title: t('byteLimit.title'),
          width: 520,
          content: (
            <div>
              <p>{t('byteLimit.content', { count: progress.fetched, size: formatBytes(progress.accumulatedChars), total: progress.total ?? progress.fetched })}</p>
              <p>{t('byteLimit.suggestTitle')}</p>
              <ol>
                <li>{t('byteLimit.suggest1')}</li>
                <li>{t('byteLimit.suggest2')}</li>
                <li>{t('byteLimit.suggest3', { count: columnsCount })}</li>
                <li>{t('byteLimit.suggest4')}</li>
              </ol>
            </div>
          ),
          okText: t('byteLimit.ok'),
        });
      } else if (progress.stopReason === 'target') {
        message.success(t('result.success_target', { count: progress.fetched, size: formatBytes(progress.accumulatedChars), total: progress.total ?? progress.fetched }));
      } else {
        message.success(t('result.success_exhausted', { count: progress.fetched, size: formatBytes(progress.accumulatedChars) }));
      }
      onClose();
    } else if (progress.phase === 'cancelled') {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.phase]);
  const showWarn = rows > WARN_ROWS;
  const estSeconds = (rows / BATCH_SIZE_TIER2) * 1.5;
  const estBytes = rows * columnsCount * 20;

  const isBusy = progress.phase === 'preparing' || progress.phase === 'fetching' || progress.phase === 'assembling';
  const isBatchFailure = progress.phase === 'failed' && progress.fetched > 0;
  const isPermissionOrPrepareFailure = progress.phase === 'failed' && progress.fetched === 0;

  const handleStart = async () => {
    const values = await form.validateFields();
    await start(ctx, values);
  };

  const query = ctx.query as { index?: string; query?: string };

  return (
    <Modal
      title={t('modal.title')}
      visible={visible}
      width={520}
      maskClosable={!isBusy}
      closable={!isBusy}
      onCancel={() => {
        if (isBusy) return;
        onClose();
      }}
      footer={null}
      destroyOnClose
    >
      {isBusy && (
        <div>
          <Progress percent={Math.min(100, Math.floor((progress.fetched / Math.max(progress.target, 1)) * 100))} status={progress.phase === 'assembling' ? 'active' : 'normal'} />
          {progress.phase === 'assembling' ? (
            <div>{t('progress.assembling')}</div>
          ) : (
            <Space direction='vertical' size={4} className='w-full'>
              <Space size={24}>
                <span>{t('progress.fetched', { fetched: progress.fetched, target: progress.target })}</span>
                {progress.total != null && <span>{t('progress.total', { total: progress.total })}</span>}
              </Space>
              <span>{t('progress.size', { size: formatBytes(progress.accumulatedChars) })}</span>
            </Space>
          )}
          <div className='mt-3 text-right'>
            <Button onClick={cancel}>{t('progress.cancel')}</Button>
          </div>
        </div>
      )}

      {isBatchFailure && (
        <div>
          <Alert type='error' showIcon message={t('error.batch_failed_title')} description={progress.errorMessage} className='mb-3' />
          <div className='text-right'>
            <Space>
              <Button onClick={() => onClose()}>{t('error.cancel')}</Button>
              <Button onClick={() => retryBatch()}>{t('error.retry')}</Button>
              <Button type='primary' onClick={() => flushPartial()}>
                {t('error.flush_partial', { count: progress.fetched })}
              </Button>
            </Space>
          </div>
        </div>
      )}

      {!isBusy && !isBatchFailure && (
        <Form form={form} layout='vertical' initialValues={{ format: 'csv', rows: DEFAULT_EXPORT_ROWS, columns: [], allFields: false }}>
          {isPermissionOrPrepareFailure && <Alert type='error' showIcon message={progress.errorMessage} className='mb-3' />}

          <div className='mb-3 p-3 bg-[var(--fc-fill-1)] rounded'>
            <div className='text-sm'>
              {t('modal.datasource')}: {ctx.datasourceName} ({ctx.cate})
            </div>
            {query.index && (
              <div className='text-sm'>
                {t('modal.index')}: {query.index}
              </div>
            )}
            <div className='text-sm'>
              {t('modal.time_range')}: {moment(ctx.start).format('YYYY-MM-DD HH:mm:ss')} ~ {moment(ctx.end).format('YYYY-MM-DD HH:mm:ss')}
            </div>
            {query.query && (
              <div className='text-sm'>
                {t('modal.query_statement')}: {query.query}
              </div>
            )}
          </div>

          <Form.Item name='format' label={t('modal.format')}>
            <Radio.Group>
              <Space direction='vertical'>
                <Radio value='csv'>{t('modal.format_csv')}</Radio>
                <Radio value='jsonl'>{t('modal.format_jsonl')}</Radio>
                <Radio value='raw'>{t('modal.format_raw')}</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item name='rows' label={`${t('modal.rows')} (${t('modal.rows_max_tip', { max: maxRows })})`} rules={[{ required: true, type: 'number', min: 1, max: maxRows }]}>
            <InputNumber min={1} max={maxRows} className='w-full' addonAfter={t('modal.rows_unit')} />
          </Form.Item>

          {format === 'csv' && (
            <>
              <Form.Item name='columns' label={t('modal.columns')}>
                <Select mode='multiple' disabled={allFields} placeholder={t('modal.columns_placeholder')} options={fieldOptions.map((f) => ({ label: f, value: f }))} />
              </Form.Item>
              <Form.Item name='allFields' valuePropName='checked' noStyle>
                <Checkbox>{t('modal.columns_all')}</Checkbox>
              </Form.Item>
              <div className='text-xs text-[var(--fc-text-3)] mt-1 mb-3'>{t('modal.columns_all_tip')}</div>
            </>
          )}

          {showWarn && (
            <Alert
              type='warning'
              showIcon
              className='mb-3'
              message={t('modal.warn_estimate', { duration: formatDuration(estSeconds), size: formatBytes(estBytes) })}
            />
          )}

          <div className='text-right'>
            <Space>
              <Button onClick={onClose}>{t('modal.cancel')}</Button>
              <Button type='primary' onClick={handleStart}>
                {t('modal.start')}
              </Button>
            </Space>
          </div>
        </Form>
      )}
    </Modal>
  );
}
