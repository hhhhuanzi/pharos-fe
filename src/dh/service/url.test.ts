import {
  buildEventCenterK8sPath,
  buildEventCenterPath,
  buildServiceDetailPath,
  buildServiceListPath,
  decodeServiceParam,
  identityToQuery,
  mergeIdentity,
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

  it('drops non-positive ds', () => {
    expect(parseServiceIdentity({ ds: '0' }).ds).toBeUndefined();
    expect(parseServiceIdentity({ ds: '-1' }).ds).toBeUndefined();
    expect(parseServiceIdentity({ ds: 'x' }).ds).toBeUndefined();
  });
});

describe('identityToQuery', () => {
  it('omits empty fields so a shared URL does not invent association', () => {
    expect(identityToQuery({ service: 'order', ds: 5 })).toEqual({ service: 'order', ds: '5' });
    expect(identityToQuery({})).toEqual({});
  });
});

describe('buildServiceDetailPath / buildServiceListPath', () => {
  it('encodes the service segment so a shared URL stays one path part', () => {
    expect(buildServiceDetailPath('order/api', { tab: 'events', ds: 5 })).toBe('/service/order%2Fapi?tab=events&ds=5');
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

describe('mergeIdentity', () => {
  it('clears cluster / namespace when the service is cleared', () => {
    expect(mergeIdentity({ service: 'order', cluster: 'prod', namespace: 'pay', ds: 5 }, { service: undefined })).toEqual({
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
