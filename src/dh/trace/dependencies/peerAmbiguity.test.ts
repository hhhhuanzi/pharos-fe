import { mixedPeerSubtitle, uniquePeerFamily } from './peerAmbiguity';

function instance(address: string, port: string, spanCount = 1) {
  return { address, port, spanCount } as const;
}

describe('uniquePeerFamily', () => {
  it('returns rabbitmq when every instance is AMQP 5672', () => {
    const instances = [instance('10.72.129.23', '5672'), instance('10.72.129.24', '5672')] as const;
    expect(uniquePeerFamily({ curated: [], extraRows: [], instances: [...instances] })).toBe('rabbitmq');
  });

  it('returns rabbitmq when messaging.system is the only protocol signal', () => {
    const extraRows = [{ key: 'messaging.system', values: ['rabbitmq'] }] as const;
    expect(uniquePeerFamily({ curated: [], extraRows: [...extraRows], instances: [] })).toBe('rabbitmq');
  });

  it('keeps mixed AMQP + Dubbo + HTTP + Nacos + ClickHouse unnamed', () => {
    const extraRows = [{ key: 'messaging.system', values: ['rabbitmq'] }] as const;
    const instances = [
      instance('172.22.0.27', '8848', 36),
      instance('rome-sec-monitoring-alert', '80', 31),
      instance('yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud', '8443', 12),
      instance('10.0.0.8', '20880', 9),
      instance('10.72.128.19', '5672', 7),
    ] as const;
    expect(uniquePeerFamily({ curated: [], extraRows: [...extraRows], instances: [...instances] })).toBe('');
  });

  it('treats messaging.system plus http.method as mixed', () => {
    const extraRows = [
      { key: 'messaging.system', values: ['rabbitmq'] },
      { key: 'http.method', values: ['POST'] },
    ] as const;
    expect(uniquePeerFamily({ curated: [], extraRows: [...extraRows], instances: [] })).toBe('');
  });

  it('does not take messaging.system when an instance port is unclassified', () => {
    const extraRows = [{ key: 'messaging.system', values: ['rabbitmq'] }] as const;
    const instances = [instance('10.0.0.9', '12345')] as const;
    expect(uniquePeerFamily({ curated: [], extraRows: [...extraRows], instances: [...instances] })).toBe('');
  });

  it('lets db.system win over a colliding ClickHouse port on the same instance', () => {
    const instances = [{ address: '10.0.0.9', port: '9000', dbSystem: 'mysql', spanCount: 1 }] as const;
    expect(uniquePeerFamily({ curated: [{ id: 'db_system', values: ['mysql'] }], extraRows: [], instances: [...instances] })).toBe(
      'mysql',
    );
  });
});

describe('mixedPeerSubtitle', () => {
  it('lists families by span count instead of a single queue name', () => {
    const extraRows = [{ key: 'messaging.destination.name', values: ['rome.sec.quote.delay.release'] }] as const;
    const instances = [
      instance('172.22.0.27', '8848', 36),
      instance('rome-sec-monitoring-alert', '80', 31),
      instance('10.72.128.19', '5672', 7),
    ] as const;
    expect(mixedPeerSubtitle({ curated: [], extraRows: [...extraRows], instances: [...instances] })).toBe('nacos · http · rabbitmq');
  });

  it('is empty when the bucket is a single explicit system', () => {
    const instances = [instance('10.72.129.23', '5672')] as const;
    expect(mixedPeerSubtitle({ curated: [], extraRows: [], instances: [...instances] })).toBe('');
  });
});
