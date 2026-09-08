import { errorRateClass } from '@/pages/service/format';

import { edgeStrokeAlpha, errorStroke } from '../trace/dependencies/graphVisual';
import {
  ERROR_RATE_CRITICAL,
  ERROR_RATE_WARNING,
  errorRateLevel,
  errorRateTone,
  oomTone,
  readyTone,
  restartTone,
  statusFillRgb,
  statusTextClass,
  TONE_ABSENT,
  TONE_CRITICAL,
  TONE_NORMAL,
  TONE_WARNING,
  utilizationTone,
} from './tone';

/** Every verdict any threshold in the module can produce, for the "how many colours" assertions. */
const everyVerdict = () => [
  utilizationTone(0),
  utilizationTone(0.5),
  utilizationTone(0.85),
  utilizationTone(0.99),
  errorRateTone(0),
  errorRateTone(0.03),
  errorRateTone(0.2),
  restartTone(0),
  restartTone(2),
  restartTone(9),
  oomTone(0),
  oomTone(4),
  readyTone(2, 2),
  readyTone(1, 2),
  readyTone(0, 2),
];

describe('errorRateTone', () => {
  it('is normal below 1% and escalates at the levels a caller would notice', () => {
    expect(errorRateTone(0)).toBe(TONE_NORMAL);
    expect(errorRateTone(0.0052)).toBe(TONE_NORMAL);
    expect(errorRateTone(0.009)).toBe(TONE_NORMAL);
    expect(errorRateTone(0.0183)).toBe(TONE_WARNING);
    expect(errorRateTone(0.039)).toBe(TONE_WARNING);
    expect(errorRateTone(0.05)).toBe(TONE_CRITICAL);
  });

  it('is soft when the service is not instrumented', () => {
    expect(errorRateTone(undefined)).toBe(TONE_ABSENT);
    expect(errorRateTone(null)).toBe(TONE_ABSENT);
    expect(errorRateTone(Number.NaN)).toBe(TONE_ABSENT);
  });
});

describe('utilizationTone', () => {
  it('calls a correctly sized container normal, not a warning', () => {
    // The reading from the screenshot that started this: 73.4% of limit is a healthy container,
    // not a warning. The old 70% threshold painted it yellow.
    expect(utilizationTone(0.734)).toBe(TONE_NORMAL);
    expect(utilizationTone(0.0103)).toBe(TONE_NORMAL);
    expect(utilizationTone(0.799)).toBe(TONE_NORMAL);
  });

  it('warns once headroom thins and escalates where throttling and OOM kills live', () => {
    expect(utilizationTone(0.8)).toBe(TONE_WARNING);
    expect(utilizationTone(0.94)).toBe(TONE_WARNING);
    expect(utilizationTone(0.95)).toBe(TONE_CRITICAL);
    expect(utilizationTone(1.2)).toBe(TONE_CRITICAL);
  });

  it('treats a missing sample as unknown, never as healthy', () => {
    expect(utilizationTone(undefined)).toBe(TONE_ABSENT);
    expect(utilizationTone(null)).toBe(TONE_ABSENT);
    expect(utilizationTone(Number.NaN)).toBe(TONE_ABSENT);
    expect(utilizationTone(Number.POSITIVE_INFINITY)).toBe(TONE_ABSENT);
  });
});

describe('restartTone', () => {
  it('treats zero as normal and five as a crash loop', () => {
    expect(restartTone(0)).toBe(TONE_NORMAL);
    expect(restartTone(1)).toBe(TONE_WARNING);
    expect(restartTone(4)).toBe(TONE_WARNING);
    expect(restartTone(5)).toBe(TONE_CRITICAL);
  });
});

describe('oomTone', () => {
  it('makes the first memory kill red because none of them are routine', () => {
    expect(oomTone(1)).toBe(TONE_CRITICAL);
  });

  it('calls zero kills normal: "it never happened" is the healthy answer, not a missing sample', () => {
    expect(oomTone(0)).toBe(TONE_NORMAL);
  });
});

