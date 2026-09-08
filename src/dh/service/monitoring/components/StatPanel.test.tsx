/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';

import { SUMMARY_SECTION } from '../sections/summary';
import { TONE_ABSENT, TONE_CRITICAL, TONE_NORMAL, TONE_WARNING } from '@/dh/status';
import type { PanelChartEntry } from './PanelChart';
import StatPanel from './StatPanel';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

/** The colour a number wears when nothing grades it — see `TONE_UNGRADED` in `StatPanel`. */
const UNGRADED = 'text-title';

function entry(refId: string, value: number): PanelChartEntry {
  return {
    target: { refId } as PanelChartEntry['target'],
    series: [{ metric: {}, points: [[1, value]] }],
  };
}

function panelById(id: string) {
  const panel = SUMMARY_SECTION.panels.find((item) => item.id === id);
  if (!panel) throw new Error(`missing panel ${id}`);
  return panel;
}

/** Every metric column, in DOM order, as `refId` plus the classes carried by its number. */
function columns(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-metric]')).map((node) => ({
    refId: node.dataset.metric,
    label: node.querySelector('div')?.textContent,
    labelClass: node.querySelector('div')?.className,
    value: node.querySelectorAll('span')[0]?.textContent,
    valueClass: node.querySelectorAll('span')[0]?.className,
  }));
}

/** The card's own name, which must not read like one of the metric labels below it. */
function cardTitleClass(container: HTMLElement) {
  return container.firstElementChild?.firstElementChild?.className ?? '';
}

describe('StatPanel summary cards', () => {
  it('keeps the summary cards ordered traffic → ready → resource', () => {
    expect(SUMMARY_SECTION.panels.map((panel) => panel.id)).toEqual(['summary_traffic', 'summary_ready', 'summary_resource']);
    expect(SUMMARY_SECTION.panels.map((panel) => panel.span)).toEqual([8, 8, 8]);
  });

  it('renders ready / restarts / OOM as peer columns', () => {
    const { container } = render(
      <StatPanel panel={panelById('summary_ready')} loading={false} entries={[entry('ready', 1), entry('desired', 1), entry('restarts', 0), entry('oom', 0)]} />,
    );

    expect(screen.getByText('monitoring.stat.ready')).toBeInTheDocument();
    expect(columns(container).map((column) => column.refId)).toEqual(['ready', 'restarts', 'oom']);
    expect(columns(container).map((column) => column.label)).toEqual(['monitoring.stat.ready_replicas', 'monitoring.stat.restarts', 'monitoring.stat.oom']);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getAllByText('0')).toHaveLength(2);
  });

  it('renders CPU and memory as peer columns', () => {
    const { container } = render(<StatPanel panel={panelById('summary_resource')} loading={false} entries={[entry('cpu_water', 0.0103), entry('mem_water', 0.733)]} />);

    expect(screen.getByText('monitoring.stat.resource')).toBeInTheDocument();
    expect(columns(container).map((column) => column.refId)).toEqual(['cpu_water', 'mem_water']);
    expect(screen.getByText('1.03')).toBeInTheDocument();
    expect(screen.getByText('73.3')).toBeInTheDocument();
    expect(screen.getAllByText('%')).toHaveLength(2);
  });

  it('renders QPS, error rate and P95 as peer columns with the unit split off the number', () => {
    const { container } = render(<StatPanel panel={panelById('summary_traffic')} loading={false} entries={[entry('qps', 0.1), entry('error_rate', 0), entry('p95', 5.46)]} />);

    expect(screen.getByText('monitoring.stat.traffic')).toBeInTheDocument();
    expect(columns(container).map((column) => column.refId)).toEqual(['qps', 'error_rate', 'p95']);
    expect(columns(container).map((column) => column.label)).toEqual(['monitoring.stat.qps', 'monitoring.stat.error_rate', 'monitoring.stat.p95']);
    expect(screen.getByText('0.1')).toBeInTheDocument();
    expect(screen.getByText('5.46')).toBeInTheDocument();
    expect(screen.getByText('ms')).toBeInTheDocument();
  });

  it('gives every number in a card the same size and weight', () => {
    const { container } = render(<StatPanel panel={panelById('summary_traffic')} loading={false} entries={[entry('qps', 0.1), entry('error_rate', 0.2), entry('p95', 5.46)]} />);

    const toneClasses = [TONE_NORMAL, TONE_WARNING, TONE_CRITICAL, TONE_ABSENT, UNGRADED];
    const sizes = columns(container).map((column) =>
      toneClasses
        .reduce((className, tone) => className.replace(tone, ''), column.valueClass ?? '')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    expect(sizes).toEqual(['text-l4 font-bold leading-none', 'text-l4 font-bold leading-none', 'text-l4 font-bold leading-none']);
  });

  it('greens a reading that is inside its band and escalates only what crossed a threshold', () => {
    const { container } = render(<StatPanel panel={panelById('summary_resource')} loading={false} entries={[entry('cpu_water', 0.0103), entry('mem_water', 0.86)]} />);

    const [cpu, memory] = columns(container);
    expect(cpu.valueClass).toContain(TONE_NORMAL);
    expect(memory.valueClass).toContain(TONE_WARNING);
  });

  it('does not warn on the 73% memory reading that used to be yellow', () => {
    const { container } = render(<StatPanel panel={panelById('summary_resource')} loading={false} entries={[entry('cpu_water', 0.0101), entry('mem_water', 0.734)]} />);

    expect(columns(container).map((column) => column.valueClass)).toEqual([expect.stringContaining(TONE_NORMAL), expect.stringContaining(TONE_NORMAL)]);
  });

  it('greens the whole replica card when the workload is genuinely fine', () => {
    const { container } = render(
      <StatPanel panel={panelById('summary_ready')} loading={false} entries={[entry('ready', 2), entry('desired', 2), entry('restarts', 0), entry('oom', 0)]} />,
    );

    expect(columns(container).map((column) => column.valueClass)).toEqual([
      expect.stringContaining(TONE_NORMAL),
      expect.stringContaining(TONE_NORMAL),
      expect.stringContaining(TONE_NORMAL),
    ]);
  });

  it('grades a degraded replica card per column instead of tinting the whole card', () => {
    const { container } = render(
      <StatPanel panel={panelById('summary_ready')} loading={false} entries={[entry('ready', 1), entry('desired', 2), entry('restarts', 7), entry('oom', 0)]} />,
    );

    const [ready, restarts, oom] = columns(container);
    expect(ready.valueClass).toContain(TONE_WARNING);
    expect(restarts.valueClass).toContain(TONE_CRITICAL);
    expect(oom.valueClass).toContain(TONE_NORMAL);
  });

  it('leaves numbers with no threshold behind them ungraded, so green keeps meaning something', () => {
    const { container } = render(<StatPanel panel={panelById('summary_traffic')} loading={false} entries={[entry('qps', 0.1), entry('error_rate', 0), entry('p95', 5.46)]} />);

    const [qps, errorRate, p95] = columns(container);
    // A percentile and a request rate are values, not grades: 5.46ms is not "healthy", it is 5.46ms.
    expect(qps.valueClass).toContain(UNGRADED);
    expect(p95.valueClass).toContain(UNGRADED);
    expect(errorRate.valueClass).toContain(TONE_NORMAL);
  });

  it('separates the card title from the metric labels it sits above', () => {
    const { container } = render(<StatPanel panel={panelById('summary_resource')} loading={false} entries={[entry('cpu_water', 0.01), entry('mem_water', 0.2)]} />);

    // 14px medium in the primary text colour, against 12px normal hint labels and 24px bold numbers.
    expect(cardTitleClass(container)).toContain('text-l1');
    expect(cardTitleClass(container)).toContain('font-medium');
    expect(cardTitleClass(container)).toContain('text-title');
    columns(container).forEach((column) => {
      expect(column.labelClass).toContain('text-base');
      expect(column.labelClass).toContain('font-normal');
      expect(column.labelClass).toContain('text-hint');
      expect(column.valueClass).toContain('text-l4');
      expect(column.valueClass).toContain('font-bold');
    });
  });

  it('renders a dash for missing samples instead of a zero', () => {
    const { container } = render(<StatPanel panel={panelById('summary_resource')} loading={false} entries={[]} />);

    expect(columns(container).map((column) => column.valueClass)).toEqual([expect.stringContaining(TONE_ABSENT), expect.stringContaining(TONE_ABSENT)]);
    expect(screen.getAllByText('—')).toHaveLength(2);
  });
});

