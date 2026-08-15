import React from 'react';
import { message, Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';

import { NS } from './constants';
import { isLogJumpEnabled, resolveLogDeepLink } from './deepLink';

interface Props {
  traceId: string;
  /** Unix microseconds，与列表 startTimeUs / 详情 startTime 一致 */
  startUs: number;
  durationUs: number;
  pluginType?: string;
  /** list：最右列「查看」；detail：标题旁「查看日志」 */
  entry: 'list' | 'detail';
}

function openLogExplorer(url: string): void {
  const basePrefix = import.meta.env.VITE_PREFIX || '';
  window.open(`${basePrefix}${url}`, '_blank');
}

export default function ViewLogsLink(props: Props) {
  const { traceId, startUs, durationUs, pluginType, entry } = props;
  const { t } = useTranslation(NS);
  const label = entry === 'detail' ? t('view_logs') : t('view_logs_action');
  const enabled = isLogJumpEnabled(pluginType);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!enabled) return;
    const url = resolveLogDeepLink({ traceId, startUs, durationUs });
    if (!url) {
      message.warning(
        <div>
          <div>{t('logs_missing_config')}</div>
          <div className='mt-1'>{t('logs_missing_config_hint')}</div>
        </div>,
        8,
      );
      return;
    }
    openLogExplorer(url);
  };

  if (!enabled) {
    return (
      <Tooltip title={t('logs_unsupported')}>
        <span className={`text-disable cursor-not-allowed ${entry === 'detail' ? 'ml-3' : ''}`}>{label}</span>
      </Tooltip>
    );
  }

  return (
    <a className={entry === 'detail' ? 'ml-3' : undefined} onClick={handleClick}>
      {label}
    </a>
  );
}
