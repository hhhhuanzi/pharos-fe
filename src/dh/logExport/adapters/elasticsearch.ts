import semver from 'semver';

import { DatasourceCateEnum, N9E_PATHNAME } from '@/utils/constant';
import { RequestMethod } from '@/store/common';
import request from '@/utils/request';
import dslBuilder from '@/plugins/elasticsearch/utils/dslBuilder';
import flatten from '@/plugins/elasticsearch/utils/flatten';
import { getESVersion } from '@/plugins/elasticsearch/services';
import { Filter } from '@/plugins/elasticsearch/ExplorerNG/types';

import { ES_PIT_KEEP_ALIVE, MAX_ROWS_TIER1, MAX_ROWS_TIER2 } from '../constants';
import { guardRowValueSize } from '../serialize';
import { FetchPageParams, FetchPageResult, LogExportAdapter, LogExportContext, LogExportPrepareResult, LogRow } from '../types';

const MIN_PIT_VERSION = '7.10.0';

/**
 * ExplorerNG 表单里 `query` 字段的实际形状（对齐
 * `src/plugins/elasticsearch/ExplorerNG/Main/Raw/index.tsx` 里 dslBuilder 的调用方式）。
 * 这里不放进全局 `types.ts`，因为它是 ES adapter 私有的解释方式。
 */
interface EsQuery {
  index: string;
  date_field: string;
  filters?: Filter[];
  syntax?: string; // lucene | kuery
  /** 页面表单里查询语句统一叫 query，同时喂给 query_string 与 kuery */
  query?: string;
}

/** T2（PIT + search_after）的私有状态，由 prepare() 创建，原样传回 fetchPage / cleanup */
interface PitState {
  pitId: string;
}

/**
 * 复用官方 dslBuilder 生成 query，再改造成 _search body。
 * 这样做的价值：query_string / kuery / filters / 时间范围的构造逻辑与页面
 * 完全一致，不会出现「导出的和看到的不一样」。
 * dslBuilder 返回 `${header}\n${body}\n` 的 NDJSON，我们只要第二行。
 *
 * `sourceFields` 非空时把 `_source` 从 `true` 收窄成白名单，这是本功能最重要的
 * 一处省流：GCP / K8s 容器日志的单文档有几百个嵌套字段、几十 KB，而 CSV 导出
 * 通常只要其中 3~5 列。不裁剪的话每批 5000 条要传几十 MB，绝大部分当场被丢掉。
 */
function buildEsSearchBody(ctx: LogExportContext, size: number, sourceFields?: string[]): Record<string, any> {
  const q = ctx.query as unknown as EsQuery;
  const ndjson = dslBuilder({
    index: q.index,
    date_field: q.date_field,
    start: ctx.start,
    end: ctx.end,
    filters: q.filters,
    syntax: q.syntax,
    query_string: q.query,
    kuery: q.query,
    limit: size,
    sorter: [{ field: q.date_field, order: ctx.reverse ? 'asc' : 'desc' }],
    _source: true,
    shouldHighlight: false, // 导出不需要高亮，省带宽也省解析
  });
  const body = JSON.parse(ndjson.split('\n')[1]);
  delete body.highlight; // dslBuilder 即使 shouldHighlight=false 也会塞一个空壳
  delete body.aggs; // 导出不需要聚合
  delete body.script_fields; // dslBuilder 塞的空壳，ES 侧多一层无用解析
  // dslBuilder 的 `_source` 形参只接受 boolean，这里直接改 body 而不是改官方文件
  if (sourceFields && sourceFields.length > 0) body._source = sourceFields;
  return body;
}

