import React from 'react';

import ServiceGraph from '@/dh/trace/dependencies';

interface Props {
  /** Set on the service-detail tab: 1-hop subgraph. Omit on the global `/service` graph. */
  focusService?: string;
  env?: string;
  cluster?: string;
  namespace?: string;
}

export default function Topology({ focusService, env, cluster, namespace }: Props) {
  return <ServiceGraph focusService={focusService} env={env} cluster={cluster} namespace={namespace} />;
}
