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
- [ ] **[人工·真实 ES]** 格式只提供 **CSV / 原始文本** 两项，CSV 是默认（第十轮调整：JSON Lines 实测导出明显偏慢，已从 UI 移除；序列化能力仍保留在 `serialize.ts`，只是不再作为可选项暴露）
- [ ] **[人工·真实 ES]** 正常路径**零配置**：弹窗里不提供任何可手动修改条数/字段的入口（不留「高级选项」），点「开始导出」就能拿到文件（第五轮调整：彻底移除「高级选项」，见下方新增章节）
- [ ] **[人工·真实 ES]** 弹窗里有一块只读摘要：「导出字段：常用字段（N 个）」+「导出条数：最多 M 条」，`M` 与 ES ≥ 7.10 时的 100000 / 否则 10000 一致；这两行是纯展示，页面上找不到任何输入框/下拉框/勾选框能改动它们
- [ ] **[人工·真实 ES]** 弹窗刚打开、mapping 还没拉回来的一瞬间：摘要区显示「正在计算常用字段…」（带 loading 图标），**不是**一个看起来已经算完但其实只是预填列的数字；此时「开始导出」按钮 disabled，mapping 拉回后自动恢复可点（第六轮新增，见下方新增章节）
- [ ] **[人工·真实 ES]** 「常用字段」摘要旁的 `?` 提示：hover 能看到判定规则说明 + 「当前包含：xxx、xxx、…」的具体字段名列表（不再只有数字，第六轮新增）；与左侧字段侧栏当前「常用字段」分组展示的字段名逐一对比，应完全一致（同一份 `resultFieldsStore` 数据 + 同一个 `groupFields()` 判定）
- [ ] **[人工·真实 ES]** 打开导出弹窗后，如果侧边栏的「常用字段」分组因为结果样本更新而发生变化（如页面重新查询），导出弹窗的摘要数字/字段列表也应跟着变化，不停留在弹窗打开那一刻的旧快照上（第六轮修复：改成 `useMemo` 响应式计算，见下方新增章节）
- [ ] **[人工·真实 ES]** 切到原始文本 → 摘要文案变为「导出字段：日志正文」（该格式只输出正文，不需要字段裁剪入口，也不受上面两条 mapping 加载状态影响）
- [ ] **[人工·真实 ES]** 导出进行中，表单控件（仅剩「导出格式」单选）disabled，但「取消」按钮**保持可点**

## 3. 导出功能

- [x] **[自动化]** CSV 单元格转义（双引号、逗号、换行）、公式注入防护（`=`/`+`/`-`/`@`/Tab/CR）、`null`/`undefined`/`0`/`false` 等边界值、列对齐与列顺序 —— `csv.test.ts`
- [ ] **[人工·真实 ES]** CSV 导出 1000 条 → 中文 Windows 的 Excel 双击打开无乱码
- [ ] **[人工·真实 ES]** CSV 中含 `=`/`+`/`-`/`@` 开头的日志内容 → Excel 中显示为文本，没有被当公式执行
- [ ] **[人工·真实 ES]** 原始文本导出 → 每行是一条日志正文，不含 `__n9e_id_n9e__` / `__n9e_raw_n9e__` 等内部字段
- ~~JSONL 相关验收项~~：第十轮已从 UI 移除该格式，用户无法选到，不再验收（`serialize.ts` 里的实现与单测保留）
- [x] **[自动化]** 文件名非法字符替换（`* \ / : ? " < > \|` 与空格）、连续下划线折叠、超长截断（120 字符）、扩展名保留 —— `filename.test.ts`
- [ ] **[人工·真实 ES]** 跨页导出正确：导 5000 条时确实拿到 5000 条不同的日志（抽查首尾与中间，确认无重复、无遗漏）

## 4. 进度与异常

进度呈现按**导出规模分档**，判断依据是 `prepare()` 实际选定的策略（`progress.strategy`）：

| 档位 | 触发条件 | 呈现 |
| --- | --- | --- |
| **小额** | `strategy === 'from_size'`（≤1 万条，含「请求 10 万条但 PIT 不可用降级到 1 万条」） | 不弹进度面板；停留在表单，主按钮转圈显示「正在导出…」，完成即下载 |
| **大额** | `strategy === 'pit_search_after'`（> 1 万条） | 显示进度面板：进度条 + 「已获取 N / M 条」+ 取消按钮，体积与剩余时间为小字次要信息 |

### 4.1 小额路径（ES < 7.10 / 不支持 PIT 时，默认就走这条；PIT 可用时默认条数恒为架构上限，走不到这条，见下方第四/五轮调整里的取舍说明）

- [ ] **[人工·真实 ES]** 点「开始导出」→ **不出现进度条**；主按钮变成 loading 的「正在导出…」
- [ ] **[人工·真实 ES]** 几秒后浏览器直接触发下载 + 一条成功 toast（含条数与体积），弹窗自动关闭
- [ ] **[人工·真实 ES]** 导出中弹窗**可以**通过遮罩 / 右上角 × 关闭；关闭后 Network 无后续请求、不下载文件
- [ ] **[人工·真实 ES]** 导出中点「取消」→ 立即停止并关窗，不下载文件（这是小额路径的逃生口，必须验证）
- [ ] **[人工·真实 ES]** 无 `/log/export` 权限 → 表单顶部出现红色 Alert，**不是**静默失败
- [ ] **[人工·真实 ES]** 数据源不可用（prepare 失败）→ 表单顶部出现红色 Alert，按钮恢复可点
- [ ] **[人工·真实 ES]** 批次失败（可断网模拟）→ 切换到三选一对话框（与大额一致）

### 4.2 大额路径（PIT 可用时默认就走这条，因为默认条数恒为架构上限 = 10 万，见下方第四/五轮调整）

- [ ] **[人工·真实 ES]** 点「开始导出」后**立刻**出现进度面板（不必等首批返回）；此时（首批还没回来）进度条为 `active` 样式、**不显示具体百分比**，文案为「正在获取首批数据…」，**不是**一个基于架构上限算出来、注定要跳变的精确百分比（第七轮修复）
- [ ] **[人工·真实 ES]** 首批响应落地后，进度条切换为正常样式并显示百分比；「已获取 N / M 条」的 `M` 是 `min(架构上限, 本次查询真实命中数)`，**不是**恒定的 10 万（第七轮修复：以 47059 命中、100000 上限为例，应显示「已获取 N / 47059 条」而不是「已获取 N / 100000 条」）
- [ ] **[人工·真实 ES]** 从「首批未回」切到「首批已回」时，百分比只会向上跳变（如 0% → 10%），**不会**出现先涨后跌的情况
- [ ] **[人工·真实 ES]** 「已生成 xx MB」与「剩余约」是**小字次要信息**，不带分母；「剩余约」的预估在首批落地前不显示（`progress.rate` 未知），落地后按修正后的分母计算，不会再出现「剩余约 36s」但分母其实是 10 万这种脱离真实命中数的估算
- [ ] **[人工·真实 ES]** 累计超过 100 MB 后，体积那行变黄并追加「（上限 300 MB）」
- [ ] **[人工·真实 ES]** 进度面板里**没有**「共命中 N 条」（该信息已并入完成 toast）
- [ ] **[人工·真实 ES]** 完成 toast 里带「本次查询共命中 N 条」
- [ ] **[人工·真实 ES]** `assembling` 阶段有「正在生成文件…」提示
- [ ] **[人工·真实 ES]** 点「取消」→ 立即停止，Network 面板无后续请求，不下载文件
- [ ] **[人工·真实 ES]** 大额导出期间弹窗**无法**通过点遮罩或右上角 × 关闭（有独立取消按钮）
- [ ] **[人工·真实 ES]** PIT 不可用而降级确认后 → 走的是**小额**呈现（无进度条），因为 target 已被 clamp 到 1 万条

### 4.3 两档共有

- [ ] **[人工·真实 ES]** CSV 场景下，Network 里 `_search` 请求体的 `_source` 始终是「常用字段」列的数组（不是 `true`）——`allFields` 恒为 `false`，弹窗里也没有「全部字段」这个选项了
- [ ] **[人工·真实 ES]** 只有首批 `_search` 带 `track_total_hits: true`，后续批次为 `false`
- [ ] **[人工·真实 ES]** 单批超过 30s 无响应 → 该请求在 Network 里被 cancel，出现「已把每批条数降到 N 条后重试」，而不是永久静止
- [ ] **[人工·真实 ES]** `preparing` 阶段点「取消」→ 立即回到可用的表单，不是空操作、按钮不再转圈
- [ ] **[人工·真实 ES]** 断网 → 出现三选一对话框；选「导出已获取的 N 条」能拿到部分文件；「重试这一批」能继续
- [ ] **[人工·真实 ES]** 结果为 0 条 → 提示「没有日志」，不下载空文件
- [ ] **[人工·真实 ES]** 弹窗关闭再打开 → 表单是初始值、进度归零、条数上限重新探测，**没有**残留上次的报错 Alert 或数据
- [ ] **[人工·真实 ES]** 导出中途关闭弹窗 → 不下载文件、不残留报错；Network 里仍有 `DELETE /_pit`（资源照常释放）

## 5. T2（PIT + search_after）与字节闸门

- [ ] **[人工·真实 ES]** 导出 20000 条（> T1 上限）成功
- [ ] **[人工·真实 ES]** Network 面板可见 `POST .../_pit`、多次 `POST .../_search`（body 含 `pit` 与 `search_after`、URL 不带 index）、最后 `DELETE .../_pit`
- [ ] **[人工·真实 ES]** 每批用的是响应里返回的最新 `pit_id`，不是一直用第一个
- [ ] **[人工·真实 ES]** T2 的批大小起始为 5000（Network 面板看 `size`）；只有在批次超时后才会自动折半，下限 250
- [ ] **[人工·真实 ES]** 导出结果无重复行（`sort -u` 后行数不变）
- [ ] **[人工·真实 ES]** 对 PIT 不可用的数据源 → 弹出降级确认，确认后按 1 万条正常导出
- [ ] **[人工·真实 ES]** 网关日志导出 50 万条：约 3 分钟完成、约 100 MB、页面不崩溃、不撞字节闸门
- [ ] **[人工·真实 ES]** 满载导出：内存峰值 < 1.2 GB（Chrome DevTools Memory 面板），并回填到设计文档 §12.2.2
- [ ] **[人工·真实 ES]** 撞字节闸门：在 300 MB 附近停止 → 文件照常下载 → 弹 `Modal.info`（不是 message）→ 三条降级建议齐全（缩短时间范围/收窄查询/改用 JSON Lines；第五轮移除了「减少导出列」这条，因为已经没有 UI 能让用户改列了）→ 文案含实际条数与命中总数
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

