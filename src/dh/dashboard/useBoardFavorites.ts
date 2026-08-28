import { useCallback, useEffect, useState } from 'react';
import { message } from 'antd';
import { useTranslation } from 'react-i18next';

import { addBoardFavorite, fetchBoardFavoriteIds, removeBoardFavorite } from './api';
import { NS } from './constants';

export function useBoardFavorites() {
  const { t } = useTranslation(NS);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());

  const reload = useCallback(() => {
    fetchBoardFavoriteIds()
      .then((ids) => setFavoriteIds(new Set(ids)))
      .catch(() => {
        setFavoriteIds(new Set());
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const toggleFavorite = useCallback(
    async (boardId: number, next: boolean) => {
      try {
        if (next) {
          await addBoardFavorite(boardId);
          message.success(t('favorite.add_success'));
        } else {
          await removeBoardFavorite(boardId);
          message.success(t('favorite.remove_success'));
        }
        setFavoriteIds((prev) => {
          const nextSet = new Set(prev);
          if (next) nextSet.add(boardId);
          else nextSet.delete(boardId);
          return nextSet;
        });
      } catch {
        message.error(t('favorite.toggle_failed'));
      }
    },
    [t],
  );

  return { favoriteIds, toggleFavorite, reload };
}
