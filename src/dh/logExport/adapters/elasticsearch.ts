import { DatasourceCateEnum, N9E_PATHNAME } from '@/utils/constant';
import { RequestMethod } from '@/store/common';
import request from '@/utils/request';
import dslBuilder from '@/plugins/elasticsearch/utils/dslBuilder';
import flattenHits from '@/plugins/elasticsearch/utils/flattenHits';
import { Filter } from '@/plugins/elasticsearch/ExplorerNG/types';

import { MAX_ROWS_TIER1 } from '../constants';
import { FetchPageParams, FetchPageResult, LogExportAdapter, LogExportContext, LogExportPrepareResult, LogRow } from '../types';

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

async function prepare(ctx: LogExportContext, requestedRows: number, _signal: AbortSignal): Promise<LogExportPrepareResult> {
  // T2（PIT + search_after）留待后续 commit 补上；本阶段统一走 T1（from+size）。
  void requestedRows;
  return { strategy: 'from_size', effectiveMaxRows: MAX_ROWS_TIER1 };
}

async function fetchPage(params: FetchPageParams & { state?: unknown }): Promise<FetchPageResult> {
  return fetchPageFromSize(params);
}

function getQueryDigest(ctx: LogExportContext): string {
  const q = ctx.query as EsQuery;
  return q.index || '';
}

async function getMaxRows(_ctx: LogExportContext): Promise<number> {
  return MAX_ROWS_TIER1;
}

const elasticsearchAdapter: LogExportAdapter = {
  cate: DatasourceCateEnum.elasticsearch,
  rawKey: 'message',
  getMaxRows,
  prepare,
  fetchPage,
  getQueryDigest,
};

export default elasticsearchAdapter;