## 首次生产验收后的调整（2026-08-08）

首轮真实环境验收暴露了「导出停在 10000 条、无报错」，据此做了以下修正，验收清单已同步更新：

1. **`_search` 增加 `_source` 白名单裁剪**（CSV 且指定列时）：原先固定 `_source: true`，对几百字段的宽表每批传的是完整文档，是卡死的直接诱因。
2. **单批超时真正接上**（`batchTimeout.ts`）：`BATCH_TIMEOUT_MS` 原先是死代码，而 umi-request 的 `timeout` 默认为 0 = 永不超时，导致卡住的批次永久 pending、UI 静止且不报错。取 30s 是为了先于后端 `WriteTimeout`（40s）触发。
3. **超时后自适应缩批**：批大小折半重试到 `MIN_BATCH_SIZE`（250）才判失败，并在进度区给出提示，避免缩批期间被误认为又卡死了。
4. **体积闸门不再当分母**：`300 MB` 原先硬编码在 5 个 locale 文案里，且与按条数算的进度条互相矛盾。现在由 `MAX_OUTPUT_CHARS` 计算注入，平时只显示「已生成 X MB」，超过 `WARN_OUTPUT_CHARS`（100 MB）才追加上限预警。
5. **进度呈现分档**（见 §4）：设计文档假定所有导出都弹进度弹窗；实际上 ≤1 万条通常几秒完成，弹窗反而是噪音。现按 `progress.strategy` 分档，小额走「无感直接下载」。
6. **`preparing` 阶段的取消从空操作修成可用**：`cancel()` 原先只认 `sessionRef.current`，而 session 要到 `start()` 末尾才赋值。
7. **关闭弹窗中止导出不再留残留状态**：新增 `session.abandoned`，让被放弃的 `runLoop` 安静收尾（仍释放 PIT、仍补审计），不再异步写入一个 `phase='failed'` 污染下次打开。

## 根据用户反馈的调整（「全部字段」收窄为结果样本字段）

用户反馈：勾选「全部字段」导出的列数远超单条日志实际拥有的字段数（约 20 个），原因是字段来源覆盖了整份索引 `_mapping`（跨多个 pod、多种日志格式的字段并集），而不是这一条日志/这次查询实际有的字段，在 `k8s-pod*` 这类宽索引上会显著放大预估体积。据此做了以下调整：

1. **`LogExportContext` 新增 `resultFields?: string[]`**（`types.ts`）：本次查询结果样本里实际出现过的叶子字段路径，直接复用字段侧栏已发布的 `src/dh/fieldsSidebar/resultFieldsStore`（与侧栏「可用字段 / 空字段」分组同一份数据），由 `LogExportMenuItem` 用与 `ExplorerNG/Main/Raw` 一致的 scope（`datasourceValue` + `index`）订阅后带入 `ctx`。
2. **`resolveSourceFields()` 独立成文件**（`resolveSourceFields.ts`，原在 `useLogExport.ts` 内部）：勾选「全部字段」时优先用 `ctx.resultFields` 作为 `_source` 白名单，而不是不做任何裁剪；没有样本（如页面还没查询出结果）时退回原有的不裁剪兜底行为。手动选择的列（`values.columns`）在 `allFields=true` 时不影响结果——`resultFields` 优先级更高，与页面「全部字段=忽略手动选择」的既有语义一致。
3. **未改动**：CSV 列的下拉可选项（`fieldOptions`，来自 `getFields`/`_mapping`）、`resolveCsvColumns()` 按首批文档 key 并集确定表头列的机制、T1/T2 分层策略。`_source` 收窄后，首批文档天然只包含 `resultFields` 范围内的字段，因此表头列数也被间接收窄到不超过该范围——不需要单独改表头逻辑。
4. **弹窗提示文案**（`modal.columns_all_tip`）拆成 `columns_all_tip_scoped`（有样本，报告将导出的字段数）与 `columns_all_tip_fallback`（无样本，退回完整文档，可能包含大量本次查询用不到的字段）两条，避免用户误以为「全部字段」永远等于整份 mapping。

## 第三轮调研：字段侧栏「可用字段」数量远高于 Kibana（结论：非 bug，是「还没查询」的兜底态）

用户对比 Pharos（`k8s-pod*`，常用 12 / 可用 912，无空字段分组）与 Kibana Discover（同索引，常见 10 / 可用 329 / 空 545 / 元 3）截图，怀疑「可用字段」计数口径有 bug。排查结论：

1. **确认组件路径**：截图对应 `src/pages/logExplorer`（页面标题「日志检索」）→ 按数据源类型分发到 `src/plugins/elasticsearch/ExplorerNG` → `SideBarNav/FieldsSidebar` → `src/dh/fieldsSidebar/FieldsList`，即第一轮改动本身覆盖的组件，不是另一套未接入的实现。
2. **不是 `groupFields.ts` 的判定 bug**：`groupFields.ts` 已有测试覆盖「没有结果信息时不产生空字段分组，退回官方两组」这一分支（`hasResultInfo` 为 `false` 时可用字段=mapping 全量、空字段=0）。截图现象与该分支完全吻合：数量级上，pharos 常用+可用=924 与 kibana 常见+可用+空+元=887 接近，说明「912」本质是 mapping 总量，而不是「可用字段分组混入了本该属于空字段的字段」。
3. **根因**：`ExplorerNG/SideBarNav/index.tsx` 里，切换/首次自动选中「索引模式」时（`onChange` 与 `onSuccess` 两处）会把 `refreshFlag` 设为 `undefined` 但**不会**自动重新执行查询，需要用户显式点「查询」。在用户点查询之前，`resultFieldsStore` 里该 scope 没有已发布的结果字段，`groupFields` 因此拿不到「结果样本」，退回「无空字段分组、可用字段=mapping 全量」的兜底——这是两轮前就写好并测试过的设计行为，不是本轮引入的回归，只是恰好在“刚选完索引模式、还没点查询”的那一刻更容易被截图捕捉到。
4. **是否要让选索引模式后自动执行查询（更贴近 Kibana 的“选完即查”体验）**：这属于查询触发时机的产品行为改动，涉及官方文件 `ExplorerNG/SideBarNav/index.tsx` / `ExplorerNG/index.tsx` 的核心查询流程，超出本轮「字段分组」问题的范围，本轮未改，留给用户决定是否需要单独立项。
5. **已做的小改动**（`src/dh/fieldsSidebar/**`，不改变任何计数口径）：`groupFields.ts` 导出 `hasResultInfo()` 判断函数，`FieldsList` 在还没有结果样本时，给「可用字段」标题旁加一个 `?` 提示（复用「空字段」分组同款的 `Tooltip`），说明当前展示的是 mapping 全量、执行查询后会拆出「空字段」分组，避免用户误以为数量异常。
6. **导出「全部字段」侧**：`resolveSourceFields.ts`（第二轮已实现）用的是同一份 `resultFields`，逻辑与侧栏「可用字段」完全一致，因此不需要为本轮的发现再单独调整导出逻辑。用户进一步提出的「即使有值也应剔除低价值 k8s 元数据」诉求（方案二）本轮只给设计草案、未实现，见调研报告。

## 第四轮：两份真实导出 CSV 的取证分析 + 简化导出配置（去掉手动选字段/选行数）

### 4.1 CSV 取证分析结论

用户提供了两份真实导出文件：`pharos-ops/Elasticsearch_k8s-pod_20260809-0947_20260809-0948.csv`（Pharos，1 分钟范围，勾了「全部字段」）与 `pharos-ops/未命名 Discover 搜索 (1).csv`（Kibana，15 分钟范围，该索引在此范围命中 667,153 条）。用 Python `csv` 模块（quote-aware，而不是天真按行/按逗号数）实测：

| 指标 | Pharos | Kibana |
| --- | --- | --- |
| 文件字节数 | 12,420,071（≈11.8 MB） | 10,479,375（≈10.0 MB） |
| `wc -l` 原始行数 | 12,996 | 16,913 |
| **表头列数（Excel/WPS 数到的 EX 列换算一致）** | 92 | 154 |
| **严格 CSV 解析出的逻辑行数** | **10,000（每行恰好 92 个字段，无一行错位）** | **无法稳定解析——字段数在 154/164/183/191/194/212 之间跳变，且以 500 行为一批出现**（见下方解释） |

**结论 1（Pharos 侧）：12MB 不是「膨胀」，是这个索引在这 1 分钟内的真实写入速率撞上了导出条数上限。** Pharos 导出的 10,000 行是完全合规、逐行 92 字段对齐的标准 CSV（BOM 头 + 每行字段数与表头严格一致），且这 92 列已经是第二轮「用 `resultFields` 收窄」生效后的结果——远小于该索引 `_mapping` 的 912 个字段，说明第二轮的收窄在这份真实数据里确实起了作用。12MB 单纯是「10,000 条 × 92 列，其中 `log` 列均值 246 字符（含少量完整堆栈，单行最大 22,776 字符）」的正常体积，未触发任何截断（`MAX_CELL_CHARS=200,000` 远未触及）。换句话说：这份文件之所以看起来「1 分钟就 12MB」，是因为该 `k8s-pod*` 索引 1 分钟内的写入量远超 10,000 条（导出条数命中了上限，而不是查询命中数只有 10,000 条）——这正好印证了本轮要解决的问题：**用户根本不需要关心「选多少行数」，只需要「尽量导出到系统允许的上限」**。

**结论 2（Kibana 侧）：Kibana 的 CSV 不是「又快又完整」，而是同时踩了两个坑——体积硬顶 + 字段本身没做严格转义。**

- **体积上限**：文件体积 10,479,375 字节，与 Kibana Reporting 经典的 CSV 导出体积上限 `xpack.reporting.csv.maxSizeBytes`（历史默认值恰好是 10 MB = 10,485,760 字节）只差 6,385 字节——高度吻合「写到快撞上体积上限时被截断」的行为，而不是「15 分钟、66.7 万条命中都导出完了」。15 分钟命中 667,153 条，文件里最多只有 16,912 条原始行（严格解析后更少），占比 < 2.5%，无论怎么折算都远不是「全部导出」。
- **字段没有严格转义，导致标准 CSV 解析器直接对不齐列**：用 Python `csv` 模块严格解析，行的字段数在 154 / 164 / 183 / 191 / 194 / 212 之间跳变，且精确以 500 行为一批出现分界（500+500+500+500+752+1000=3752 行）。逐字段比对发现：Kibana 把同一个字段的 `xxx` 与 `xxx.keyword`（ES 的多字段索引，两者值完全相同）**都当成独立列导出**——154 列里有 73 对（146 列）是这种逐字节相同的重复列，仅 8 列是真正唯一的。加上多值字段（数组）在某些行没有正确加引号，逗号被当成了新列的分隔符，导致标准解析器数出的字段数比表头还多。这解释了用户截图 5 里看到的「TRUE TRUE TRUE…」「harbor-gke.xxx harbor-gke.xxx…」连续重复列——那不是「元数据字段很多」，而是同一个值被逗号拆到了好几个视觉上的单元格里。
- **净效果**：Kibana 那份文件按「真正不重复的有效列」算，比 Pharos 少（Pharos 92 列全部有效且严格对齐；Kibana 154 列里近一半是重复的 `.keyword`，且解析本身不可靠）。所以「Kibana 15 分钟只用 10MB 就导出又快又干净」这个直觉是不成立的——它是更早地撞上了自己的体积硬顶，并且字段本身的转义质量不如我们。

