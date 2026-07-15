import React, { useContext, useEffect, useState } from 'react';
import { Row, Col, Select, Space, Button, Input, Tooltip, InputNumber, Spin, Form, Radio } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import _ from 'lodash';
import moment from 'moment';
import { useTranslation, Trans } from 'react-i18next';
import logfmtParser from 'logfmt/lib/logfmt_parser';
import TimeRangePicker, { IRawTimeRange, parseRange } from '@/components/TimeRangePicker';
import InputGroupWithFormItem from '@/components/InputGroupWithFormItem';
import EmptyDatasourcePopover from '@/components/DatasourceSelect/EmptyDatasourcePopover';
import { CommonStateContext } from '@/App';
import { SearchTraceType, SearchTraceIDType } from './type';
import LabelField from './components/LabelField';
import { getTraceServices, getTraceOperation } from './services';
import { TRACING_PLUGIN_TYPES } from '@/dh/trace';
import type { TracePluginType } from '@/dh/trace';

interface IProps {
  init?: string;
  initPluginId?: number;
  onSearch: (item: SearchTraceType | SearchTraceIDType) => void;
  resultLoading: boolean;
}

export const placeholderDurationFields = 'e.g. 1.2s,100ms,500us';
export function validateDurationFields(_, value) {
  if (!value) return Promise.resolve();
  return /\d[\d\\.]*(us|ms|s|m|h)$/.test(value) ? Promise.resolve() : Promise.reject(new Error(`${placeholderDurationFields}`));
}

export function convTagsLogfmt(tags) {
  if (!tags) {
    return null;
  }
  const data = logfmtParser.parse(tags);
  Object.keys(data).forEach((key) => {
    const value = data[key];
    // make sure all values are strings
    // https://github.com/jaegertracing/jaeger/issues/550#issuecomment-352850811
    if (typeof value !== 'string') {
      data[key] = String(value);
    }
  });
  return data;
}

export type { SearchTraceType };

