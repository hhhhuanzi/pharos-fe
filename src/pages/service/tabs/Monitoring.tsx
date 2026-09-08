import React from 'react';

import ServiceMonitoring from '@/dh/service/monitoring';

interface Props {
  service: string;
  env?: string;
  clusters?: string[];
  namespaces?: string[];
}

export default function Monitoring({ service, env, clusters, namespaces }: Props) {
  return <ServiceMonitoring service={service} env={env} clusters={clusters} namespaces={namespaces} />;
}
