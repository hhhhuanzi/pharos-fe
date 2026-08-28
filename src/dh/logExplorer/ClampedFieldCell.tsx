import React, { useLayoutEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

import { LOG_CELL_LINE_HEIGHT_PX, LOG_CELL_MAX_LINES } from './clampedField';

import './ClampedFieldCell.less';

interface ClampedFieldCellProps {
  children: React.ReactNode;
  onViewAll?: () => void;
  estimatedOverflow?: boolean;
}

export default function ClampedFieldCell(props: ClampedFieldCellProps) {
  const { children, onViewAll, estimatedOverflow } = props;
  const { t } = useTranslation('log_explorer');
  const contentRef = useRef<HTMLDivElement>(null);
  const [measuredOverflow, setMeasuredOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    setMeasuredOverflow(el.scrollHeight > el.clientHeight + 1);
  });

  const showViewAll = Boolean(onViewAll) && (estimatedOverflow || measuredOverflow);

  return (
    <div className='dh-log-clamped-cell py-1'>
      <div
        ref={contentRef}
        className='dh-log-clamped-cell__content'
        style={{ maxHeight: LOG_CELL_MAX_LINES * LOG_CELL_LINE_HEIGHT_PX }}
      >
        {children}
      </div>
      {showViewAll ? (
        <Button
          type='link'
          size='small'
          className='px-0 h-auto'
          onClick={(event) => {
            event.stopPropagation();
            onViewAll?.();
          }}
        >
          {t('log_cell_view_all')}
        </Button>
      ) : null}
    </div>
  );
}