**结论 3**：Discover 表格本身的 `discover:sampleSize`（默认 500，与本次观察到的「以 500 行为批」现象吻合，大概率是 Kibana 按表格 sampleSize 分批渲染/导出）与 CSV Reporting 的体积上限是两套独立机制，不需要在本报告里精确复现 Kibana 版本号——两个机制共同作用的结果就是：Kibana 的「导出」在多数场景下也只是「导出一小部分样本」，不是字面意义上的「导出全部匹配结果」。

**结论 4（此前已确认，本轮取证再次印证）**：Kibana Discover 表格本身默认展示的列（本例是「时间戳 + 日志正文」这一类少数固定列），才是用户日常真正会用的导出范围；「全部字段/全部可用字段」在 Kibana 里本来就是少见的高级用法。这与我们「默认列 = 时间字段 + 日志正文」的既有设计方向一致，第四轮据此进一步升级为「常用字段」默认集合（见下）。

### 4.2 简化后的默认行为

用户产品决策：导出弹窗不再要求用户手动选「导出条数」与「导出字段/全部字段」，改为零配置——点「开始导出」即可，系统自动用允许的最大条数与常用字段。具体规则：

- **导出条数**：不再展示可编辑的条数输入框作为默认路径。默认值 = `adapter.getMaxRows(ctx)`（ES ≥ 7.10 时为 `MAX_ROWS_TIER2`=100,000，否则 `MAX_ROWS_TIER1`=10,000），即“当前架构允许的上限”。真正的边界仍然由 `useLogExport.ts` 现有的 `target = Math.min(values.rows, prepareResult.effectiveMaxRows, maxRows)` 三重 clamp，以及 `MAX_OUTPUT_CHARS`（300MB 字节闸门）、`guardRowValueSize`（单值截断）、超时缩批重试等安全网兜底——**这些安全阈值本轮未做任何放宽**，只是不再需要用户自己填一个数字。
- **导出字段**：不再展示可编辑的字段下拉框/「使用全部字段」勾选框作为默认路径。默认字段集合改为**常用字段**：新增 `resolveDefaultColumns.ts`，直接复用字段侧栏 `groupFields.ts` 的「常用字段」判定（内置推荐词表 `recommendedFields` ∪ 用户在侧栏「显示字段」里用过的 `popularFields`，有结果样本时与样本取交集排掉噪音字段），再并上强制保底的「预填列」（页面当前时间字段 + 日志正文字段，不参与样本过滤，保证这两列总是在）。这与字段侧栏「常用字段」分组是同一份判定逻辑、同一套数据源，不是另起一套新的启发式规则。
- **两者的默认值都会在弹窗里以只读摘要展示**（「导出字段：常用字段（N 个）」+「导出条数：最多 M 条」），不需要用户点开任何东西就能看到即将发生什么。

### 4.3 「高级选项」：保留，默认收起

评估后选择**保留**一个默认收起的「高级选项」区（原有的条数输入框、字段下拉、「使用全部字段」勾选框原样移入其中），理由：

- 改动成本低——三个控件与其校验规则全部复用，只是从「默认展示」变成「默认 `display:none`，点标题展开」，没有新造表单逻辑。
- 保留了少数确实需要「导全部字段」（如需要深挖某个 K8s 元数据字段做根因分析）或「自定义条数」（如故意只想抽样 1000 条快速看一眼）场景的退路，避免把能力焊死。
- 严格满足用户「正常路径零配置」的核心要求：不展开「高级选项」，用户不需要做任何选择即可点「开始导出」。

**已知代价（需要用户知晓，非阻塞项）**：对 ES ≥ 7.10（支持 PIT）的数据源，默认条数（10 万）会使 `prepare()` 判定走 T2（`pit_search_after`）策略，即使这次查询实际只命中几条——这意味着默认路径会比此前「默认 1 万条走 T1」多出「建 PIT + 删 PIT」两次网络往返，且会短暂展示「大额导出」的进度面板（虽然通常一批就 `exhausted` 完成，感知上是一闪而过，不是长时间占用）。这是「总是按上限请求」这个语义本身带来的、可预期的次要成本，不属于安全阈值被放宽；如果后续观察到这个开销影响体感，可以考虑把 `prepare()` 改造成「先按 T1 试探、命中上限再升级到 T2」的懒升级策略，属于比本轮更大的改动，本轮未做，仅记录在此供后续参考。

### 4.4 改动文件清单（第四轮）

- 新增 `src/dh/logExport/resolveDefaultColumns.ts` + `resolveDefaultColumns.test.ts`：默认「常用字段」集合的纯函数与单测。
- 修改 `src/dh/logExport/components/LogExportModal.tsx`：条数/字段控件移入默认收起的「高级选项」；新增零配置摘要行；删除基于「用户填的条数」的预估体积/预估耗时黄色警告（`estBytes`/`WARN_ROWS`，理由见下）；`rows` 字段默认值改为跟随 `adapter.getMaxRows()`；`columns` 默认值改为跟随 `resolveDefaultColumns()`。
- 修改 `src/dh/logExport/constants.ts`：删除不再使用的 `WARN_ROWS`、`DEFAULT_EXPORT_ROWS`。
- 修改 5 个 locale 文件（`zh_CN`/`zh_HK`/`en_US`/`ja_JP`/`ru_RU`）：删除 `warn_estimate`；新增 `rows_summary`、`fields_summary_default/custom/all/full_doc`、`fields_summary_tip`、`advanced_options`。
- **未改动**：`LogExportMenuItem.tsx`、`useLogExport.ts`、`resolveSourceFields.ts`、`adapters/elasticsearch.ts`——`LogExportFormValues` 的字段形状（`rows`/`columns`/`allFields`）完全不变，只是默认值与是否展示交给 Modal 决定，核心拉取/裁剪/安全阀逻辑无需变化。

### 4.5 一个一并去掉的预估警告（判断，非用户明确要求，供确认）

原弹窗有一条基于「用户填的条数 × 预估列宽」算出的黄色警告（`rows > WARN_ROWS || estBytes >= WARN_OUTPUT_CHARS`）。默认条数改为「架构上限」后，这条警告会在几乎所有 PIT 可用的场景下永远触发（因为 `rows` 恒等于 10 万这个上限，而不是真实预期的命中量），从「异常预警」变成「每次都亮」的噪音，且该数字本身失真（真实命中量可能只有几十条）。本轮判断后直接删除了这条预估警告，保留了基于**实际累计字节数**的运行中/完成后提示（`WARN_OUTPUT_CHARS` 近似上限、`byte_limit` 完成提示 `Modal.info`）——这些是基于真实数据而非预估，不受本次改动影响，真正的「导出太大」保护并未减弱。如果用户认为这条预估警告仍有价值（哪怕不准），可以再讨论恢复形式（比如改成只在「高级选项」手动改了条数/字段之后才显示）。

## 第五轮：彻底移除「高级选项」（不再保留任何自定义入口）

用户看到第四轮实现的「高级选项（默认收起）」效果后明确反馈：「高级选项这里关闭，不然会被开发玩坏」——即哪怕默认收起，只要控件还在代码里，就有被后续开发顺手改动（放大条数、勾上「全部字段」）的风险，重新引入此前修复过的「导出体积失控/客户端拖崩」问题。据此彻底删除该入口，推翻第四轮 §4.3 「保留、默认收起」的决定。

1. **删除的 UI**：`LogExportModal.tsx` 里 `advancedOpen` 状态、折叠面板容器 div、里面的 `rows` 的 `Form.Item`+`InputNumber`、`columns` 的 `Form.Item`+`Select`（含「全部字段」相关的 disabled/校验逻辑）、`allFields` 的 `Form.Item`+`Checkbox`、字段选择器下方的「仅导出本次查询结果样本…」提示 `div`，以及触发展开/收起的 `DownOutlined`/`RightOutlined` 图标行，全部删除。摘要区里按 `allFields`/`isUsingDefaultColumns` 分三种文案（默认/自定义/全部字段）的分支同步简化为只有一种（CSV 恒为「常用字段（N 个）」，JSONL/原始文本恒为「完整文档」）。
2. **数据流变化**：`rows`/`columns`/`allFields` 不再是 antd `Form` 里注册的字段（`Form` 现在只管 `format` 这一个字段）。它们改为纯 React state 派生：`maxRows`（`adapter.getMaxRows(ctx)` 解析出的架构上限）与 `defaultColumns`（`resolveDefaultColumns()` 算出的常用字段集合），点击「开始导出」时在 `handleStart()` 里直接手工拼一个 `LogExportFormValues` 对象（`{ format, rows: maxRows, columns: defaultColumns, allFields: false }`）传给 `start(ctx, values)`——不经过 `form.validateFields()` 读取这三个值，因为表单上压根没有对应的输入控件，也就没有输入回来源头。这样即使以后有人想在这块加控件，也得先重新给 `Form` 注册字段，不是简单取消一个 `disabled`/展开一个面板就能改回去。
3. **底层纯函数未改动**：`resolveSourceFields.ts`（`allFields` 为 `false` 时用 `values.columns` 作为 `_source` 白名单）、`resolveDefaultColumns.ts`、`useLogExport.ts`（`target = min(rows, effectiveMaxRows, maxRows)` 三重 clamp 逻辑）的对外签名与行为都不需要改——它们本来就不关心「这个值是用户填的还是代码算的」，`LogExportModal.tsx` 传入的 `values` 形状与以前完全一致，只是现在永远是「默认值」。
4. **清理的死代码/死文案**：
   - import：`InputNumber`、`Select`、`Checkbox`、`DownOutlined`、`RightOutlined` 从 `LogExportModal.tsx` 移除（`Tooltip`/`QuestionCircleOutlined` 仍保留，摘要区的「常用字段」`?` 提示现在无条件展示）。
   - state/变量：`advancedOpen`、`fieldOptions`（原本只用来填「导出字段」下拉框的 options 和估算 `allFieldsCount`，现在两个用途都不存在了；`getFields()` 拉到的字段名改为在 `.then()` 回调内联传给 `resolveDefaultColumns()`，不再保留成 state）、`allFieldsCount`、`columnsCount`、`sameFieldSet()`、`isUsingDefaultColumns` 全部删除。
   - i18n key（5 个 locale 文件同步清理）：`modal.rows`、`modal.rows_unit`、`modal.rows_max_tip`、`modal.columns`、`modal.columns_placeholder`、`modal.columns_all`、`modal.columns_all_tip_scoped`、`modal.columns_all_tip_fallback`、`modal.columns_required`、`modal.fields_summary_custom`、`modal.fields_summary_all`、`modal.advanced_options`。`byteLimit.suggest3`（原「减少导出列」，已不可行动）删除，原 `byteLimit.suggest4`（JSON Lines 建议）重命名为 `suggest3`，降级建议从 4 条变 3 条。保留的 `modal.fields_summary_default`/`modal.fields_summary_full_doc`/`modal.fields_summary_tip`/`modal.rows_summary` 不变（只读摘要，不是可改的入口）。同时把 `error.timeout` 与 `result.memory_error` 里「建议减少导出字段/导出列」的措辞改成「缩短时间范围/收窄查询条件」——前者已经不是用户能在这个弹窗里采取的行动。
