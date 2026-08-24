import { instanceTypeLabel, middlewareFromPort, peerInstancePort, systemFromHostname, unanimousSystemFromPorts } from './wellKnownPorts';

describe('middlewareFromPort', () => {
  it('maps AMQP / Redis / ClickHouse ports and leaves 8443 unmapped', () => {
    expect(middlewareFromPort(5672)).toEqual({ system: 'rabbitmq', displayName: 'RabbitMQ / AMQP' });
    expect(middlewareFromPort(5671)?.system).toBe('rabbitmq');
    expect(middlewareFromPort(15672)).toEqual({ system: 'rabbitmq', displayName: 'RabbitMQ' });
    expect(middlewareFromPort(6379)?.system).toBe('redis');
    expect(middlewareFromPort(9000)?.system).toBe('clickhouse');
    expect(middlewareFromPort(8123)?.system).toBe('clickhouse');
    expect(middlewareFromPort(8443)).toBeUndefined();
    expect(middlewareFromPort(80)).toBeUndefined();
  });
});

describe('peerInstancePort', () => {
  it('reads the port field, then host:port in the address', () => {
    expect(peerInstancePort('10.72.129.23', '5672')).toBe(5672);
    expect(peerInstancePort('10.72.129.23:5672', '')).toBe(5672);
    expect(peerInstancePort('[2001:db8::1]:6379', '')).toBe(6379);
    expect(peerInstancePort('2001:db8::1', '')).toBeUndefined();
  });
});

describe('systemFromHostname', () => {
  it('recognizes ClickHouse Cloud hosts and ignores a bare 8443 port', () => {
    expect(systemFromHostname('yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud')).toBe('clickhouse');
    expect(systemFromHostname('yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud:8443')).toBe('clickhouse');
    expect(systemFromHostname('10.72.129.23')).toBe('');
  });
});

describe('unanimousSystemFromPorts', () => {
  it('returns rabbitmq when every instance is 5672', () => {
    expect(
      unanimousSystemFromPorts([
        { address: '10.72.129.23', port: '5672' },
        { address: '10.72.129.24:5672', port: '' },
      ]),
    ).toBe('rabbitmq');
  });

  it('does not unify mixed or unknown ports', () => {
    expect(
      unanimousSystemFromPorts([
        { address: '10.0.0.1', port: '5672' },
        { address: '10.0.0.2', port: '3306' },
      ]),
    ).toBe('');
    expect(unanimousSystemFromPorts([{ address: '10.0.0.1', port: '8080' }])).toBe('');
    expect(unanimousSystemFromPorts([])).toBe('');
  });
});

describe('instanceTypeLabel', () => {
  it('infers each row from hostname / db.system / port, not a node-wide type', () => {
    expect(instanceTypeLabel({ address: '10.0.0.1', port: '9000', dbSystem: 'mysql' })).toBe('MySQL');
    expect(instanceTypeLabel({ address: '10.72.129.23', port: '5672' })).toBe('RabbitMQ / AMQP');
    expect(instanceTypeLabel({ address: '10.0.0.1', port: '8080' })).toBe('');
    expect(
      instanceTypeLabel({
        address: 'yex9qpm2v9.asia-southeast1.p.gcp.clickhouse.cloud',
        port: '8443',
        messagingSystem: 'rabbitmq',
      }),
    ).toBe('ClickHouse');
    expect(instanceTypeLabel({ address: '10.0.0.8', port: '8443' })).toBe('');
    expect(instanceTypeLabel({ address: '10.0.0.8', port: '5672', dbSystem: 'clickhouse' })).toBe('ClickHouse');
  });
});
