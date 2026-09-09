import { collectExportedInstances, pickDefaultExportedInstance } from './instancePicker';
import type { MonitoringSeries } from './query';

function series(exported_instance: string): MonitoringSeries {
  return { metric: { exported_instance }, points: [[1, 1]] };
}

describe('collectExportedInstances', () => {
  it('dedupes, shortens to the pod segment, and sorts by pod name', () => {
    expect(
      collectExportedInstances([
        series('pre-turms.turms-business-service-8f78ccd54-v9dv2.turms-business-service'),
        series('pre-turms.turms-business-service-8f78ccd54-2mr88.turms-business-service'),
        series('pre-turms.turms-business-service-8f78ccd54-v9dv2.turms-business-service'),
      ]),
    ).toEqual([
      { value: 'pre-turms.turms-business-service-8f78ccd54-2mr88.turms-business-service', label: 'turms-business-service-8f78ccd54-2mr88' },
      { value: 'pre-turms.turms-business-service-8f78ccd54-v9dv2.turms-business-service', label: 'turms-business-service-8f78ccd54-v9dv2' },
    ]);
  });

  it('drops series that never carried exported_instance', () => {
    expect(collectExportedInstances([{ metric: {}, points: [[1, 1]] }])).toEqual([]);
  });
});

describe('pickDefaultExportedInstance', () => {
  const options = [
    { value: 'ns.pod-a.svc', label: 'pod-a' },
    { value: 'ns.pod-b.svc', label: 'pod-b' },
  ] as const;

  it('keeps the current pick when it is still in the list', () => {
    expect(pickDefaultExportedInstance([...options], 'ns.pod-b.svc')).toBe('ns.pod-b.svc');
  });

  it('falls back to the first sorted pod when the current pick is gone', () => {
    expect(pickDefaultExportedInstance([...options], 'ns.pod-gone.svc')).toBe('ns.pod-a.svc');
    expect(pickDefaultExportedInstance([...options])).toBe('ns.pod-a.svc');
  });
});
