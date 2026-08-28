import { TraceDetailUnsupportedError, TraceServiceRequiredError, isTraceForbidden, isTraceServiceRequired, isTraceUnsupported } from './traceError';

describe('isTraceForbidden', () => {
  it('only reports the 403 raised by the guarded trace endpoint', () => {
    expect(isTraceForbidden({ status: 403, message: 'trace does not belong to your team' })).toBe(true);
    expect(isTraceForbidden({ status: 404 })).toBe(false);
    expect(isTraceForbidden({ status: 502 })).toBe(false);
    expect(isTraceForbidden({ status: '403' })).toBe(false);
  });

  it('tolerates errors that carry no status', () => {
    expect(isTraceForbidden(new Error('boom'))).toBe(false);
    expect(isTraceForbidden(undefined)).toBe(false);
    expect(isTraceForbidden(null)).toBe(false);
    expect(isTraceForbidden('403')).toBe(false);
  });
});

describe('isTraceUnsupported', () => {
  it('recognizes the unsupported error regardless of the prototype chain surviving', () => {
    const error = new TraceDetailUnsupportedError('skywalking');
    expect(isTraceUnsupported(error)).toBe(true);
    expect(error.pluginType).toBe('skywalking');
    expect(isTraceUnsupported({ ...error, dhTraceError: error.dhTraceError })).toBe(true);
  });

  it('does not confuse it with other failures', () => {
    expect(isTraceUnsupported(new Error('boom'))).toBe(false);
    expect(isTraceUnsupported({ status: 403 })).toBe(false);
    expect(isTraceUnsupported({ dhTraceError: 'something-else' })).toBe(false);
    expect(isTraceUnsupported(undefined)).toBe(false);
    expect(isTraceUnsupported(null)).toBe(false);
  });

  it('is disjoint from the forbidden classification', () => {
    const unsupported = new TraceDetailUnsupportedError('otel');
    expect(isTraceForbidden(unsupported)).toBe(false);
    expect(isTraceUnsupported({ status: 403 })).toBe(false);
  });
});

describe('isTraceServiceRequired', () => {
  it('recognizes the fail-closed error raised when no service was selected', () => {
    const error = new TraceServiceRequiredError();
    expect(isTraceServiceRequired(error)).toBe(true);
    expect(isTraceServiceRequired({ dhTraceError: error.dhTraceError })).toBe(true);
  });

  it('stays disjoint from the other classifications', () => {
    const error = new TraceServiceRequiredError();
    expect(isTraceForbidden(error)).toBe(false);
    expect(isTraceUnsupported(error)).toBe(false);
    expect(isTraceServiceRequired(new TraceDetailUnsupportedError('otel'))).toBe(false);
    expect(isTraceServiceRequired({ status: 403 })).toBe(false);
    expect(isTraceServiceRequired(undefined)).toBe(false);
    expect(isTraceServiceRequired(null)).toBe(false);
  });
});