/**
 * The distinction the whole `absent: 'zero'` mechanism exists for: an OOM query matches no series
 * until a container is actually OOM-killed, so "no result" is the healthy answer — but only while
 * we can prove kube-state-metrics is being scraped at all.
 */
describe('StatPanel event counters with no events', () => {
  it('reads an empty OOM result as zero kills, in the normal tone, when the exporter is reporting', () => {
    const { container } = render(<StatPanel panel={panelById('summary_ready')} loading={false} entries={[entry('ready', 1), entry('desired', 1), entry('restarts', 0)]} />);

    const oom = columns(container).find((column) => column.refId === 'oom');
    expect(oom?.value).toBe('0');
    expect(oom?.valueClass).toContain(TONE_NORMAL);
  });

  it('still dashes the OOM column when nothing about the container is being reported', () => {
    // Restarts is the guard: kube-state-metrics publishes it for every container at 0, so its
    // absence means the exporter or the matcher failed and "zero kills" would be a guess.
    const { container } = render(<StatPanel panel={panelById('summary_ready')} loading={false} entries={[]} />);

    const [ready, restarts, oom] = columns(container);
    expect([ready.value, restarts.value, oom.value]).toEqual(['—', '—', '—']);
    expect(oom.valueClass).toContain(TONE_ABSENT);
  });

  it('greens a zero restart count, which is a measurement rather than a missing series', () => {
    const { container } = render(
      <StatPanel panel={panelById('summary_ready')} loading={false} entries={[entry('ready', 1), entry('desired', 1), entry('restarts', 0), entry('oom', 0)]} />,
    );

    const restarts = columns(container).find((column) => column.refId === 'restarts');
    expect(restarts?.value).toBe('0');
    expect(restarts?.valueClass).toContain(TONE_NORMAL);
  });

  it('says 未接入 rather than 0 for RED metrics, whose series only exists once spans arrive', () => {
    const { container } = render(<StatPanel panel={panelById('summary_traffic')} loading={false} entries={[]} />);

    expect(columns(container).map((column) => column.value)).toEqual(['monitoring.stat.uninstrumented', 'monitoring.stat.uninstrumented', 'monitoring.stat.uninstrumented']);
    expect(columns(container).map((column) => column.valueClass)).toEqual([
      expect.stringContaining(TONE_ABSENT),
      expect.stringContaining(TONE_ABSENT),
      expect.stringContaining(TONE_ABSENT),
    ]);
  });
});