export default function Index(props: IProps) {
  const { t } = useTranslation('trace');
  const { groupedDatasourceList } = useContext(CommonStateContext);
  const { onSearch, resultLoading, init, initPluginId } = props;
  const [cate, setCate] = useState<TracePluginType>('jaeger');
  const datasourceList = groupedDatasourceList[cate] || [];
  const [curPlugin, setCurPlugin] = useState<number>();
  const [isTraceId, setIsTraceId] = useState(false);
  const [services, setServices] = useState<{ label: string; value: string }[]>([]);
  const [operations, setOperations] = useState<{ label: string; value: string }[]>([]);
  const [range, setRange] = useState<IRawTimeRange>({
    start: 'now-12h',
    end: 'now',
  });
  const parsedRange = parseRange(range);

  const [search, setSearch] = useState<SearchTraceType>({
    data_source_id: 0,
    service: '',
    operation: '',
    start_time_min: moment().subtract(12, 'h').valueOf(),
    start_time_max: moment().valueOf(),
    plugin_type: 'jaeger',
  });
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    // Prefer a cate that actually has configured datasources
    const preferred =
      TRACING_PLUGIN_TYPES.find((item) => (groupedDatasourceList[item.value] || []).length > 0)?.value || 'jaeger';
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
      setOperations([]);
    }
  }, [cate]);

  const fetchService = async (dataSourceId: number, pluginType: TracePluginType = cate) => {
    try {
      setLoading(true);
      const startMs = moment(parsedRange.start).valueOf();
      const endMs = moment(parsedRange.end).valueOf();
      const serviceRes = await getTraceServices(dataSourceId, pluginType, startMs, endMs);
      setServices(serviceRes);
      if (serviceRes.length > 0) {
        const first = serviceRes[0];
        setSearch((prev) => ({
          ...prev,
          service: first.value,
          plugin_type: pluginType,
        }));
        await fetchOperation(dataSourceId, first.value, pluginType);
      }
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  };

  const fetchOperation = async (dataSourceId: number, service: string, pluginType: TracePluginType = cate) => {
    try {
      setLoading(true);
      const startMs = moment(parsedRange.start).valueOf();
      const endMs = moment(parsedRange.end).valueOf();
      const operationRes = await getTraceOperation(dataSourceId, service, pluginType, startMs, endMs);
      setOperations(operationRes.map((operation) => ({ label: operation, value: operation })));
      operationRes.length > 0 && form.setFieldsValue({ operation: operationRes[0] });
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  };

  const handleCateChange = (next: TracePluginType) => {
    setCate(next);
    setSearch((prev) => ({ ...prev, plugin_type: next, service: '' }));
    form.setFieldsValue({ operation: '' });
  };

  const handlePluginChange = async (id: number) => {
    setCurPlugin(id);
    if (isTraceId) {
      await form.validateFields();
      const traceID = form.getFieldValue('traceId');
      onSearch({ data_source_id: id, traceID, plugin_type: cate });
    } else {
      setSearch((prev) => ({ ...prev, service: '', data_source_id: id, plugin_type: cate }));
      form.setFieldsValue({ operation: '' });
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
  const handleServiceChange = async (service: string) => {
    setSearch({ ...search, service, plugin_type: cate });
    fetchOperation(curPlugin!, service, cate);
  };

  const handleSearch = async (byTraceId: boolean) => {
    if (!curPlugin) return;
    if (byTraceId) {
      await form.validateFields();
      const traceID = form.getFieldValue('traceId');
      onSearch({ data_source_id: curPlugin, traceID, plugin_type: cate });
    } else {
      await form.validateFields();
      const { attributes, duration_max, duration_min, operation } = form.getFieldsValue();

      const searchItems = {
        ...search,
        start_time_min: moment(parsedRange.start).valueOf(),
        start_time_max: moment(parsedRange.end).valueOf(),
        data_source_id: curPlugin,
        operation,
        duration_max,
        duration_min,
        attributes: convTagsLogfmt(attributes),
        plugin_type: cate,
      };
      onSearch(searchItems);
    }
  };

  return (
    <Spin spinning={loading}>
      <div className='tracing-search'>
        <Form form={form}>
          <Row gutter={8}>
            <Col span={24}>
              <Space style={{ width: '100%', justifyContent: 'start', marginBottom: 8 }}>
                <InputGroupWithFormItem label={t('common:datasource.type')}>
                  <Select
                    dropdownMatchSelectWidth={false}
                    style={{ width: '100%' }}
                    value={cate}
                    onChange={handleCateChange}
                  >
                    {_.map(TRACING_PLUGIN_TYPES, (item) => (
                      <Select.Option key={item.value} value={item.value}>
                        {item.label}
                      </Select.Option>
                    ))}
                  </Select>
                </InputGroupWithFormItem>
                <EmptyDatasourcePopover datasourceList={datasourceList}>
                  <InputGroupWithFormItem label={t('common:datasource.id')}>
                    <Select style={{ minWidth: 121 }} value={curPlugin} onChange={handlePluginChange}>
                      {_.map(datasourceList, (item) => (
                        <Select.Option value={item.id} key={item.id}>
                          {item.name}
                        </Select.Option>
                      ))}
                    </Select>
                  </InputGroupWithFormItem>
                </EmptyDatasourcePopover>
                <Radio.Group optionType='button' buttonStyle='solid' value={isTraceId} onChange={handleTypeSwitch}>
                  <Radio value={false}>{t('mode.query')}</Radio>
                  <Radio value={true}>{t('mode.id')}</Radio>
                </Radio.Group>
              </Space>
            </Col>

            {!isTraceId ? (
              <>
                <Col span={8}>
                  <LabelField label='Service'>
                    <Select
                      dropdownMatchSelectWidth={false}
                      style={{ width: '100%' }}
                      onChange={handleServiceChange}
                      value={search.service}
                      className='ellipse-when-overflow'
                      showSearch
                      filterOption={(input, option: any) => option.children.indexOf(input) >= 0}
                    >
                      {services.map((item) => (
                        <Select.Option value={item.value} key={item.value}>
                          {item.label}
                        </Select.Option>
                      ))}
                    </Select>
                  </LabelField>
                </Col>
                <Col span={8}>
                  <LabelField label='Operation'>
                    <Form.Item name='operation' style={{ width: '100%' }}>
                      <Select dropdownMatchSelectWidth={false} style={{ width: '100%' }} showSearch allowClear>
                        {operations.map((item) => (
                          <Select.Option value={item.value} key={item.value}>
                            {item.label}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </LabelField>
                </Col>
                <Col span={8}>
                  <LabelField
                    label={
                      <span>
                        {t('label')}
                        <Tooltip
                          overlayInnerStyle={{ width: 276 }}
                          title={
                            <div style={{ width: 260 }}>
                              <Trans ns='trace' i18nKey='label_tip'>
                                <div>
                                  值支持
                                  <a href='https://brandur.org/logfmt' target='_blank' style={{ color: 'white', fontWeight: 'bold', marginLeft: 5, marginRight: 5 }}>
                                    logfmt
                                  </a>
                                  格式
                                </div>
                                <div>空格分割</div>
                                <div>包含空格的字符串需要引号包裹</div>
                              </Trans>
                              <hr />
                              <div>error=true db.statement="select * from User"</div>
                            </div>
                          }
                        >
                          <InfoCircleOutlined style={{ marginLeft: 4 }} />
                        </Tooltip>
                      </span>
                    }
                  >
                    <Form.Item name='attributes' style={{ flex: 1 }}>
                      <Input placeholder='http.status_code=200 error=true' onPressEnter={() => handleSearch(false)} />
                    </Form.Item>
                  </LabelField>
                </Col>
                <Col flex='200px'>
                  <LabelField label={t('time')}>
                    <TimeRangePicker style={{ width: '100%' }} value={range} onChange={setRange} />
                  </LabelField>
                </Col>
                <Col flex='200px'>
                  <LabelField label={t('duration_max')}>
                    <Form.Item
                      name='duration_max'
                      validateTrigger='onBlur'
                      rules={[
                        {
                          validator: validateDurationFields,
                        },
                      ]}
                    >
                      <Input style={{ width: '100%' }} placeholder='1.2s,100ms,500us' onPressEnter={() => handleSearch(false)} />
                    </Form.Item>
                  </LabelField>
                </Col>
                <Col flex='200px'>
                  <LabelField label={t('duration_min')}>
                    <Form.Item
                      validateTrigger='onBlur'
                      name='duration_min'
                      rules={[
                        {
                          validator: validateDurationFields,
                        },
                      ]}
                    >
                      <Input min={0} style={{ width: '100%' }} placeholder='1.2s,100ms,500us' onPressEnter={() => handleSearch(false)} />
                    </Form.Item>
                  </LabelField>
                </Col>
                <Col flex='1'>
                  <LabelField label={t('num_traces')}>
                    <InputNumber
                      min={0}
                      style={{ width: '100%' }}
                      value={search.num_traces}
                      onChange={(num_traces: number) => setSearch({ ...search, num_traces })}
                      onPressEnter={() => handleSearch(false)}
                    />
                  </LabelField>
                </Col>

                <Col span={24}>
                  <Space style={{ width: '100%', justifyContent: 'end' }}>
                    <Button type='primary' onClick={() => handleSearch(false)} loading={loading || resultLoading} style={{ marginBottom: 16 }}>
                      {t('query')}
                    </Button>
                  </Space>
                </Col>
              </>
            ) : (
              <Col span={24}>
                <Row gutter={8}>
                  <Col flex='auto'>
                    <Form.Item
                      name='traceId'
                      rules={[
                        {
                          required: true,
                          message: t('traceid_msg'),
                        },
                      ]}
                    >
                      <Input style={{ width: '100%' }} placeholder='traceId' onPressEnter={() => handleSearch(true)} />
                    </Form.Item>
                  </Col>
                  <Col flex='50px'>
                    <Button type='primary' onClick={() => handleSearch(true)}>
                      {t('query')}
                    </Button>
                  </Col>
                </Row>
              </Col>
            )}
          </Row>
        </Form>
      </div>
    </Spin>
  );
}
