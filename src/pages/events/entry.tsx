import React from 'react';
import { Redirect } from 'react-router-dom';

import { RELEASE_FLAGS } from '@/dh/releaseFlags';

import { K8S_PATH, PATH } from './constants';
import './locale';

// 页面本体懒加载：entry 会被 import.meta.glob({ eager: true }) 在启动时同步加载。
const Index = React.lazy(() => import('./index'));
const K8s = React.lazy(() => import('./K8s'));

function RedirectToService() {
  return <Redirect to='/service' />;
}

const EventCenter = RELEASE_FLAGS.serviceDeferredTabs ? Index : RedirectToService;
const EventCenterK8s = RELEASE_FLAGS.serviceDeferredTabs ? K8s : RedirectToService;

export default {
  routes: [
    {
      path: K8S_PATH,
      component: EventCenterK8s,
      exact: true,
    },
    {
      path: PATH,
      component: EventCenter,
      exact: true,
    },
  ],
};
