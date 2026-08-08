/** i18n namespace，locale 目录会被 src/i18n.ts 自动扫描 */
export const NS = 'dhLogExport';

/** 后端权限点，与 pharos-be center/cconf/ops.go 中的 name 严格一致 */
export const OP_LOG_EXPORT = '/log/export';

/** 审计埋点接口 */
export const AUDIT_RECORD_PATH = '/api/n9e/dh/log-export/record';

/**
 * T1 单批拉取条数。
 * 取 1000 的理由见 HANDOFF-log-export.md §5.2：ES max_result_window 默认 10000，
 * 1000/批恰好 10 次打满，且末批 from=9000&size=1000 不越界。
 */
export const BATCH_SIZE_TIER1 = 1000;

/**
 * T2 单批拉取条数。
 * PIT + search_after 没有深分页惩罚，每批成本恒定，所以可以开得比 T1 大，
 * 用更少的往返换更短的总耗时（§12.4）。5000 × 1KB ≈ 5MB/响应，仍在安全区。
 */
export const BATCH_SIZE_TIER2 = 5000;

/** T1（from+size）上限 = ES index.max_result_window 默认值，改不动 */
export const MAX_ROWS_TIER1 = 10000;

/**
 * T2（ES PIT + search_after）的【条数】闸门。
 *
 * ⚠️ 这只是【两个闸门之一】。真正决定能导多少的是下面的字节闸门：
 * 窄表（网关访问日志，10 列）能跑满 100 万条；宽表（全字段应用日志）
 * 会先撞上 MAX_OUTPUT_CHARS 提前停止。两个闸门先到先停。
 */
export const MAX_ROWS_TIER2 = 1_000_000;

/**
 * 输出体积闸门：累计写入 parts[] 的字符数上限。
 *
 * 3 亿字符 ≈ 300 MB 的输出文件（ASCII 为主时 1 字符 ≈ 1 字节）。
 * 对应的浏览器内存峰值约 900 MB（parts 按 UTF-16 存 = 2×，
 * 组装瞬间的 Blob 再 +1×），推导见 HANDOFF-log-export.md §12.2。
 *
 * 之所以要有这个闸门：条数根本不能代表内存占用。同样 50 万条，
 * 网关访问日志（10 列、每行 ~200 字符）只有 100MB，
 * 而带 stack trace 的应用日志（50 列、每行 ~2000 字符）有 1GB —— 后者必须提前刹车。
 */
export const MAX_OUTPUT_CHARS = 300_000_000;

/** 超过任一软警告线，在弹窗里显示黄色提示，但不阻止 */
export const WARN_ROWS = 100_000;
export const WARN_OUTPUT_CHARS = 100_000_000; // ≈ 100 MB

/** 单批请求超时（毫秒）。超时即视为该批失败，走失败处理流程 */
export const BATCH_TIMEOUT_MS = 30_000;

/**
 * ES PIT 的 keep_alive。
 * 注意 ES 的语义是【每次带 pit 的搜索都会把存活时间重置为这个值】，
 * 不是「从创建起总共只能活 5 分钟」。所以即使一次导出跑 10 分钟，
 * 只要批次间隔 < 5 分钟，PIT 就不会过期。见 §5.4.2。
 */
export const ES_PIT_KEEP_ALIVE = '5m';

/** 默认导出条数（弹窗 InputNumber 初始值） */
export const DEFAULT_EXPORT_ROWS = 10_000;

/** 埋点接口发送的 fields 数组超过该长度时截断，避免撞审计脱敏的 8192 字节截断（§11.3） */
export const MAX_AUDIT_FIELDS = 50;
