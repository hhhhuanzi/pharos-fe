import React from 'react';

import { PATH } from './constants';
import './locale';

// 页面本体懒加载：entry 会被 import.meta.glob({ eager: true }) 在启动时同步加载。
const Index = React.lazy(() => import('./index'));
const Detail = React.lazy(() => import('./Detail'));

export default {
  routes: [
    {
      path: `${PATH}/:service`,
      component: Detail,
      exact: true,
    },
    {
      path: PATH,
      component: Index,
      exact: true,
    },
  ],
};
