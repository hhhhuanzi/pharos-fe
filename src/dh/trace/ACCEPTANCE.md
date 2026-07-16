# SkyWalking 链路集成 — 验收清单（MVP）

分支：前后端均为 `feature_link`。

## 前置

- [ ] N9E 后端已部署含 Plugins 中 `skywalking` / `jaeger` 的构建
- [ ] SkyWalking OAP GraphQL 可访问（默认 `http://<oap>:12800/graphql`）
- [ ] 数据源 URL 填 OAP 根地址（如 `http://oap:12800`，**不要**把 `/graphql` 写进 URL；代理路径为 `/graphql`）

## 功能验收

1. **集成中心 → 数据源**
   - [ ] 可看到 SkyWalking 类型并新建
   - [ ] 保存成功；详情页显示 URL / 认证信息
2. **侧栏「数据查询」**
   - [ ] 出现「链路」→ 进入 `/trace/explorer`
3. **链路查询**
   - [ ] 数据源类型可选 Jaeger / SkyWalking
   - [ ] 选择 SkyWalking 实例后能加载 Service 列表
   - [ ] 有分组信息时，Service 前面出现独立的「分组」选择框，先选分组、再选服务（级联），选中分组后 Service 下拉框收窄到该组
   - [ ] Service 列表不包含虚拟/推断服务（如自动探测出的 DB、MQ 节点，`normal=false`），只列真实插了 Agent 的服务
   - [ ] 当前 Service 存在多个实例时，Operation 后面出现「实例」选择框（展示 `instanceUUID@ip`），可按实例过滤 Trace；只有 1 个实例时不显示该选择框
   - [ ] 按时间 + Service（+ 分组/实例，若有）查询出 Trace 列表
   - [ ] 含错误 Span 的 Trace 在列表里有红色标识（左边框 + Error 标签），非错误 Trace 无标识
   - [ ] 点击列表项或按 TraceId 查询可打开 Span 瀑布图
4. **Jaeger 回归**
   - [ ] 已有 Jaeger 数据源仍可查询列表与详情
5. **非回归**
   - [ ] 指标 / 日志 / 告警页面无明显报错

## 二开落点回顾

| 层 | 自有 | 薄入口 |
|----|------|--------|
| FE | `src/dh/trace/**`、`Datasources/SkyWalking/**` | `baseCates`、`menu.tsx`、Datasource Form/Detail switch、locale |
| BE | （无业务包） | `center/cconf/plugin.go` |

后续 OpenTelemetry：实现 `src/dh/trace/adapters/otel.ts` 并在 `TRACING_PLUGIN_TYPES` 中启用即可。
