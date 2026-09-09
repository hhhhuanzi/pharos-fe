import type { MonitoringPanelDef, MonitoringSectionDef } from '../panels';
import { otelJobMatcher, type MonitoringScope } from '../selectors';

function otel(scope: MonitoringScope, extra: string[] = []): string {
  return otelJobMatcher(scope, extra);
}

function heapPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_heap',
    titleKey: 'monitoring.panel.jvm_heap',
    hintKey: 'monitoring.panel.jvm_heap_hint',
    unit: 'bytes',
    span: 12,
    targets: [
      {
        refId: 'used',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) => `sum by (exported_instance) (jvm_memory_used_bytes${otel(scope, ['jvm_memory_type="heap"'])})`,
      },
      {
        refId: 'xms',
        nameKey: 'monitoring.legend.xms',
        reference: 'budget',
        // Same fold as Xmx. `jvm.memory.init` is experimental; agent 2.29 does not emit it unless
        // emit-experimental-metrics is on. Empty result → no line (do not fake from used / request).
        build: (scope) => `max(sum by (exported_instance) (jvm_memory_init_bytes${otel(scope, ['jvm_memory_type="heap"'])}))`,
      },
      {
        refId: 'xmx',
        nameKey: 'monitoring.legend.xmx',
        reference: 'ceiling',
        // Same fold as container request / limit: per-pod first, then max() to one service line.
        build: (scope) => `max(sum by (exported_instance) (jvm_memory_limit_bytes${otel(scope, ['jvm_memory_type="heap"'])}))`,
      },
    ],
  };
}

/**
 * Heap generations only, per pod. The old `sum by (jvm_memory_pool_name)` added every replica
 * together and mixed in Metaspace / CodeHeap, so four ~1.3 GiB heaps read as a 5 GiB "pool".
 */
function heapPoolPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_pool',
    titleKey: 'monitoring.panel.jvm_pool',
    hintKey: 'monitoring.panel.jvm_pool_hint',
    unit: 'bytes',
    span: 12,
    instanceFilter: 'exported_instance',
    targets: [
      {
        refId: 'pool',
        nameLabels: ['jvm_memory_pool_name'],
        build: (scope) => `sum by (jvm_memory_pool_name) (jvm_memory_used_bytes${otel(scope, ['jvm_memory_type="heap"'])})`,
      },
    ],
  };
}

function nonHeapPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_nonheap',
    titleKey: 'monitoring.panel.jvm_nonheap',
    hintKey: 'monitoring.panel.jvm_nonheap_hint',
    unit: 'bytes',
    span: 12,
    instanceFilter: 'exported_instance',
    targets: [
      {
        refId: 'nonheap',
        nameLabels: ['jvm_memory_pool_name'],
        build: (scope) => `sum by (jvm_memory_pool_name) (jvm_memory_used_bytes${otel(scope, ['jvm_memory_type="non_heap"'])})`,
      },
    ],
  };
}

/**
 * All-pod GC trio — no Pod picker. Legend is `pod · Young GC`. A missing Full GC is padded
 * to a 0 line after fetch (`padMissingGc`), not dropped, so "never ran" ≠ "not scraped".
 */
function gcPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_gc',
    titleKey: 'monitoring.panel.jvm_gc',
    hintKey: 'monitoring.panel.jvm_gc_hint',
    unit: 'percentUnit',
    span: 12,
    padMissingGc: 'g1Old',
    targets: [
      {
        refId: 'gc',
        nameLabels: ['exported_instance', 'jvm_gc_name'],
        nameRewrite: 'exportedInstancePod',
        build: (scope, rateWindow) => `sum by (exported_instance, jvm_gc_name) (rate(jvm_gc_duration_seconds_sum${otel(scope)}[${rateWindow}]))`,
      },
    ],
  };
}

function gcCountPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_gc_count',
    titleKey: 'monitoring.panel.jvm_gc_count',
    hintKey: 'monitoring.panel.jvm_gc_count_hint',
    // Window totals from increase(); keep decimals (Prometheus extrapolation). Not ops (/s).
    unit: 'short',
    span: 12,
    padMissingGc: 'g1Old',
    targets: [
      {
        refId: 'gc_count',
        nameLabels: ['exported_instance', 'jvm_gc_name'],
        nameRewrite: 'exportedInstancePod',
        build: (scope, rateWindow) => `sum by (exported_instance, jvm_gc_name) (increase(jvm_gc_duration_seconds_count${otel(scope)}[${rateWindow}]))`,
      },
    ],
  };
}

function gcPausePanel(): MonitoringPanelDef {
  return {
    id: 'jvm_gc_pause',
    titleKey: 'monitoring.panel.jvm_gc_pause',
    hintKey: 'monitoring.panel.jvm_gc_pause_hint',
    unit: 'seconds',
    span: 12,
    padMissingGc: 'g1Old',
    targets: [
      {
        refId: 'gc_pause',
        nameLabels: ['exported_instance', 'jvm_gc_name'],
        nameRewrite: 'exportedInstancePod',
        build: (scope, rateWindow) => {
          const matcher = otel(scope);
          const spent = `sum by (exported_instance, jvm_gc_name) (rate(jvm_gc_duration_seconds_sum${matcher}[${rateWindow}]))`;
          const count = `sum by (exported_instance, jvm_gc_name) (rate(jvm_gc_duration_seconds_count${matcher}[${rateWindow}]))`;
          return `${spent} / ${count}`;
        },
      },
    ],
  };
}

function afterGcPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_after_gc',
    titleKey: 'monitoring.panel.jvm_after_gc',
    hintKey: 'monitoring.panel.jvm_after_gc_hint',
    unit: 'bytes',
    span: 12,
    targets: [
      {
        refId: 'after_gc',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) => `sum by (exported_instance) (jvm_memory_used_after_last_gc_bytes${otel(scope, ['jvm_memory_type="heap"'])})`,
      },
    ],
  };
}

function threadsPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_threads',
    titleKey: 'monitoring.panel.jvm_threads',
    unit: 'count',
    span: 12,
    targets: [
      {
        refId: 'threads',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) => `sum by (exported_instance) (jvm_thread_count${otel(scope)})`,
      },
    ],
  };
}

function classesPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_classes',
    titleKey: 'monitoring.panel.jvm_classes',
    unit: 'count',
    span: 12,
    targets: [
      {
        refId: 'classes',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) => `sum by (exported_instance) (jvm_class_count${otel(scope)})`,
      },
    ],
  };
}

function cpuPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_cpu',
    titleKey: 'monitoring.panel.jvm_cpu',
    unit: 'percentUnit',
    // Process utilization of the whole runtime, so the same coarse ladder as the node panels.
    yAxis: 'utilization',
    span: 12,
    targets: [
      {
        refId: 'cpu',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) => `avg by (exported_instance) (jvm_cpu_recent_utilization_ratio${otel(scope)} or jvm_cpu_recent_utilization${otel(scope)})`,
      },
    ],
  };
}

/**
 * Section 4: OTel runtime-telemetry (not Micrometer). Default expanded. Empty → 引导接入,
 * not a failure. Coverage n/m is shown inside the section; collapsed = no query.
 */
export const JVM_SECTION: MonitoringSectionDef = {
  id: 'jvm',
  titleKey: 'monitoring.section.jvm',
  defaultOpen: true,
  fallbackEmptyKey: 'monitoring.jvm.empty',
  instancePicker: {
    build: (scope) => `count by (exported_instance) (jvm_memory_used_bytes${otel(scope, ['jvm_memory_type="heap"'])})`,
  },
  panels: [heapPanel(), heapPoolPanel(), nonHeapPanel(), afterGcPanel(), gcPanel(), gcCountPanel(), gcPausePanel(), cpuPanel(), threadsPanel(), classesPanel()],
};
