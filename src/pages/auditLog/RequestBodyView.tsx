import React from 'react';
import { useTranslation } from 'react-i18next';

import { REDACTED_PLACEHOLDER, REQUEST_BODY_FIELD_LABELS } from './constants';

interface RequestBodyViewProps {
  raw: string;
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string' && value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) return true;
  return false;
}

function formatPrimitive(value: unknown, t: (key: string) => string): string {
  if (value == null) return t('detail.value_empty');
  if (typeof value === 'string') {
    if (value === REDACTED_PLACEHOLDER || value === '***REDACTED***') {
      return t('detail.value_redacted');
    }
    return value || t('detail.value_empty');
  }
  if (typeof value === 'boolean') return value ? t('detail.value_true') : t('detail.value_false');
  if (typeof value === 'number') return String(value);
  return String(value);
}

function fieldLabel(key: string, t: (key: string, fallback?: string) => string): string {
  const mapped = REQUEST_BODY_FIELD_LABELS[key];
  if (mapped) return mapped;
  return t(`request_fields.${key}`, key);
}

interface EntryRow {
  key: string;
  label: string;
  value: string;
}

function flattenEntries(data: unknown, t: (key: string, fallback?: string) => string, prefix = ''): EntryRow[] {
  if (data == null || typeof data !== 'object') {
    return [
      {
        key: prefix || 'value',
        label: prefix ? fieldLabel(prefix, t) : t('detail.request_body'),
        value: formatPrimitive(data, t),
      },
    ];
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return [
        {
          key: prefix || 'value',
          label: prefix ? fieldLabel(prefix, t) : t('detail.request_body'),
          value: t('detail.value_empty'),
        },
      ];
    }
    // 简单标量数组：拼成可读文本；对象数组：逐项展开
    const allPrimitive = data.every((item) => item == null || typeof item !== 'object');
    if (allPrimitive) {
      return [
        {
          key: prefix || 'value',
          label: prefix ? fieldLabel(prefix, t) : t('detail.request_body'),
          value: data.map((item) => formatPrimitive(item, t)).join('、'),
        },
      ];
    }
    const rows: EntryRow[] = [];
    data.forEach((item, idx) => {
      rows.push(...flattenEntries(item, t, prefix ? `${prefix}[${idx}]` : `[${idx}]`));
    });
    return rows;
  }

  const rows: EntryRow[] = [];
  Object.keys(data as Record<string, unknown>).forEach((key) => {
    const value = (data as Record<string, unknown>)[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (isEmptyValue(value)) {
      rows.push({
        key: path,
        label: fieldLabel(key, t),
        value: t('detail.value_empty'),
      });
      return;
    }
    if (value != null && typeof value === 'object') {
      if (Array.isArray(value)) {
        rows.push(...flattenEntries(value, t, key));
      } else if (Object.keys(value as object).length === 0) {
        rows.push({
          key: path,
          label: fieldLabel(key, t),
          value: t('detail.value_empty'),
        });
      } else {
        // 嵌套对象：作为子字段展开，标签用「父.子」可读形式
        Object.keys(value as Record<string, unknown>).forEach((childKey) => {
          const childVal = (value as Record<string, unknown>)[childKey];
          const childPath = `${key}.${childKey}`;
          if (childVal != null && typeof childVal === 'object') {
            rows.push(...flattenEntries(childVal, t, childPath));
          } else {
            rows.push({
              key: childPath,
              label: `${fieldLabel(key, t)} · ${fieldLabel(childKey, t)}`,
              value: formatPrimitive(childVal, t),
            });
          }
        });
      }
      return;
    }
    rows.push({
      key: path,
      label: fieldLabel(key, t),
      value: formatPrimitive(value, t),
    });
  });
  return rows;
}

export default function RequestBodyView({ raw }: RequestBodyViewProps) {
  const { t } = useTranslation('auditLog');

  if (!raw) {
    return <span className='text-soft'>{t('detail.request_body_empty')}</span>;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // 非 JSON：按纯文本行展示，避免整块代码灰底
    return <div className='whitespace-pre-wrap break-all text-base text-main'>{raw}</div>;
  }

  const entries = flattenEntries(parsed, t as (key: string, fallback?: string) => string);
  if (entries.length === 0) {
    return <span className='text-soft'>{t('detail.request_body_empty')}</span>;
  }

  return (
    <div className='flex flex-col gap-2'>
      {entries.map((row) => (
        <div key={row.key} className='flex gap-3 text-base leading-5'>
          <div className='w-[120px] shrink-0 text-hint'>{row.label}</div>
          <div className='min-w-0 flex-1 break-all text-main'>{row.value}</div>
        </div>
      ))}
    </div>
  );
}
