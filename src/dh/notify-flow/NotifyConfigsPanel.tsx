import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Form, Segmented, Space } from 'antd';
import { CopyOutlined, FullscreenExitOutlined, FullscreenOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { FormListFieldData } from 'antd/lib/form/FormList';
import { useTranslation } from 'react-i18next';
import _ from 'lodash';

import { getItems as getNotificationTemplates } from '@/pages/notificationTemplates/services';
import { DEFAULT_VALUES, NS } from '@/pages/notificationRules/constants';
import RuleConfig from '@/pages/notificationRules/pages/Form/RuleConfig';

import { buildNotifyFlowGraph } from './buildGraph';
import NotifyFlowCanvas from './NotifyFlowCanvas';
import type { NotifyConfigValue, NotifyFlowFocus, NotifyFlowLookups } from './types';

export type NotifyViewMode = 'graph' | 'cards';

interface NamedItem {
  id: number;
  name: string;
}

export interface NotifyConfigsPanelProps {
  disabled?: boolean;
  fields: FormListFieldData[];
  add: (defaultValue?: unknown, insertIndex?: number) => void;
  remove: (index: number | number[]) => void;
  move: (from: number, to: number) => void;
  eventKeys: string[];
  expandFiltersSignal?: { indices: number[]; ts: number } | null;
  focusNotifySignal?: { index: number; ts: number } | null;
  channels: NamedItem[];
  userGroups: NamedItem[];
}

function toNameMap(items: NamedItem[] | undefined): Record<number, string> {
  const map: Record<number, string> = {};
  if (!Array.isArray(items)) return map;
  for (const item of items) {
    if (typeof item?.id === 'number' && typeof item?.name === 'string') {
      map[item.id] = item.name;
    }
  }
  return map;
}

function fieldDomId(index: number, focus?: NotifyFlowFocus): string | undefined {
  if (focus === 'filters') return `notify_configs_${index}_severities`;
  if (focus === 'channel') return `notify_configs_${index}_channel_id`;
  if (focus === 'template') return `notify_configs_${index}_template_id`;
  return undefined;
}

export default function NotifyConfigsPanel(props: NotifyConfigsPanelProps) {
  const { t } = useTranslation(NS);
  const { disabled, fields, add, remove, move, eventKeys, expandFiltersSignal, focusNotifySignal, channels, userGroups } = props;
  const form = Form.useFormInstance();
  const notifyConfigs = Form.useWatch('notify_configs', form) as NotifyConfigValue[] | undefined;

  const [viewMode, setViewMode] = useState<NotifyViewMode>('graph');
  const [drawerIndex, setDrawerIndex] = useState<number>();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerFocus, setDrawerFocus] = useState<NotifyFlowFocus>();
  const [localExpandSignal, setLocalExpandSignal] = useState<{ indices: number[]; ts: number } | null>(null);
  const [templates, setTemplates] = useState<NamedItem[]>([]);
  const [fitToken, setFitToken] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const ids = (notifyConfigs ?? []).map((item) => item?.channel_id).filter((id): id is number => typeof id === 'number');
    if (ids.length === 0) {
      setTemplates([]);
      return;
    }
    const uniqueIds = Array.from(new Set(ids));
    getNotificationTemplates(uniqueIds.join(','))
      .then((res) => {
        setTemplates(Array.isArray(res) ? res : []);
      })
      .catch(() => {
        setTemplates([]);
      });
  }, [JSON.stringify((notifyConfigs ?? []).map((item) => item?.channel_id))]);

  const lookups: NotifyFlowLookups = useMemo(
    () => ({
      channelNames: toNameMap(channels),
      templateNames: toNameMap(templates),
      teamNames: toNameMap(userGroups),
    }),
    [channels, templates, userGroups],
  );

  const fieldKeysSig = fields.map((field) => String(field.key)).join(',');
  const graph = useMemo(() => {
    const keys = fieldKeysSig
      ? fieldKeysSig.split(',').map((key) => {
          const asNumber = Number(key);
          return Number.isNaN(asNumber) ? key : asNumber;
        })
      : [];
    return buildNotifyFlowGraph(notifyConfigs, lookups, t, { keys });
  }, [notifyConfigs, lookups, t, fieldKeysSig]);

  const mergedExpandSignal = useMemo(() => {
    if (!expandFiltersSignal && !localExpandSignal) return null;
    if (!expandFiltersSignal) return localExpandSignal;
    if (!localExpandSignal) return expandFiltersSignal;
    return expandFiltersSignal.ts >= localExpandSignal.ts ? expandFiltersSignal : localExpandSignal;
  }, [expandFiltersSignal, localExpandSignal]);

  const closeDrawer = useCallback(() => {
    setDrawerVisible(false);
    setDrawerIndex(undefined);
    setDrawerFocus(undefined);
  }, []);

  const openDrawer = useCallback((index: number, focus?: NotifyFlowFocus) => {
    setDrawerIndex(index);
    setDrawerFocus(focus);
    setDrawerVisible(true);
    if (focus === 'filters') {
      setLocalExpandSignal({ indices: [index], ts: Date.now() });
    }
  }, []);

  const handleViewModeChange = (mode: NotifyViewMode) => {
    setViewMode(mode);
    if (mode === 'cards') {
      closeDrawer();
      setFullscreen(false);
    }
  };

  const bumpFit = useCallback(() => {
    setFitToken((token) => token + 1);
  }, []);

  const handleResetLayout = () => {
    setResetToken((token) => token + 1);
    bumpFit();
  };

  const handleRemove = useCallback(
    (index: number | number[]) => {
      const first = Array.isArray(index) ? index[0] : index;
      remove(index);
      bumpFit();
      if (typeof first !== 'number' || drawerIndex == null) return;
      if (drawerIndex === first) {
        closeDrawer();
      } else if (drawerIndex > first) {
        setDrawerIndex(drawerIndex - 1);
      }
    },
    [bumpFit, closeDrawer, drawerIndex, remove],
  );

  const handleAdd = useCallback(
    (defaultValue?: unknown, insertIndex?: number) => {
      const nextIndex = insertIndex ?? fields.length;
      add(defaultValue, insertIndex);
      bumpFit();
      if (viewMode === 'graph' && !disabled) {
        openDrawer(nextIndex);
      }
    },
    [add, bumpFit, disabled, fields.length, openDrawer, viewMode],
  );

  const handleToolbarAdd = () => {
    handleAdd(DEFAULT_VALUES.notify_configs[0]);
  };

  const handleToolbarCopy = () => {
    const source = drawerIndex ?? fields.length - 1;
    if (source < 0) return;
    const values = form.getFieldValue(['notify_configs', source]);
    handleAdd(_.cloneDeep(values), source + 1);
  };

  useEffect(() => {
    if (focusNotifySignal && typeof focusNotifySignal.index === 'number') {
      setViewMode('graph');
      openDrawer(focusNotifySignal.index, 'filters');
    }
  }, [focusNotifySignal, openDrawer]);

  useEffect(() => {
    if (!drawerVisible || drawerIndex == null) return;
    const id = fieldDomId(drawerIndex, drawerFocus);
    if (!id) return;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [drawerVisible, drawerIndex, drawerFocus, mergedExpandSignal]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !drawerVisible) {
        setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, drawerVisible]);

  const drawerField = drawerVisible && drawerIndex != null ? fields.find((field) => field.name === drawerIndex) : undefined;

  const renderRuleConfig = (field: FormListFieldData) => (
    <RuleConfig
      disabled={disabled}
      fields={fields}
      field={field}
      activeIndex={drawerIndex}
      setActiveIndex={setDrawerIndex}
      add={handleAdd}
      remove={handleRemove}
      move={move}
      eventKeys={eventKeys}
      expandFiltersSignal={mergedExpandSignal}
    />
  );

  const graphToolbar = (
    <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
      <div className='text-base text-hint'>{t('flow.parallel_hint')}</div>
      <Space>
        {!disabled ? (
          <>
            <Button size='small' icon={<PlusOutlined />} onClick={handleToolbarAdd}>
              {t('flow.add')}
            </Button>
            <Button size='small' icon={<CopyOutlined />} disabled={fields.length === 0} onClick={handleToolbarCopy}>
              {t('flow.copy')}
            </Button>
          </>
        ) : null}
        <Button size='small' icon={<UndoOutlined />} onClick={handleResetLayout}>
          {t('flow.reset_layout')}
        </Button>
        <Button
          size='small'
          icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? t('flow.exit_fullscreen') : t('flow.fullscreen')}
        </Button>
        {!fullscreen ? (
          <Segmented
            size='small'
            value={viewMode}
            onChange={(value) => handleViewModeChange(value as NotifyViewMode)}
            options={[
              { label: t('flow.view_graph'), value: 'graph' },
              { label: t('flow.view_cards'), value: 'cards' },
            ]}
          />
        ) : null}
      </Space>
    </div>
  );

  const handleCanvasDelete = useCallback(
    (index: number) => {
      handleRemove(index);
    },
    [handleRemove],
  );

  const canvas = (
    <NotifyFlowCanvas
      graph={graph}
      selectedIndex={drawerIndex}
      disabled={disabled}
      fill={fullscreen}
      fitToken={fitToken}
      resetToken={resetToken}
      onOpen={openDrawer}
      onDelete={disabled ? undefined : handleCanvasDelete}
    />
  );

  return (
    <div className='dh-notify-flow'>
      <div className={fullscreen ? 'fixed inset-0 z-[1000] flex flex-col bg-[var(--fc-fill-1)] p-4' : undefined}>
        {viewMode === 'graph' ? (
          graphToolbar
        ) : (
          <div className='mb-3 flex justify-end'>
            <Segmented
              size='small'
              value={viewMode}
              onChange={(value) => handleViewModeChange(value as NotifyViewMode)}
              options={[
                { label: t('flow.view_graph'), value: 'graph' },
                { label: t('flow.view_cards'), value: 'cards' },
              ]}
            />
          </div>
        )}
        {viewMode === 'graph' ? <div className={fullscreen ? 'min-h-0 flex-1' : undefined}>{canvas}</div> : null}
      </div>

      {fields.map((field) => {
        const inDrawer = viewMode === 'graph' && drawerVisible && drawerIndex === field.name;
        if (inDrawer) return null;
        return (
          <div key={field.key} style={{ display: viewMode === 'graph' ? 'none' : undefined }}>
            {renderRuleConfig(field)}
          </div>
        );
      })}

      {viewMode === 'cards' && !disabled ? (
        <Button className='w-full' type='dashed' onClick={handleToolbarAdd} icon={<PlusOutlined />}>
          {t('notification_configuration.add_btn')}
        </Button>
      ) : null}

      <Drawer
        title={t('flow.drawer_title', { index: (drawerIndex ?? 0) + 1 })}
        visible={Boolean(drawerVisible && drawerField)}
        onClose={closeDrawer}
        width={720}
        zIndex={1100}
        destroyOnClose={false}
        extra={
          !disabled && drawerIndex != null ? (
            <Button type='link' danger onClick={() => handleRemove(drawerIndex)}>
              {t('flow.delete')}
            </Button>
          ) : null
        }
      >
        {drawerField ? renderRuleConfig(drawerField) : null}
      </Drawer>
    </div>
  );
}
