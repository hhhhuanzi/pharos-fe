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
   - [ ] 按时间 + Service 查询出 Trace 列表
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