5. **未变化**：`format`（CSV/JSONL/原始文本）仍是一级选项，保留在表单里；`nearOutputLimit`/`byte_limit` 完成提示等运行时保护逻辑完全未动；进度呈现分档（§4）逻辑未动。
6. **测试**：`LogExportModal.tsx` 之前没有组件级单测（只有 `resolveDefaultColumns.test.ts`/`resolveSourceFields.test.ts`/`groupFields.test.ts` 等纯函数层测试），本轮改动是纯 UI 层且未改动任何被测的纯函数签名，`npx jest src/dh` 87 个用例全绿，无需新增/删减测试。
7. **遗留问题，供用户确认**：如果以后真的有极少数场景需要导出全部字段（mapping 全量）或自定义条数（比如故意抽样极小的一批做快速核对），目前的实现里已经**没有任何前端入口**能做到——需要重新讨论要不要以「权限点/白名单」的形式开一个更受控的后门（例如只对某个运营角色可见，而不是对所有登录用户可见的表单控件），还是认为这种小众场景可以退回「直接用 Kibana / 直接查 ES」解决，不值得在 Pharos 里维护一条这么危险的路径。本轮未擅自实现，仅记录以待用户决策。

## 第六轮：导出弹窗「常用字段」计数与侧边栏不一致（10 vs 2）排查与修复

> **⚠️ 本轮结论已被第八轮推翻，仅作为排查过程存档。** 本轮把根因归结为「mapping 异步时序」，据此加了 `useMemo` 响应式计算 + loading 态。这个修复本身没有错（确实修掉了一个真实的、更小的时序问题），但**不是**用户反馈的「9/10 vs 2」现象的主因——用户后续两轮真实环境复测证伪了这个假设（等了很久、`columnsResolving` 早已结束，摘要仍定格在「常用字段（2 个）」）。真正的根因是 `getFields()`/`getFullFields()` 底层两个 mapping 解析函数对同一份 ES `_mapping` 响应解析出不一致的字段集合，与任何异步时序无关，见第八轮。

用户反馈：同一个页面、同一次查询（`k8s-pod*`，1 分钟，命中 44,862 条），字段侧边栏「常用字段」显示 10 个（`@timestamp`/`time`/`log`/`kubernetes.labels.app`/`kubernetes.labels.component`/`cluster`/`kubernetes.container_name`/`kubernetes.host`/`kubernetes.namespace_name`/`kubernetes.pod_name`），导出弹窗摘要却显示「导出字段：常用字段（2 个）」。

### 6.1 排查结论：不是判定逻辑不一致，是「还没算完的中间态被当成了最终结果」

逐项验证用户列出的可能根因：

1. **判定模式是否两处各维护一份、可能不同步**：`src/dh/logExport/resolveDefaultColumns.ts` 直接 `import groupFields from '@/dh/fieldsSidebar/groupFields'`、`import getRecommendedRank from '@/dh/fieldsSidebar/recommendedFields'`（间接）——是同一份代码，不存在两份拷贝。**排除**。
2. **scope 是否不匹配**：`FieldsSidebar/index.tsx` 用 `{ datasourceValue: Form.useWatch(['datasourceValue']), index: Form.useWatch('query')?.index }`；`LogExportMenuItem.tsx` 用 `{ datasourceValue: Form.useWatch('datasourceValue', form), index: Form.useWatch('query', form)?.index }`——两者都从同一个 `Form.useFormInstance()` 取值，且弹窗里「查询条件」区回显的索引名与侧边栏一致，说明 `ctx.datasourceId`/`query.index` 本身没错。**排除**。
3. **发布时机不匹配 / 字段判定模式不同**：`useResultFieldsPublisher`（产出）与 `useResultFields`（消费，侧边栏和导出弹窗调用的是同一个函数）之间没有第三份拷贝，两者读到的是 `resultFieldsStore` 里**同一个数组引用**。**排除**（但发现一个真实问题，见下）。
4. **真正的根因——一次性快照 + 无 loading 态**：`resolveDefaultColumns()` 需要的 `fieldOptions`（mapping 字段全集）来自 `getFields(ctx.datasourceId, query.index)`，这是弹窗打开时才发起的一次网络请求（`_mapping`，`k8s-pod*` 这类多 pod 宽索引的 mapping 响应可能有一定体积，不是零延迟）。旧代码把这次请求的 `.then()` 回调当成「计算默认列」的唯一时机，效果上等于：**弹窗刚打开、这次 `_mapping` 请求还没返回的那一瞬间，`fieldOptions` 是空数组，`resolveDefaultColumns` 只能算出强制预填列（`date_field` + `message`）= 2 个**，而摘要区没有任何 loading 提示，看起来就是一个「算完的」最终数字。侧边栏的 mapping（`getFullFields`）通常在页面打开时已经请求过、早于用户点「导出」，所以用户看侧边栏时几乎总是命中「已加载完」的状态，两边呈现出的「时刻」不同，才造成了 10 vs 2 的直觉差异——一旦 `_mapping` 请求返回，导出弹窗按原逻辑其实也会更新到与侧边栏一致的数字，只是没有任何东西告诉用户「现在这个数字还会变」。已用 `resolveDefaultColumns.test.ts` 里新增的回归用例复现并锁定这个「加载前 2 个、加载后 10 个」的前后对比（构造了与截图同名的 `kubernetes.*` 字段）。
5. **额外发现（非本次讨论的差异根因，但顺带记录）**：ES adapter 的强制预填列用的是 `adapter.rawKey = 'message'`（`src/dh/logExport/adapters/elasticsearch.ts`），而这个 `k8s-pod*` 索引的实际日志正文字段是 `log`（侧边栏「常用字段」列表里出现的是 `log` 不是 `message`）。这意味着预填列里的“正文列”在这份索引上可能并不存在于 mapping 中，是一个通用兜底值不总是精确命中每个索引的具体字段名，属于「一次性硬编码某个字段名」在多样化索引命名习惯下的固有局限，不是本轮 10 vs 2 的成因（因为 `message` 即使不存在也会被强制塞进 `columns` 数组，ES `_source` 请求里包含一个不存在的字段名是无害的，只是这一列在结果里恒为空）。是否要把这个「正文字段」做成可探测（如同 `date_field` 一样由页面查询表单提供，而不是 adapter 里硬编码单一英文名），本轮未改，留待用户评估是否有必要。

### 6.2 修复

1. **`LogExportModal.tsx`：默认列从「一次性异步快照」改成「响应式纯函数计算」**：新增 `fieldOptions`（mapping 字段，`useState`，弹窗打开时异步拉取一次）与 `columnsResolving`（是否还在拉取，`useState`）两个状态；`defaultColumns` 改为 `useMemo(() => resolveDefaultColumns({ fieldOptions, resultFields: ctx.resultFields, popularCounts, presetColumns }), [fieldOptions, ctx.resultFields, ...])`——不再在 `getFields().then()` 回调里 `setDefaultColumns()` 定死一次，而是让它随 `fieldOptions`（mapping 拉取完成）与 `ctx.resultFields`（字段侧栏发布的结果样本，可能在弹窗打开后才更新）两者中任意一个变化而自动重新计算，从机制上保证导出弹窗与侧边栏任何时刻看到的都是同一份输入算出来的同一个结果，不会停留在打开瞬间的旧快照上。
2. **新增 loading 态**：`columnsResolving` 为 `true` 期间，摘要区显示「正在计算常用字段…」（带 spinner），不展示可能还是预填列兜底值的数字；同时「开始导出」按钮 disabled（仅 CSV 格式受影响，JSONL/原始文本始终是完整文档，不依赖这次 mapping 拉取）。避免用户在数字还没定型时就点了导出。
3. **effect 增加取消保护**：`useEffect` 里给异步请求加了 `let cancelled = false` + 清理函数，弹窗关闭或快速重开时，旧一轮请求的回调不会再覆盖新一轮打开后的状态（原代码没有这层保护，理论上存在极端场景下的竞态）。
4. **可见性改进（交付要求 4）**：摘要区 `?` Tooltip 的文案（`modal.fields_summary_tip`）新增 `{{fields}}` 占位符，直接把 `defaultColumns.join('、')` 拼进提示文案里，例如「…当前包含：time、message、kubernetes.pod_name、…」。不引入新的可编辑控件（不违背第五轮「零配置、不留入口」的决定），只是把已经算好的字段名摆出来，用户 hover 一下就能在点「开始导出」前核对具体字段，不用再对着一个数字瞎猜。
5. **未改动**：`resolveDefaultColumns.ts`、`resolveSourceFields.ts`、`groupFields.ts`、`recommendedFields.ts`、`resultFieldsStore.ts` 的判定逻辑与对外签名——排查已确认它们本身没有不一致，问题完全在 `LogExportModal.tsx` 这一层「什么时候算、算完之前给用户看什么」的时序处理上。

### 6.3 改动文件清单（第六轮）

