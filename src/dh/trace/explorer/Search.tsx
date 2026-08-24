import React, { useContext, useEffect, useRef, useState } from 'react';
import { Button, Form, Input, InputNumber, Radio, Select, Spin } from 'antd';
import moment from 'moment';
import { useTranslation } from 'react-i18next';
import TimeRangePicker, { getDefaultValue, IRawTimeRange, parseRange } from '@/components/TimeRangePicker';
import InputGroupWithFormItem from '@/components/InputGroupWithFormItem';
import EmptyDatasourcePopover from '@/components/DatasourceSelect/EmptyDatasourcePopover';
import { CommonStateContext } from '@/App';
import { getTraceInstances, getTraceServices } from '@/pages/traceCpt/services';
import type { SearchTraceIDType, SearchTraceType } from '@/pages/traceCpt/type';
import { TRACING_PLUGIN_TYPES } from '@/dh/trace';
import type { TracePluginType } from '@/dh/trace';
import { isValidDurationSeconds, secondsToDurationMin } from '../duration';
import { TRACE_SEARCH_DEFAULT_LIMIT, TRACE_SEARCH_DEFAULT_RANGE, TRACE_SEARCH_MAX_LIMIT, TRACE_SEARCH_RANGE_LS, resolveNumTraces } from './searchDefaults';

interface IProps {
  init?: string;
  initPluginId?: number;
  initPluginType?: TracePluginType;
  /** Prefill Service when opening from the service page (no trace id). */
  initService?: string;
  /** Prefill the time window (e.g. topology → traces with the same range). */
  initRange?: IRawTimeRange;
  /** Kept for deep-link compat; tags filter was removed from the compact bar. */
  initTags?: string;
  /** Service-detail embed: pin investigation context (type + datasource + service). */
  lockService?: boolean;
  onSearch: (item: SearchTraceType | SearchTraceIDType) => void;
  resultLoading: boolean;
}

function getGroupOptions(services: { label: string; value: string; group?: string }[]): string[] {
  const groups = services.map((item) => item.group).filter((g): g is string => Boolean(g));
  return Array.from(new Set(groups)).sort();
}

/** Input.Group defaults to width 100%; keep clusters content-sized so 27"/55" screens do not stretch fields. */
const inlineGroupClass =
  'w-auto shrink-0 [&_.ant-form-item]:mb-0 [&_.input-group-with-form-item-label]:max-w-none [&_.input-group-with-form-item-content]:w-auto';
const toolbarClass = 'flex max-w-full flex-col gap-2';
const toolbarRowClass = 'inline-flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto';
/** Hug picker text (e.g. 「最近 15 分钟」). Empty look is the control's own padding, not a missing column. */
const timeRangeGroupClass =
  'inline-flex w-max shrink-0 [&_.ant-form-item]:mb-0 [&_.input-group-with-form-item-label]:max-w-none [&_.input-group-with-form-item-content]:w-auto [&_.input-group-with-form-item-content]:shrink-0 [&_.flashcat-timeRangePicker-target]:inline-flex [&_.flashcat-timeRangePicker-target]:w-max [&_.flashcat-timeRangePicker-target]:text-left';
const traceIdFieldClass = 'mb-0 w-[400px] max-w-full';

