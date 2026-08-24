import React from 'react';

import ServiceMonitoring from '@/dh/service/monitoring';

interface Props {
  service: string;
  clusters: string[];
  namespaces: string[];
}

export default function Monitoring({ service, clusters, namespaces }: Props) {
  return <ServiceMonitoring service={service} clusters={clusters} namespaces={namespaces} />;
}
