import React from 'react';

import ServiceGraph from '@/dh/trace/dependencies';

interface Props {
  focusService?: string;
}

export default function Topology({ focusService }: Props) {
  return <ServiceGraph focusService={focusService} />;
}