- 修改 `src/dh/logExport/components/LogExportModal.tsx`：`defaultColumns` 改为 `useMemo` 响应式计算；新增 `columnsResolving` loading 态与对应 UI；`getFields()` 异步请求加取消保护；摘要 Tooltip 展示具体字段名。
- 修改 5 个 locale 文件（`zh_CN`/`zh_HK`/`en_US`/`ja_JP`/`ru_RU`）：新增 `modal.fields_summary_loading`；`modal.fields_summary_tip` 追加 `{{fields}}` 占位符。
- 新增 `resolveDefaultColumns.test.ts` 回归用例：用与用户截图同名的 `kubernetes.*` 字段，复现并锁定「mapping 未加载时只有预填列 2 个 → mapping 加载后恢复到与侧边栏一致的常用字段集合」这一前后对比，防止未来回归到「一次性快照」的写法。
- **未改动**：`resolveDefaultColumns.ts`、`resolveSourceFields.ts`、`src/dh/fieldsSidebar/**`——问题不在判定算法本身。

## 第七轮：导出进度条分母失真（显示 10 万，真实命中 47059）排查与修复

用户反馈：进度面板显示「已获取 5000 / 100000 条」（5%，剩余约 36s），但页面右下角显示本次查询真实命中数是 47059 条，与进度条分母完全不沾边。

### 7.1 根因

第四/五轮把「导出条数」简化为恒等于架构上限（`maxRows`，PIT 可用时为 100,000）之后，`useLogExport.ts` 里驱动进度条/剩余时间的 `progress.target` 也变成了恒定的 100,000——这个字段此前的语义是「用户填的、贴近真实预期的条数」，简化后退化成了一个与真实命中数毫无关系的「上限探测值」。而**真实命中数其实早就被请求回来了**：`adapters/elasticsearch.ts` 的 T1（`from_size`，`fetched === 0` 时）与 T2（`pit_search_after`，`cursor == null` 时，即首批）都会在**首批请求**里设置 `track_total_hits: true`，响应体的 `hits.total.value` 也已经被解析并存进 `session.total`/`progress.total`（`useLogExport.ts` 原有的 `if (res.total != null) session.total = res.total`）。这个值此前只在「完成 toast」里用过一次，没有被用来修正进度条分母与剩余时间预估——数据链路是通的，只是没接到 UI 需要的两处计算上。

### 7.2 修复方案：进度条「展示分母」与「拉取循环真正的目标」解耦

新增纯函数 `resolveProgressTarget(target, total)`（`resolveProgressTarget.ts`）：`total` 未知（首批还没回）时退回 `target`（架构上限）；`total` 已知后收窄为 `min(target, total)`（命中数超过上限时仍封顶在上限，因为超过部分本来就不会被导出）。`useLogExport.ts` 的 `sessionProgress()`（唯一往 UI 写 `progress.target` 的地方）改用这个函数计算对外的 `progress.target`，而驱动 `runLoop`/`fetchBatch` 何时停止的 `session.target`（内部字段，从未对外暴露）完全不变——两者拆开后，「进度条应该显示多少」与「循环应该跑到多少」不再是同一个数字，互不影响，不需要改动拉取循环本身的任何一行判断逻辑。

由于 `total` 只会在首批被赋值一次、此后不再变化，且 `fetched` 单调递增，`min(target, total)` 只会在「首批落地」这一个时间点让分母变小（或不变），不可能出现先涨后跌——已用单测覆盖（见下）。

因为 `progress.target` 在整个代码库里只在 `LogExportModal.tsx` 的 4 处读取（百分比计算、「已获取 N/M」文案、剩余时间预估的两处），且这几处全部是直接消费这个字段、没有自己重新计算分母，所以 `LogExportModal.tsx` 里现成的百分比/剩余时间公式**不需要改一行**，只要 `progress.target` 本身变准，这几处显示就自动变准。

### 7.3 首批响应之前的过渡态 UI

新增 `totalUnknown = progress.total == null && progress.fetched === 0`（首批必定同时带回 `total` 与第一批 `rows`，所以这个条件精确对应「还没有任何数据/总数回来」这段时间，一旦有数据落地就不会再触发，即使某次响应意外没带 `total` 也会安全退回已有逻辑，不会卡在「未知」状态里出不来）。这段时间内：

- 进度条切到 `showInfo={false}` + `status='active'`（antd `Progress` 的条纹动效），不展示任何百分比数字。
- 主文案从「已获取 N / M 条」换成「正在获取首批数据，稍后会切换为按真实命中数计算的准确进度…」（`progress.first_batch`，5 个 locale 均已补充）。
- 「已生成 xx MB」「剩余约」这两行不展示（此时 `accumulatedChars` 恒为 0、`progress.rate` 恒为 `undefined`，展示出来也没有信息量）。
- 首批落地的瞬间（`fetched` 从 0 变为 > 0，`total` 同时被赋值），一次性切换到正常样式 + 准确分母，不会有「中间态」。

### 7.4 47059 命中场景下的实际展示

架构上限 100,000（PIT 可用），首批（5000 条）落地前：进度条 `active` 条纹动效、无百分比、文案「正在获取首批数据…」。首批落地后：`progress.total = 47059`，`progress.target` 收窄为 `min(100000, 47059) = 47059`，「已获取 5000 / 47059 条」，百分比 `Math.floor(5000/47059*100) = 10%`，剩余时间按 `(47059 - 5000) / rate` 计算（而不是原来的 `(100000 - 5000) / rate`，原公式会把剩余量高估约 2.1 倍）。

### 7.5 T1/T2 一致性

`sessionProgress()`/`resolveProgressTarget()` 是 T1、T2 共用的同一段代码，不区分 `session.prepareResult.strategy`；而 T1（`from_size`）与 T2（`pit_search_after`）在 adapter 层对首批 `track_total_hits` 的设置时机（`fetched === 0` / `cursor == null`）与 `total` 的解析方式（`res?.hits?.total?.value ?? res?.hits?.total`）完全一致，因此本次修复对两条路径同时生效，不需要分别处理。T1 因为通常走「不弹进度面板、按钮转圈」的呈现（`isLargeExport` 为 `false`），用户平时看不到这个修复的效果，但字段本身（`progress.target`/`progress.total`）在 T1 下同样是准确值，不会出现 `undefined` 导致 `NaN%` 的问题（`Math.max(progress.target, 1)` 兜底 + `total` 为 `0` 时 `resolveProgressTarget` 按「已知」处理而不是误判为「未知」，已用单测覆盖该边界）。

### 7.6 改动文件清单（第七轮）

- 新增 `src/dh/logExport/resolveProgressTarget.ts` + `resolveProgressTarget.test.ts`：进度条展示分母的收窄规则，从 `useLogExport.ts` 抽成纯函数便于单测（6 个用例：未知态退回上限、`null` 同样视为未知、47059 真实场景、命中数超过上限时封顶、命中数恰好等于上限、命中数为 0 时按「已知」而非「未知」处理）。
- 修改 `src/dh/logExport/useLogExport.ts`：`sessionProgress()` 的 `target` 改用 `resolveProgressTarget(session.target, session.total)`；驱动拉取循环的 `session.target` 本身不变。
- 修改 `src/dh/logExport/components/LogExportModal.tsx`：新增 `totalUnknown` 判断；首批未回时进度条切换为无百分比的 `active` 样式 + 「正在获取首批数据…」文案，不展示体积/剩余时间两行。
- 修改 `src/dh/logExport/types.ts`：`ExportProgress.target`/`total` 的注释更新，说明分母的收窄规则与 `total` 的赋值时机。
- 修改 5 个 locale 文件：新增 `progress.first_batch`。
- **未改动**：`adapters/elasticsearch.ts`（`track_total_hits` 的设置时机与解析方式本身已经正确，本轮只是把已经存在的 `total` 接到 UI 计算上）、`runLoop`/`fetchBatch`（循环控制用的 `session.target` 不受影响，不需要新增请求）。

## 第八轮：「常用字段」9 vs 2 的真正根因（推翻第六轮「mapping 时序」结论）

> **⚠️ 本轮结论已被第九轮推翻，仅作为排查过程存档。** 本轮把根因归结为「`mappingsToFields()` 不兼容 ES `_mapping` 响应把 `properties` 挂在 `_doc` 这一层的形态」，据此把两个解析函数的兼容范围收敛成一个共享函数。**这个收敛改动本身有独立价值，予以保留，没有回滚**，但它建立在一个从未用真实 ES 响应验证过的假设上——标准 ES 8.x `_mapping` 响应其实是 `{索引名: {mappings: {properties: {...}}}}`，`properties` 直接挂在 `mappings` 下，走"修复前"的旧代码 `mappings?.doc?.properties || mappings?.properties` 本来就能通过 `|| mappings?.properties` 这条回退拿到值——`_doc` 那个分支是否真的被这次报告的索引命中，从来没有拿真实响应验证过，只是一处合理但未经证实的推测。用户实测：修完之后现象完全没变，直接证伪了这个假设。真正原因见第九轮。

用户用两轮真实环境复测证伪了第六轮的结论：`k8s-pod*`，1 分钟，命中 42403/43473 条，侧边栏「常用字段」9 个（`log`/`@timestamp`/`time`/`kubernetes.labels.app`/`cluster`/`kubernetes.container_name`/`kubernetes.host`/`kubernetes.namespace_name`/`kubernetes.pod_name`），导出弹窗摘要显示「常用字段（2 个）」——截图是等到导出都跑到 20000/43473（第七轮验证过的准确分母都已经生效）才截的，`columnsResolving` 早就结束，摘要文案是稳定态而非 loading 态，说明真正原因不是「mapping 还没拉回来」。

### 8.1 排查过程（按用户建议的方向逐条验证，而不是重复第六轮已被证伪的假设）

