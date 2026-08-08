import React, { useContext } from 'react';

import { CommonStateContext } from '@/App';
// @ts-ignore
import useIsPlus from 'plus:/components/useIsPlus';

export interface Versions {
  github_verison: string;
  version: string;
}

// Pharos 走自有版本号体系（v1.0.0-pharos.x），不展示对比官方 Nightingale 版本的“有新版本可更新”提示。
export default function Version() {
  const isPlus = useIsPlus();
  const { versions } = useContext(CommonStateContext);

  if (!isPlus) {
    return <span>{versions?.version}</span>;
  }
  return null;
}
