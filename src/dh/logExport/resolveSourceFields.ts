import { LogExportContext, LogExportFormValues } from './types';

/**
 * 本次导出真正需要哪些字段。返回 undefined = 需要完整文档。
 *
 * - `jsonl`：语义就是完整文档，不裁剪；
 * - `raw`：同样不裁剪，`rowsToRawChunk` 会把完整文档序列化为一行 JSON；
 * - `csv` 且未勾选 `allFields`：裁剪到用户手动选的列（原有行为）；
 * - `csv` 且勾选了 `allFields`：优先用 `ctx.resultFields`——本次查询结果样本里
 *   实际出现过的字段路径（见 `src/dh/fieldsSidebar/resultFieldsStore`）——作为
 *   `_source` 白名单，而不是不做任何裁剪。跨 pod / 跨日志格式的宽索引上，不裁剪
 *   等于把整份 `_mapping` 规模的字段都摊到每一行上，即使单条文档实际只有其中一小
 *   部分有值；用当前查询结果样本收窄，能显著降低导出体积与内存风险（呼应
 *   `guardRowValueSize` 的单值截断——字段数越少，风险敞口也越小）。
 *   没有样本（如页面还没查询出结果）时退回不裁剪，保留原有兜底行为。
 *
 * 独立成文件（而不是留在 useLogExport.ts 里）是为了让单测不必连带 mock `./adapters`
 * 拉进来的真实网络请求依赖（`@/utils/request` -> `@/App` 用到 `import.meta.env`，
 * jest 无法解析）。
 */
export function resolveSourceFields(values: LogExportFormValues, ctx: LogExportContext): string[] | undefined {
  if (values.format !== 'csv') return undefined;
  if (!values.allFields) return values.columns.length > 0 ? values.columns : undefined;
  return ctx.resultFields && ctx.resultFields.length > 0 ? ctx.resultFields : undefined;
}
