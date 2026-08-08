import { FLATTEN_MAX_DEPTH, RESULT_SAMPLE_MAX_DOCS } from './constants';

/**
 * 把一批日志文档展平成「叶子字段路径」集合。
 *
 * 为什么不复用官方 `Main/Raw/index.tsx` 里的 `getFields`：那个函数只遍历 `_source`
 * 的第一层 key，对 GCP/K8s 这类深嵌套日志只能得到 `jsonPayload`、`kubernetes` 这种顶层名，
 * 而侧栏字段来自 mapping、是 `jsonPayload.dest_instance.project_id` 这样的完整路径，
 * 两边对不上就没法判断某个 mapping 字段在当前结果里到底有没有值。
 */
export default function flattenLogFields(
  logs: unknown[],
  options: {
    /** 日志行里存放原始 `_source` 的 key（官方是 `__n9e_raw_n9e__`），没有则直接展平日志行本身 */
    rawKey?: string;
    maxDocs?: number;
  } = {},
): string[] {
  const { rawKey, maxDocs = RESULT_SAMPLE_MAX_DOCS } = options;
  const paths = new Set<string>();

  const isPlainObject = (value: unknown): value is Record<string, unknown> => {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  };

  const walk = (value: unknown, prefix: string, depth: number) => {
    if (value == null) return;

    if (Array.isArray(value)) {
      // ES 里数组字段的 mapping 与其元素同名，所以数组本身也算一个存在的字段
      if (prefix) paths.add(prefix);
      if (depth >= FLATTEN_MAX_DEPTH) return;
      value.forEach((item) => {
        if (isPlainObject(item)) walk(item, prefix, depth + 1);
      });
      return;
    }

    if (isPlainObject(value)) {
      if (depth >= FLATTEN_MAX_DEPTH) {
        if (prefix) paths.add(prefix);
        return;
      }
      const keys = Object.keys(value);
      if (keys.length === 0) {
        if (prefix) paths.add(prefix);
        return;
      }
      keys.forEach((key) => {
        // 跳过官方注入的内部字段（__n9e_id_n9e__ / __n9e_raw_n9e__ 等）
        if (key.startsWith('__n9e_')) return;
        walk(value[key], prefix ? `${prefix}.${key}` : key, depth + 1);
      });
      return;
    }

    if (prefix) paths.add(prefix);
  };

  logs.slice(0, maxDocs).forEach((log) => {
    if (!isPlainObject(log)) return;
    const source = rawKey && isPlainObject(log[rawKey]) ? log[rawKey] : log;
    walk(source, '', 0);
  });

  return Array.from(paths).sort();
}
