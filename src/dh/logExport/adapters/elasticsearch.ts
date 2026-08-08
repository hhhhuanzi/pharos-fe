import semver from 'semver';

import { DatasourceCateEnum, N9E_PATHNAME } from '@/utils/constant';
import { RequestMethod } from '@/store/common';
import request from '@/utils/request';
import dslBuilder from '@/plugins/elasticsearch/utils/dslBuilder';
import flattenHits from '@/plugins/elasticsearch/utils/flattenHits';
import { getESVersion } from '@/plugins/elasticsearch/services';
import { Filter } from '@/plugins/elasticsearch/ExplorerNG/types';

import { ES_PIT_KEEP_ALIVE, MAX_ROWS_TIER1, MAX_ROWS_TIER2 } from '../constants';
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
 */
function buildEsSearchBody(ctx: LogExportContext, size: number): Record<string, any> {
  const q = ctx.query as EsQuery;
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
  return body;
}

/** ES hit[] -> 导出用的扁平行。取 flattenHits 里已经 flatten 过的 _source，丢弃 _id/_index 等 ES 元数据 */
function flattenEsHits(hits: any[]): LogRow[] {
  const { docs } = flattenHits(hits);
  return docs.map((doc) => doc.fields ?? {});
}

async function fetchPageFromSize({ ctx, fetched, size, signal }: FetchPageParams): Promise<FetchPageResult> {
  const q = ctx.query as EsQuery;
  const body = buildEsSearchBody(ctx, size);
  body.from = fetched;
  const res = await request(`/api/${N9E_PATHNAME}/proxy/${ctx.datasourceId}/${encodeURIComponent(q.index)}/_search`, {
    method: RequestMethod.Post,
    data: body,
    headers: { 'Content-Type': 'application/json' },
    signal,
    silence: true, // 由 useLogExport 统一报错，否则每批失败都弹一个 notification
  });
  // 注意：/proxy 走的是「原样返回」分支（request.tsx 响应拦截器），没有 err/dat 包装
  const hits = res?.hits?.hits ?? [];
  return {
    rows: flattenEsHits(hits),
    total: res?.hits?.total?.value ?? res?.hits?.total,
    exhausted: hits.length < size,
  };
}

/** 建 PIT。400/404（ES < 7.10 或该功能被禁用）时抛错，调用方（prepare）据此降级到 T1 */
async function createPit(ctx: LogExportContext, signal: AbortSignal): Promise<string> {
  const q = ctx.query as EsQuery;
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
async function fetchPageSearchAfter({ ctx, size, cursor, state, signal }: FetchPageParams & { state?: unknown }): Promise<FetchPageResult> {
  const q = ctx.query as EsQuery;
  const pitState = state as PitState;
  const body = buildEsSearchBody(ctx, size);
  delete body.from;
  body.track_total_hits = false; // 深分页统计总数很贵，且首批已经拿到 total
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
  return {
    rows: flattenEsHits(hits),
    total: res?.hits?.total?.value ?? res?.hits?.total,
    cursor: lastHit?.sort,
    exhausted: hits.length < size,
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
  } catch {
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
  const q = ctx.query as EsQuery;
  return q.index || '';
}

/** 可能支持 PIT 时返回 100 万上限，否则退回 1 万。真正的 PIT 建立结果仍以 prepare() 的运行时探测为准 */
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
  rawKey: 'message',
  getMaxRows,
  prepare,
  fetchPage,
  cleanup,
  getQueryDigest,
};

export default elasticsearchAdapter;
