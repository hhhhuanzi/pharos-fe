# 日志导出到本地 — 验收清单

分支：前后端均为 `feature_link`。完整设计见 `pharos-ops/HANDOFF-log-export.md`（v3）。

> 标注说明：
> - **[自动化]** 已有对应单测覆盖（`csv.test.ts` / `filename.test.ts`），CI 里能跑，不需要人工重复验证纯函数逻辑本身；但涉及真实浏览器/Excel/ES 行为的部分仍需人工过一遍。
> - **[人工·真实 ES]** 必须在有真实数据的 Elasticsearch（7.10+，生产为 `8.9.0`）环境里人工验证，没有自动化覆盖。
> - **[人工·非回归]** 需要人工确认现有功能未被本次改动影响。

## 前置

- [x] C0 已完成：生产 ES 版本 = `8.9.0`，PIT 可用（2026-08-08 确认）
- [ ] **[人工·真实 ES]** pharos-be 已部署包含 C1 的构建
- [ ] **[人工·真实 ES]** 管理员已在「角色管理」中为目标角色勾选 `/log/export`（⚠️ 除 admin 外默认没有）
- [ ] **[人工·真实 ES]** 至少有一个可用的 Elasticsearch 数据源，且当前用户对它有访问权
- [ ] **[人工·真实 ES]** 目标索引里有 > 1000 条日志；另外准备一个几十万条的索引（如网关日志）用于验证大批量导出

## 1. 入口可见性

- [ ] **[人工·真实 ES]** `/log/explorer` 选 ES 数据源 → 「更多操作」下拉里出现「导出日志」
- [ ] **[人工·真实 ES]** 选 VictoriaLogs / Loki → 不出现（本期范围外）
- [ ] **[人工·真实 ES]** 选 MySQL / Prometheus 等非日志数据源 → 不出现
- [ ] **[人工·真实 ES]** 用没有 `/log/export` 权限的账号登录 → 不出现
- [ ] **[人工·真实 ES]** 未选数据源时 → 菜单项 disabled

## 2. 配置弹窗

- [ ] **[人工·真实 ES]** 「查询条件」区正确回显数据源名、索引、绝对时间范围、查询语句
- [ ] **[人工·真实 ES]** 时间范围显示的是解析后的绝对时间，不是 `now-1h`
- [ ] **[人工·真实 ES]** 三种格式都能选，CSV 是默认
- [ ] **[人工·真实 ES]** 「导出条数」的 max：ES ≥ 7.10 显示 1000000，否则显示 10000
- [ ] **[人工·真实 ES]** 「最多 N 条」说明文字常驻显示；默认值是 10000
- [ ] **[人工·真实 ES]** 字段选择器默认预填当前页面时间字段 + `message`
- [ ] **[人工·真实 ES]** 切到 JSONL / 原始文本 → 字段选择区隐藏
- [ ] **[人工·真实 ES]** 勾「使用全部字段」→ 字段选择器 disabled + 出现「以前 1000 条为准」提示
- [ ] **[人工·真实 ES]** 条数填 > 100000 → 出现黄色警告，包含预计耗时 + 预计体积 + 300 MB 上限说明，但「开始导出」仍可点

## 3. 导出功能

- [x] **[自动化]** CSV 单元格转义（双引号、逗号、换行）、公式注入防护（`=`/`+`/`-`/`@`/Tab/CR）、`null`/`undefined`/`0`/`false` 等边界值、列对齐与列顺序 —— `csv.test.ts`
- [ ] **[人工·真实 ES]** CSV 导出 1000 条 → 中文 Windows 的 Excel 双击打开无乱码
- [ ] **[人工·真实 ES]** CSV 中含 `=`/`+`/`-`/`@` 开头的日志内容 → Excel 中显示为文本，没有被当公式执行
- [ ] **[人工·真实 ES]** JSONL 导出 → `jq . file.jsonl` 能解析（无 BOM）
- [ ] **[人工·真实 ES]** JSONL 中不含 `__n9e_id_n9e__` / `__n9e_raw_n9e__` 等内部字段
- [ ] **[人工·真实 ES]** 原始文本导出 → 每行是一条日志正文
- [x] **[自动化]** 文件名非法字符替换（`* \ / : ? " < > \|` 与空格）、连续下划线折叠、超长截断（120 字符）、扩展名保留 —— `filename.test.ts`
- [ ] **[人工·真实 ES]** 跨页导出正确：导 5000 条时确实拿到 5000 条不同的日志（抽查首尾与中间，确认无重复、无遗漏）

## 4. 进度与异常