describe('readyTone', () => {
  it('grades the replica pair on how much of the workload is actually up', () => {
    expect(readyTone(1, 1)).toBe(TONE_NORMAL);
    expect(readyTone(3, 3)).toBe(TONE_NORMAL);
    expect(readyTone(2, 3)).toBe(TONE_WARNING);
    expect(readyTone(0, 3)).toBe(TONE_CRITICAL);
  });

  it('is soft when the workload is unknown rather than claiming health', () => {
    expect(readyTone(undefined, 3)).toBe(TONE_ABSENT);
    expect(readyTone(1, undefined)).toBe(TONE_ABSENT);
    expect(readyTone(0, 0)).toBe(TONE_ABSENT);
  });
});

describe('the app-wide colour vocabulary', () => {
  it('spends exactly three colours on verdicts', () => {
    expect(new Set(everyVerdict())).toEqual(new Set([TONE_NORMAL, TONE_WARNING, TONE_CRITICAL]));
  });

  it('keeps grey out of the verdict scale, so it can only ever mean "not measured"', () => {
    expect(everyVerdict()).not.toContain(TONE_ABSENT);
  });

  it('uses the product status tokens, so the colours match every other status in the app', () => {
    expect([TONE_NORMAL, TONE_WARNING, TONE_CRITICAL]).toEqual(['text-success', 'text-warning', 'text-error']);
    // No private palette: a page-local green would drift from the service list the moment either
    // side was retouched.
    expect(everyVerdict().join(' ')).not.toMatch(/text-(green|yellow|red)-\d+/);
  });

  it('never reaches for orange: amber and red are the only escalation steps', () => {
    expect(everyVerdict()).not.toContain('text-alert');
  });

  it('renders a level as a text class or as an alpha-capable rgb triple from the same token', () => {
    expect(statusTextClass('warning')).toBe(TONE_WARNING);
    expect(statusFillRgb('warning')).toBe('rgb(var(--fc-fill-warning-rgb) / 1)');
    expect(statusFillRgb('success', 0.78)).toBe('rgb(var(--fc-fill-success-rgb) / 0.78)');
  });
});

/**
 * The reason this module exists: the same rule used to be written out in the service list, the
 * monitoring tab, the dependency graph and the node drawer, with the thresholds copied by hand into
 * each one. These assertions fail if any consumer starts keeping its own scale again.
 */
describe('every status consumer reads the same scale', () => {
  it('publishes the error-rate thresholds instead of leaving them as magic numbers', () => {
    expect([ERROR_RATE_WARNING, ERROR_RATE_CRITICAL]).toEqual([0.01, 0.05]);
    expect(errorRateLevel(ERROR_RATE_WARNING)).toBe('warning');
    expect(errorRateLevel(ERROR_RATE_CRITICAL)).toBe('error');
  });

  it('gives the service overview list the same colours as everything else', () => {
    // The screen users calibrate on: 3.90% / 1.83% amber, 0.52% green.
    expect(errorRateClass(0.039)).toBe(errorRateTone(0.039));
    expect(errorRateClass(0.0183)).toBe(TONE_WARNING);
    expect(errorRateClass(0.0052)).toBe(TONE_NORMAL);
    expect(errorRateClass(undefined)).toBe(TONE_ABSENT);
  });

  it('gives the dependency graph the same bands, in stroke form', () => {
    expect(errorStroke(0.0052)).toBe(statusFillRgb('success'));
    expect(errorStroke(0.0183, 0.92)).toBe(statusFillRgb('warning', 0.92));
    expect(errorStroke(0.06, 1)).toBe(statusFillRgb('error', 1));
    // Edge opacity is banded on the same scale, so a worse edge is a firmer line as well as a
    // redder one.
    const alphaOf = (errorRate: number) => edgeStrokeAlpha({ dimmed: false, highlighted: false, errorRate });
    expect([alphaOf(0.0052), alphaOf(0.0183), alphaOf(0.06)]).toEqual([0.78, 0.92, 1]);
  });
});