1. **`recommendedFields.ts` 的内置模式是否真的覆盖不到这 9 个字段名**：`getRecommendedRank()` 是按路径**最后一段**归一化匹配，不要求整段路径命中词表。逐个验证：`container_name`/`host`/`namespace_name`/`pod_name`/`cluster` 命中「容器/主机」层；`app`（`kubernetes.labels.app` 的最后一段）命中「服务/应用」层；`log`/`time`/`@timestamp` 命中「时间/正文」层。**9 个全部命中**，排除「内置模式覆盖不到」——侧边栏能显示这 9 个，逻辑上完全成立。
2. **`ctx.resultFields` 是否是两处消费者的同一份数据**：`resultFieldsStore.ts` 是模块级单例（`const store: Record<string, string[] | undefined> = {}`），产出侧 `useResultFieldsPublisher`（`ExplorerNG/Main/Raw/index.tsx` 调用）与消费侧 `useResultFields`（`FieldsSidebar` 与 `LogExportMenuItem.tsx` 都调用同一个函数）按 `scopeKey = datasourceValue@index` 读写同一个模块级对象，不存在「各自持有独立副本」的情况——排除。且这个数据即使缺失也不是「2」的成因：`groupFields.ts` 里 `resultFields` 只影响 `isPresent()` 过滤，`hasResultInfo` 为 `false`（没有样本）时 `isPresent` 恒为 `true`，不会把 `recommended` 过滤成空。
3. **`presetColumns` 是否在某个分支「抢跑」覆盖了后面算出来的常用字段**：`resolveDefaultColumns.ts` 是 `[...presetColumns, ...groups.popular]` 的并集去重，没有任何「满足条件就直接 `return presetColumns`」的分支；`LogExportModal.tsx` 的 `useMemo` 依赖数组包含 `fieldOptions`/`ctx.resultFields` 等全部输入，没有条件性跳过重算——排除。
4. **真正的根因——`fieldOptions` 本身是空的，且不是因为请求失败，而是「同一份 ES mapping 响应，两个不同的解析函数解析出不一致的字段集合」**：

   - 导出弹窗（`LogExportModal.tsx`）调用 `getFields(ctx.datasourceId, query.index)`（`@/plugins/elasticsearch/services.ts`），内部用 `mappingsToFields()`（`@/plugins/elasticsearch/utils/mappingsToFields.ts`）解析 `_mapping` 响应。
   - 字段侧边栏（`SideBarNav/index.tsx`）调用 `getFullFields(datasourceValue, index, {...})`，内部用 `mappingsToFullFields()`（同一个文件）解析同一个 `_mapping` 响应。
   - **修复前**（`src/plugins/elasticsearch/utils/mappingsToFields.ts`），`mappingsToFields()` 从 `mappings` 节点取 `properties` 只有一行：

     ```ts
     // mappings?.doc?.properties 为了兼容 6.x 版本接口
     _.forEach(mappings?.doc?.properties || mappings?.properties, (item, key) => {
     ```

     只认 `doc`（ES 6.x 多 mapping type 时代的 type 名）或直接挂在 `properties` 下（ES 7.x+ 标准形态）这两种位置。而同文件里 `mappingsToFullFields()` 那一侧（本轮之前就已存在的代码）：

     ```ts
     // mappings?._doc?.properties 兼容 8.x 版本
     let properties = mappings?.doc?.properties ?? mappings?._doc?.properties ?? mappings?.properties;
     ```

     **额外兼容了 `_doc`**（ES 7.x 过渡期单 mapping type 固定名，8.x 索引若沿用旧模板/由旧版本 reindex 而来仍可能带这层）以及自定义 type 名的兜底分支。如果 `k8s-pod*` 这个长期滚动的索引，其 `_mapping` 响应里 `properties` 恰好挂在 `_doc` 这一层下（生产 ES 版本是 `8.9.0`，注释本身就是维护者早前为了兼容 8.x 加的，说明这种响应形态在生产环境是真实存在过的），`mappingsToFields()` 的 `mappings?.doc?.properties || mappings?.properties` 两者都取不到值，`_.forEach(undefined, ...)` 静默不做任何事——**整个索引的字段一个都解析不出来**，`getFields()` 返回 `allFields: []`，`fieldOptions` 变成空数组。而 `getFullFields()` 因为已经兼容 `_doc`，能正常拿到全部字段，侧边栏因此完全正常。
   - **为什么恰好是「2」**：`fieldOptions` 为空时，`resolveDefaultColumns()` 里 `groups.popular` 必然是空（`groupFields()` 遍历的 `fields` 数组本身是空的，无论内置推荐词表匹配规则多宽松都没有素材可匹配），最终只剩下强制注入、不依赖 `fieldOptions`/`resultFields` 的 `presetColumns`（时间字段 + 日志正文字段，2 个）。这与「mapping 请求失败被 `.catch()` 静默吞掉」表现完全相同（`columnsResolving` 照常在 `.finally()` 里置 `false`，UI 上没有任何区别），但根因不是网络失败，是**解析函数本身的兼容范围缺口**，请求本身是成功的（HTTP 200，只是解析器从这个响应体里读出了 `[]`）。

### 8.2 为什么第六轮的结论是错的

第六轮观察到「弹窗刚打开、mapping 还没回来的一瞬间摘要显示 2」，据此推断「10 vs 2」是这个瞬间被截图记录下来的中间态，加了 `useMemo` + loading 态修复。这个修复本身没有错——它确实解决了一个真实存在、但更小的问题（避免用户在请求还没落地时看到未完成的临时值）。但它建立在一个未经证实的假设上：「mapping 请求最终会成功返回完整字段」。这次排查证明，对这个具体索引来说，mapping 请求**成功返回了，但解析器解析出的是空数组**——不存在「等一等就会变准」这件事，所以无论等多久、`columnsResolving` 早就是 `false`，摘要永远定格在 2，与第六轮观察到的截图现象（等了很久仍是 2）完全吻合，而不是第六轮以为的「异步时序」。

### 8.3 修复

**没有在 `src/dh/**` 里新增一套字段解析逻辑去绕过这个问题**（那样会制造第二份、注定还会分裂的 mapping 解析代码），而是直接修正共享工具函数本身，让 `getFields()`/`getFullFields()` 的所有调用方都拿到一致、正确的结果：

1. **`src/plugins/elasticsearch/utils/mappingsToFields.ts`**：把两个函数各自维护的一份「从 `mappings` 节点取 `properties`」逻辑，收成一个共享的 `resolveMappingProperties()` 函数（认 `doc` / `_doc` / 直接 `properties` / 自定义 type 名四种真实存在过的 ES `_mapping` 响应形态），`mappingsToFields()`（简单版，`getFields()` 用）与 `mappingsToFullFields()`（完整版，`getFullFields()` 用）都改用这一个函数，物理上不可能再分裂成两份不同步的判断。
2. **为什么直接改这个官方共享文件、而不是在 `src/dh/**` 里加一层薄封装绕过**：这不是产品逻辑分支，是一个纯粹的、有既有兄弟函数代码作证的 bug（`mappingsToFullFields` 早就实现了正确的兼容范围，只是没有同步到 `mappingsToFields`），修复后让所有既有调用方（`AlertRule/Queries/DateField.tsx`、`dashboard/Editor/QueryEditor/Elasticsearch/Values`、`dashboard/Editor/QueryEditor/Elasticsearch/DateField.tsx` 等原生页面的 `getFields()` 调用）在同样的 ES 响应形态下也一并被修好，而不是只修导出弹窗这一个调用点、放着同一个 bug 继续影响其它官方页面。改动范围是这两个函数内部的私有解析逻辑，两个函数的对外签名/返回值形状完全不变，风险可控。

### 8.4 用测试验证（复现 + 锁定修复）

- 新增 `src/plugins/elasticsearch/utils/mappingsToFields.test.ts`（5 个用例）：
  - 用一段手写的「未修复前」逻辑复现 bug——`_doc` 挂载的 mapping 解析出 `[]`（对照组，证明 bug 曾经真实存在）。
  - 用截图里的 9 个真实字段名构造一份 `_doc` 挂载的 mapping，验证修复后的 `mappingsToFields()` 与 `mappingsToFullFields()` 解析出**完全一致**的字段集合（`@timestamp`/`cluster`/`kubernetes.container_name`/`kubernetes.host`/`kubernetes.labels.app`/`kubernetes.namespace_name`/`kubernetes.pod_name`/`log`/`time`）。
  - 未挂 `_doc`（标准 ES 7.x+ 形态）时两者本来就一致，验证不受本次改动影响。
  - 自定义 type 名（早期 ES 5.x/6.x）也能正确解析。
  - `type` 过滤（如只要 `date` 类型字段）仍然生效，没有被重构破坏。
- 在 `src/dh/logExport/resolveDefaultColumns.test.ts` 新增一条端到端回归用例：直接用 `mappingsToFields()`（不是手写数组）解析上面这份 `_doc` mapping 得到 `fieldOptions`，喂给 `resolveDefaultColumns()`，验证最终导出列包含全部 9 个结果样本字段 + 1 个强制预填的 `message`（`time` 与样本重复，去重后只多 1 个），印证「mapping 解析修好后，导出弹窗的默认列自动恢复到与侧边栏一致」，不需要在 `resolveDefaultColumns.ts`/`LogExportModal.tsx` 里另外改一行。
- `npx jest src/dh src/plugins/elasticsearch` 全部 109 个用例通过（新增 5 + 1 = 6 个，其余为既有用例回归确认）。

### 8.5 修复后 9 个字段场景下的展示

`fieldOptions` 现在能正确解析出这份索引的全部 mapping 字段（含 `kubernetes.*` 嵌套字段），`resolveDefaultColumns()` 与侧边栏 `groupFields()` 用的是同一套判定 + 同一份 `resultFields` 交集，因此导出弹窗摘要会显示「导出字段：常用字段（9 个）」（如果 `presetColumns` 的两个字段都恰好在这 9 个里，则去重后仍是 9；如果 `presetColumns` 里有一个不在结果样本里的强制字段如 `message`，则是 10——与本文档 8.4 节末尾用例的计算方式一致），与侧边栏「常用字段」分组的数字和具体字段名一一对应，`?` Tooltip 里能看到与侧边栏完全相同的字段列表。

### 8.6 改动文件清单（第八轮）

- 修改 `src/plugins/elasticsearch/utils/mappingsToFields.ts`（官方共享工具文件）：抽出 `resolveMappingProperties()`，修正 `mappingsToFields()` 对 `_doc`/自定义 type 名两种 mapping 响应形态的兼容缺口，与 `mappingsToFullFields()` 收敛成同一份判断逻辑。
- 新增 `src/plugins/elasticsearch/utils/mappingsToFields.test.ts`：5 个用例，复现并锁定本次 bug。
- 修改 `src/dh/logExport/resolveDefaultColumns.test.ts`：新增 1 个端到端回归用例，用真实 `mappingsToFields()` 解析结果驱动 `resolveDefaultColumns()`。
- 修改本文档：第六轮结论标注为已推翻，指向本节。
- **未改动**：`src/dh/logExport/**`（除测试文件）、`src/dh/fieldsSidebar/**`——第六轮已经确认过这两块目录里的判定逻辑本身没有问题，本轮排查结果与之一致，问题始终在共享的 mapping 解析工具函数里，不需要在 `dh/` 层加任何补丁或兜底。
- **遗留问题，供用户知悉（非阻塞）**：`resolveMappingProperties()` 目前按「先查 `doc`/`_doc`/`properties`，都没有再猜一个自定义 type 名」的顺序兜底，如果某个索引的 mapping 结构比这四种更复杂（比如同时存在多个自定义 type 名），仍可能解析不全；这是历史遗留的 `mappingsToFullFields()` 本来就有的兜底范围，本轮只是让 `mappingsToFields()` 追平到同一个范围，没有扩大兜底范围本身。

## 第九轮：放弃继续猜测响应形态，改成「结构上不可能不一致」的架构方案（推翻第八轮结论）

