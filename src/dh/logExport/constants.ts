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

/**
 * 自适应缩批的下限。
 *
 * 5000 条/批只对「窄表」成立。GCP / K8s 容器日志这类几百个字段的宽表，单文档能到
 * 几十 KB，5000 条就是几十 MB 的响应体 —— 慢到超时，甚至把浏览器拖进 GC 抖动。
 * 因此一批超时后不直接判失败，而是把批大小折半重试（见 useLogExport 的 fetchBatch）。
 * 折半到这个下限仍然超时，才认定是真的故障并交给用户三选一。
 */
export const MIN_BATCH_SIZE = 250;

/** T1（from+size）上限 = ES index.max_result_window 默认值，改不动 */
export const MAX_ROWS_TIER1 = 10000;

/**
 * T2（ES PIT + search_after）的【条数】闸门。
 *
 * ⚠️ 这只是【两个闸门之一】。真正决定能导多少的是下面的字节闸门：
 * 窄表（网关访问日志，10 列）能跑到 10 万条；宽表（全字段应用日志）
 * 会先撞上 MAX_OUTPUT_CHARS 提前停止。两个闸门先到先停。
 *
 * 原定 100 万条偏保守场景下也太大（会话/内存占用过久），收窄为 10 万。
 */
export const MAX_ROWS_TIER2 = 100_000;

/**
 * 输出体积闸门：累计写入 parts[] 的字符数上限。
 *
 * 300 MiB 的字符数 ≈ 300 MB 的输出文件（ASCII 为主时 1 字符 ≈ 1 字节）。
 * 对应的浏览器内存峰值约 900 MB（parts 按 UTF-16 存 = 2×，
 * 组装瞬间的 Blob 再 +1×），推导见 HANDOFF-log-export.md §12.2。
 *
 * 之所以要有这个闸门：条数根本不能代表内存占用。同样 50 万条，
 * 网关访问日志（10 列、每行 ~200 字符）只有 100MB，
 * 而带 stack trace 的应用日志（50 列、每行 ~2000 字符）有 1GB —— 后者必须提前刹车。
 *
 * ⚠️ 写成 `300 * 1024 * 1024` 而不是 `300_000_000`，是为了让 `formatCharsLimit()`
 * （按 1024² 换算）正好渲染成「300 MB」。UI 上的闸门数字必须由这个常量算出来，
 * 不允许再在 i18n 文案里硬编码 —— 否则改常量而文案不动，用户看到的就是假的。
 */
export const MAX_OUTPUT_CHARS = 300 * 1024 * 1024;

/**
 * 输出体积软警告线（≈100 MB）。
 * 平时进度里只显示「已生成 X MB」；累计超过这条线才补上「上限 300 MB」，
 * 提前告诉用户可能会撞闸门。见 LogExportModal 的进度区。
 */
export const WARN_OUTPUT_CHARS = 100 * 1024 * 1024;

/**
 * 单批请求超时（毫秒）。
 *
 * ⚠️ 这个超时必须由 `withBatchTimeout` 自己实现：umi-request 的 `timeout` 默认为 0
 * （= 永不超时），且它的超时只让 promise 提前 reject，不会真的中断底层 fetch。
 * 少了这道保护，一个卡住的批次会让 promise 永久 pending，UI 就静止在最后一次
 * 成功的进度上、不报错也不结束 —— 这正是首次生产验收时「停在 10000 条」的现象。
 *
 * 超时后不直接判失败，而是先把批大小折半重试到 MIN_BATCH_SIZE，见 useLogExport。
 *
 * 取 30s 还有一个后端原因：center 的 `http.Server.WriteTimeout` 默认 40s
 * （`etc/config.toml`），而 `/proxy/*` 并没有像 SSE 端点那样清掉 write deadline。
 * 让前端的 30s 先触发，我们拿到的是一次干净的 abort + 可读的错误文案；
 * 等后端 40s 掐断连接的话，前端只会收到 `TypeError: Failed to fetch`
 * 或者一段被截断的 JSON。所以这个值必须保持小于后端的 WriteTimeout。
 */
export const BATCH_TIMEOUT_MS = 30_000;

/**
 * ES PIT 的 keep_alive。
 * 注意 ES 的语义是【每次带 pit 的搜索都会把存活时间重置为这个值】，
 * 不是「从创建起总共只能活 5 分钟」。所以即使一次导出跑 10 分钟，
 * 只要批次间隔 < 5 分钟，PIT 就不会过期。见 §5.4.2。
 */
export const ES_PIT_KEEP_ALIVE = '5m';

/** 埋点接口发送的 fields 数组超过该长度时截断，避免撞审计脱敏的 8192 字节截断（§11.3） */
export const MAX_AUDIT_FIELDS = 50;

/**
 * 单个字段值的字符数上限（约 200KB/字段）。
 *
 * `_source` 白名单（见 elasticsearch.ts buildEsSearchBody）只能裁剪「要哪些字段」，
 * 裁不掉「某个字段本身有多大」——如果业务把整段 stack trace / 序列化 payload /
 * base64 blob 写进了日志正文字段，即使只勾选 1~2 列（例如时间字段 + message），
 * 单条文档也可能是几 MB 甚至更大，串行拉 10 个批次足以在 JSON.parse / CSV 转义 /
 * Blob 组装的多次放大下把浏览器乃至整机内存拖垮（真实生产事故：导出 1 万条、
 * 只选了少量列，仍然让电脑内存耗尽到系统级卡死重启）。
 *
 * 200,000 字符：正常日志正文不会达到这个量级，只有真正异常的数据才会触发截断，
 * 不影响任何正常导出场景。触发时保留前 200,000 字符 + 截断标记，不静默丢弃信息。
 */
export const MAX_CELL_CHARS = 200_000;