/**
 * ES hit[] -> 导出用的扁平行。
 *
 * 刻意不复用 `utils/flattenHits`：它为每个 doc 同时产出 `_source` 与 `fields` 两份
 * flatten 结果（即同一份数据在内存里存三遍），还带一个 `propNames.indexOf` 的
 * O(字段数²) 循环。对几百字段 × 5000 条/批的宽表，这两项都是实打实的内存与 CPU
 * 开销，而导出只用得到 `fields`。这里直接调同一个 `flatten`，保证 key 完全一致。
 *
 * `guardRowValueSize` 必须在这里（展平后立刻）调用，而不是留到 CSV/JSONL 序列化
 * 阶段：`_source` 白名单只能少选字段，选中的那个字段本身有多大是裁不掉的——
 * 真实事故：只选了时间字段 + 日志正文两列，仍然因为正文字段里混入了异常巨大的
 * 单条内容（如整段 stack trace / 序列化 payload）把浏览器内存拖垮。这里截断后，
 * 后面所有格式的序列化、`parts[]` 累积都基于已经有界的字符串。
 */
function flattenEsHits(hits: any[]): { rows: LogRow[]; truncatedCells: number } {
  let truncatedCells = 0;
  const rows = hits.map((hit) => {
    if (!hit?._source) return {};
    const flat = flatten(hit._source);
    const guarded = guardRowValueSize(flat);
    if (guarded !== flat) truncatedCells++;
    return guarded;
  });
  return { rows, truncatedCells };
}

async function fetchPageFromSize({ ctx, fetched, size, sourceFields, signal }: FetchPageParams): Promise<FetchPageResult> {
  const q = ctx.query as unknown as EsQuery;
  const body = buildEsSearchBody(ctx, size, sourceFields);
  body.from = fetched;
  // 精确统计总数在大索引上很贵，只有首批需要（UI 的「共命中 N 条」拿到一次就够）
  body.track_total_hits = fetched === 0;
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${ctx.datasourceId}/${encodeURIComponent(q.index)}/_search`, {
    method: RequestMethod.Post,
    data: body,
    headers: { 'Content-Type': 'application/json' },
    signal,
    silence: true, // 由 useLogExport 统一报错，否则每批失败都弹一个 notification
  });
  // 注意：/proxy 走的是「原样返回」分支（request.tsx 响应拦截器），没有 err/dat 包装
  const hits = res?.hits?.hits ?? [];
  const { rows, truncatedCells } = flattenEsHits(hits);
  return {
    rows,
    total: res?.hits?.total?.value ?? res?.hits?.total,
    exhausted: hits.length < size,
    truncatedCells,
  };
}

/** 建 PIT。400/404（ES < 7.10 或该功能被禁用）时抛错，调用方（prepare）据此降级到 T1 */
async function createPit(ctx: LogExportContext, signal: AbortSignal): Promise<string> {
  const q = ctx.query as unknown as EsQuery;
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${ctx.datasourceId}/${encodeURIComponent(q.index)}/_pit`, {
    method: RequestMethod.Post,
    params: { keep_alive: ES_PIT_KEEP_ALIVE },
    signal,
    silence: true,
  });
  if (!res?.id) throw new Error('createPit: response missing id');
  return res.id;
}

/** 释放 PIT。失败只 console.warn，见 §5.4.3：泄漏一个 PIT 的代价是多占一点搜索上下文，不是灾难 */
async function deletePit(ctx: LogExportContext, pitId: string): Promise<void> {
  await request(`/api/${N9E_PATHNAME}/proxy/${ctx.datasourceId}/_pit`, {
    method: RequestMethod.Delete,
    data: { id: pitId },
    headers: { 'Content-Type': 'application/json' },
    silence: true,
  });
}

/**
 * T2：PIT + search_after。URL 里【不能】带 index —— PIT 已经锁定了索引集合。
 * 每批都用响应里的新 pit_id 更新 state（原地修改，与 useLogExport 中传回的引用一致），
 * 因为 ES 可能在响应中轮换 pit_id（§5.4.2）。
 */
