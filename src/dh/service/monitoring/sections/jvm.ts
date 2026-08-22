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
        refId: 'limit',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        nameKey: 'monitoring.legend.limit',
        dashed: true,
        build: (scope) => `sum by (exported_instance) (jvm_memory_limit_bytes${otel(scope, ['jvm_memory_type="heap"'])})`,
      },
    ],
  };
}

function poolPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_pool',
    titleKey: 'monitoring.panel.jvm_pool',
    unit: 'bytes',
    span: 12,
    targets: [
      {
        refId: 'pool',
        nameLabels: ['jvm_memory_pool_name'],
        build: (scope) => `sum by (jvm_memory_pool_name) (jvm_memory_used_bytes${otel(scope)})`,
      },
    ],
  };
}

function gcPanel(): MonitoringPanelDef {
  return {
    id: 'jvm_gc',
    titleKey: 'monitoring.panel.jvm_gc',
    hintKey: 'monitoring.panel.jvm_gc_hint',
    unit: 'percentUnit',
    span: 12,
    targets: [
      {
        refId: 'gc',
        nameLabels: ['jvm_gc_name'],
        build: (scope, rateWindow) => `sum by (jvm_gc_name) (rate(jvm_gc_duration_seconds_sum${otel(scope)}[${rateWindow}]))`,
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
    span: 8,
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
    span: 8,
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
    hintKey: 'monitoring.panel.jvm_cpu_hint',
    unit: 'percentUnit',
    span: 8,
    targets: [
      {
        refId: 'cpu',
        nameLabels: ['exported_instance'],
        nameRewrite: 'exportedInstancePod',
        build: (scope) =>
          `avg by (exported_instance) (jvm_cpu_recent_utilization_ratio${otel(scope)} or jvm_cpu_recent_utilization${otel(scope)})`,
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
  panels: [heapPanel(), poolPanel(), gcPanel(), afterGcPanel(), threadsPanel(), classesPanel(), cpuPanel()],
};