用户用真实环境复测：第八轮的修复上线后现象没有变化，导出弹窗 Tooltip 明确显示「当前包含：@timestamp、message」——恰好等于 `presetColumns`，证明 `groupFields()` 返回的 `popular` 分组依然是空数组，`_doc` 假设不是真根因。

### 9.1 明确区分「已用代码/测试验证过」与「无法离线验证、只能给出核查方法」的结论

这是第三轮排查同一个问题，前两轮都是在没有真实 ES 响应的情况下对响应形态做了合理但未经证实的假设。本轮不再猜测响应形态，逐条标注验证方式：

**A. 已用代码读取 + 现有/新增测试验证过的结论：**

1. `recommendedFields.ts` 的 `getRecommendedRank()` 按路径最后一段归一化匹配，`log`/`@timestamp`/`time`/`cluster`/`kubernetes.container_name`/`kubernetes.host`/`kubernetes.namespace_name`/`kubernetes.pod_name`/`kubernetes.labels.app` 这 9 个字段名全部命中内置词表——用 `resolveDefaultColumns.test.ts` 新增用例直接断言过（§9.4）。**结论：不是词表覆盖不到的问题。**
2. `resolveDefaultColumns.ts` 没有任何「满足条件就直接 `return presetColumns`」的抢跑分支，读代码可见它始终是 `[...presetColumns, ...groups.popular]` 去重——`groups.popular` 为空是唯一能让结果恰好等于 `presetColumns` 的原因。**结论：不是这一层的分支问题。**
3. `resultFieldsStore.ts` 是真正的模块级单例（`const store: Record<string, string[] | undefined> = {}`，不是每次 `useResultFields()` 调用各自 `useState` 初始化的本地副本），产出侧（`ExplorerNG/Main/Raw/index.tsx`）与消费侧（`FieldsList`、`LogExportMenuItem.tsx`）读写的是同一个模块级对象；两处的 `scope`（`{datasourceValue, index}`）都来自同一个 `Form.useFormInstance()` 上完全相同的字段路径（`Form.useWatch(['datasourceValue'])`/`Form.useWatch('query')`），scopeKey 计算方式相同。**结论：不存在「两份互相看不见的独立副本」，第六轮的排除结论在本轮复核后依然成立。**
4. `flattenLogFields.ts` 展平结果样本时，通过 `rawKey='__n9e_raw_n9e__'` 先 `unwrap` 到 `item._source`（读 `ExplorerNG/Main/Raw/index.tsx` 第 205-213 行：`{...log, __n9e_raw_n9e__: log, __n9e_id_n9e__: uniqueId()}`，其中 `log = item._source ?? {}`），再对这份真正的 `_source` 递归展平、跳过 `__n9e_` 前缀的内部字段。**结论**（代码读取验证，未接入真实浏览器逐字段比对）：产出的路径应该是 `kubernetes.pod_name` 这样与 mapping 字段名同构的路径，不含额外前缀/包装字段，`isPresent()` 的过滤逻辑本身在这个前提下是成立的（`groupFields.test.ts`、`resolveDefaultColumns.test.ts` 里用同构路径构造的测试全部通过，证明"给定同构输入，判定逻辑正确"）。
5. **新增测试直接证明「同一份输入，`groupFields()` 与 `resolveDefaultColumns()` 算出的常用字段集合完全相等」**（`resolveDefaultColumns.test.ts` 新用例，§9.4）：这是本轮要求的"结构性保证"，不依赖任何关于两条链路是否一致的假设——只要喂给两者的 `fields`/`resultFields`/`popularCounts` 相同，输出就保证相同，这是被测试锁定的事实，不是推测。

**B. 无法在没有真实浏览器/ES 环境的情况下验证，只能给出具体核查方法的部分：**

1. **真实场景下 `ctx.resultFields` 具体的值是什么、是否与 mapping 字段名完全同构**：第 A.4 点只验证了"代码逻辑上应该同构"，没有验证"这个具体索引在这个具体查询下，`resultFieldsStore` 里实际存的字符串数组长什么样"。**核查方法**：在字段侧栏里把「空字段」分组展开，如果 `kubernetes.pod_name` 等字段明明在结果里有值却被分到了「空字段」而不是「常用字段/可用字段」，说明 `isPresent()` 判定为 false，问题出在 `resultFields` 与字段名不同构；如果它们正确出现在「常用字段」分组（本轮 bug 报告里用户的截图正是这样——侧边栏显示 10 个「常用字段」），则**已经间接证明侧边栏这条链路上 `isPresent()` 是通的**，不需要再单独验证。如果需要更直接的证据，可以在 `src/dh/fieldsSidebar/resultFieldsStore.ts` 的 `useResultFields` 返回值处临时加一行 `console.log`，在浏览器里查询后打开 Console 直接看数组内容。
2. **真实场景下 `getFields()`/`getFullFields()` 两次 `_mapping` 请求实际返回的字段集合具体差多少、差在哪些字段**：第八轮的 `_doc` 假设已被证伪，但没有找到"真正差在哪"的确凿证据（可能是 `crossClusterEnabled` 走了不同接口、可能是 `allow_hide_system_indices` 参数不同导致 `expand_wildcards` 不同、也可能是别的原因）。**核查方法**：在 Network 面板筛选 `_mapping`，应该能看到两个请求（一个来自侧栏打开页面时发的，一个来自点「导出日志」时发的）——对比两者的请求 URL/参数、以及响应体（如果响应体完全一样，问题在解析函数；如果响应体本身就不一样，问题在请求参数/接口选择）。**本轮不再需要这个答案**——见下方 9.2 的架构方案，直接绕开了"两条链路是否一致"这个问题，不需要再花时间钉死具体差在哪。

### 9.2 架构方案：不再有两条链路

不再让导出弹窗自己发起并解析一次 `_mapping`，而是让它直接复用字段侧栏已经渲染出来的那一份字段数组——只要侧栏能显示出「常用字段」，导出弹窗用的就是**同一个数组引用**，过**同一个 `groupFields()`**，结果在结构上不可能不一致，不再依赖任何关于 mapping 响应形态、请求参数是否一致的假设。

仿照已有的 `resultFieldsStore.ts`（模块级单例 + 按 scope 发布/订阅）新增 `src/dh/fieldsSidebar/indexFieldsStore.ts`：

1. **发布侧**：`src/dh/fieldsSidebar/FieldsList/index.tsx`（自有组件，不是官方文件）本来就以 `fields: Field[]` prop 的形式收到侧栏用来分组展示的那份**完整**数组（`groupFields({fields, ...})` 直接用它算出全部四个分组，不是分组后的子集）。新增 `useIndexFieldsPublisher(scope, fields.map(f => f.field), loading)` 一行调用，`loading` 为 `true`（mapping 请求还在飞）时不写入/不覆盖 store，避免把"还没到位的空数组"当成"这个索引真的没有字段"发布出去（否则会用另一条链路重新引入同一类 bug）。**不需要改任何官方文件**（`SideBarNav/index.tsx`、`FieldsSidebar/index.tsx` 都未改动），符合二开隔离「能加文件不改文件」原则。
2. **订阅侧**：`LogExportMenuItem.tsx` 已经在用同样的 scope 订阅 `useResultFields`，照葫芦画瓢新增 `useIndexFields(scope)`，塞进 `ctx.indexFields`（`LogExportContext` 新增字段，风格与现有 `resultFields` 一致）。
3. **消费侧**：`LogExportModal.tsx` 的 `effectiveFieldOptions = ctx.indexFields ?? fallbackFieldOptions`——`ctx.indexFields` 不可用（`undefined`，即侧栏还没发布过，比如弹窗打开这一刻侧栏 mapping 还在加载、或宿主页面没有接入字段侧栏）时才退回原来的 `getFields()` 请求兜底；一旦 `ctx.indexFields` 在弹窗打开期间才姗姗来迟（侧栏加载慢于用户点开导出弹窗），`effectiveFieldOptions` 立刻切换过去，不等待/不依赖兜底请求的结果。**正常路径下（侧栏已加载完成）不再发起 `_mapping` 请求**，是本方案额外带来的一个小的性能优化。

### 9.3 点 (b)（`isPresent`/`resultFields` 命名一致性）的验证结论

见 9.1 的 A.3/A.4/B.1：**代码层面**（模块级单例、scope 计算方式、`flattenLogFields` 的 unwrap 逻辑）读取验证过没有问题；**真实数据是否真的同构**无法离线验证，但用户截图里侧边栏能正确显示 10 个「常用字段」这一事实本身，已经是"侧栏这条链路上 `isPresent()` 是通的"的强证据（如果 `resultFields` 与 mapping 字段名不同构，`isPresent()` 会把这些字段错误地分到「空字段」而不是「常用字段」，但截图显示的恰恰是「常用字段 10 个」，不是「空字段」堆了一堆本该有值的字段）。本轮的架构方案（9.2）让导出弹窗直接复用侧栏的判定结果，即使 (b) 在某些边缘场景下真的有问题，也会**同时**体现在侧栏和导出弹窗两边（用户能一眼看出侧栏本身就不对，而不是"两边对不上"），不再是导出弹窗单独出现的诡异现象。

### 9.4 测试

新增 `src/dh/logExport/resolveDefaultColumns.test.ts` 用例「结构性保证」：用本轮用户截图里的 9 个真实字段名，同时喂给 `groupFields()`（侧栏判定函数）与 `resolveDefaultColumns()`（导出弹窗判定函数），断言：

- 两者算出的「常用字段」名称集合完全相等（`sidebarPopularNames` vs `resolveDefaultColumns` 结果 `\ presetColumns`）；
- 导出弹窗最终列覆盖全部 9 个截图字段；
- 明确断言导出列数量**不等于** `presetColumns.length`（即不会退化成本轮 bug 报告的「只剩 2 个」）。

`npx jest src/dh src/plugins/elasticsearch` 全部 110 个用例通过（新增 1 个用例，其余为既有用例回归确认，第八轮新增的 `mappingsToFields.ts` 收敛改动未回滚，其测试继续保留并通过）。`ReadLints` 检查 `LogExportModal.tsx`/`LogExportMenuItem.tsx`/`types.ts`/`indexFieldsStore.ts`/`FieldsList/index.tsx`/`resolveDefaultColumns.test.ts` 均无告警。

`indexFieldsStore.ts` 本身（发布/订阅的 React hook 机制）未写专门的单测——与它模仿的 `resultFieldsStore.ts` 一致，这个仓库目前没有 hook 渲染测试的基础设施（无 `@testing-library/react`），且两个 store 的发布/订阅/淘汰逻辑几乎逐行对应，`resultFieldsStore.ts` 本身也一直没有专门测试、靠集成场景验证；本轮新增的纯逻辑部分（`effectiveFieldOptions` 的 `??` 优先级、`resolveDefaultColumns` 输出一致性）已经被 9.4 的测试覆盖。

