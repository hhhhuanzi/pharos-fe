/** i18n namespace，locale 目录会被 src/i18n.ts 自动扫描 */
export const NS = 'dhFieldsSidebar';

/** 「常用字段」使用频次的 localStorage key 前缀，实际 key 为 `${前缀}@${datasourceValue}@${index}` */
export const POPULAR_FIELDS_CACHE_KEY = 'dh-log-explorer-popular-fields';

/** 单个 scope 最多持久化多少个字段的频次，超出时丢弃频次最低的，避免 localStorage 无限膨胀 */
export const POPULAR_FIELDS_MAX_STORED = 50;

/**
 * 「常用字段」分组最多展示多少个。
 * 这一组的意义是「不用滚动就能看到」，一旦超过一屏就退化成第二个字段海，所以必须封顶。
 */
export const POPULAR_GROUP_MAX = 12;

/** 展平结果样本时最多扫描多少条日志，防止无限滚动模式下累积上千条时卡顿 */
export const RESULT_SAMPLE_MAX_DOCS = 500;

/** 展平嵌套对象时的最大深度，兜底防御异常数据造成的深递归 */
export const FLATTEN_MAX_DEPTH = 12;

/** resultFields store 最多缓存多少个 scope（多 tab 场景），超出按写入顺序淘汰 */
export const RESULT_FIELDS_MAX_SCOPES = 8;
