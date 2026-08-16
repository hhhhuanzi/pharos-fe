import React from 'react';
import { Col, Row } from 'antd';
import { useTranslation } from 'react-i18next';

import type { PodEventCategory, PodEventStats } from '@/dh/service';

import { NS } from '../constants';

function formatStat(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '0';
}

interface Props {
  stats: PodEventStats;
  onSelect?: (category: PodEventCategory) => void;
}

const CARDS: Array<{ key: PodEventCategory; tone: string }> = [
  { key: 'restart', tone: 'text-warning' },
  { key: 'crash', tone: 'text-error' },
  { key: 'pending', tone: 'text-alert' },
];

export default function PodStatsCards(props: Props) {
  const { stats, onSelect } = props;
  const { t } = useTranslation(NS);

  return (
    <Row gutter={16}>
      {CARDS.map((card) => {
        const stat = stats[card.key];
        const className = 'fc-border flex h-full min-h-[140px] w-full flex-col rounded-lg bg-fc-100 p-4 text-left';
        const body = (
          <>
            <div className='mb-3 shrink-0 text-base font-normal leading-none text-hint'>{t(`category.${card.key}`)}</div>
            <div className={`mb-3 text-l4 font-bold leading-none ${card.tone}`}>{formatStat(stat.occurrences)}</div>
            <div className='flex flex-col gap-1 text-base text-hint'>
              <div>
                {t('stats.events')} <span className='font-medium text-title'>{formatStat(stat.events)}</span>
              </div>
              <div>
                {t('stats.pods')} <span className='font-medium text-title'>{formatStat(stat.pods)}</span>
              </div>
            </div>
          </>
        );

        return (
          <Col key={card.key} span={8}>
            {onSelect ? (
              <button type='button' className={`${className} cursor-pointer hover:bg-fc-150`} onClick={() => onSelect(card.key)}>
                {body}
              </button>
            ) : (
              <div className={className}>{body}</div>
            )}
          </Col>
        );
      })}
    </Row>
  );
}
