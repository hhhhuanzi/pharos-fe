import {
  buildEventCenterK8sPath,
  buildEventCenterPath,
  buildServiceDetailPath,
  buildServiceListPath,
  decodeServiceParam,
  identityToQuery,
  mergeIdentity,
  parseServiceDetailLocation,
  parseServiceIdentity,
} from './url';

describe('parseServiceIdentity', () => {
  it('reads service / cluster / namespace / ds and ignores blanks', () => {
    expect(
      parseServiceIdentity({
        service: ' order ',
        cluster: 'prod',
        namespace: '',
        ds: '5',
        tab: 'overview',
      }),
    ).toEqual({ service: 'order', cluster: 'prod', namespace: undefined, ds: 5 });
  });

  it('takes the first value when query-string yields an array', () => {
    expect(parseServiceIdentity({ service: ['gateway', 'other'], ds: ['3'] })).toEqual({
      service: 'gateway',
      cluster: undefined,
      namespace: undefined,
      ds: 3,
    });
  });

  it('reads the environment so a detail page opened from a list row stays on that environment', () => {
    expect(parseServiceIdentity({ service: 'quote', env: ' prod ' })).toMatchObject({ service: 'quote', env: 'prod' });
    expect(parseServiceIdentity({ service: 'quote', env: '  ' }).env).toBeUndefined();
  });

  it('drops non-positive ds', () => {
    expect(parseServiceIdentity({ ds: '0' }).ds).toBeUndefined();
    expect(parseServiceIdentity({ ds: '-1' }).ds).toBeUndefined();
    expect(parseServiceIdentity({ ds: 'x' }).ds).toBeUndefined();
  });
});

describe('identityToQuery', () => {
  it('omits empty fields so a shared URL does not invent association', () => {
    expect(identityToQuery({ service: 'order', ds: 5 })).toEqual({ service: 'order', ds: '5' });
    expect(identityToQuery({ service: 'quote', env: 'prod' })).toEqual({ service: 'quote', env: 'prod' });
    expect(identityToQuery({})).toEqual({});
  });
});

describe('buildServiceDetailPath / buildServiceListPath', () => {
  it('encodes the service segment so a shared URL stays one path part', () => {
    expect(buildServiceDetailPath('order/api', { tab: 'events', ds: 5 })).toBe('/service/order%2Fapi?tab=events&ds=5');
    expect(buildServiceDetailPath('order', { tab: 'traces', ds: 5, start: 1700000000, end: 1700003600 })).toBe(
      '/service/order?tab=traces&ds=5&start=1700000000&end=1700003600',
    );
    expect(buildServiceDetailPath('quote', { ds: 5, env: 'prod' })).toBe('/service/quote?ds=5&env=prod');
    expect(buildServiceDetailPath('order', { tab: 'traces', ds: 5, traceId: 'abc' })).toBe('/service/order?tab=traces&ds=5&traceId=abc');
    expect(decodeServiceParam('order%2Fapi')).toBe('order/api');
    expect(buildServiceListPath({ tab: 'topology' })).toBe('/service?tab=topology');
    expect(buildServiceListPath()).toBe('/service');
  });
});

describe('buildEventCenterPath / buildEventCenterK8sPath', () => {
  it('keeps the list path clean and forwards an optional service filter', () => {
    expect(buildEventCenterPath()).toBe('/event-center');
    expect(buildEventCenterPath({ service: 'order', cluster: 'prod' })).toBe('/event-center?service=order&cluster=prod');
    expect(buildEventCenterK8sPath({ service: 'order' })).toBe('/event-center/k8s?service=order');
  });
});

describe('parseServiceDetailLocation', () => {
  it('reads identity from a service detail path and query', () => {
    expect(parseServiceDetailLocation('/service/turms-business-service', '?tab=logs&env=test&cluster=k8s-trade-test&namespace=turms&ds=5')).toEqual({
      service: 'turms-business-service',
      env: 'test',
      cluster: 'k8s-trade-test',
      namespace: 'turms',
      ds: 5,
    });
  });

  it('ignores the service list and the global log explorer', () => {
    expect(parseServiceDetailLocation('/service', '?tab=overview')).toBeUndefined();
    expect(parseServiceDetailLocation('/log/explorer', '?tab=logs')).toBeUndefined();
  });

  it('decodes a service name that contains a slash', () => {
    expect(parseServiceDetailLocation('/service/order%2Fapi', '')).toMatchObject({ service: 'order/api' });
  });
});

describe('mergeIdentity', () => {
  it('clears env / cluster / namespace when the service is cleared', () => {
    expect(mergeIdentity({ service: 'order', env: 'prod', cluster: 'prod', namespace: 'pay', ds: 5 }, { service: undefined })).toEqual({
      ds: 5,
    });
  });

  it('keeps association when only one side is patched', () => {
    expect(mergeIdentity({ service: 'order', cluster: 'prod' }, { namespace: 'pay' })).toEqual({
      service: 'order',
      cluster: 'prod',
      namespace: 'pay',
    });
  });
});
