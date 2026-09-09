import React from 'react';
import { Select } from 'antd';
import { useTranslation } from 'react-i18next';

import { NS } from '@/pages/service/constants';

import type { MonitoringInstanceOption } from '../instancePicker';

interface Props {
  value?: string;
  options: MonitoringInstanceOption[];
  onChange: (value: string) => void;
}

/**
 * Shared JVM Pod picker for heap-generation and non-heap charts only. Same `selectedInstance`.
 * No visible "当前 Pod" label — the control sits next to the panel title.
 */
const SELECT_CLASS =
  'min-w-[280px] max-w-[360px] [&_.ant-select-selector]:h-auto [&_.ant-select-selector]:min-h-[24px] [&_.ant-select-selector]:bg-fc-50 [&_.ant-select-selector]:border-[var(--fc-border-color)] [&_.ant-select-selection-item]:h-auto [&_.ant-select-selection-item]:whitespace-normal [&_.ant-select-selection-item]:break-all [&_.ant-select-selection-item]:leading-5';

const DROPDOWN_CLASS = '[&_.ant-select-item-option-content]:whitespace-normal [&_.ant-select-item-option-content]:break-all';

export default function InstanceSelect({ value, options, onChange }: Props) {
  const { t } = useTranslation(NS);

  return (
    <Select
      size='small'
      className={SELECT_CLASS}
      value={value}
      onChange={onChange}
      dropdownMatchSelectWidth={false}
      dropdownClassName={DROPDOWN_CLASS}
      aria-label={t('monitoring.jvm.pod')}
    >
      {options.map((option) => (
        <Select.Option key={option.value} value={option.value} title={option.label}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );
}