export default function Search(props: IProps) {
  const { t } = useTranslation('trace');
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const { onSearch, resultLoading, init, initPluginId, initPluginType, initService, initRange, lockService } = props;
  /** Same flag as lockService: embed locks type + datasource + service together. */
  const contextLocked = Boolean(lockService && initService);
  const [cate, setCate] = useState<TracePluginType>(initPluginType || 'jaeger');
  const datasourceList = groupedDatasourceList[cate] || [];
  const [curPlugin, setCurPlugin] = useState<number>();
  const [isTraceId, setIsTraceId] = useState(!!init);
  const [services, setServices] = useState<{ label: string; value: string; group?: string }[]>([]);
  const [group, setGroup] = useState<string>('');
  const [instances, setInstances] = useState<{ label: string; value: string }[]>([]);
  const groupOptions = getGroupOptions(services);
  const filteredServices = group ? services.filter((item) => item.group === group) : services;
  const serviceSelectOptions =
    contextLocked && initService && !filteredServices.some((item) => item.value === initService)
      ? [{ label: initService, value: initService }, ...filteredServices]
      : filteredServices;
  const hasInstanceCol = instances.length > 1;
  const [range, setRange] = useState<IRawTimeRange>(
    () => initRange || getDefaultValue(TRACE_SEARCH_RANGE_LS, TRACE_SEARCH_DEFAULT_RANGE) || TRACE_SEARCH_DEFAULT_RANGE,
  );
  const parsedRange = parseRange(range);

  const [search, setSearch] = useState<SearchTraceType>({
    data_source_id: 0,
    service: lockService && initService ? initService : '',
    operation: '',
    start_time_min: moment().subtract(15, 'm').valueOf(),
    start_time_max: moment().valueOf(),
    plugin_type: 'jaeger',
    num_traces: TRACE_SEARCH_DEFAULT_LIMIT,
  });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const didApplyInitService = useRef(false);
  const didAutoSearchService = useRef(false);

  useEffect(() => {
    if (initPluginType) return;
    const preferred = TRACING_PLUGIN_TYPES.find((item) => (groupedDatasourceList[item.value] || []).length > 0)?.value || 'jaeger';
    setCate(preferred);
  }, []);

  useEffect(() => {
    const tempList = groupedDatasourceList[cate] || [];
    if (tempList?.length > 0) {
      const firstAvailableId = initPluginId || tempList[0].id;
      setCurPlugin(firstAvailableId);
      setSearch((prev) => ({ ...prev, plugin_type: cate, data_source_id: firstAvailableId }));
      if (!isTraceId) {
        fetchService(firstAvailableId, cate);
      }
      if (init) {
        form.setFieldsValue({ traceId: init });
        onSearch({ data_source_id: firstAvailableId, traceID: init, plugin_type: cate });
      }
    } else {
      setCurPlugin(undefined);
      setServices([]);
      setInstances([]);
    }
  }, [cate]);

  const fetchService = async (dataSourceId: number, pluginType: TracePluginType = cate) => {
    try {
      setLoading(true);
      const startMs = moment(parsedRange.start).valueOf();
      const endMs = moment(parsedRange.end).valueOf();
      const serviceRes = await getTraceServices(dataSourceId, pluginType, startMs, endMs);
      setServices(serviceRes);
      setGroup('');
      const nextService = contextLocked && initService ? initService : '';
      setSearch((prev) => ({ ...prev, service: nextService, instance: undefined, plugin_type: pluginType }));
      if (nextService) {
        fetchInstances(dataSourceId, nextService, pluginType);
      } else {
        setInstances([]);
      }
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  };

  const fetchInstances = async (dataSourceId: number, service: string, pluginType: TracePluginType = cate) => {
    setSearch((prev) => ({ ...prev, instance: undefined }));
    if (!service) {
      setInstances([]);
      return;
    }
    try {
      const startMs = moment(parsedRange.start).valueOf();
      const endMs = moment(parsedRange.end).valueOf();
      const instanceRes = await getTraceInstances(dataSourceId, service, pluginType, startMs, endMs);
      setInstances(instanceRes);
    } catch (e) {
      setInstances([]);
    }
  };

  const handleCateChange = (next: TracePluginType) => {
    if (contextLocked) return;
    setCate(next);
    setSearch((prev) => ({ ...prev, plugin_type: next, service: '' }));
  };

  const handlePluginChange = async (id: number) => {
    if (contextLocked) return;
    setCurPlugin(id);
    if (isTraceId) {
      await form.validateFields(['traceId']);
      const traceID = form.getFieldValue('traceId');
      onSearch({ data_source_id: id, traceID, plugin_type: cate });
    } else {
      setSearch((prev) => ({ ...prev, service: '', data_source_id: id, plugin_type: cate }));
      fetchService(id, cate);
    }
  };

  const handleTypeSwitch = () => {
    setIsTraceId(!isTraceId);
    if (isTraceId) {
      if (curPlugin) {
        fetchService(curPlugin, cate);
      }
    } else {
      form.setFieldsValue({ traceId: '' });
    }
  };

  const handleServiceChange = (nextService?: string) => {
    if (contextLocked) return;
    const service = nextService || '';
    setSearch((prev) => ({ ...prev, service, instance: undefined, plugin_type: cate }));
    if (service && curPlugin) {
      fetchInstances(curPlugin, service, cate);
    } else {
      setInstances([]);
    }
  };

  useEffect(() => {
    if (didApplyInitService.current || init || !initService) return;
    if (contextLocked) {
      didApplyInitService.current = true;
      setSearch((prev) => ({ ...prev, service: initService, instance: undefined, plugin_type: cate }));
      if (curPlugin) fetchInstances(curPlugin, initService, cate);
      return;
    }
    if (services.length === 0) return;
    if (!services.some((item) => item.value === initService)) return;
    didApplyInitService.current = true;
    handleServiceChange(initService);
  }, [services, initService, init, contextLocked]);

  const handleGroupChange = (nextGroup?: string) => {
    const g = nextGroup || '';
    setGroup(g);
    if (contextLocked) return;
    setSearch((prev) => ({ ...prev, service: '', instance: undefined, plugin_type: cate }));
    setInstances([]);
  };

  const handleInstanceChange = (nextInstance?: string) => {
    setSearch((prev) => ({ ...prev, instance: nextInstance || undefined }));
  };

  const handleSearch = async (byTraceId: boolean) => {
    if (!curPlugin) return;
    if (byTraceId) {
      await form.validateFields(['traceId']);
      const traceID = form.getFieldValue('traceId');
      onSearch({ data_source_id: curPlugin, traceID, plugin_type: cate });
      return;
    }
    await form.validateFields(['duration_min_s', 'num_traces']);
    const { duration_min_s, num_traces } = form.getFieldsValue(['duration_min_s', 'num_traces']);
    const queryService = contextLocked && initService ? initService : search.service;
    onSearch({
      ...search,
      service: queryService,
      start_time_min: moment(parsedRange.start).valueOf(),
      start_time_max: moment(parsedRange.end).valueOf(),
      data_source_id: curPlugin,
      operation: '',
      duration_min: secondsToDurationMin(duration_min_s),
      duration_max: undefined,
      attributes: undefined,
      num_traces: resolveNumTraces(num_traces),
      service_name: services.find((item) => item.value === queryService)?.label || (contextLocked ? initService : undefined),
      plugin_type: cate,
    });
  };

  useEffect(() => {
    if (didAutoSearchService.current || init || !initService || !curPlugin) return;
    if (search.service !== initService) return;
    didAutoSearchService.current = true;
    handleSearch(false);
  }, [search.service, initService, curPlugin, init]);

  const queryButton = (
    <Button className='shrink-0' type='primary' onClick={() => handleSearch(isTraceId)} loading={loading || resultLoading}>
      {t('query')}
    </Button>
  );

  return (
    <Spin spinning={loading}>
      <Form form={form} initialValues={{ num_traces: TRACE_SEARCH_DEFAULT_LIMIT }}>
        <div className={toolbarClass}>
          <div className={toolbarRowClass}>
            <InputGroupWithFormItem className={inlineGroupClass} label={t('common:datasource.type')}>
              <span title={contextLocked ? t('search.datasource_locked') : undefined}>
                <Select
                  dropdownMatchSelectWidth={false}
                  className='w-[120px]'
                  value={cate}
                  onChange={handleCateChange}
                  disabled={contextLocked}
                >
                  {TRACING_PLUGIN_TYPES.map((item) => (
                    <Select.Option key={item.value} value={item.value}>
                      {item.label}
                    </Select.Option>
                  ))}
                </Select>
              </span>
            </InputGroupWithFormItem>
            <div className='shrink-0'>
              <EmptyDatasourcePopover datasourceList={datasourceList}>
                <InputGroupWithFormItem className={inlineGroupClass} label={t('common:datasource.id')}>
                  <span title={contextLocked ? t('search.datasource_locked') : undefined}>
                    <Select
                      dropdownMatchSelectWidth={false}
                      className='w-40 [&_.ant-select-selection-item]:truncate'
                      value={curPlugin}
                      onChange={handlePluginChange}
                      disabled={contextLocked}
                    >
                      {datasourceList.map((item) => (
                        <Select.Option value={item.id} key={item.id}>
                          {item.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </span>
                </InputGroupWithFormItem>
              </EmptyDatasourcePopover>
            </div>
            <Radio.Group className='shrink-0' optionType='button' buttonStyle='solid' value={isTraceId} onChange={handleTypeSwitch}>
              <Radio value={false}>{t('mode.query')}</Radio>
              <Radio value={true}>{t('mode.id')}</Radio>
            </Radio.Group>
          </div>

          {!isTraceId ? (
            <div className={toolbarRowClass}>
              {groupOptions.length > 0 && !contextLocked && (
                <InputGroupWithFormItem className={inlineGroupClass} label={t('group')}>
                  <Select
                    dropdownMatchSelectWidth={false}
                    className='w-40'
                    value={group || undefined}
                    allowClear
                    placeholder={t('all_groups')}
                    onChange={(val) => handleGroupChange(val)}
                    showSearch
                    filterOption={(input, option: any) => (option.children || '').indexOf(input) >= 0}
                  >
                    {groupOptions.map((g) => (
                      <Select.Option value={g} key={g}>
                        {g}
                      </Select.Option>
                    ))}
                  </Select>
                </InputGroupWithFormItem>
              )}
              <InputGroupWithFormItem className={inlineGroupClass} label='Service'>
                <span title={contextLocked ? t('search.service_locked') : undefined}>
                  <Select
                    dropdownMatchSelectWidth={false}
                    className='w-[200px] [&_.ant-select-selection-item]:truncate'
                    onChange={handleServiceChange}
                    value={(contextLocked ? initService : search.service) || undefined}
                    allowClear={!contextLocked}
                    disabled={contextLocked}
                    placeholder={t('all_services')}
                    showSearch={!contextLocked}
                    filterOption={(input, option: any) => (option.children || '').indexOf(input) >= 0}
                  >
                    {serviceSelectOptions.map((item) => (
                      <Select.Option value={item.value} key={item.value}>
                        {item.label}
                      </Select.Option>
                    ))}
                  </Select>
                </span>
              </InputGroupWithFormItem>
              {hasInstanceCol && (
                <InputGroupWithFormItem className={inlineGroupClass} label={t('instance')}>
                  <Select
                    dropdownMatchSelectWidth={false}
                    className='w-40'
                    value={search.instance || undefined}
                    allowClear
                    placeholder={t('all_instances')}
                    onChange={handleInstanceChange}
                    showSearch
                    filterOption={(input, option: any) => (option.children || '').indexOf(input) >= 0}
                  >
                    {instances.map((item) => (
                      <Select.Option value={item.value} key={item.value}>
                        {item.label}
                      </Select.Option>
                    ))}
                  </Select>
                </InputGroupWithFormItem>
              )}
              <InputGroupWithFormItem className={timeRangeGroupClass} label={t('time')}>
                <TimeRangePicker localKey={TRACE_SEARCH_RANGE_LS} value={range} onChange={(val) => val && setRange(val)} />
              </InputGroupWithFormItem>
              <InputGroupWithFormItem className={inlineGroupClass} label={`${t('search.duration_gt')} (${t('search.duration_unit')})`}>
                <Form.Item
                  name='duration_min_s'
                  validateTrigger='onBlur'
                  rules={[
                    {
                      validator: async (_, value) => {
                        if (isValidDurationSeconds(value)) return;
                        throw new Error(t('search.duration_invalid'));
                      },
                    },
                  ]}
                >
                  <InputNumber
                    min={0}
                    step={0.01}
                    className='w-20'
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearch(false);
                    }}
                  />
                </Form.Item>
              </InputGroupWithFormItem>
              <InputGroupWithFormItem className={inlineGroupClass} label={t('num_traces')}>
                <Form.Item
                  name='num_traces'
                  validateTrigger='onBlur'
                  rules={[
                    {
                      validator: async (_, value) => {
                        if (value == null || value === '') return;
                        const n = typeof value === 'number' ? value : Number(value);
                        if (!Number.isFinite(n) || n <= TRACE_SEARCH_MAX_LIMIT) return;
                        throw new Error(t('search.num_traces_max'));
                      },
                    },
                  ]}
                >
                  <InputNumber
                    min={1}
                    max={TRACE_SEARCH_MAX_LIMIT}
                    className='w-20'
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSearch(false);
                    }}
                  />
                </Form.Item>
              </InputGroupWithFormItem>
              {queryButton}
            </div>
          ) : (
            <div className={toolbarRowClass}>
              <Form.Item
                name='traceId'
                className={traceIdFieldClass}
                rules={[
                  {
                    required: true,
                    message: t('traceid_msg'),
                  },
                ]}
              >
                <Input placeholder='traceId' onPressEnter={() => handleSearch(true)} />
              </Form.Item>
              {queryButton}
            </div>
          )}
        </div>
      </Form>
    </Spin>
  );
}