- [ ] **[人工·真实 ES]** 进度条正常推进，「已获取 N / M 条」数字正确
- [ ] **[人工·真实 ES]** 进度区显示「已生成 xx MB / 300 MB」，且随进度更新
- [ ] **[人工·真实 ES]** `assembling` 阶段有「正在生成文件…」提示
- [ ] **[人工·真实 ES]** 「共命中 N 条」在能拿到 total 时显示
- [ ] **[人工·真实 ES]** 点「取消」→ 立即停止，Network 面板无后续请求，不下载文件
- [ ] **[人工·真实 ES]** 导出期间弹窗无法通过点遮罩或右上角 × 关闭
- [ ] **[人工·真实 ES]** 断网 → 出现三选一对话框；选「导出已获取的 N 条」能拿到部分文件；「重试这一批」能继续
- [ ] **[人工·真实 ES]** 结果为 0 条 → 提示「没有日志」，不下载空文件
- [ ] **[人工·真实 ES]** 弹窗关闭再打开 → 表单是初始值，进度归零，没有残留上次的数据

## 5. T2（PIT + search_after）与字节闸门

- [ ] **[人工·真实 ES]** 导出 20000 条（> T1 上限）成功
- [ ] **[人工·真实 ES]** Network 面板可见 `POST .../_pit`、多次 `POST .../_search`（body 含 `pit` 与 `search_after`、URL 不带 index）、最后 `DELETE .../_pit`
- [ ] **[人工·真实 ES]** 每批用的是响应里返回的最新 `pit_id`，不是一直用第一个
- [ ] **[人工·真实 ES]** T2 的批大小是 5000（Network 面板看 `size`）
- [ ] **[人工·真实 ES]** 导出结果无重复行（`sort -u` 后行数不变）
- [ ] **[人工·真实 ES]** 对 PIT 不可用的数据源 → 弹出降级确认，确认后按 1 万条正常导出
- [ ] **[人工·真实 ES]** 网关日志导出 50 万条：约 3 分钟完成、约 100 MB、页面不崩溃、不撞字节闸门
- [ ] **[人工·真实 ES]** 满载导出：内存峰值 < 1.2 GB（Chrome DevTools Memory 面板），并回填到设计文档 §12.2.2
- [ ] **[人工·真实 ES]** 撞字节闸门：在 300 MB 附近停止 → 文件照常下载 → 弹 `Modal.info`（不是 message）→ 四条降级建议齐全 → 文案含实际条数与命中总数
- [ ] **[人工·真实 ES]** PIT 释放：取消导出后 Network 面板有 `DELETE /_pit`；连续取消 5 次后仍能正常导出

## 6. 权限与审计

- [ ] **[人工·真实 ES]** 无 `/log/export` 权限的用户即使直接调接口 → 403
- [ ] **[人工·真实 ES]** 有 `/log/export` 但对该数据源无访问权 → 403（`checkDsProxyPerm` 生效）
- [ ] **[人工·真实 ES]** 每次导出在 `/audit-log` 页面产生 2 条记录（start + finish）
- [ ] **[人工·真实 ES]** 记录的 `object_type=log_export`、`module=日志导出`、`risk_level=high`
- [ ] **[人工·真实 ES]** `finish` 记录的 `actual_rows` 与实际导出条数一致，含 `stop_reason` 与 `output_bytes`
- [ ] **[人工·真实 ES]** 取消导出也会产生 `finish` 记录，`status=cancelled`
- [ ] **[人工·真实 ES]** center 日志中有对应的 `dh_audit high_risk_operation` WARN
- [x] **[自动化]**（BE，C2 已做过）admin 调用 `/api/n9e/dh/log-export/record` 返回 200 + `max_rows`；审计落库；center 日志有 WARN —— 见 C1/C2 commit 的自测记录

## 7. 非回归

- [ ] **[人工·非回归]** 「更多操作」里原有的「分享」功能正常
- [ ] **[人工·非回归]** 日志页面的正常查询、翻页、字段勾选、直方图、日志聚类均不受影响
- [ ] **[人工·非回归]** 导出期间在页面上翻页/改查询条件，两者互不打断
- [ ] **[人工·非回归]** 商业版构建（`npm run build:advanced`）下，Plus 的 `LogDownload` 与本功能同时存在且都能用，菜单不错乱
- [ ] **[人工·非回归]** Dashboard 的 `table` / `tableNG` 面板原有的 CSV 导出功能未受影响
- [ ] **[人工·非回归]** 明暗主题切换（body 加 `theme-dark`）下弹窗与进度条显示正常

## 8. 与 Kibana CSV 导出的对齐验收

