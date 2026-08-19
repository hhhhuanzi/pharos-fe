import React from 'react';
import { Col, Row } from 'antd';
import { useTranslation } from 'react-i18next';

import { K8S_EVENT_CATEGORIES, type PodEventCategory, type PodEventStats } from '@/dh/service';

import { NS } from '../constants';

function formatStat(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '0';
}

interface Props {
  stats: PodEventStats;
  onSelect?: (category: PodEventCategory) => void;
}

const CARD_TONE: Record<PodEventCategory, string> = {
  restart: 'text-warning',
  crash: 'text-error',
  pending: 'text-alert',
  oom: 'text-error',
  evicted: 'text-alert',
  image_pull: 'text-warning',
  probe: 'text-warning',
  volume: 'text-alert',
  node_not_ready: 'text-error',
};

const WORKLOAD_KEYS = K8S_EVENT_CATEGORIES.filter((key) => key !== 'node_not_ready');
const NODE_KEYS: PodEventCategory[] = ['node_not_ready'];

export default function PodStatsCards(props: Props) {
  const { stats, onSelect } = props;
  const { t } = useTranslation(NS);

  const renderCard = (key: PodEventCategory) => {
    const stat = stats[key];
    const className = 'fc-border flex h-full min-h-[140px] w-full flex-col rounded-lg bg-fc-100 p-4 text-left';
    const objectLabel = key === 'node_not_ready' ? t('stats.nodes') : t('stats.pods');
    const body = (
      <>
        <div className='mb-3 shrink-0 text-base font-normal leading-none text-hint'>{t(`category.${key}`)}</div>
        <div className={`mb-3 text-l4 font-bold leading-none ${CARD_TONE[key]}`}>{formatStat(stat.occurrences)}</div>
        <div className='flex flex-col gap-1 text-base text-hint'>
          <div>
            {t('stats.events')} <span className='font-medium text-title'>{formatStat(stat.events)}</span>
          </div>
          <div>
            {objectLabel} <span className='font-medium text-title'>{formatStat(stat.pods)}</span>
          </div>
          {key === 'pending' ? <div className='text-soft'>{t('category.pending_hint')}</div> : null}
        </div>
      </>
    );

    return (
      <Col key={key} span={8}>
        {onSelect ? (
          <button type='button' className={`${className} cursor-pointer hover:bg-fc-150`} onClick={() => onSelect(key)}>
            {body}
          </button>
        ) : (
          <div className={className}>{body}</div>
        )}
      </Col>
    );
  };

  const health = stats.health;

  return (
    <div className='flex flex-col gap-4'>
      <div>
        <div className='mb-3 text-l1 font-bold text-title'>{t('section.workload')}</div>
        <Row gutter={[16, 16]}>{WORKLOAD_KEYS.map(renderCard)}</Row>
      </div>
      <div>
        <div className='mb-3 text-l1 font-bold text-title'>{t('section.node')}</div>
        <Row gutter={[16, 16]}>{NODE_KEYS.map(renderCard)}</Row>
      </div>
      <div>
        <div className='mb-3 text-l1 font-bold text-title'>{t('section.health')}</div>
        <div className='fc-border flex min-h-[140px] flex-col rounded-lg bg-fc-100 p-4'>
          <div className='mb-3 shrink-0 text-base font-normal leading-none text-hint'>{t('health.warning')}</div>
          <div className='mb-3 text-l4 font-bold leading-none text-warning'>{formatStat(health.warning)}</div>
          <Row gutter={8}>
            <Col span={8}>
              <div className='rounded-lg bg-fc-50 p-3'>
                <div className='truncate text-hint' title={t('health.normal')}>
                  {t('health.normal')}
                </div>
                <div className='font-bold text-title'>{formatStat(health.normal)}</div>
              </div>
            </Col>
            <Col span={8}>
              <div className='rounded-lg bg-fc-50 p-3'>
                <div className='truncate text-hint' title={t('health.namespaces')}>
                  {t('health.namespaces')}
                </div>
                <div className='font-bold text-title'>{formatStat(health.namespaces)}</div>
              </div>
            </Col>
            <Col span={8}>
              <div className='rounded-lg bg-fc-50 p-3'>
                <div className='truncate text-hint' title={t('health.pods')}>
                  {t('health.pods')}
                </div>
                <div className='font-bold text-title'>{formatStat(health.pods)}</div>
              </div>
            </Col>
          </Row>
        </div>
      </div>
    </div>
  );
}
