import React, { useMemo } from 'react';
import { Button, Empty } from 'antd';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import type { PodEventStats } from '@/dh/service';

import { NS } from '../constants';
import EventKeywordSearch from './EventKeywordSearch';
import PodStatsCards from './PodStatsCards';

export const EVENT_DASHBOARD_SOURCES = [
  { key: 'k8s', available: true, aliases: ['k8s', 'kubernetes', 'kube'] },
  { key: 'logs', available: false, aliases: ['logs', 'log'] },
  { key: 'traces', available: false, aliases: ['traces', 'trace', 'tracing'] },
] as const;

type SourceKey = (typeof EVENT_DASHBOARD_SOURCES)[number]['key'];

interface Props {
  stats: PodEventStats;
  k8sPath: string;
  sourceQuery: string;
  onSourceQuery: (value: string) => void;
}

function sourceMatches(key: SourceKey, aliases: readonly string[], label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [key, label, ...aliases].some((item) => item.toLowerCase().includes(q));
}

export default function SourceDashboard(props: Props) {
  const { stats, k8sPath, sourceQuery, onSourceQuery } = props;
  const { t } = useTranslation(NS);

  const visible = useMemo(() => EVENT_DASHBOARD_SOURCES.filter((source) => sourceMatches(source.key, source.aliases, t(`sources.${source.key}`), sourceQuery)), [sourceQuery, t]);

  return (
    <div>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='text-l2 font-bold text-title'>{t('dashboard.title')}</div>
        <EventKeywordSearch value={sourceQuery} onChange={onSourceQuery} placeholder={t('dashboard.search_placeholder')} />
      </div>
      <div className='mb-3 text-base text-hint'>{t('dashboard.hint')}</div>
      {visible.length === 0 ? (
        <div className='flex min-h-[140px] items-center justify-center rounded-lg bg-fc-100 fc-border'>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('dashboard.source_empty')} />
        </div>
      ) : (
        <div className='flex flex-col gap-4'>
          {visible.map((source) =>
            source.available ? (
              <div key={source.key}>
                <div className='mb-3 flex flex-wrap items-start justify-between gap-2'>
                  <div>
                    <div className='text-l1 font-bold text-title'>{t(`sources.${source.key}`)}</div>
                    <div className='mt-1 text-base text-hint'>{t(`sources.${source.key}_desc`)}</div>
                  </div>
                  <Link to={k8sPath}>
                    <Button type='link' className='px-0'>
                      {t('dashboard.open_k8s')}
                    </Button>
                  </Link>
                </div>
                <PodStatsCards stats={stats} />
              </div>
            ) : (
              <div key={source.key} className='fc-border flex min-h-[140px] flex-col rounded-lg bg-fc-100 p-4'>
                <div className='mb-3 text-l1 font-bold text-title'>{t(`sources.${source.key}`)}</div>
                <div className='text-base text-hint'>{t('sources.unavailable')}</div>
                <div className='mt-1 text-base text-soft'>{t(`sources.${source.key}_desc`)}</div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