### 9.5 改动文件清单（第九轮）

- 新增 `src/dh/fieldsSidebar/indexFieldsStore.ts`：「索引 mapping 字段列表」的模块级单例发布/订阅 store，与 `resultFieldsStore.ts` 同构。
- 修改 `src/dh/fieldsSidebar/FieldsList/index.tsx`：新增一行 `useIndexFieldsPublisher(scope ?? {}, indexFieldNames, loading)`，`indexFieldNames` 由已有的 `fields` prop `useMemo` 出。
- 修改 `src/dh/logExport/types.ts`：`LogExportContext` 新增 `indexFields?: string[]`。
- 修改 `src/dh/logExport/components/LogExportMenuItem.tsx`：新增 `useIndexFields(scope)` 订阅，塞进 `ctx.indexFields`。
- 修改 `src/dh/logExport/components/LogExportModal.tsx`：`fieldOptions` state 拆成仅供兜底路径使用的 `fallbackFieldOptions`/`fallbackColumnsResolving`；新增 `effectiveFieldOptions = ctx.indexFields ?? fallbackFieldOptions` 与对应的 `columnsResolving` 派生值；`getFields()` 兜底请求仅在 `ctx.indexFields === undefined` 时才发起。
- 修改 `src/dh/logExport/resolveDefaultColumns.test.ts`：新增「结构性保证」用例。
- 修改本文档：第八轮结论标注为已推翻，指向本节；新增本节记录本轮排查（含已验证/未验证结论的显式区分）与架构级修复。
- **未改动/未回滚**：`src/plugins/elasticsearch/utils/mappingsToFields.ts`（第八轮的 `resolveMappingProperties()` 收敛保留，它是独立的正确性改进，只是不再被当作本问题的解释）、`resolveDefaultColumns.ts`、`groupFields.ts`、`resultFieldsStore.ts`、`SideBarNav/index.tsx`、`FieldsSidebar/index.tsx`（官方文件，本轮方案不需要改它们）。
- **仍然无法离线证实、需要用户在真实环境确认的点**：9.1-B 列出的两条——如果用户方便，最直接的验证方式是这次修复上线后直接看导出弹窗摘要是否变成「常用字段（9/10 个）」且与侧边栏数字一致；如果依然不一致，请提供当时 Network 面板里 `_mapping` 请求的实际响应体（脱敏后的字段名结构即可），才能继续排查是否存在 9.1-B.2 提到的请求参数差异。

## 第十轮（已整体回退）：把「原始文本导出整份文档 JSON」误判成 bug

> **⚠️ 本轮的问题判定从一开始就是错的，改动已在第十一轮整体回退，本节仅作为教训存档。**
> 不要再按本节的思路"修复"原始文本导出。

第十轮认定「选『原始文本』导出 `k8s-pod*` 得到的 `.log` 每行都是一份完整文档 JSON」是 bug，
根据是 `adapters/elasticsearch.ts` 的 `rawKey` 硬编码为 `'message'`，而该索引的正文字段叫 `log`，
于是 `rowsToRawChunk()` 走了 `JSON.stringify(row)` 的整行兜底。据此做了三处改动：删掉整行 JSON
兜底、把 raw 的 `_source` 从 `true` 收窄成 `[rawKey]`、在拉取循环里加「首批体检」——整批取不到
正文字段就中止导出并报错。

**这个判定是错的。** 用户明确表示那正是期望行为：「这个没问题，本身就是原始日志，不要处理」。
「原始文本」在用户心里就是「把原始日志原样倒出来」，`rawKey` 对不上时输出整份原始文档，
正是他要的东西，从来没有人抱怨过。

### 10.1 这次"修复"实际造成的两个回归

1. **原始文本导出产出空文件**（用户实测）。`_source` 收窄成 `["message"]` 之后，`k8s-pod*` 的
   每条 hit 都只剩一个空 `_source`，每行输出空串，下载下来就是一个只有换行符的文件。
   「首批体检」本意是要在这种情况下中止导出，但用户拿到的仍然是文件——无论中止逻辑是否
   按预期触发，结果都比修复前更差：修复前至少能拿到用户想要的原始文档。
2. **用户报告 CSV 导出也变慢了**（3 万多条从不到 1 分钟退化到 10 分钟量级，截图里出现了
   自适应缩批提示）。见 10.3 的排查结论。

### 10.2 第十一轮：回退范围

按「精确回退第十轮引入的改动，不往更早回退」执行，工作区里其它未提交工作（自动查询
`src/dh/autoQuery/**`、字段侧栏 `src/dh/fieldsSidebar/**`、`mappingsToFields.ts`、
`ExplorerNG/index.tsx` 的自动查询接入等）逐文件逐 hunk 判断后全部原样保留：

- `serialize.ts`：恢复 `rowsToRawChunk()` 的 `JSON.stringify(row)` 整行兜底；删除 `toRawLine()`
  与 `countRawBodyLines()`。注释里写明这是用户确认过的期望行为，不要再"修"。
- `resolveSourceFields.ts`：去掉第三个参数 `rawKey`；raw 分支恢复返回 `undefined`（即 `_source: true`，
  拉整份文档）——整行兜底需要完整文档才有内容可写。
- `useLogExport.ts`：删除 `failFatally()`、模块级 `isRawBodyMissing()` 以及 `runLoop` 里的首批体检
  调用；`resolveSourceFields(values, ctx)` 恢复两参数调用。
- `types.ts`：`LogExportAdapter.rawKey` 与 `FetchPageParams.sourceFields` 的注释恢复。
- `adapters/elasticsearch.ts`：仅回退第十轮加的注释（本轮确认第十轮对该文件**只改了注释**，
  没有逻辑改动）。
- `components/LogExportModal.tsx`：摘要区恢复 `t('modal.fields_summary_raw')`（不再传字段名）。
- 5 个 locale：删除 `error.raw_body_missing`；`modal.fields_summary_raw` 去掉 `{{field}}` 占位符；
  `byteLimit.suggest3` 恢复原文案。
- `serialize.test.ts` / `resolveSourceFields.test.ts`：删除锁定第十轮行为的用例，恢复
  「raw 格式始终不裁剪」用例，并把「正文字段缺失时退回整行文档 JSON」写成回归锁——
  下次再有人想删这个兜底，测试会先红。

`npx jest src/dh` 108 个用例全绿（第十轮的 114 减去被删除的 6 个）。

### 10.3 CSV 变慢：排查结论（**不是**第十轮引起的，未做任何改动）

用户怀疑 CSV 退化也是第十轮的副作用，希望"回退即可一并解决"。**代码级核对的结论是否定的**，
如实记录如下，避免把一个未证实的因果关系写进文档：

第十轮对 CSV 共用路径的全部触碰只有三处，都不产生开销：

1. `resolveSourceFields()` 的 `csv` / `jsonl` 分支逐字未变，只多了一个前置的 `raw` 分支。
2. `runLoop` 每批多调一次 `isRawBodyMissing()`，而它的第一行就是
   `if (session.values.format !== 'raw') return false;`——CSV 下是一次字符串比较。
3. `failFatally()` 是新增的 `useCallback`，CSV 路径下从未被调用。

`LogExportModal.tsx` 的改动确认只有 `t()` 的一个实参，不引入额外渲染或计算。

而截图里出现的「批超时 + 自适应缩批」机制（`batchTimeout.ts`、`BATCH_TIMEOUT_MS=30s`、
`MIN_BATCH_SIZE=250`）是「首次生产验收后的调整（2026-08-08）」引入的，**早于**用户认可的
那一版（第九轮之后、第十轮之前）；`track_total_hits` 只在首批为 `true` 的写法同样早于第七轮
（见 §7.6「未改动 adapters/elasticsearch.ts」）。也就是说，用户说"好用"的那一版里，这些机制
全都已经在跑了，把退化归到它们头上同样缺乏证据。

**因此本轮没有改动任何与批大小/超时/缩批相关的代码**——用户已明确要求，没有证据不得擅自
调整那道保护（它当初是为了解决"导出卡死导致电脑重启"引入的）。真正需要的下一步证据是：
CSV 导出变慢时打开 Network 面板，看那次 `_search` 请求的 **请求体 `_source` 数组有多少字段**、
**响应体多大**、**耗时多少**。一次 5000 条的批在 30 秒内没返回，只可能来自响应体过大或集群
本身慢，这两件事在请求/响应里是直接可见的，不需要再猜。

顺带记录一处**会放大观感**、但不是根因的现象（代码级确认，未实测）：`progress.rate` 用的是
`session.fetched / (Date.now() - session.startedAt)`，即整段会话的平均速率。首批一旦撞上 30 秒
超时并缩批重试，这 30 秒会被摊进分母，于是「剩余约 10m10s」这个数字在之后很长一段时间里
都被显著高估，实际耗时通常没有它显示的那么长。

### 10.4 教训（最重要的一条）

**这次事故的起点不是实现错误，是需求判断错误：在用户没有抱怨、没有提出需求的情况下，
把一个自己主观认定的"bug"当成问题去修，而那恰恰是用户想要的行为。** 修复本身还引入了两个
真实回归（空文件、以及被用户归因到导出上的性能抱怨）。

因此，以后遇到「我发现了一个 bug」时，先分清两种情况：

- **用户报告的问题**：照修。
- **自己主动发现的"问题"**：先确认它是不是用户认为的问题，再动手。尤其是当"修复"会改变
  用户已经在用的输出形态时——现有行为存在得越久、越没人抱怨，越可能是特性而不是缺陷。

第二条教训（关于假设）：第十轮把「`_source` 白名单命中不存在的字段时 ES 返回什么」这个
关键假设明确标注为"读代码推导、未接真实 ES 验证"，然后照样发布了。一个被自己标注为未验证
的假设，如果整条修复链路都建立在它之上，那它就不是脚注，而是**发布阻塞项**——要么验证，
要么换一个不依赖它的方案。

## 第十二轮：确定 raw 格式的最终产品定义

用户再次明确：原始日志不是“优先导出 `message` 等正文字段”，而是**无条件导出整份文档
JSON，每行一条（JSON Lines），不做任何字段挑选**。这是继第十一轮回退后用户第二次明确表态，
至此作为最终产品决策固定下来。

- 文档是否存在 `message`、`log` 或其它正文字段，都不影响输出结构。
- raw 查询必须保持 `_source: true`，确保拿到整份文档。
- 后续不要再把完整 JSON 当成兜底行为，也不要“优化”成猜测或挑选正文字段。
- 文件扩展名暂时保持 `.log`，未擅自改成 `.jsonl`。

