import React from 'react';

import { PATH } from './constants';
import './locale';

const List = React.lazy(() => import('./index'));

export default {
  routes: [
    {
      path: PATH,
      component: List,
      exact: true,
    },
  ],
};
