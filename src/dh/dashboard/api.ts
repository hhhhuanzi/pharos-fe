import { RequestMethod } from '@/store/common';
import request from '@/utils/request';
import { N9E_PATHNAME } from '@/utils/constant';

function asDat<T>(res: unknown): T {
  if (res && typeof res === 'object' && 'dat' in res) {
    return (res as { dat: T }).dat;
  }
  return res as T;
}

export async function fetchBoardFavoriteIds(): Promise<number[]> {
  const res = await request(`/api/${N9E_PATHNAME}/dh/board-favorites`, {
    method: RequestMethod.Get,
    silence: true,
  });
  const dat = asDat<number[]>(res);
  return Array.isArray(dat) ? dat.map(Number).filter((id) => !Number.isNaN(id)) : [];
}

export function addBoardFavorite(boardId: number) {
  return request(`/api/${N9E_PATHNAME}/dh/board/${boardId}/favorite`, {
    method: RequestMethod.Post,
  });
}

export function removeBoardFavorite(boardId: number) {
  return request(`/api/${N9E_PATHNAME}/dh/board/${boardId}/favorite`, {
    method: RequestMethod.Delete,
  });
}
