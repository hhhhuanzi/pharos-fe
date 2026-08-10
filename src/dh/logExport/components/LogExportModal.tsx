import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Progress, Radio, Space, Tooltip, message } from 'antd';
import { LoadingOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import moment from 'moment';

import { getFields } from '@/plugins/elasticsearch/services';
import { getPopularFields } from '@/dh/fieldsSidebar/popularFields';

import { MAX_OUTPUT_CHARS, NS, WARN_OUTPUT_CHARS } from '../constants';
import { formatChars, formatCharsLimit } from '../format';
import { resolveDefaultColumns } from '../resolveDefaultColumns';
import useLogExport from '../useLogExport';
import { ExportFormat, LogExportAdapter, LogExportContext, LogExportFormValues } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  ctx: LogExportContext;
  adapter: LogExportAdapter;
}

/** 体积闸门的展示值。必须由常量算出来注入 i18n，不能在文案里写死数字 */
const OUTPUT_LIMIT_LABEL = formatCharsLimit(MAX_OUTPUT_CHARS);

/** 语言无关的粗略时长展示（m:ss），避免为一个估算值再引入一套本地化时间单位 */
function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m${r}s` : `${r}s`;
}

const DEFAULT_MAX_ROWS_FALLBACK = 10_000;

/**
 * 导出条数/字段【不再】开放给用户手动修改（也不留“高级选项”入口）——见用户反馈
 * 「高级选项这里关闭，不然会被开发玩坏」：只要 UI 上还留着输入框/下拉框，就有被
 * 后续开发顺手改大/改成「全部字段」的风险，重新引入之前修复过的导出体积失控问题。
 * `rows` 因此完全由 `maxRows` 状态量派生。
 *
 * `columns` 则不用 state 存最终结果，而是用 `useMemo` 对 `effectiveFieldOptions`
 * （mapping 字段名，优先来自 `ctx.indexFields`——字段侧栏 `FieldsList` 已经渲染用过的
 * 同一份数组，不可用时才自己发一次 `_mapping` 兜底请求）与 `ctx.resultFields`（结果
 * 样本，来自字段侧栏同一份 `resultFieldsStore`，随时可能变化）做纯函数计算——这样
 * 导出弹窗打开期间，只要侧边栏那份「mapping 字段」或「结果样本」任一变化，这里的
 * 「常用字段」都会跟着重新算，不会停留在打开瞬间的旧快照上。
 *
 * 之所以优先用 `ctx.indexFields` 而不是自己独立发一次 `_mapping` 请求再解析：历史上
 * 出过不止一轮「导出弹窗与侧边栏『常用字段』数量对不上」，根因都指向「两条独立链路
 * （`getFields()`+`mappingsToFields()` vs `getFullFields()`+`mappingsToFullFields()`）
 * 各自请求、各自解析同一份 ES `_mapping` 响应，只要两者的兼容范围/请求参数有一处不
 * 同就会算出不同结果」——详见 ACCEPTANCE.md 里记录的排查过程。直接复用侧栏已经算好的
 * 同一个数组引用、过同一个 `groupFields()`，结果在结构上就不可能不一致，不再依赖任何
 * 关于 mapping 响应形态的假设。
 */
export default function LogExportModal(props: Props) {
  const { visible, onClose, ctx, adapter } = props;
  const { t } = useTranslation(NS);
  const [form] = Form.useForm<{ format: ExportFormat }>();
  // 仅在 ctx.indexFields 不可用时才用得到的兜底 mapping 拉取结果，见下方 effect 与
  // effectiveFieldOptions 的说明
  const [fallbackFieldOptions, setFallbackFieldOptions] = useState<string[]>([]);
  // 区分「还在拉 mapping」与「拉完但常用字段就是这么少」，否则用户会把还没算完的
  // 中间态误当成最终结果——这个 state 只服务于兜底路径（ctx.indexFields 不可用时）
  const [fallbackColumnsResolving, setFallbackColumnsResolving] = useState(false);
  const [maxRows, setMaxRows] = useState<number>(DEFAULT_MAX_ROWS_FALLBACK);
  const { progress, start, cancel, flushPartial, retryBatch, reset } = useLogExport();

  const format: ExportFormat = Form.useWatch('format', form) ?? 'csv';
  const query = ctx.query as { index?: string; date_field?: string; query?: string };

  // 弹窗打开时才拉取上限；关闭时清理，避免下次打开回显旧数据
  useEffect(() => {
    if (!visible) {
      form.resetFields();
      reset();
      setFallbackFieldOptions([]);
      setFallbackColumnsResolving(false);
      // 上限也要归零：否则重新打开时摘要会先顶着上一个数据源的 max 一段时间，
      // 直到新的 getMaxRows 返回
      setMaxRows(DEFAULT_MAX_ROWS_FALLBACK);
      return;
    }
    let cancelled = false;
    form.setFieldsValue({ format: 'csv' });
    // 条数固定用当前架构（T1/T2）下允许的最大值，跑到这个上限或数据自然耗尽为止
    // （真正的边界仍由 useLogExport 的 target = min(rows, effectiveMaxRows, maxRows) 兜底）
    adapter
      .getMaxRows(ctx)
      .then((max) => !cancelled && setMaxRows(max))
      .catch(() => !cancelled && setMaxRows(DEFAULT_MAX_ROWS_FALLBACK));
    // mapping 字段名优先用 ctx.indexFields（字段侧栏 FieldsList 已经发布过的同一份数组，
    // 见 indexFieldsStore.ts）。只有它还不可用时（弹窗打开这一刻侧栏还没加载完，或宿主
    // 页面根本没有接入字段侧栏）才自己发一次 _mapping 兜底请求——避免重复请求，也避免
    // 「两条链路各自解析同一份 mapping、算出不同字段集合」这一类历史上出过的不一致。
    if (query.index && ctx.indexFields === undefined) {
      setFallbackColumnsResolving(true);
      getFields(ctx.datasourceId, query.index)
        .then((res) => {
          if (cancelled) return;
          setFallbackFieldOptions(res.allFields);
        })
        .catch(() => {
          // 拉取失败时保持为空，resolveDefaultColumns 会退回预填列兜底，不阻断导出
        })
        .finally(() => !cancelled && setFallbackColumnsResolving(false));
    }
    return () => {
      // 关闭/快速重开时，让还在途中的旧请求失效，不覆盖新一轮打开后的状态
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ctx.indexFields 在弹窗打开期间也可能才姗姗来迟（侧栏 mapping 请求晚于弹窗打开才
  // 落地）——一旦它变成非 undefined，立刻优先切过去，不等待/不依赖上面兜底请求的结果
  const effectiveFieldOptions = ctx.indexFields ?? fallbackFieldOptions;
  const columnsResolving = ctx.indexFields === undefined && fallbackColumnsResolving;

  // CSV 强制保底列：查询使用的时间字段 + adapter 既有预设，不参与「常用字段」的结果样本过滤
  const presetColumns = useMemo(
    () => (query.date_field ? [query.date_field, ...adapter.csvPresetColumns] : adapter.csvPresetColumns),
    [query.date_field, adapter.csvPresetColumns],
  );

  // 字段固定用「常用字段」（内置推荐词表 ∪ 用户自定义常用字段），有结果样本时与样本取
  // 交集排掉噪音字段——逻辑与字段侧栏「常用字段」分组（groupFields.ts）完全一致，这里
  // 不重新实现一套判定；随 ctx.resultFields/ctx.indexFields 变化重新计算，与侧栏保持同步。
  const defaultColumns = useMemo(() => {
    if (!visible) return [];
    return resolveDefaultColumns({
      fieldOptions: effectiveFieldOptions,
      resultFields: ctx.resultFields,
      popularCounts: getPopularFields({ datasourceValue: ctx.datasourceId, index: query.index }),
      presetColumns,
    });
  }, [visible, effectiveFieldOptions, ctx.resultFields, ctx.datasourceId, query.index, presetColumns]);

  // 导出结束后用 toast 反馈，不常驻弹窗；撞字节闸门时文件仍然下载，但要用 Modal.info
  // 承载降级建议（§10.7），一条自动消失的 toast 放不下这个信息量
  useEffect(() => {
    if (progress.phase === 'done') {
      // 与下面按 stopReason 分三种的完成提示是两件独立的事：截断是「个别字段值异常大」，
      // 不影响是否达标/是否撞字节闸门，因此单独一条 warning，不占用/替换主提示文案
      if (progress.fetched > 0 && progress.truncatedCells) {
        message.warning(t('result.truncated_cells', { count: progress.truncatedCells }));
      }
      if (progress.fetched === 0) {
        message.info(t('result.empty'));
      } else if (progress.stopReason === 'byte_limit') {
        Modal.info({
          title: t('byteLimit.title'),
          width: 520,
          content: (
            <div>
              <p>
                {t('byteLimit.content', {
                  count: progress.fetched,
                  size: formatChars(progress.accumulatedChars),
                  total: progress.total ?? progress.fetched,
                  limit: OUTPUT_LIMIT_LABEL,
                })}
              </p>
              <p>{t('byteLimit.suggestTitle')}</p>
              <ol>
                <li>{t('byteLimit.suggest1')}</li>
                <li>{t('byteLimit.suggest2')}</li>
                <li>{t('byteLimit.suggest3')}</li>
              </ol>
            </div>
          ),
          okText: t('byteLimit.ok'),
        });
      } else if (progress.stopReason === 'target') {
        message.success(t('result.success_target', { count: progress.fetched, size: formatChars(progress.accumulatedChars), total: progress.total ?? progress.fetched }));
      } else {
        message.success(t('result.success_exhausted', { count: progress.fetched, size: formatChars(progress.accumulatedChars) }));
      }
      onClose();
    } else if (progress.phase === 'cancelled') {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.phase]);

  // 体积闸门只是异常保护，不是导出目标。平时把它写成分母，会和按条数算的进度条
  // 打架（同一时刻一个显示 10%、一个显示 1.5%）；只有真的快撞上了才有必要提。
  const nearOutputLimit = progress.accumulatedChars >= WARN_OUTPUT_CHARS;

  const isBusy = progress.phase === 'preparing' || progress.phase === 'fetching' || progress.phase === 'assembling';
  const isBatchFailure = progress.phase === 'failed' && progress.fetched > 0;
  const isPermissionOrPrepareFailure = progress.phase === 'failed' && progress.fetched === 0;

  /**
   * 呈现分档。大额（PIT 分页，分钟级、几十次往返）才值得占用一整块进度面板；
   * 小额（≤1 万条，通常几秒）只让按钮转个圈，完成即下载 —— 这才是用户要的
   * 「点一下就出文件」的体感。判断依据是 prepare() 实际选定的策略，而不是请求的
   * 条数：请求 10 万条但 PIT 不可用而降级到 1 万条时，它本质上就是一次小额导出。
   */
  const isLargeExport = progress.strategy === 'pit_search_after';
  const showProgressPanel = isBusy && isLargeExport;
  // 只有大额导出期间锁死弹窗（有独立的取消按钮）；小额随时可关，关闭即中止，
  // 避免「本该几秒的导出卡住了，而用户被一个转圈的按钮锁死」
  const lockClose = showProgressPanel;

  /**
   * 首批响应之前，真实命中数（`progress.total`）还不知道，`progress.target`（进度条
   * 分母）只能暂时等于请求条数（架构上限，如 10 万）——这个数字大概率远超真实命中数
   * （用户反馈的真实案例：分母 10 万、真实命中 47059），此时展示一个「看起来精确、
   * 实则注定要跳变」的百分比只会误导用户，所以改成不显示具体数字的 active 进度条 +
   * 一句「正在获取首批数据」。一旦首批落地，`total` 就确定了（此后不再变化，见
   * useLogExport 的 sessionProgress()），从这里开始才展示准确的百分比/条数/剩余时间。
   */
  const totalUnknown = progress.total == null && progress.fetched === 0;

  const handleStart = async () => {
    await form.validateFields();
    // rows/columns/allFields 不经过表单，直接用当前已解析出的默认值拼装——
    // 弹窗上没有任何控件能改动它们，避免被后续开发顺手放宽
    const values: LogExportFormValues = {
      format,
      rows: maxRows,
      columns: defaultColumns,
      allFields: false,
    };
    await start(ctx, values);
  };

  return (
    <Modal
      title={t('modal.title')}
      visible={visible}
      width={520}
      maskClosable={!lockClose}
      closable={!lockClose}
      onCancel={() => {
        if (lockClose) return;
        onClose();
      }}
      footer={null}
      destroyOnClose
    >
      {showProgressPanel && (
        <div>
          <Progress
            percent={totalUnknown ? 100 : Math.min(100, Math.floor((progress.fetched / Math.max(progress.target, 1)) * 100))}
            showInfo={!totalUnknown}
            status={progress.phase === 'assembling' || totalUnknown ? 'active' : 'normal'}
          />
          {progress.phase === 'assembling' ? (
            <div>{t('progress.assembling')}</div>
          ) : totalUnknown ? (
            <Space direction='vertical' size={4} className='w-full'>
              <span>{t('progress.first_batch')}</span>
              {!!progress.notice && <span className='text-[var(--fc-fill-warning)]'>{progress.notice}</span>}
            </Space>
          ) : (
            <Space direction='vertical' size={4} className='w-full'>
              {/* 主信息：只留「已获取 N / M 条」。「共命中」并到完成 toast 里，不占进度区。
                  M 是首批落地后收窄过的真实命中数（封顶请求上限），不是恒定的架构上限 */}
              <span>{t('progress.fetched', { fetched: progress.fetched, target: progress.target })}</span>
              {/* 次要信息：小字。体积接近闸门时才变成醒目的警告 */}
              <Space size={24} className={nearOutputLimit ? 'text-xs' : 'text-xs text-[var(--fc-text-3)]'}>
                <span className={nearOutputLimit ? 'text-[var(--fc-fill-warning)]' : undefined}>
                  {nearOutputLimit
                    ? t('progress.size_near_limit', { size: formatChars(progress.accumulatedChars), limit: OUTPUT_LIMIT_LABEL })
                    : t('progress.size', { size: formatChars(progress.accumulatedChars) })}
                </span>
                {!!progress.rate && progress.target > progress.fetched && (
                  <span>{t('progress.remaining', { time: formatDuration((progress.target - progress.fetched) / progress.rate / 1000) })}</span>
                )}
              </Space>
              {!!progress.notice && <span className='text-[var(--fc-fill-warning)]'>{progress.notice}</span>}
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

      {/* 小额导出全程停留在这块表单上，只把主按钮切成 loading —— 不弹进度面板。
          表单控件逐个 disabled 而不用 Form 级 disabled：antd 4.21 的 Button 也消费
          DisabledContext，会把下面的「取消」一起禁掉，小额路径就没有逃生口了。 */}
      {!showProgressPanel && !isBatchFailure && (
        <Form form={form} layout='vertical' initialValues={{ format: 'csv' }}>
          {isPermissionOrPrepareFailure && <Alert type='error' showIcon message={progress.errorMessage} className='mb-3' />}

          <div className='mb-3 p-3 bg-[var(--fc-fill-1)] rounded'>
            <div className='text-xs text-[var(--fc-text-3)] mb-2'>{t('modal.query_condition')}</div>
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

          {/* 只保留 CSV 与原始文本：JSON Lines 实测导出明显更慢，收益不足以抵消等待，
              序列化能力本身保留在 serialize.ts（供将来复用），只是不再作为可选项暴露 */}
          <Form.Item name='format' label={t('modal.format')}>
            <Radio.Group disabled={isBusy}>
              <Space direction='vertical'>
                <Radio value='csv'>{t('modal.format_csv')}</Radio>
                <Radio value='raw'>{t('modal.format_raw')}</Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {/* 零配置、无法被改动：导出字段固定为「常用字段」、导出条数固定为架构允许的
              上限，弹窗里不提供任何可以修改它们的入口（不留「高级选项」，避免被
              后续开发顺手放宽导出范围，重新引入体积失控风险）。
              字段名列表放进 Tooltip：多选框删掉之后，这是唯一还能看到「具体导出哪些
              字段」的地方，不能只给一个数字让用户自己猜。 */}
          <div className='mb-3 p-3 bg-[var(--fc-fill-1)] rounded'>
            <div className='text-sm flex items-center gap-1'>
              {format === 'csv' && columnsResolving ? (
                <span className='text-[var(--fc-text-3)]'>
                  <LoadingOutlined className='mr-1' />
                  {t('modal.fields_summary_loading')}
                </span>
              ) : (
                <>
                  <span>{format === 'csv' ? t('modal.fields_summary_default', { count: defaultColumns.length }) : t('modal.fields_summary_raw')}</span>
                  {format === 'csv' && (
                    <Tooltip title={t('modal.fields_summary_tip', { fields: defaultColumns.join('、') })}>
                      <QuestionCircleOutlined className='text-hint' />
                    </Tooltip>
                  )}
                </>
              )}
            </div>
            <div className='text-sm'>{t('modal.rows_summary', { max: maxRows.toLocaleString() })}</div>
          </div>

          <div className='text-right'>
            <Space>
              {/* 导出中点它就是中止本次导出，不只是关窗 —— 小额路径的逃生口 */}
              <Button onClick={() => (isBusy ? cancel() : onClose())}>{t('modal.cancel')}</Button>
              {/* CSV 常用字段还没算完时不让点「开始导出」，避免拿着只有预填列的临时兜底值
                  就发出去——JSONL/原始文本始终是完整文档，不依赖这次 mapping 拉取，不受影响 */}
              <Button type='primary' loading={isBusy} disabled={format === 'csv' && columnsResolving} onClick={handleStart}>
                {isBusy ? t('modal.exporting') : t('modal.start')}
              </Button>
            </Space>
          </div>
        </Form>
      )}
    </Modal>
  );
}
