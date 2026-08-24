import React from 'react';

import ServiceGraph from '@/dh/trace/dependencies';

interface Props {
  /** Set on the service-detail tab: 1-hop subgraph. Omit on the global `/service` graph. */
  focusService?: string;
}

export default function Topology({ focusService }: Props) {
  return <ServiceGraph focusService={focusService} />;
}