async function fetchPageSearchAfter({ ctx, size, cursor, state, sourceFields, signal }: FetchPageParams & { state?: unknown }): Promise<FetchPageResult> {
  const q = ctx.query as unknown as EsQuery;
  const pitState = state as PitState;
  const body = buildEsSearchBody(ctx, size, sourceFields);
  delete body.from;
  // 只有首批（还没有游标）统计精确总数；后续批次统计一遍纯属浪费
  body.track_total_hits = cursor == null;
  body.pit = { id: pitState.pitId, keep_alive: ES_PIT_KEEP_ALIVE };
  body.sort = [
    { [q.date_field]: { order: ctx.reverse ? 'asc' : 'desc', unmapped_type: 'boolean' } },
    { _shard_doc: 'asc' }, // tiebreaker，只在 PIT 上下文可用
  ];
  if (cursor) body.search_after = cursor;

  const res = await request(`/api/${N9E_PATHNAME}/proxy/${ctx.datasourceId}/_search`, {
    method: RequestMethod.Post,
    data: body,
    headers: { 'Content-Type': 'application/json' },
    signal,
    silence: true,
  });
  if (res?.pit_id) pitState.pitId = res.pit_id;

  const hits = res?.hits?.hits ?? [];
  const lastHit = hits[hits.length - 1];
  const { rows, truncatedCells } = flattenEsHits(hits);
  return {
    rows,
    total: res?.hits?.total?.value ?? res?.hits?.total,
    cursor: lastHit?.sort,
    exhausted: hits.length < size,
    truncatedCells,
  };
}

function isPitState(state: unknown): state is PitState {
  return !!state && typeof state === 'object' && typeof (state as PitState).pitId === 'string';
}

async function prepare(ctx: LogExportContext, requestedRows: number, signal: AbortSignal): Promise<LogExportPrepareResult> {
  if (requestedRows <= MAX_ROWS_TIER1) {
    return { strategy: 'from_size', effectiveMaxRows: MAX_ROWS_TIER1 };
  }

  // settings.version 拿不到或格式不合法时不拦截，只是少一次省流的机会——真正的判定仍由下面的 createPit 兜底
  try {
    const version = await getESVersion(ctx.datasourceId);
    const coerced = semver.coerce(version);
    if (coerced && semver.lt(coerced, MIN_PIT_VERSION)) {
      return { strategy: 'from_size', effectiveMaxRows: MAX_ROWS_TIER1, downgradeReason: 'es_version_too_low' };
    }
  } catch {
    // 探测版本失败不阻断，继续尝试建 PIT
  }

  try {
    const pitId = await createPit(ctx, signal);
    return { strategy: 'pit_search_after', effectiveMaxRows: MAX_ROWS_TIER2, state: { pitId } as PitState };
  } catch (err) {
    // 用户取消或建 PIT 超时都不能推断出「集群不支持 PIT」。原来无条件 catch 会把这两种
    // 情况也误判成降级，于是用户点了取消反而收到一个「降级到 1 万条，是否继续」的弹窗。
    if (signal.aborted) throw err;
    return { strategy: 'from_size', effectiveMaxRows: MAX_ROWS_TIER1, downgradeReason: 'pit_unsupported' };
  }
}

async function fetchPage(params: FetchPageParams & { state?: unknown }): Promise<FetchPageResult> {
  if (isPitState(params.state)) return fetchPageSearchAfter(params);
  return fetchPageFromSize(params);
}

async function cleanup(ctx: LogExportContext, state?: unknown): Promise<void> {
  if (!isPitState(state)) return;
  try {
    await deletePit(ctx, state.pitId);
  } catch (err) {
    console.warn('[dh/logExport] deletePit failed:', err);
  }
}

function getQueryDigest(ctx: LogExportContext): string {
  const q = ctx.query as unknown as EsQuery;
  return q.index || '';
}

/** 可能支持 PIT 时返回 10 万上限，否则退回 1 万。真正的 PIT 建立结果仍以 prepare() 的运行时探测为准 */
async function getMaxRows(ctx: LogExportContext): Promise<number> {
  try {
    const version = await getESVersion(ctx.datasourceId);
    const coerced = semver.coerce(version);
    if (coerced && semver.gte(coerced, MIN_PIT_VERSION)) return MAX_ROWS_TIER2;
  } catch {
    // 探测失败保守退回 T1 上限
  }
  return MAX_ROWS_TIER1;
}

const elasticsearchAdapter: LogExportAdapter = {
  cate: DatasourceCateEnum.elasticsearch,
  csvPresetColumns: ['message'],
  getMaxRows,
  prepare,
  fetchPage,
  cleanup,
  getQueryDigest,
};

export default elasticsearchAdapter;
