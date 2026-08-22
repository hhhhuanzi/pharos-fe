import type { MonitoringSectionDef } from '../panels';

/**
 * Section 6: middleware is a documented empty state this period. Labels cannot map a service
 * onto a broker/db instance, and the design forbids linking out to a cluster-wide overview.
 */
export const MIDDLEWARE_SECTION: MonitoringSectionDef = {
  id: 'middleware',
  titleKey: 'monitoring.section.middleware',
  defaultOpen: true,
  emptyKey: 'monitoring.middleware.empty',
  panels: [],
};
