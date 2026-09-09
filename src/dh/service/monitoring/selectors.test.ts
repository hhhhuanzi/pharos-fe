import { clusterMatcher, containerMatcher, otelJobMatcher, podSetFilter, scopeMatcher, spanmetricsMatcher, workloadMatcher } from './selectors';

const withNamespace = { service: 'rome-sec-admin', cluster: 'k8s-rome-sec-test', namespace: 'rome-sec' } as const;
const withoutNamespace = { service: 'rome-sec-admin', cluster: 'k8s-rome-sec-test' } as const;
const withEnv = { service: 'rome-sec-admin', cluster: 'k8s-rome-sec-test', namespace: 'rome-sec', env: 'prod' } as const;

describe('containerMatcher / workloadMatcher', () => {
  it('encodes service_name as container / deployment and binds namespace when the page has one', () => {
    expect(containerMatcher(withNamespace)).toBe('{cluster="k8s-rome-sec-test",namespace="rome-sec",container="rome-sec-admin"}');
    expect(containerMatcher(withoutNamespace)).toBe('{cluster="k8s-rome-sec-test",container="rome-sec-admin"}');
    expect(containerMatcher(withNamespace)).not.toContain('service=');
    expect(containerMatcher(withNamespace)).not.toContain('pod=~');
  });

  it('appends extra matchers after the scope', () => {
    expect(containerMatcher(withoutNamespace, ['resource="cpu"'])).toBe('{cluster="k8s-rome-sec-test",container="rome-sec-admin",resource="cpu"}');
    expect(containerMatcher(withNamespace, ['resource="cpu"'])).toBe('{cluster="k8s-rome-sec-test",namespace="rome-sec",container="rome-sec-admin",resource="cpu"}');
  });

  it('keys kube_deployment_* by deployment, which is the stage-0 encoding of service_name', () => {
    expect(workloadMatcher(withoutNamespace)).toBe('{cluster="k8s-rome-sec-test",deployment="rome-sec-admin"}');
    expect(workloadMatcher(withNamespace)).toBe('{cluster="k8s-rome-sec-test",namespace="rome-sec",deployment="rome-sec-admin"}');
  });
});

describe('otelJobMatcher', () => {
  it('pins exported_job to the business namespace without using the collector namespace label', () => {
    expect(otelJobMatcher(withNamespace)).toBe('{cluster="k8s-rome-sec-test",exported_job="rome-sec/rome-sec-admin"}');
    expect(otelJobMatcher(withoutNamespace)).toBe('{cluster="k8s-rome-sec-test",exported_job=~".+/rome-sec-admin"}');
  });

  it('never uses container, whose namespace/pod on these series name the collector', () => {
    expect(otelJobMatcher(withNamespace)).not.toContain('container=');
    expect(otelJobMatcher(withNamespace)).not.toContain('namespace="rome-sec"');
    expect(otelJobMatcher(withEnv)).not.toContain('deployment_environment_name=');
  });

  it('escapes regex metacharacters in the service name when the namespace is unknown', () => {
    expect(otelJobMatcher({ service: 'a.b', cluster: 'c' })).toBe('{cluster="c",exported_job=~".+/a\\\\.b"}');
  });

  it('escapes quotes in the pinned job when the namespace is known', () => {
    expect(otelJobMatcher({ service: 'a"b', cluster: 'c', namespace: 'n' })).toBe('{cluster="c",exported_job="n/a\\"b"}');
  });

  it('pins exported_instance only when the scope carries one', () => {
    expect(otelJobMatcher({ ...withNamespace, exportedInstance: 'rome-sec.rome-sec-admin-abc.rome-sec-admin' })).toBe(
      '{cluster="k8s-rome-sec-test",exported_job="rome-sec/rome-sec-admin",exported_instance="rome-sec.rome-sec-admin-abc.rome-sec-admin"}',
    );
    expect(otelJobMatcher(withNamespace)).not.toContain('exported_instance=');
    expect(otelJobMatcher({ ...withEnv, exportedInstance: 'rome-sec.pod-a.rome-sec-admin' })).not.toContain('deployment_environment_name=');
  });
});

describe('spanmetricsMatcher / clusterMatcher', () => {
  it('matches spanmetrics on service_name and the header environment', () => {
    expect(spanmetricsMatcher(withNamespace)).toBe('{service_name="rome-sec-admin"}');
    expect(spanmetricsMatcher(withEnv)).toBe('{service_name="rome-sec-admin",deployment_environment_name="prod"}');
    expect(spanmetricsMatcher(withEnv)).not.toContain('namespace=');
  });

  it('filters cluster-only families by cluster plus extras, not business namespace', () => {
    expect(clusterMatcher(withNamespace, ['id!="/"'])).toBe('{cluster="k8s-rome-sec-test",id!="/"}');
    expect(clusterMatcher(withNamespace, ['id!="/"'])).not.toContain('namespace=');
  });
});

describe('podSetFilter', () => {
  it('intersects on pod through a container-labelled metric instead of a pod name regex', () => {
    expect(podSetFilter(withoutNamespace)).toBe('and on (pod) (max by (pod) (container_memory_working_set_bytes{cluster="k8s-rome-sec-test",container="rome-sec-admin"}))');
    expect(podSetFilter(withoutNamespace)).not.toContain('pod=~');
    expect(podSetFilter(withNamespace)).toContain('namespace="rome-sec"');
  });
});

describe('label escaping', () => {
  it('escapes quotes and backslashes in label values', () => {
    expect(containerMatcher({ service: 'a"b\\c', cluster: 'k' })).toBe('{cluster="k",container="a\\"b\\\\c"}');
  });
});

describe('scopeMatcher', () => {
  it('binds namespace when known so kube_pod_info does not cross ns', () => {
    expect(scopeMatcher(withNamespace)).toBe('{cluster="k8s-rome-sec-test",namespace="rome-sec"}');
    expect(scopeMatcher(withoutNamespace)).toBe('{cluster="k8s-rome-sec-test"}');
  });
});