- [ ] **[人工·真实 ES]** 导出的是当前查询命中的全部结果（受上限约束），不是仅当前页
- [ ] **[人工·真实 ES]** 完全继承页面的时间范围、查询语句、筛选条件，且弹窗内不可编辑
- [ ] **[人工·真实 ES]** 导出列 = 用户在页面上选中的列（可在弹窗内临时调整）
- [ ] **[人工·真实 ES]** 有明确的上限，且按体积而非仅按条数
- [ ] **[人工·真实 ES]** 超限时截断 + 明确告知，不静默
- [x] **[自动化]** CSV 标准转义 + BOM + 公式注入防护 —— `csv.test.ts`（BOM 本身需人工确认 Excel 打开效果）
- [ ] **[人工·真实 ES]** 嵌套字段有确定的处理方式（JSON 字符串化）
- [x] **[设计已保证]** 不多做：没有导出时改查询、没有字段重命名、没有导出模板、没有定时导出

## 9. 上线后观察项（非发布阻塞，上线一个月后回顾）

- [ ] 从 `operation_log` 统计 `stop_reason` 分布，`byte_limit` 占比 > 20% 时评估 T3 后端流式
- [ ] 统计 `actual_rows` 的 P50 / P95
- [ ] 统计 `duration_ms` 的 P95
- [ ] 收集用户对「分几次导出」的反馈

## 10. 二开隔离验证

```bash
# FE：官方文件只有 1 个，+2~3 行（本次实测：MainMoreOperations.tsx +6/-1，其中
# 新增语句本体为 1 行 import + 1 个菜单项对象，符合预期）
cd pharos-fe && git diff --stat feature_link -- src/plugins src/pages

# victorialogs / loki 下应零改动
git diff --stat feature_link -- src/plugins/victorialogs src/plugins/loki

# BE：官方文件只有两个
cd pharos-be && git diff --stat feature_link -- center/router/router.go center/cconf/ops.go

# 两仓均无新增依赖
git diff feature_link -- package.json go.mod
```

- [x] 上述核对已在实施过程中逐 commit 执行，结果符合预期（见各 commit message 说明）

## 二开落点回顾

| 层 | 自有 | 薄入口 |
| --- | --- | --- |
| FE 业务 | `src/dh/logExport/**` | 仅 `src/plugins/elasticsearch/ExplorerNG/components/MainMoreOperations.tsx`（+6/-1，含 1 行 import + 1 个菜单项） |
| FE i18n | `src/dh/logExport/locale/**` | 无（`src/i18n.ts` glob 自动扫描） |
| BE 路由 | `center/router/router_dh_log_export.go` | `center/router/router.go` +1 行 |
| BE 配置 | `center/cconf/conf_dh_log_export.go` | 无 |
| BE 权限 | 无 | `center/cconf/ops.go` +2 行 |
| BE 审计 | `pkg/dh/audit/routes_map.go` +4 行（自有文件） | 无 |
| DB | 无 | 无 |
| 依赖 | 无 | 无 |

## 已知的、相对设计文档的实现期调整

以下几点在实施时按代码实际情况做了最小必要调整，均已在对应 commit message 中说明：

1. **ES 版本探测方式**：改为在 adapter 内部直接调用 `services.ts` 现有的 `getESVersion(datasourceId)`（`GET /proxy/{id}/`），而不是要求 `LogExportContext.query` 携带 `version` 字段 —— 页面表单里本来就没有这个字段，新增会侵入官方组件。
2. **`/dh/log-export/record` 的 `phase='start'` 请求体里 `strategy` 先占位为 `from_size`**：因为策略是在 `adapter.prepare()`（发生在 `start` 埋点请求之后）才确定的，而 `LogExportRecordRequest.strategy` 是必填字段。`finish` 记录带的是真实策略，不影响 §16 提到的「靠 `stop_reason` 统计闸门占比」的诉求。
3. **`useLogExport.ts` 的返回值多了一个 `retryBatch()`**：设计文档 §7.3 的 `UseLogExportReturn` 接口只列了 `flushPartial`，但 §10.4 的失败三选一里明确需要「重试这一批」，没有它这个按钮无法工作，属必要补充。
4. **导出统一使用 `reverse: true`（新到旧）**，不跟随页面上临时切换的排序方向：排序方向是 `Main/index.tsx` 内的局部 state，没有向下传递到 `MainMoreOperations`，要传下去需要多改一处官方文件签名，超出「+2~3 行」的薄入口预算。
5. **CSV 列可选项来自 ES `_mapping`**（`services.ts` 的 `getFields`），而不是仅从 `localStorage` 的页面选项里取：后者只保存用户已经勾选过的字段，为空时下拉框会没有可选项。
