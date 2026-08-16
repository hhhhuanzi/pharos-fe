import React from 'react';

import { K8S_PATH, PATH } from './constants';
import './locale';

// 页面本体懒加载：entry 会被 import.meta.glob({ eager: true }) 在启动时同步加载。
const Index = React.lazy(() => import('./index'));
const K8s = React.lazy(() => import('./K8s'));

export default {
  routes: [
    {
      path: K8S_PATH,
      component: K8s,
      exact: true,
    },
    {
      path: PATH,
      component: Index,
      exact: true,
    },
  ],
};
