/**
 * 日志场景「内置推荐字段」规则。
 *
 * 设计约束：不能写死成只适配某一个索引。所以这里不匹配完整路径，
 * 而是匹配字段路径的【最后一段】——归一化（转小写、去掉非字母数字）后与词表比对。
 * 这样 `@timestamp`、`kubernetes.pod_name`、`resource.labels.namespace_name`
 * 都能命中，而 `jsonPayload.dest_instance.project_id` 这类业务嵌套字段不会。
 */

/** 按重要性从高到低分层，同层内不再排序，靠路径深度做次级排序 */
const RECOMMENDED_TIERS: string[][] = [
  // 时间
  ['@timestamp', 'timestamp', 'time', 'ts', 'datetime', 'date', 'event_time', 'log_time'],
  // 正文
  ['message', 'msg', 'log', 'body', 'content', 'text_payload', 'textpayload', 'raw'],
  // 级别
  ['level', 'severity', 'log_level', 'loglevel', 'levelname', 'priority'],
  // 链路
  ['trace_id', 'traceid', 'span_id', 'spanid', 'parent_span_id', 'request_id', 'requestid'],
  // 服务 / 应用
  ['service', 'service_name', 'servicename', 'app', 'app_name', 'application', 'component', 'logger', 'logger_name', 'ident'],
  // 容器 / 主机
  ['pod', 'pod_name', 'namespace', 'namespace_name', 'container', 'container_name', 'host', 'hostname', 'node_name', 'cluster', 'cluster_name'],
  // 请求
  ['method', 'path', 'url', 'uri', 'status', 'status_code', 'http_status', 'client_ip', 'remote_addr', 'user_id', 'duration', 'latency', 'elapsed', 'cost'],
];

/** 归一化：转小写并去掉 `_`、`-`、`@` 等非字母数字字符，让 `pod_name` / `podName` / `PodName` 等价 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const TIER_BY_NAME: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  RECOMMENDED_TIERS.forEach((names, tier) => {
    names.forEach((name) => {
      const key = normalize(name);
      // 同名出现在多层时保留更靠前的层
      if (map[key] === undefined) {
        map[key] = tier;
      }
    });
  });
  return map;
})();

/**
 * 取字段的推荐排序权重，越小越靠前；不在推荐词表内返回 undefined。
 *
 * 权重 = 层级 * 100 + 路径深度。加深度是为了让 `log` 排在
 * `jsonPayload.some.nested.log` 前面——同样命中词表时，浅路径几乎总是更常用的那个。
 */
export default function getRecommendedRank(field: string): number | undefined {
  if (!field) return undefined;
  // 侧栏一般不展示 .keyword 子字段，这里仍做一次剥离，避免上游开启 includeSubFields 后失效
  const path = field.endsWith('.keyword') ? field.slice(0, -'.keyword'.length) : field;
  const segments = path.split('.');
  const lastSegment = segments[segments.length - 1];
  const tier = TIER_BY_NAME[normalize(lastSegment)];
  if (tier === undefined) return undefined;
  return tier * 100 + Math.min(segments.length, 99);
}
