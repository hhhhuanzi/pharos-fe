import React from 'react';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import { NS } from './constants';

interface Props {
  favorited: boolean;
  onToggle: (next: boolean) => void;
}

export default function FavoriteStar(props: Props) {
  const { t } = useTranslation(NS);
  const { favorited, onToggle } = props;

  return (
    <span
      role='button'
      tabIndex={0}
      className='inline-flex cursor-pointer text-base leading-none'
      title={favorited ? t('favorite.remove') : t('favorite.add')}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(!favorited);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onToggle(!favorited);
        }
      }}
    >
      {/* Gold, not `text-warning`: a favourite is a bookmark, not a degraded state, and the warning
          scale's text step is a dark olive that reads as neither. */}
      {favorited ? <StarFilled className='text-[var(--fc-fill-gold)]' /> : <StarOutlined className='text-hint hover:text-[var(--fc-fill-gold)]' />}
    </span>
  );
}
